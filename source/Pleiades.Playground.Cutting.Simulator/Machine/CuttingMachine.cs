using System.Globalization;
using System.Security.Cryptography;
using Microsoft.Extensions.Options;
using Pleiades.Playground.Cutting.Protocol.Model;
using Pleiades.Playground.Cutting.Simulator.Machine.Variants;

namespace Pleiades.Playground.Cutting.Simulator.Machine;

/// <summary>
/// The state of the simulated machine: production plan, NC archive, stock, alarms and what runs. Every change
/// goes through one lock and raises <see cref="Changed"/>. This class sends no telegram; that is the job of
/// <see cref="MachineActions"/>, the <see cref="CommandDispatcher"/> and the <see cref="ProductionRunner"/>.
/// </summary>
internal sealed class CuttingMachine
{
    private const int MaxSequence = 999;

    /// <summary>How many done orders of the endless mode stay in the plan; older ones are cleared away.</summary>
    private const int KeepGeneratedDone = 10;

    private readonly Lock _lock = new();
    private readonly Config _config;
    private readonly List<ProductionOrder> _orders = [];
    private readonly SortedSet<string> _archive = new(StringComparer.OrdinalIgnoreCase);
    private readonly List<StorageLocation> _locations = [];
    private readonly List<MachineAlarm> _alarms = [];
    private TaskCompletionSource _changed = NewSignal();

    private bool _online;
    private bool _hostConnected;
    private bool _productionActive;
    private bool _abortRequested;
    private bool _autoRun;
    private bool _endless;
    private double _timeScale;
    private int _feedrate = 100;
    private int _nextSequence = 1;
    private int _nextGenerated = 1;
    private int _palletChangerPosition = 4;
    private int _sheetLoadAcknowledge = 1;
    private StopMode _stopMode;
    private ProductionJob? _pendingSingle;
    private string _currentProgram = string.Empty;
    private int? _currentOrder;
    private int _currentSheet;
    private double _progress;
    private string _waitingFor = string.Empty;

    public CuttingMachine(IOptions<Config> config, IMachineVariant variant)
    {
        ArgumentNullException.ThrowIfNull(config);
        ArgumentNullException.ThrowIfNull(variant);
        _config = config.Value;
        Variant = variant;
        _autoRun = _config.AutoRun;
        _endless = _config.EndlessMode;
        _timeScale = _config.TimeScale;
        _locations.AddRange(variant.InitialLocations());
    }

    /// <summary>Raised after every change, outside the lock.</summary>
    public event EventHandler? Changed;

    public IMachineVariant Variant { get; }

    public CuttingMachineType Type => Variant.Type;

    public string MachineNumber => _config.MachineNumber;

    public double TimeScale
    {
        get
        {
            lock (_lock)
            {
                return _timeScale;
            }
        }
    }

    public MachineSnapshot Snapshot()
    {
        lock (_lock)
        {
            return new MachineSnapshot
            {
                Type = Type,
                MachineNumber = MachineNumber,
                DisplayName = _config.DisplayName,
                SerialNumber = _config.SerialNumber,
                Online = _online,
                HostConnected = _hostConnected,
                State = StateUnlocked(),
                ProductionActive = _productionActive,
                StopMode = _stopMode,
                AutoRun = _autoRun,
                EndlessMode = _endless,
                TimeScale = _timeScale,
                Feedrate = _feedrate,
                CurrentProgram = _currentProgram,
                CurrentOrder = _currentOrder,
                CurrentSheet = _currentSheet,
                ProgramProgress = _progress,
                WaitingFor = _waitingFor,
                PalletChangerPosition = _palletChangerPosition,
                SheetLoadAcknowledge = _sheetLoadAcknowledge,
                Orders = [.. _orders],
                Archive = [.. _archive],
                Locations = [.. _locations],
                Alarms = [.. _alarms],
            };
        }
    }

    /// <summary>
    /// Waits until the next change or the timeout.
    /// </summary>
    public async Task WaitForChangeAsync(TimeSpan timeout, CancellationToken cancellationToken)
    {
        Task signal;
        lock (_lock)
        {
            signal = _changed.Task;
        }

        try
        {
            await signal.WaitAsync(timeout, cancellationToken).ConfigureAwait(false);
        }
        catch (TimeoutException)
        {
            // A timeout is a normal end of the wait.
        }
    }

    // ----- Connection -----------------------------------------------------------------------------------------

    public bool Online => Read(() => _online);

    public bool HostConnected => Read(() => _hostConnected);

    public void SetOnline(bool online)
    {
        Update(() =>
        {
            _online = online;
            if (!online)
            {
                _hostConnected = false;
                _productionActive = false;
                _abortRequested = true;
            }
        });
    }

    public void SetHostConnected(bool connected)
    {
        Update(() => _hostConnected = connected);
    }

    // ----- Settings -------------------------------------------------------------------------------------------

    public void SetAutoRun(bool autoRun)
    {
        Update(() => _autoRun = autoRun);
    }

    public bool EndlessMode => Read(() => _endless);

    /// <summary>
    /// Switches the endless mode. Switched on, it starts the plan as the start button would, also with an empty
    /// plan; switched off, the plan runs out with the orders it holds.
    /// </summary>
    public void SetEndlessMode(bool endless)
    {
        Update(() =>
        {
            _endless = endless;
            if (endless && _online && _alarms.Count == 0 && !_productionActive)
            {
                _productionActive = true;
                _stopMode = StopMode.None;
            }
        });
    }

    public void SetTimeScale(double timeScale)
    {
        Update(() => _timeScale = Math.Clamp(timeScale, 0.001, 100));
    }

    public int Feedrate => Read(() => _feedrate);

    public void SetFeedrate(int percent)
    {
        Update(() => _feedrate = Math.Clamp(percent, 0, 200));
    }

    public void SetSheetLoadAcknowledge(int value)
    {
        Update(() => _sheetLoadAcknowledge = value);
    }

    public int TogglePalletChanger()
    {
        return Update(() => _palletChangerPosition = _palletChangerPosition == 4 ? 7 : 4);
    }

    public int PalletChangerPosition => Read(() => _palletChangerPosition);

    // ----- NC archive -----------------------------------------------------------------------------------------

    public void AddPrograms(IEnumerable<string> programs)
    {
        Update(() =>
        {
            foreach (var program in programs.Where(p => !string.IsNullOrWhiteSpace(p)))
            {
                _archive.Add(program.Trim());
            }
        });
    }

    /// <summary>Deletes an NC program (§3.4): 0, -1 not in the archive, -10 it runs.</summary>
    public int DeleteProgram(string program)
    {
        return Update(() =>
        {
            if (string.Equals(_currentProgram, program, StringComparison.OrdinalIgnoreCase))
            {
                return CuttingReturnCodes.NotPossibleNow;
            }

            return _archive.Remove(program) ? CuttingReturnCodes.Ok : -1;
        });
    }

    public bool HasProgram(string program) => Read(() => _archive.Contains(program));

    // ----- Production plan ------------------------------------------------------------------------------------

    public ProductionOrder? FindOrder(int sequence)
    {
        return Read(() => _orders.Find(o => o.Sequence == sequence));
    }

    /// <summary>
    /// Creates an order (§3.2). Returns its sequence number, or -3 when the name exists, -9 for an invalid
    /// parameter, -1 when the plan is full.
    /// </summary>
    public int InsertOrder(ProductionOrder order, int requestedSequence)
    {
        ArgumentNullException.ThrowIfNull(order);
        return Update(() =>
        {
            if (string.IsNullOrWhiteSpace(order.Name) || string.IsNullOrWhiteSpace(order.NcProgram) ||
                order.Target is < 1 or > MaxSequence)
            {
                return -9;
            }

            if (_orders.Exists(o => string.Equals(o.Name, order.Name, StringComparison.OrdinalIgnoreCase)))
            {
                return -3;
            }

            var sequence = requestedSequence is >= 1 and <= MaxSequence && !_orders.Exists(o => o.Sequence == requestedSequence)
                ? requestedSequence
                : NextFreeSequence();
            if (sequence < 0)
            {
                return -1;
            }

            _orders.Add(order with { Sequence = sequence });
            _archive.Add(order.NcProgram);
            return sequence;
        });
    }

    /// <summary>Replaces an order that does not run (web page).</summary>
    public bool ReplaceOrder(ProductionOrder order)
    {
        ArgumentNullException.ThrowIfNull(order);
        return Update(() =>
        {
            var index = _orders.FindIndex(o => o.Sequence == order.Sequence);
            if (index < 0 || _orders[index].Sequence == _currentOrder)
            {
                return false;
            }

            _orders[index] = order;
            _archive.Add(order.NcProgram);
            return true;
        });
    }

    /// <summary>
    /// Deletes orders (§3.3) by the first given of sequence number (-1 = all), name or job. Returns 0, -1 when one
    /// runs, -2 when none matches, -4 without parameters.
    /// </summary>
    public int DeleteOrders(int? sequence, string? name, string? job, bool deletePrograms)
    {
        return Update(() =>
        {
            var matches = Select(sequence, name, job, allowAll: true);
            if (matches is null)
            {
                return -4;
            }

            if (matches.Count == 0)
            {
                return -2;
            }

            if (matches.Exists(o => o.Sequence == _currentOrder))
            {
                return -1;
            }

            foreach (var order in matches)
            {
                _orders.Remove(order);
                if (deletePrograms && !_orders.Exists(o => string.Equals(o.NcProgram, order.NcProgram, StringComparison.OrdinalIgnoreCase)))
                {
                    _archive.Remove(order.NcProgram);
                }
            }

            return CuttingReturnCodes.Ok;
        });
    }

    /// <summary>
    /// Sets the status of orders (§3.7). Returns 0, -1 when one runs, -2 when none matches, -4 for invalid
    /// parameters.
    /// </summary>
    public int ModifyState(int? sequence, string? name, string? job, CuttingOrderStatus status)
    {
        return Update(() =>
        {
            var matches = Select(sequence, name, job, allowAll: false);
            if (matches is null)
            {
                return -4;
            }

            if (matches.Count == 0)
            {
                return -2;
            }

            if (matches.Exists(o => o.Sequence == _currentOrder))
            {
                return -1;
            }

            foreach (var order in matches)
            {
                var index = _orders.IndexOf(order);
                _orders[index] = order with { Status = status };
            }

            return CuttingReturnCodes.Ok;
        });
    }

    /// <summary>
    /// Moves an order, or all orders of a job, to a 1-based position (§3.8). Returns 0 or -1.
    /// </summary>
    public int MoveOrder(string? name, string? job, int position)
    {
        return Update(() =>
        {
            var matches = Select(null, name, job, allowAll: false);
            if (matches is null || matches.Count == 0 || position < 1)
            {
                return -1;
            }

            foreach (var order in matches)
            {
                _orders.Remove(order);
            }

            var index = Math.Min(position - 1, _orders.Count);
            _orders.InsertRange(index, matches);
            return CuttingReturnCodes.Ok;
        });
    }

    /// <summary>Moves an order one place up (-1) or down (+1); for the web page.</summary>
    public void Shift(int sequence, int delta)
    {
        Update(() =>
        {
            var index = _orders.FindIndex(o => o.Sequence == sequence);
            var target = index + delta;
            if (index < 0 || target < 0 || target >= _orders.Count)
            {
                return;
            }

            (_orders[index], _orders[target]) = (_orders[target], _orders[index]);
        });
    }

    // ----- Production -----------------------------------------------------------------------------------------

    /// <summary>
    /// Starts the plan (§4.1 with <c>*</c>): 0, -1 without a free order, -4 when a program runs, -10 with an alarm.
    /// In endless mode an empty plan starts as well: the machine writes its next order itself.
    /// </summary>
    public int StartPlan()
    {
        return Update(() =>
        {
            if (_alarms.Count > 0)
            {
                return CuttingReturnCodes.NotPossibleNow;
            }

            if (_currentOrder is not null || _pendingSingle is not null || _currentProgram.Length > 0)
            {
                return -4;
            }

            if (!_endless && !_orders.Exists(o => o.IsRunnable))
            {
                return -1;
            }

            _productionActive = true;
            _stopMode = StopMode.None;
            return CuttingReturnCodes.Ok;
        });
    }

    /// <summary>
    /// Starts one NC program outside the plan (§4.1): 0, -1 not in the archive, -4 when a program runs, -10 with
    /// an alarm.
    /// </summary>
    public int StartSingle(string program)
    {
        return Update(() =>
        {
            if (_alarms.Count > 0)
            {
                return CuttingReturnCodes.NotPossibleNow;
            }

            if (_currentProgram.Length > 0 || _pendingSingle is not null)
            {
                return -4;
            }

            if (!_archive.Contains(program))
            {
                return -1;
            }

            _pendingSingle = new ProductionJob(null, program);
            return CuttingReturnCodes.Ok;
        });
    }

    /// <summary>Requests a stop (§4.2): 0, -2 when nothing runs, -3 for another mode.</summary>
    public int RequestStop(int mode)
    {
        return Update(() =>
        {
            if (mode is not ((int)StopMode.AfterProgram or (int)StopMode.AfterOrder))
            {
                return -3;
            }

            if (!_productionActive && _currentProgram.Length == 0)
            {
                return -2;
            }

            if (_currentProgram.Length == 0)
            {
                _productionActive = false;
                return CuttingReturnCodes.Ok;
            }

            _stopMode = (StopMode)mode;
            return CuttingReturnCodes.Ok;
        });
    }

    /// <summary>Aborts the running program; the runner sends ResetNCP.</summary>
    public void RequestAbort()
    {
        Update(() =>
        {
            if (_currentProgram.Length > 0)
            {
                _abortRequested = true;
            }

            _productionActive = false;
        });
    }

    /// <summary>
    /// The next program run, or <see langword="null"/>. Starts the plan when <see cref="Config.AutoRun"/> is on
    /// and ends it when no order is left; in endless mode it writes a new order instead.
    /// </summary>
    public ProductionJob? TakeNextJob()
    {
        bool? changed = null;
        var mutated = false;
        ProductionJob? job = null;
        lock (_lock)
        {
            _abortRequested = false;
            if (_online && _alarms.Count == 0)
            {
                if (_pendingSingle is not null)
                {
                    job = _pendingSingle;
                    _pendingSingle = null;
                    mutated = true;
                }
                else
                {
                    job = NextPlanJobUnlocked(ref changed);
                    mutated = changed is not null;
                }
            }
        }

        if (mutated)
        {
            Notify();
        }

        return job;
    }

    private ProductionJob? NextPlanJobUnlocked(ref bool? changed)
    {
        // In endless mode there is always a next order, so AutoRun starts the plan also when it is empty.
        var next = _orders.Find(o => o.IsRunnable);
        if (!_productionActive && _autoRun && (next is not null || _endless))
        {
            _productionActive = true;
            changed = true;
        }

        if (!_productionActive)
        {
            return null;
        }

        if (next is null && _endless)
        {
            next = GenerateOrderUnlocked();
            changed = true;
        }

        if (next is null)
        {
            _productionActive = false;
            _stopMode = StopMode.None;
            changed = false;
            return null;
        }

        return new ProductionJob(next.Sequence, next.NcProgram);
    }

    /// <summary>
    /// Writes the next order of the endless mode into the plan: the demo orders of the machine type in turn, each
    /// with a new name and quantity, three to a job. Clears away done orders of its own beyond the last few, so that
    /// the plan does not run full. Returns <see langword="null"/> when no sequence number is free.
    /// </summary>
    private ProductionOrder? GenerateOrderUnlocked()
    {
        var done = _orders.FindAll(o => o.Generated && o.Status == CuttingOrderStatus.Completed);
        foreach (var order in done.Take(Math.Max(0, done.Count - KeepGeneratedDone)))
        {
            _orders.Remove(order);
        }

        var templates = Variant.DemoOrders();
        if (templates.Count == 0)
        {
            return null;
        }

        var sequence = NextFreeSequence();
        if (sequence < 0)
        {
            return null;
        }

        string name;
        int number;
        do
        {
            number = _nextGenerated;
            _nextGenerated = (_nextGenerated % 99_999) + 1;
            name = string.Create(CultureInfo.InvariantCulture, $"{Prefix(templates[0].Name)}-E{number:D5}");
        }
        while (_orders.Exists(o => string.Equals(o.Name, name, StringComparison.OrdinalIgnoreCase)));

        var template = templates[(number - 1) % templates.Count];
        var generated = template with
        {
            Sequence = sequence,
            Name = name,
            JobName = string.Create(CultureInfo.InvariantCulture, $"JOB-E{((number - 1) / 3) + 1:D4}"),
            Target = RandomNumberGenerator.GetInt32(1, 6),
            Actual = 0,
            Status = CuttingOrderStatus.Free,
            Generated = true,
        };
        _orders.Add(generated);
        _archive.Add(generated.NcProgram);
        return generated;

        // "L-1001" gives "L": the generated names keep the letter of the machine type.
        static string Prefix(string name)
        {
            var dash = name.IndexOf('-', StringComparison.Ordinal);
            return dash > 0 ? name[..dash] : "E";
        }
    }

    public void SetOrderStatus(int sequence, CuttingOrderStatus status)
    {
        Update(() =>
        {
            var index = _orders.FindIndex(o => o.Sequence == sequence);
            if (index >= 0)
            {
                _orders[index] = _orders[index] with { Status = status };
            }
        });
    }

    public void BeginProgram(string program, int? order, int sheet)
    {
        Update(() =>
        {
            _currentProgram = program;
            _currentOrder = order;
            _currentSheet = sheet;
            _progress = 0;
            _waitingFor = string.Empty;
        });
    }

    public void SetProgress(double progress)
    {
        Update(() => _progress = Math.Clamp(progress, 0, 1));
    }

    public void SetCurrentOrder(int? order)
    {
        Update(() => _currentOrder = order);
    }

    public void SetWaiting(string reason)
    {
        Update(() => _waitingFor = reason);
    }

    /// <summary>Counts one run of the order and returns it.</summary>
    public ProductionOrder? CountSheet(int sequence)
    {
        return Update(() =>
        {
            var index = _orders.FindIndex(o => o.Sequence == sequence);
            if (index < 0)
            {
                return null;
            }

            _orders[index] = _orders[index] with { Actual = _orders[index].Actual + 1 };
            return _orders[index];
        });
    }

    /// <summary>Ends the program and returns the stop mode that applies now.</summary>
    public StopMode EndProgram()
    {
        return Update(() =>
        {
            _currentProgram = string.Empty;
            _currentSheet = 0;
            _progress = 0;
            var mode = _stopMode;
            if (mode == StopMode.AfterProgram)
            {
                _productionActive = false;
                _stopMode = StopMode.None;
            }

            return mode;
        });
    }

    /// <summary>Ends the order run and applies a stop after the order.</summary>
    public void EndOrder()
    {
        Update(() =>
        {
            _currentOrder = null;
            if (_stopMode == StopMode.AfterOrder)
            {
                _productionActive = false;
                _stopMode = StopMode.None;
            }
        });
    }

    public bool AbortRequested => Read(() => _abortRequested);

    public bool ProductionActive => Read(() => _productionActive);

    public StopMode CurrentStopMode => Read(() => _stopMode);

    // ----- Alarms ---------------------------------------------------------------------------------------------

    public bool HasAlarms => Read(() => _alarms.Count > 0);

    public void RaiseAlarms(IEnumerable<MachineAlarm> alarms)
    {
        Update(() => _alarms.AddRange(alarms));
    }

    public void ClearAlarms()
    {
        Update(() => _alarms.Clear());
    }

    // ----- Stock ----------------------------------------------------------------------------------------------

    public StorageLocation? Location(string key)
    {
        return Read(() => _locations.Find(l => l.Key == key));
    }

    public IReadOnlyList<StorageLocation> Locations() => Read(() => (IReadOnlyList<StorageLocation>)[.. _locations]);

    public StorageLocation? UpdateLocation(string key, Func<StorageLocation, StorageLocation> change)
    {
        ArgumentNullException.ThrowIfNull(change);
        return Update(() =>
        {
            var index = _locations.FindIndex(l => l.Key == key);
            if (index < 0)
            {
                return null;
            }

            _locations[index] = change(_locations[index]);
            return _locations[index];
        });
    }

    // ----- Persistence ----------------------------------------------------------------------------------------

    public PersistedState Export()
    {
        lock (_lock)
        {
            return new PersistedState
            {
                Type = Type,
                AutoRun = _autoRun,
                EndlessMode = _endless,
                TimeScale = _timeScale,
                Feedrate = _feedrate,
                NextSequence = _nextSequence,
                NextGeneratedNumber = _nextGenerated,
                PalletChangerPosition = _palletChangerPosition,
                Orders = [.. _orders],
                Archive = [.. _archive],
                Locations = [.. _locations],
            };
        }
    }

    public void Import(PersistedState state)
    {
        ArgumentNullException.ThrowIfNull(state);
        Update(() =>
        {
            _autoRun = state.AutoRun;
            _endless = state.EndlessMode ?? _config.EndlessMode;
            _nextGenerated = Math.Clamp(state.NextGeneratedNumber, 1, 99_999);
            _timeScale = state.TimeScale > 0 ? state.TimeScale : _config.TimeScale;
            _feedrate = state.Feedrate;
            _nextSequence = Math.Max(1, state.NextSequence);
            _palletChangerPosition = state.PalletChangerPosition;
            _orders.Clear();

            // An order that ran when the simulator stopped is free again.
            _orders.AddRange(state.Orders.Select(o => o.Status == CuttingOrderStatus.Active ? o with { Status = CuttingOrderStatus.Free } : o));
            _archive.Clear();
            _archive.UnionWith(state.Archive);
            if (state.Locations.Count > 0)
            {
                _locations.Clear();
                _locations.AddRange(state.Locations);
            }
        });
    }

    // ----- Helpers --------------------------------------------------------------------------------------------

    private OperatingState StateUnlocked()
    {
        if (!_online)
        {
            return OperatingState.Off;
        }

        if (_alarms.Count > 0)
        {
            return OperatingState.Fault;
        }

        if (_waitingFor.Length > 0)
        {
            return OperatingState.Waiting;
        }

        return _currentProgram.Length > 0 ? OperatingState.Running : OperatingState.Idle;
    }

    private int NextFreeSequence()
    {
        for (var i = 0; i < MaxSequence; i++)
        {
            var candidate = ((_nextSequence - 1 + i) % MaxSequence) + 1;
            if (!_orders.Exists(o => o.Sequence == candidate))
            {
                _nextSequence = (candidate % MaxSequence) + 1;
                return candidate;
            }
        }

        return -1;
    }

    /// <summary>
    /// The orders of the first given selector: sequence number, name or job. <see langword="null"/> when none is
    /// given.
    /// </summary>
    private List<ProductionOrder>? Select(int? sequence, string? name, string? job, bool allowAll)
    {
        if (sequence is not null)
        {
            return sequence == -1 && allowAll ? [.. _orders] : _orders.FindAll(o => o.Sequence == sequence);
        }

        if (!string.IsNullOrWhiteSpace(name))
        {
            return _orders.FindAll(o => string.Equals(o.Name, name, StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(job))
        {
            return _orders.FindAll(o => string.Equals(o.JobName, job, StringComparison.OrdinalIgnoreCase));
        }

        return null;
    }

    private T Read<T>(Func<T> read)
    {
        lock (_lock)
        {
            return read();
        }
    }

    private void Update(Action change)
    {
        Update(() =>
        {
            change();
            return 0;
        });
    }

    private T Update<T>(Func<T> change)
    {
        T result;
        lock (_lock)
        {
            result = change();
        }

        Notify();
        return result;
    }

    private void Notify()
    {
        TaskCompletionSource signal;
        lock (_lock)
        {
            signal = _changed;
            _changed = NewSignal();
        }

        signal.TrySetResult();
        Changed?.Invoke(this, EventArgs.Empty);
    }

    private static TaskCompletionSource NewSignal()
    {
        return new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    }
}

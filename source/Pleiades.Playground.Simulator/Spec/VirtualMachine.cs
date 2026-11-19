// SPDX-License-Identifier: Apache-2.0
using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using System.Text.Json.Nodes;

namespace Pleiades.Playground.Simulator.Spec;

/// <summary>Who the virtual machine is.</summary>
internal sealed record MachineIdentity(string Manufacturer, string SerialNumber, string ProductInstanceUri);

/// <summary>The counters that only grow, kept across restarts.</summary>
/// <param name="PowerOnDuration">Seconds the machine has been powered.</param>
/// <param name="Energy">Electric energy taken in, in watt hours.</param>
/// <param name="PartsProduced">Parts produced in the lifetime of the machine.</param>
/// <param name="OperationDuration">Seconds the machine has been operating: running a program.</param>
/// <param name="NextJobOrderNumber">
/// The number of the next job order; null before the first run. A new run goes on from it, so a job order id is
/// never given twice: a consumer that pairs the events of a job order by its id over runs would mix them.
/// </param>
internal sealed record MachineCounters(
    double PowerOnDuration, double Energy, long PartsProduced, double OperationDuration = 0, int? NextJobOrderNumber = null);

/// <summary>
/// A machine tool as a state machine, driven by a scenario. Every value and event follows from one state, so they
/// agree with each other: the spindle turns only while a program runs, a job order counts the parts of its program
/// executions, and the energy of a program execution is the integral of the published power over it.
/// </summary>
/// <remarks>
/// The machine is advanced by <see cref="Advance"/> with the current time and returns what changed. It is not
/// thread-safe; the caller serialises access.
/// </remarks>
[SuppressMessage("Security", "CA5394:Do not use insecure randomness", Justification = "Simulation, not security")]
internal sealed class VirtualMachine
{
    private const string NotExecuting = "NotExecuting";
    private const string Executing = "Executing";

    /// <summary>Name of channel 1 in the control; the manifest names it under <c>instances</c>.</summary>
    public const string ChannelName = "CHAN1";

    /// <summary>Name of spindle 1 in the control; the manifest names it under <c>instances</c>.</summary>
    public const string SpindleName = "S1";

    private readonly MachineIdentity _identity;
    private readonly SpecOutputConfig _config;
    private readonly ScenarioConfig _scenario;
    private readonly List<JobTemplate> _jobTemplates;
    private readonly List<double> _feedOverrideSteps;
    private readonly List<double> _spindleOverrideSteps;
    private readonly Random _random;

    private readonly Dictionary<string, SpecValue> _values = [];
    private readonly List<SpecMessage> _pending = [];
    private readonly List<JobOrder> _jobOrders = [];
    private readonly List<ActiveAlert> _alerts = [];

    private DateTimeOffset _now;
    private Phase _phase = Phase.Idle;
    private DateTimeOffset _phaseEnd;
    private Execution? _execution;
    private JobOrder? _activeJob;
    private int _nextJobNumber;
    private int _nextTemplate;
    private bool _jobOrdersChanged;
    private readonly List<JobOrder> _resultsChanged = [];
    private bool _alertsChanged;

    private double _powerOnDuration;
    private double _operationDuration;
    private double _energy;
    private long _partsProduced;
    private double _power;
    private double _feedOverride;
    private double _spindleOverride;
    private long _heartbeat;
    private long _notifications;
    private readonly Dictionary<string, long> _seq = new(StringComparer.Ordinal);
    private readonly DateTimeOffset _warmUpEnd;
    private readonly string _programPath;
    private readonly List<string> _stacklightLamps;
    private readonly HashSet<string> _unavailable;
    private double _bearingTemperature;
    private readonly string _bearingPath;
    private DateTimeOffset _nextHeartbeat;
    private DateTimeOffset _nextMeasurement;

    public VirtualMachine(MachineIdentity identity, SpecOutputConfig config, MachineCounters counters, DateTimeOffset start)
    {
        ArgumentNullException.ThrowIfNull(identity);
        ArgumentNullException.ThrowIfNull(config);
        ArgumentNullException.ThrowIfNull(counters);
        _identity = identity;
        _config = config;
        _scenario = config.Scenario;
        _unavailable = [.. _scenario.Unavailable];
        foreach (var path in _unavailable.Where(p => !SpecElements.MayBeUnavailable.Contains(p)))
        {
            throw new ArgumentException(
                $"'{path}' may not be unavailable; the model allows it for every element but {string.Join(", ", SpecElements.AlwaysAvailable)}.", nameof(config));
        }
        _unavailable.UnionWith(SpecElements.NotDelivered);
        _jobTemplates = _scenario.Jobs.Count > 0 ? _scenario.Jobs : [new JobTemplate()];
        _feedOverrideSteps = _scenario.FeedOverrideSteps.Count > 0 ? _scenario.FeedOverrideSteps : [1.0];
        _spindleOverrideSteps = _scenario.SpindleOverrideSteps.Count > 0 ? _scenario.SpindleOverrideSteps : [1.0];
        // The ids of executions and alerts come from these numbers: with a seed, the start of the run goes in too,
        // so that a restart gives no id of the run before it again.
        _random = _scenario.Seed is { } seed ? new Random(unchecked(seed * 397 ^ (int)start.ToUnixTimeSeconds())) : new Random();
        _now = start;
        SequencePrefix = SpecWire.SequencePrefix(start);
        _warmUpEnd = start + _scenario.WarmUpTime;
        _bearingPath = SpecElements.ExtensionPath(config.ManufacturerDomain, SpecElements.BearingTemperature);
        _programPath = SpecElements.ExtensionPath(config.ManufacturerDomain, SpecElements.ActiveProgram);
        _stacklightLamps = _scenario.StacklightLamps.Count > 0 ? _scenario.StacklightLamps : [.. StacklightRules.FourLamps];
        _bearingTemperature = _scenario.BearingTemperatureIdle;
        _nextJobNumber = Math.Max(_scenario.FirstJobOrderNumber, counters.NextJobOrderNumber ?? 0);
        _powerOnDuration = counters.PowerOnDuration;
        _energy = counters.Energy;
        _partsProduced = counters.PartsProduced;
        _operationDuration = counters.OperationDuration;
        _feedOverride = _feedOverrideSteps[0];
        _spindleOverride = _spindleOverrideSteps[0];
        Initialise();
    }

    private enum Phase
    {
        Idle,
        Setup,
        Loading,
        Executing,
        Interrupted,
        Faulted,
    }

    /// <summary>
    /// The prefix of the event numbers: the start of this machine in UTC, <c>yyyyMMddTHHmmssZ</c>.
    /// <see cref="SpecEvent.Seq"/> counts from 1 within it in each group; a new start begins a new prefix.
    /// </summary>
    public string SequencePrefix { get; }

    /// <summary>The time the machine has reached.</summary>
    public DateTimeOffset Now => _now;

    /// <summary>The current value of every element: the retained image of the broker.</summary>
    public IReadOnlyCollection<SpecValue> Values => _values.Values;

    /// <summary>The counters to keep across a restart.</summary>
    public MachineCounters Counters => new(_powerOnDuration, _energy, _partsProduced, _operationDuration, _nextJobNumber);

    /// <summary>
    /// The values set when the machine was created, all of them. Call once, before the first <see cref="Advance"/>.
    /// </summary>
    public IReadOnlyList<SpecMessage> TakeInitialMessages()
    {
        return Flush();
    }

    /// <summary>Advances the machine to <paramref name="now"/> and returns the values and events that came up.</summary>
    public IReadOnlyList<SpecMessage> Advance(DateTimeOffset now)
    {
        var elapsed = now - _now;
        if (elapsed <= TimeSpan.Zero)
        {
            return [];
        }

        // The power published since the last step held until now; the energy is its integral.
        _energy += _power * elapsed.TotalHours;
        _powerOnDuration += elapsed.TotalSeconds;
        if (_phase == Phase.Executing)
        {
            _operationDuration += elapsed.TotalSeconds;
        }
        WarmBearing(elapsed);
        _now = now;

        ChangeOverrides(elapsed);
        EndWarmUp();
        UpdateAlerts();
        RunPhase(elapsed);
        RaiseAlerts(elapsed);
        StopProgram(elapsed);
        ChangeQueue(elapsed);
        PromoteNextJobOrder();
        RemoveExpiredJobOrders();
        PublishPeriodic();
        return Flush();
    }

    private void Initialise()
    {
        Set(SpecElements.Manufacturer, _identity.Manufacturer);
        Set(SpecElements.SerialNumber, _identity.SerialNumber);
        Set(SpecElements.ProductInstanceUri, _identity.ProductInstanceUri);
        Set(SpecElements.Model, _scenario.Model);
        Set(SpecElements.ManufacturerUri, _config.EffectiveManufacturerUri);
        Set(SpecElements.ProductCode, _scenario.ProductCode);
        Set(SpecElements.YearOfConstruction, (long)_scenario.YearOfConstruction);
        Set(SpecElements.MonthOfConstruction, (long)_scenario.MonthOfConstruction);
        Set(SpecElements.InitialOperationDate, SpecWire.Timestamp(_scenario.InitialOperationDate));
        Set(SpecElements.DeviceClass, _scenario.DeviceClass);
        foreach (var path in SpecElements.NotDelivered)
        {
            Set(path, (JsonNode?)null);
        }
        Set(SpecElements.Software, new JsonArray([.. Software().Select(s => (JsonNode)s)]));
        _heartbeat = 1;
        Set(SpecElements.Heartbeat, _heartbeat);
        _nextHeartbeat = _now + _config.HeartbeatInterval;
        SetStatus(NotExecuting, "Processing");
        Set(SpecElements.IsWarmUp, _now < _warmUpEnd);
        Set(SpecElements.ChannelState, "Reset");
        Set(SpecElements.ChannelMode, "Automatic");
        Set(SpecElements.ChannelName, ChannelName);
        Set(SpecElements.RapidOverride, 1.0);
        Set(SpecElements.ActiveWorkMaster, (JsonNode?)null);
        Set(_programPath, (JsonNode?)null);
        Set(SpecElements.ProgramExecution, (JsonNode?)null);
        SetFeedOverride();
        Set(SpecElements.SpindleIsRotating, false);
        Set(SpecElements.SpindleIsUsedAsAxis, false);
        Set(SpecElements.SpindleName, SpindleName);
        Set(SpecElements.StacklightMode, "Segmented");
        Set(SpecElements.SpindleOverride, _spindleOverride);
        Set(SpecElements.PartsProducedInLifetime, _partsProduced);
        // The first list comes with its events too, so that the events alone give the same list.
        for (var i = 0; i < _scenario.QueuedJobOrders; i++)
        {
            AddJobOrder();
        }
        PromoteNextJobOrder();
        _jobOrdersChanged = true;
        _alertsChanged = true;
        UpdatePower();
        PublishMeasurements();
        _phaseEnd = _now;
    }

    private void RunPhase(TimeSpan elapsed)
    {
        switch (_phase)
        {
            case Phase.Idle when _now >= _phaseEnd && _now >= _warmUpEnd && !HasFailure():
                StartJobOrder();
                break;
            case Phase.Setup when _now >= _phaseEnd:
            case Phase.Loading when _now >= _phaseEnd:
                StartExecution();
                break;
            case Phase.Executing:
                Execute(elapsed);
                break;
            case Phase.Interrupted when _now >= _phaseEnd && !HasFailure():
                ResumeExecution();
                break;
            case Phase.Faulted when !HasFailure():
                EnterPhase(Phase.Idle, _scenario.IdleTime);
                break;
            default:
                break;
        }
    }

    private void StartJobOrder()
    {
        var job = _jobOrders.FirstOrDefault(j => j.State == "AllowedToStart");
        if (job is null)
        {
            return;
        }

        // The result of the job order comes with its start.
        job.StartTime = _now;
        job.ProducedQuantity = 0;
        job.GoodQuantity = 0;
        job.RunsCompleted = 0;
        ChangeJobState(job, "Running");
        _activeJob = job;

        // Keep the queue full: the next one may start, a new one waits.
        AddJobOrder();
        PromoteNextJobOrder();

        SetWorkMaster(job, null);
        EnterPhase(Phase.Setup, _scenario.SetupTime);
    }

    private void StartExecution()
    {
        var job = _activeJob!;
        var executionId = NewId();
        _execution = new Execution(executionId, _now, _energy, job);

        SetWorkMaster(job, executionId);
        ChangeExecutionState(_execution, "Running", SpecElements.ProgramExecutionStarted);
        EnterPhase(Phase.Executing, TimeSpan.Zero);
    }

    private void Execute(TimeSpan elapsed)
    {
        var execution = _execution!;
        execution.Progress += elapsed.TotalSeconds * _feedOverride;
        execution.Job.ActualProductionTime += elapsed.TotalSeconds;
        if (execution.Progress < execution.Job.Template.CycleTime.TotalSeconds)
        {
            return;
        }

        var job = execution.Job;
        EndExecution("Ended");
        if (job.RunsCompleted >= job.RunsPlanned)
        {
            job.EndTime = _now;
            job.JobResult = "Successful";
            ChangeResult(job);
            ChangeJobState(job, "Ended");
            _activeJob = null;
            SetWorkMaster(job, null);
            EnterPhase(Phase.Idle, _scenario.IdleTime);
        }
        else
        {
            EnterPhase(Phase.Loading, _scenario.LoadTime);
        }
    }

    /// <summary>
    /// Ends the program execution as Ended or Aborted. Its snapshot stays with that state until the next one
    /// begins, and the event carries the sums over the program execution, its interruptions included.
    /// </summary>
    private void EndExecution(string state)
    {
        var execution = _execution!;
        var job = execution.Job;
        var completed = state == "Ended";
        _execution = null;

        if (completed)
        {
            _partsProduced++;
            job.ProducedQuantity++;
            job.RunsCompleted++;
            if (_random.NextDouble() >= _scenario.ScrapRate)
            {
                job.GoodQuantity++;
            }
            Set(SpecElements.PartsProducedInLifetime, _partsProduced);
            ChangeResult(job);
        }

        SetWorkMaster(job, null);
        var eventPath = completed ? SpecElements.ProgramExecutionEnded : SpecElements.ProgramExecutionAborted;
        ChangeExecutionState(execution, state, eventPath, sums =>
        {
            sums["Duration"] = Math.Round((_now - execution.Start).TotalSeconds, 3);
            sums["PartsProduced"] = completed ? 1 : 0;
            sums["EnergyElectricity"] = Math.Round(_energy - execution.EnergyAtStart, 3);
        });
    }

    /// <summary>
    /// Sets the state of a program execution: its snapshot, and the event named after the new state. At the end the
    /// snapshot carries the sums too, and keeps them until the next program execution begins.
    /// </summary>
    private void ChangeExecutionState(Execution execution, string state, string eventPath, Action<JsonObject>? addSums = null)
    {
        execution.State = state;
        var snapshot = new JsonObject
        {
            ["ExecutionId"] = execution.Id,
            ["JobOrderID"] = execution.Job.Id,
            ["ActiveWorkMaster"] = execution.Job.Template.WorkMasterId,
            ["State"] = state,
            ["StartTime"] = SpecWire.Timestamp(execution.Start),
        };
        addSums?.Invoke(snapshot);
        // The snapshot names its ExecutionId inside; it carries no correlationId.
        Set(SpecElements.ProgramExecution, snapshot);
        Emit(eventPath, (JsonObject)snapshot.DeepClone(), execution.Id);
    }

    /// <summary>Interrupts the program execution; a failure interrupts the job order too, a program stop does not.</summary>
    private void InterruptExecution(bool interruptJob, TimeSpan duration)
    {
        var execution = _execution!;
        ChangeExecutionState(execution, "Interrupted", SpecElements.ProgramExecutionInterrupted);
        if (interruptJob)
        {
            ChangeJobState(execution.Job, "Interrupted");
        }
        EnterPhase(Phase.Interrupted, duration);
    }

    private void ResumeExecution()
    {
        var execution = _execution!;
        if (execution.Job.State == "Interrupted")
        {
            ChangeJobState(execution.Job, "Running");
        }
        ChangeExecutionState(execution, "Running", SpecElements.ProgramExecutionResumed);
        EnterPhase(Phase.Executing, TimeSpan.Zero);
    }

    private void AbortExecution()
    {
        var job = _execution!.Job;
        EndExecution("Aborted");
        job.EndTime = _now;
        job.JobResult = "Unsuccessful";
        ChangeResult(job);
        ChangeJobState(job, "Aborted");
        _activeJob = null;
        EnterPhase(Phase.Faulted, TimeSpan.Zero);
    }

    private void StopProgram(TimeSpan elapsed)
    {
        if (_phase == Phase.Executing && _random.NextDouble() < _scenario.ProgramStopsPerHour * elapsed.TotalHours)
        {
            var executionId = _execution!.Id;
            _notifications++;
            InterruptExecution(interruptJob: false, _scenario.ProgramStopDuration);
            // The stop gives a message to the operator: an alert without a category, that does not stay.
            Emit(SpecElements.NotificationEvent, new JsonObject
            {
                ["Id"] = SpecWire.NameUuid(string.Create(CultureInfo.InvariantCulture,
                    $"{_identity.ProductInstanceUri} {SequencePrefix} notification {_notifications}")),
                ["ErrorCode"] = _scenario.ProgramStopCode,
                ["Message"] = _scenario.ProgramStopText,
                ["Time"] = SpecWire.Timestamp(_now),
                ["SourceName"] = ChannelName,
                ["correlationId"] = executionId,
            }, executionId);
        }
    }

    /// <summary>The planner changes a waiting job order: revokes its release, cancels it, or takes it back.</summary>
    private void ChangeQueue(TimeSpan elapsed)
    {
        if (_random.NextDouble() >= _scenario.QueueChangesPerHour * elapsed.TotalHours)
        {
            return;
        }
        var waiting = _jobOrders.Where(j => j.State is "NotAllowedToStart" or "AllowedToStart").ToList();
        if (waiting.Count == 0)
        {
            return;
        }
        var job = waiting[_random.Next(waiting.Count)];
        switch (_random.Next(4))
        {
            case 0:
                if (job.State == "AllowedToStart")
                {
                    job.HeldUntil = _now + _scenario.QueueHoldTime;
                    ChangeJobState(job, "NotAllowedToStart");
                }
                break;
            case 1:
                // Cancelled: it ends as aborted without having run, and stays for the retention.
                job.EndTime = _now;
                ChangeJobState(job, "Aborted");
                AddJobOrder();
                break;
            case 2:
                // Taken back before it started: it leaves the list without a change of state.
                _jobOrders.Remove(job);
                _jobOrdersChanged = true;
                EmitJob(SpecElements.JobOrderRemoved, job);
                AddJobOrder();
                break;
            default:
                // The planner changes the runs: the job order changes without a change of state.
                job.RunsPlanned = Math.Max(1, job.RunsPlanned + (_random.Next(2) == 0 ? -1 : 1) * (1 + _random.Next(3)));
                _jobOrdersChanged = true;
                EmitJob(SpecElements.JobOrderChanged, job);
                break;
        }
    }

    /// <summary>Sets the phase and everything that follows from it: status, channel, spindle and power.</summary>
    private void EnterPhase(Phase phase, TimeSpan duration)
    {
        _phase = phase;
        _phaseEnd = _now + duration;
        var executionId = _execution?.Id;
        switch (phase)
        {
            case Phase.Setup:
                SetStatus(NotExecuting, "Setup");
                Set(SpecElements.ChannelState, "Reset");
                Set(SpecElements.ChannelMode, "JogManual");
                break;
            case Phase.Executing:
                SetStatus(Executing, "Processing");
                Set(SpecElements.ChannelState, "Active", executionId);
                break;
            case Phase.Interrupted:
                SetStatus(NotExecuting, "Processing");
                Set(SpecElements.ChannelState, "Interrupted", executionId);
                break;
            default:
                SetStatus(NotExecuting, "Processing");
                Set(SpecElements.ChannelState, "Reset");
                break;
        }
        if (phase != Phase.Setup)
        {
            Set(SpecElements.ChannelMode, "Automatic");
        }
        Set(SpecElements.SpindleIsRotating, phase == Phase.Executing);
        UpdatePower();
    }

    private void UpdateAlerts()
    {
        foreach (var alert in _alerts.ToList())
        {
            if (_now >= alert.Since + alert.Template.Duration)
            {
                _alerts.Remove(alert);
                _alertsChanged = true;
                Emit(SpecElements.AlertCleared, alert.ToJson(), alert.CorrelationId);
            }
            else if (!alert.Changed && alert.Template.ChangeAfter is { } after && _now >= alert.Since + after)
            {
                alert.Changed = true;
                alert.SeverityValue = alert.Template.ChangedSeverityValue ?? alert.SeverityValue;
                _alertsChanged = true;
                Emit(SpecElements.AlertChanged, alert.ToJson(), alert.CorrelationId);
            }
        }
    }

    private void RaiseAlerts(TimeSpan elapsed)
    {
        foreach (var template in _scenario.Alerts)
        {
            var isFailure = template.Severity == "Failure";
            if ((isFailure && _phase != Phase.Executing) || _alerts.Any(a => a.Template == template))
            {
                continue;
            }
            if (_random.NextDouble() >= template.RatePerHour * elapsed.TotalHours)
            {
                continue;
            }

            var alert = new ActiveAlert(NewId(), template, _now, _execution?.Id);
            _alerts.Add(alert);
            _alertsChanged = true;
            Emit(SpecElements.AlertRaised, alert.ToJson(), alert.CorrelationId);

            if (isFailure)
            {
                if (_random.NextDouble() < _scenario.AbortOnFailureProbability)
                {
                    AbortExecution();
                }
                else
                {
                    InterruptExecution(interruptJob: true, TimeSpan.Zero);
                }
            }
        }
    }

    private bool HasFailure()
    {
        return _alerts.Any(a => a.Template.Severity == "Failure");
    }

    private void ChangeOverrides(TimeSpan elapsed)
    {
        if (_feedOverrideSteps.Count > 1 && _random.NextDouble() < _scenario.FeedOverrideChangesPerHour * elapsed.TotalHours)
        {
            _feedOverride = NextStep(_feedOverrideSteps, _feedOverride);
            SetFeedOverride();
        }
        if (_spindleOverrideSteps.Count > 1 && _random.NextDouble() < _scenario.SpindleOverrideChangesPerHour * elapsed.TotalHours)
        {
            _spindleOverride = NextStep(_spindleOverrideSteps, _spindleOverride);
            Set(SpecElements.SpindleOverride, _spindleOverride);
        }
    }

    /// <summary>The feed override of the machine is the one of its only channel.</summary>
    private void SetFeedOverride()
    {
        Set(SpecElements.FeedOverride, _feedOverride);
        Set(SpecElements.ChannelFeedOverride, _feedOverride);
    }

    private void EndWarmUp()
    {
        if (_now >= _warmUpEnd)
        {
            Set(SpecElements.IsWarmUp, false);
        }
    }

    /// <summary>
    /// The work master the machine carries out, with the program that carries it out as a signal of the
    /// manufacturer. While a program runs the work master carries its ExecutionId.
    /// </summary>
    private void SetWorkMaster(JobOrder job, string? executionId)
    {
        Set(SpecElements.ActiveWorkMaster, job.Template.WorkMasterId, executionId);
        Set(_programPath, job.Template.Program);
    }

    private IEnumerable<JsonObject> Software()
    {
        var software = _scenario.Software.Count > 0
            ? _scenario.Software
            :
            [
                new SoftwareTemplate { Manufacturer = _identity.Manufacturer, ComponentName = "NC kernel", SoftwareRevision = "6.3.2" },
                new SoftwareTemplate { Manufacturer = _identity.Manufacturer, ComponentName = "HMI", SoftwareRevision = _scenario.SoftwareRevision },
            ];
        foreach (var entry in software)
        {
            yield return new JsonObject
            {
                ["Manufacturer"] = entry.Manufacturer,
                ["ComponentName"] = entry.ComponentName,
                ["SoftwareRevision"] = entry.SoftwareRevision,
            };
        }
    }

    private double NextStep(List<double> steps, double current)
    {
        var others = steps.Where(s => !s.Equals(current)).ToList();
        return others.Count == 0 ? current : others[_random.Next(others.Count)];
    }

    private void AddJobOrder()
    {
        var template = _jobTemplates[_nextTemplate];
        _nextTemplate = (_nextTemplate + 1) % _jobTemplates.Count;
        var job = new JobOrder(string.Create(CultureInfo.InvariantCulture, $"{_nextJobNumber++}/01"), template)
        {
            State = "NotAllowedToStart",
            StateSince = _now,
        };
        _jobOrders.Add(job);
        _jobOrdersChanged = true;
        EmitJob(SpecElements.JobOrderAdded, job);
    }

    private void PromoteNextJobOrder()
    {
        if (_jobOrders.Any(j => j.State == "AllowedToStart"))
        {
            return;
        }
        var next = _jobOrders.FirstOrDefault(j => j.State == "NotAllowedToStart" && (j.HeldUntil is null || _now >= j.HeldUntil));
        if (next is null)
        {
            return;
        }
        ChangeJobState(next, "AllowedToStart");
    }

    /// <summary>Changes the state of a job order; the event is named after the transition.</summary>
    private void ChangeJobState(JobOrder job, string state)
    {
        var transition = (job.State, state) switch
        {
            ("NotAllowedToStart", "AllowedToStart") => SpecElements.JobOrderReleased,
            ("AllowedToStart", "NotAllowedToStart") => SpecElements.JobOrderRevoked,
            ("AllowedToStart", "Running") => SpecElements.JobOrderStarted,
            ("Running", "Interrupted") => SpecElements.JobOrderInterrupted,
            ("Interrupted", "Running") => SpecElements.JobOrderResumed,
            ("Running" or "Interrupted", "Ended") => SpecElements.JobOrderEnded,
            ("Running" or "Interrupted", "Aborted") => SpecElements.JobOrderAborted,
            ("NotAllowedToStart" or "AllowedToStart", "Aborted") => SpecElements.JobOrderCancelled,
            _ => throw new InvalidOperationException($"No transition of a job order from {job.State} to {state}."),
        };
        job.State = state;
        job.StateSince = _now;
        _jobOrdersChanged = true;
        EmitJob(transition, job);
    }

    /// <summary>
    /// Marks the result of a job order as changed: a new quantity, its end. One <c>JobOrderResultChanged</c> per step
    /// carries it, after the events of the job order; a running time alone brings none.
    /// </summary>
    private void ChangeResult(JobOrder job)
    {
        _jobOrdersChanged = true;
        if (!_resultsChanged.Contains(job))
        {
            _resultsChanged.Add(job);
        }
    }

    /// <summary>An event of a job order with its entry; its result, if it has one, goes along off the wire.</summary>
    private void EmitJob(string path, JobOrder job)
    {
        Emit(path, job.ToJson(), related: job.StartTime is null ? null : job.ResultJson());
    }

    private void RemoveExpiredJobOrders()
    {
        foreach (var job in _jobOrders.Where(j => j.EndTime is { } end && _now >= end + _scenario.JobOrderRetention).ToList())
        {
            _jobOrders.Remove(job);
            _jobOrdersChanged = true;
            EmitJob(SpecElements.JobOrderRemoved, job);
        }
    }

    private void PublishPeriodic()
    {
        if (_now >= _nextHeartbeat)
        {
            _heartbeat++;
            Set(SpecElements.Heartbeat, _heartbeat);
            _nextHeartbeat += _config.HeartbeatInterval;
            if (_nextHeartbeat <= _now)
            {
                _nextHeartbeat = _now + _config.HeartbeatInterval;
            }
        }
        if (_now >= _nextMeasurement)
        {
            UpdatePower();
            PublishMeasurements();
        }
    }

    private void PublishMeasurements()
    {
        Set(SpecElements.ActiveEnergy, Math.Round(_energy, 3));
        Set(SpecElements.PowerOnDuration, Math.Round(_powerOnDuration));
        Set(SpecElements.OperationDuration, Math.Round(_operationDuration));
        Set(_bearingPath, Math.Round(_bearingTemperature, 1));
        _nextMeasurement = _now + _config.MeasurementInterval;
    }

    /// <summary>
    /// The bearing approaches the temperature of the state that held over the step: warm while the spindle turned,
    /// cool while it stood.
    /// </summary>
    private void WarmBearing(TimeSpan elapsed)
    {
        var target = _phase == Phase.Executing
            ? _scenario.BearingTemperatureIdle + ((_scenario.BearingTemperatureRunning - _scenario.BearingTemperatureIdle) * _spindleOverride)
            : _scenario.BearingTemperatureIdle;
        var approach = 1 - Math.Exp(-elapsed.TotalSeconds / _scenario.BearingTimeConstant.TotalSeconds);
        _bearingTemperature += (target - _bearingTemperature) * approach;
    }

    private void UpdatePower()
    {
        var level = _phase switch
        {
            Phase.Executing => _execution!.Job.Template.ExecutingPower,
            Phase.Setup or Phase.Loading => _scenario.SetupPower,
            _ => _scenario.IdlePower,
        };
        var noise = 1 + (_scenario.PowerNoise * ((2 * _random.NextDouble()) - 1));
        _power = Math.Round(level * noise, 1);
        Set(SpecElements.ActivePower, _power);
    }

    private void SetStatus(string itemState, string operationMode)
    {
        Set(SpecElements.Status, new JsonObject
        {
            ["MachineryItemState"] = itemState,
            ["MachineryOperationMode"] = operationMode,
        });
    }

    private void Set(string path, JsonNode? value, string? correlationId = null)
    {
        // An element the machine lacks for good: value null, once.
        if (_unavailable.Contains(path))
        {
            value = null;
            correlationId = null;
        }
        if (_values.TryGetValue(path, out var current)
            && current.CorrelationId == correlationId
            && JsonNode.DeepEquals(current.Value, value))
        {
            return;
        }
        var specValue = new SpecValue(path, value, SpecElements.UnitOf(path), _now, correlationId);
        _values[path] = specValue;
        _pending.Add(specValue);
    }

    private void Set(string path, string value, string? correlationId = null)
    {
        Set(path, JsonValue.Create(value), correlationId);
    }

    private void Set(string path, double value)
    {
        Set(path, JsonValue.Create(value));
    }

    private void Set(string path, long value)
    {
        Set(path, JsonValue.Create(value));
    }

    private void Set(string path, bool value)
    {
        Set(path, JsonValue.Create(value));
    }

    /// <summary>
    /// Says an event; <c>sequence</c> counts the events of its group, and the id follows from the machine, the group and
    /// the sequence. An event of a program execution
    /// carries its ExecutionId as <paramref name="correlationId"/>.
    /// </summary>
    private void Emit(string path, JsonObject value, string? correlationId = null, JsonObject? related = null)
    {
        // A machine without alert information has no alert events either.
        if (path.StartsWith("Notification.", StringComparison.Ordinal) && _unavailable.Contains(SpecElements.ActiveAlerts))
        {
            return;
        }
        var group = SpecElements.EventGroup(path);
        var seq = _seq.GetValueOrDefault(group) + 1;
        _seq[group] = seq;
        var sequence = SpecWire.Sequence(SequencePrefix, seq);
        var id = SpecWire.NameUuid($"{_identity.ProductInstanceUri} {group} {sequence}");
        _pending.Add(new SpecEvent(path, _now, seq, value, id, sequence, correlationId, related));
    }

    private List<SpecMessage> Flush()
    {
        foreach (var job in _resultsChanged.Where(j => j.StartTime is not null && _jobOrders.Contains(j)))
        {
            Emit(SpecElements.JobOrderResultChanged, job.ResultJson(), related: job.ToJson());
        }
        _resultsChanged.Clear();
        if (_jobOrdersChanged)
        {
            _jobOrdersChanged = false;
            Set(SpecElements.JobOrders, new JsonArray([.. _jobOrders.Select(j => (JsonNode)j.ToJson())]));
            // A result from the start of its job order until the job order leaves the list.
            Set(SpecElements.JobOrderResults, new JsonArray([.. _jobOrders.Where(j => j.StartTime is not null).Select(j => (JsonNode)j.ResultJson())]));
        }
        if (_alertsChanged)
        {
            _alertsChanged = false;
            Set(SpecElements.ActiveAlerts, new JsonArray([.. _alerts.Select(a => (JsonNode)a.ToJson())]));
        }
        // The whole list, retained, whenever a lamp changes; Set sends nothing when it stays the same.
        Set(SpecElements.StackElement, StacklightRules.StackElements(_stacklightLamps, StacklightState()));
        var messages = _pending.ToList();
        _pending.Clear();
        return messages;
    }

    /// <summary>The state the stack light shows, from the phase of the machine and its active alerts.</summary>
    private StacklightInput StacklightState()
    {
        return new StacklightInput(
            Executing: _phase == Phase.Executing,
            Interrupted: _phase == Phase.Interrupted,
            Setup: _phase == Phase.Setup,
            OperatorAsked: _phase == Phase.Idle,
            Failure: _alerts.Any(a => a.Template.Severity == "Failure"),
            Warning: _alerts.Any(a => a.Template.Severity is "OffSpec" or "CheckFunction"),
            Maintenance: _alerts.Any(a => a.Template.Severity == "MaintenanceRequired"));
    }

    private string NewId()
    {
        Span<byte> bytes = stackalloc byte[16];
        _random.NextBytes(bytes);
        return new Guid(bytes).ToString();
    }

    private sealed class Execution(string id, DateTimeOffset start, double energyAtStart, JobOrder job)
    {
        public string Id { get; } = id;
        public DateTimeOffset Start { get; } = start;
        public double EnergyAtStart { get; } = energyAtStart;
        public JobOrder Job { get; } = job;
        public double Progress { get; set; }
        public string State { get; set; } = "Running";
    }

    private sealed class JobOrder(string id, JobTemplate template)
    {
        public string Id { get; } = id;
        public JobTemplate Template { get; } = template;
        public string State { get; set; } = "NotAllowedToStart";
        public DateTimeOffset StateSince { get; set; }
        public DateTimeOffset? StartTime { get; set; }
        public DateTimeOffset? EndTime { get; set; }
        public double ProducedQuantity { get; set; }
        public double GoodQuantity { get; set; }
        public double ActualProductionTime { get; set; }
        public long RunsPlanned { get; set; } = template.Quantity;
        public long RunsCompleted { get; set; }
        public string JobResult { get; set; } = "Unknown";
        public DateTimeOffset? HeldUntil { get; set; }

        /// <summary>
        /// The entry of <c>JobMonitoring.JobOrders</c>: what is ordered. The machine knows no planned times.
        /// </summary>
        public JsonObject ToJson()
        {
            return new JsonObject
            {
                ["JobOrderID"] = Id,
                [nameof(State)] = State,
                [nameof(StateSince)] = SpecWire.Timestamp(StateSince),
                ["JobName"] = Template.JobName,
                ["WorkMasterID"] = Template.WorkMasterId,
                ["OrderNumbers"] = new JsonArray(JsonValue.Create($"SO-{Id.Split('/')[0]}")),
                [nameof(RunsPlanned)] = RunsPlanned,
                ["JobExecutionMode"] = "ProductionMode",
                ["PlannedStartTime"] = null,
                ["PlannedEndTime"] = null,
            };
        }

        /// <summary>
        /// The entry of <c>JobMonitoring.JobOrderResults</c>: what came of it, from its start. <c>EndTime</c> is
        /// <see langword="null"/> and <c>JobResult</c> <c>Unknown</c> until it ends.
        /// </summary>
        public JsonObject ResultJson()
        {
            return new JsonObject
            {
                ["JobOrderID"] = Id,
                [nameof(StartTime)] = SpecWire.Timestamp(StartTime!.Value),
                [nameof(EndTime)] = EndTime is { } end ? SpecWire.Timestamp(end) : null,
                [nameof(ProducedQuantity)] = ProducedQuantity,
                [nameof(GoodQuantity)] = GoodQuantity,
                [nameof(RunsCompleted)] = RunsCompleted,
                [nameof(ActualProductionTime)] = Math.Round(ActualProductionTime, 3),
                [nameof(JobResult)] = JobResult,
            };
        }
    }

    private sealed class ActiveAlert(string id, AlertTemplate template, DateTimeOffset since, string? correlationId)
    {
        public string Id { get; } = id;
        public AlertTemplate Template { get; } = template;
        public DateTimeOffset Since { get; } = since;
        public string? CorrelationId { get; } = correlationId;
        public int? SeverityValue { get; set; } = template.SeverityValue;
        public bool Changed { get; set; }

        public JsonObject ToJson()
        {
            var json = new JsonObject
            {
                [nameof(Id)] = Id,
                ["ErrorCode"] = Template.Code,
                ["Message"] = Template.Text,
                ["Severity"] = Template.Severity,
            };
            if (SeverityValue is { } value)
            {
                json[nameof(SeverityValue)] = value;
            }
            json["Time"] = SpecWire.Timestamp(Since);
            if (Template.Source is { Length: > 0 } source)
            {
                json["SourceName"] = source;
            }
            if (CorrelationId is not null)
            {
                json["correlationId"] = CorrelationId;
            }
            return json;
        }
    }
}

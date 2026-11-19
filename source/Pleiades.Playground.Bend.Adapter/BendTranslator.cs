using System.Text.Json.Nodes;
using Pleiades.Playground.Bend.Protocol.Model;
using Pleiades.Playground.Bend.Protocol.Telegrams;
using Pleiades.Playground.Mqtt.Extensions.Machines;

namespace Pleiades.Playground.Bend.Adapter;

/// <summary>
/// Turns what a bending machine reports over RCI into values and events of the data model (contracts/mqtt, the binding
/// of machines). It sends nothing and reads no file, so the whole mapping can be tested on its own. It remembers the
/// alert that stands, so it can be cleared with the same <c>Id</c>.
/// </summary>
/// <remarks>
/// <code>
/// OperatingStateFeedback  1 running       State.Status  Executing     Processing
///                         0 idle          State.Status  NotExecuting  Processing
///                         2 maintenance   State.Status  OutOfService  Maintenance
///                        -1 fault         State.Status  OutOfService  Processing   + Notification.ActiveAlerts, AlertRaised
///                         3 offline       State.Status  NotAvailable  None         the machine is not reached
/// another operating state                 Notification.ActiveAlerts, AlertCleared for a fault that stood
/// ManufacturingOrder…     WorkMasterMonitoring.ActiveWorkMaster and x-&lt;domain&gt;.WorkMasterMonitoring.ActiveProgram
///                         the ProgramName; x-&lt;domain&gt;.Production.*
/// ProcessingStopped       ActiveWorkMaster and ActiveProgram null: the machine runs no program
/// order done              Notification.NotificationEvent RCI-ORDER-FINISHED
/// OperatorMessage         Notification.NotificationEvent RCI-MESSAGE-&lt;MessageNo&gt;
/// </code>
/// <para>
/// The list <c>Notification.ActiveAlerts</c> goes out before the events that change it, so that a consumer who reads it
/// when an event arrives finds the list the event speaks of. It is <c>null</c>, not known, until the machine reports its
/// first operating state: before that nothing says whether a fault stands.
/// </para>
/// </remarks>
internal sealed class BendTranslator
{
    /// <summary>The category of a fault of the machine after NAMUR NE 107: the protocol names none.</summary>
    internal const string FaultSeverity = "Failure";

    private static readonly TimeSpan Tick = TimeSpan.FromMilliseconds(1);

    private readonly MachineIdentity _identity;
    private readonly TimeProvider _time;
    private readonly Func<string> _newId;
    private readonly Dictionary<string, DateTimeOffset> _lastTimestamp = new(StringComparer.Ordinal);
    private JsonObject? _fault;
    private bool _alertsKnown;
    private string? _lastFinishedOrder;

    /// <param name="identity">Who the machine is; gives the prefix of the signals of the manufacturer.</param>
    /// <param name="time">The clock: a timestamp in the future, which the binding does not allow, becomes now.</param>
    /// <param name="newId">Makes the <c>Id</c> of an alert or a notification; a UUID when not given.</param>
    public BendTranslator(MachineIdentity identity, TimeProvider time, Func<string>? newId = null)
    {
        _identity = identity ?? throw new ArgumentNullException(nameof(identity));
        _time = time ?? throw new ArgumentNullException(nameof(time));
        _newId = newId ?? (() => Guid.NewGuid().ToString());
    }

    /// <summary>
    /// Whether the machine said it is offline (3) and has said nothing else since: any other message of it, an
    /// operating state, an order, a package or an operator message, shows it is reached again.
    /// </summary>
    public bool Offline { get; private set; }

    /// <summary>The alert that stands, or null.</summary>
    public JsonObject? ActiveFault => _fault;

    /// <summary>The full path of a signal of the manufacturer, for example <c>x-trumpf-com.Rci.OperatingState</c>.</summary>
    public string Signal(string relativePath) => _identity.Signal(relativePath);

    /// <summary>
    /// The elements the adapter delivers, for the manifest: of the model <c>State.Status</c> and
    /// <c>Notification.ActiveAlerts</c>, and the signals of the manufacturer. Every timestamp is the one of the machine.
    /// </summary>
    public static IReadOnlyList<MachineElement> Elements(MachineIdentity identity)
    {
        ArgumentNullException.ThrowIfNull(identity);
        return
        [
            new(Paths.Status, MachineElement.Source),
            new(Paths.ActiveAlerts, MachineElement.Source),
            new(Paths.ActiveWorkMaster, MachineElement.Source),
            new(identity.Signal(Paths.ActiveProgram), MachineElement.Source,
                MachineSignal.Text("Name of the bending program of the active order")),
            new(identity.Signal(Paths.RciOperatingState), MachineElement.Source,
                MachineSignal.WholeNumber(MachineUnit.One, "RCI operating state: -1 fault, 0 idle, 1 running, 2 maintenance, 3 offline")),
            new(identity.Signal(Paths.ActiveOrder), MachineElement.Source,
                MachineSignal.Text("OrderNo of the active manufacturing order")),
            new(identity.Signal(Paths.ActivePackage), MachineElement.Source,
                MachineSignal.Text("Name of the active production package")),
            new(identity.Signal(Paths.ActivePart), MachineElement.Source,
                MachineSignal.Text("PartNo of the active manufacturing order")),
            new(identity.Signal(Paths.ProcessedParts), MachineElement.Source,
                MachineSignal.WholeNumber(MachineUnit.One, "Processed parts of the active manufacturing order")),
            new(identity.Signal(Paths.DesiredParts), MachineElement.Source,
                MachineSignal.WholeNumber(MachineUnit.One, "Desired number of parts of the active manufacturing order")),
            new(identity.Signal(Paths.ScrapParts), MachineElement.Source,
                MachineSignal.WholeNumber(MachineUnit.One, "Scrap parts of the active manufacturing order")),
            new(identity.Signal(Paths.PackageProcessed), MachineElement.Source,
                MachineSignal.WholeNumber(MachineUnit.One, "How often the active production package is done")),
            new(identity.Signal(Paths.PackageDesired), MachineElement.Source,
                MachineSignal.WholeNumber(MachineUnit.One, "How often the active production package is to be done")),
        ];
    }

    /// <summary>
    /// What stands when the adapter begins publishing: the state and the program as <c>null</c> where the machine has
    /// said nothing yet, not known right now, and the list of alerts, <c>null</c> as well until an operating state came.
    /// </summary>
    public IReadOnlyList<Publication> Current()
    {
        var now = _time.GetUtcNow();
        List<Publication> result = [];
        foreach (var path in new[] { Paths.Status, Paths.ActiveWorkMaster, Signal(Paths.ActiveProgram) }.Where(p => !_lastTimestamp.ContainsKey(p)))
        {
            result.Add(new ValuePublication(path, null, now));
        }

        result.Add(new ValuePublication(Paths.ActiveAlerts, _alertsKnown ? AlertList() : null, now));
        return Ordered(result);
    }

    /// <summary>Translates one observation.</summary>
    /// <param name="observation">What the machine reported.</param>
    /// <param name="withEvents">
    /// false while the files that were there at the start are read: then only the newest values count. The state they
    /// leave, an alert that stands included, is kept.
    /// </param>
    /// <returns>What to publish.</returns>
    public IReadOnlyList<Publication> Translate(RciObservation observation, bool withEvents = true)
    {
        ArgumentNullException.ThrowIfNull(observation);
        var at = Time(observation.Timestamp);
        if (observation is not OperatingStateObserved)
        {
            // A machine that sends anything is reached; only an operating state says offline again.
            Offline = false;
        }

        var publications = observation switch
        {
            OperatingStateObserved state => TranslateOperatingState(state, at),
            OrderObserved order => TranslateOrder(order, at),
            PackageObserved package => TranslatePackage(package, at),
            OperatorMessageObserved message =>
            [
                Notification(
                    string.IsNullOrEmpty(message.MessageNo) ? "RCI-MESSAGE" : $"RCI-MESSAGE-{message.MessageNo}",
                    string.IsNullOrEmpty(message.MessageText) ? "Operator message" : message.MessageText,
                    at),
            ],
            _ => [],
        };

        return Ordered(withEvents ? publications : [.. publications.Where(p => p is not EventPublication)]);
    }

    private List<Publication> TranslateOperatingState(OperatingStateObserved state, DateTimeOffset at)
    {
        var rci = (RciOperatingState)state.OperatingState;
        Offline = rci == RciOperatingState.Offline;
        var (itemState, operationMode) = rci switch
        {
            RciOperatingState.Running => ("Executing", "Processing"),
            RciOperatingState.Idle => ("NotExecuting", "Processing"),
            RciOperatingState.Maintenance => ("OutOfService", "Maintenance"),
            RciOperatingState.Fault => ("OutOfService", "Processing"),
            _ => ("NotAvailable", "None"),
        };

        List<Publication> publications =
        [
            Signal(Paths.RciOperatingState, state.OperatingState, at),
        ];

        var alertsWereKnown = _alertsKnown;
        _alertsKnown = true;
        if (rci == RciOperatingState.Fault)
        {
            var errorCode = string.IsNullOrEmpty(state.ErrorNo) ? "RCI-FAULT" : $"RCI-{state.ErrorNo}";
            if (_fault is not null && (string?)_fault["ErrorCode"] != errorCode)
            {
                publications.AddRange(ClearFault(at));
            }

            if (_fault is null)
            {
                _fault = new JsonObject
                {
                    ["Id"] = _newId(),
                    ["ErrorCode"] = errorCode,
                    ["Message"] = string.IsNullOrEmpty(state.ErrorText) ? "Machine fault" : state.ErrorText,
                    ["Severity"] = FaultSeverity,
                    ["Time"] = MachineBinding.Timestamp(at),
                };
                publications.Add(new ValuePublication(Paths.ActiveAlerts, AlertList(), at));
                publications.Add(new EventPublication(Paths.AlertRaised, (JsonObject)_fault.DeepClone(), at));
            }
        }
        else if (_fault is not null)
        {
            publications.AddRange(ClearFault(at));
        }
        else if (!alertsWereKnown)
        {
            // The first operating state without a fault: now it is known that no alert stands.
            publications.Add(new ValuePublication(Paths.ActiveAlerts, AlertList(), at));
        }

        if (Offline)
        {
            // A machine that is off runs no program.
            publications.Add(new ValuePublication(Paths.ActiveWorkMaster, null, at));
            publications.Add(new ValuePublication(Signal(Paths.ActiveProgram), null, at));
        }

        publications.Add(new ValuePublication(Paths.Status, new JsonObject
        {
            ["MachineryItemState"] = itemState,
            ["MachineryOperationMode"] = operationMode,
        }, at));
        return publications;
    }

    private List<Publication> TranslateOrder(OrderObserved order, DateTimeOffset at)
    {
        List<Publication> publications = [];
        if (order.Event == OrderEvent.Stopped)
        {
            // The processing ended, finished or paused: the machine runs no program until the next order.
            publications.Add(new ValuePublication(Paths.ActiveWorkMaster, null, at));
            publications.Add(new ValuePublication(Signal(Paths.ActiveProgram), null, at));
        }
        else if (!string.IsNullOrEmpty(order.ProgramName))
        {
            publications.Add(new ValuePublication(Paths.ActiveWorkMaster, order.ProgramName, at));
            publications.Add(new ValuePublication(Signal(Paths.ActiveProgram), order.ProgramName, at));
        }

        publications.Add(new ValuePublication(Signal(Paths.ActiveOrder), order.OrderNo, at));
        publications.Add(new ValuePublication(Signal(Paths.ActivePackage), order.ProductionPackage, at));
        if (!string.IsNullOrEmpty(order.PartNo))
        {
            publications.Add(new ValuePublication(Signal(Paths.ActivePart), order.PartNo, at));
        }

        AddCount(publications, Paths.ProcessedParts, order.ProcessedParts, at);
        AddCount(publications, Paths.DesiredParts, order.DesiredParts, at);
        AddCount(publications, Paths.ScrapParts, order.ScrapParts, at);

        var finished = order.ProcessedParts is { } processed && order.DesiredParts is { } desired && desired > 0 && processed >= desired;
        var orderKey = $"{order.ProductionPackage}/{order.OrderNo}";
        if (finished && _lastFinishedOrder != orderKey)
        {
            _lastFinishedOrder = orderKey;
            publications.Add(Notification("RCI-ORDER-FINISHED",
                $"Order {order.OrderNo} finished: {order.ProcessedParts} of {order.DesiredParts} parts", at));
        }
        else if (!finished && _lastFinishedOrder == orderKey)
        {
            // The positions of a kit start again from 0 for its next run.
            _lastFinishedOrder = null;
        }

        return publications;
    }

    private List<Publication> TranslatePackage(PackageObserved package, DateTimeOffset at)
    {
        List<Publication> publications = [new ValuePublication(Signal(Paths.ActivePackage), package.Name, at)];
        AddCount(publications, Paths.PackageProcessed, package.ProcessedQuantity, at);
        AddCount(publications, Paths.PackageDesired, package.DesiredQuantity, at);
        return publications;
    }

    private List<Publication> ClearFault(DateTimeOffset at)
    {
        if (_fault is null)
        {
            return [];
        }

        var cleared = _fault;
        _fault = null;
        return
        [
            new ValuePublication(Paths.ActiveAlerts, AlertList(), at),
            new EventPublication(Paths.AlertCleared, cleared, at),
        ];
    }

    /// <summary>The whole list of <c>Notification.ActiveAlerts</c>; <c>[]</c> for none.</summary>
    private JsonArray AlertList() => _fault is null ? [] : [_fault.DeepClone()];

    /// <summary>A message that does not stay: an alert without <c>Severity</c>.</summary>
    private EventPublication Notification(string errorCode, string message, DateTimeOffset at) =>
        new(Paths.NotificationEvent, new JsonObject
        {
            ["Id"] = _newId(),
            ["ErrorCode"] = errorCode,
            ["Message"] = message,
            ["Time"] = MachineBinding.Timestamp(at),
        }, at);

    private ValuePublication Signal(string relativePath, int value, DateTimeOffset at) =>
        new(Signal(relativePath), value, at, MachineUnit.One.Name);

    private void AddCount(List<Publication> publications, string relativePath, int? value, DateTimeOffset at)
    {
        if (value is { } number)
        {
            publications.Add(Signal(relativePath, number, at));
        }
    }

    /// <summary>The time of the machine in UTC; one in the future, which the binding does not allow, is now.</summary>
    private DateTimeOffset Time(DateTime utc)
    {
        var now = _time.GetUtcNow();
        var at = new DateTimeOffset(DateTime.SpecifyKind(utc, DateTimeKind.Utc));
        return at > now ? now : at;
    }

    /// <summary>
    /// Makes the timestamps of each path strictly increasing. The RCI timestamps have whole seconds, so a fault and its
    /// end often share one; the value that came later must stay the later one in the store. The later value moves one
    /// millisecond past the earlier. The events count as one path: they share a topic.
    /// </summary>
    private List<Publication> Ordered(List<Publication> publications)
    {
        for (var i = 0; i < publications.Count; i++)
        {
            var publication = publications[i];
            var key = publication switch
            {
                ValuePublication value => value.Path,
                EventPublication => "events/notifications",
                _ => string.Empty,
            };
            if (_lastTimestamp.TryGetValue(key, out var last) && publication.Timestamp <= last)
            {
                publication = publication with { Timestamp = last + Tick };
                publications[i] = publication;
            }

            _lastTimestamp[key] = publication.Timestamp;
        }

        return publications;
    }
}

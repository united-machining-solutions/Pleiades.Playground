using System.Text.Json;

namespace Pleiades.Playground.JuiceBar.Api;

internal sealed record LiveOrder(string? State, double? ProgressFraction);

internal sealed record LiveSnapshot(bool Connected, string? ProductionState, string? PumpControlMode,
    string? PumpControlServiceState, double? ProgressFraction, IReadOnlyList<QueuedOrder> Queue,
    IReadOnlyDictionary<int, bool> AmountWarnings, DateTimeOffset ObservedAt);

/// <summary>
/// What the machine last said over its Socket.IO interface: the state of the production, the queue, the
/// warnings of the pumps and the state of each order. Nothing is kept across a lost connection.
/// </summary>
internal sealed class LiveState(TimeProvider time)
{
    private readonly Lock _gate = new();
    private readonly Dictionary<int, bool> _warnings = [];
    private readonly Dictionary<int, LiveOrder> _orders = [];

    // Orders this service placed that the machine does not list yet: it answers an order first and puts it into
    // the queue a moment later, after it has loaded the program.
    private readonly HashSet<int> _placed = [];
    private IReadOnlyList<QueuedOrder> _queue = [];
    private bool _connected;
    private string? _productionState;
    private string? _pumpControlMode;
    private string? _serviceState;
    private double? _progress;
    private DateTimeOffset _observedAt = time.GetUtcNow();

    internal LiveSnapshot Snapshot()
    {
        lock (_gate)
        {
            return new(_connected, _productionState, _pumpControlMode, _serviceState, _progress, _queue,
                new Dictionary<int, bool>(_warnings), _observedAt);
        }
    }

    internal LiveOrder? Order(int orderNumber)
    {
        lock (_gate)
        {
            return _orders.GetValueOrDefault(orderNumber);
        }
    }

    /// <summary>Counts an order this service placed as waiting until the machine lists it.</summary>
    internal void Placed(int orderNumber)
    {
        lock (_gate)
        {
            if (!_queue.Any(q => q.OrderNumber == orderNumber))
            {
                _placed.Add(orderNumber);
            }
        }
    }

    /// <summary>The orders this service placed that are not in the queue of the machine yet.</summary>
    internal int PlacedNotQueued()
    {
        lock (_gate)
        {
            return _placed.Count;
        }
    }

    internal void Connected()
    {
        lock (_gate)
        {
            _connected = true;
            _observedAt = time.GetUtcNow();
        }
    }

    internal void Disconnected()
    {
        lock (_gate)
        {
            _connected = false;
            _productionState = _pumpControlMode = _serviceState = null;
            _progress = null;
            _queue = [];
            _warnings.Clear();
            _orders.Clear();
            _placed.Clear();
            _observedAt = time.GetUtcNow();
        }
    }

    /// <summary>Takes one event of the machine. Events and shapes it does not know are ignored.</summary>
    internal void Apply(string channel, string name, JsonElement value)
    {
        lock (_gate)
        {
            _observedAt = time.GetUtcNow();
            switch (channel, name)
            {
                case ("/production", "state"):
                    _productionState = Text(value);
                    if (_productionState != "processingOrder")
                    {
                        _progress = null;
                    }

                    break;
                case ("/production", "pumpControlMode"):
                    _pumpControlMode = Text(value);
                    break;
                case ("/production", "pumpControlServiceState"):
                    _serviceState = Text(value);
                    break;
                case ("/production", "progress"):
                    // The machine repeats the progress of the last drink to a new listener; it counts only while it mixes.
                    _progress = _productionState == "processingOrder" ? Fraction(value) : null;
                    break;
                case ("/production", "queue") when value.ValueKind == JsonValueKind.Array:
                    _queue = [.. value.EnumerateArray().Select(ToQueued).OfType<QueuedOrder>()];
                    _placed.ExceptWith(_queue.Select(q => q.OrderNumber));
                    break;
                case ("/production", "amountWarning" or "warning") when Number(value, "pumpNr") is { } pump:
                    // The machine marks a pump without a warning with warningCleared; anything else is a warning.
                    _warnings[pump] = !(value.TryGetProperty("warningCleared", out var cleared)
                        && cleared.ValueKind == JsonValueKind.True);
                    break;
                case ("/orders", "state") when Number(value, "orderNumber") is { } number:
                    _orders[number] = (_orders.GetValueOrDefault(number) ?? new(null, null)) with
                    {
                        State = value.TryGetProperty("toState", out var state) ? Text(state) : null,
                    };
                    if (_orders[number].State == "error")
                    {
                        // An order that failed before it reached the queue never will.
                        _placed.Remove(number);
                    }

                    break;
                case ("/orders", "progress") when Number(value, "orderNumber") is { } number:
                    _orders[number] = (_orders.GetValueOrDefault(number) ?? new(null, null)) with
                    {
                        ProgressFraction = value.TryGetProperty("progress", out var progress) ? Fraction(progress) : null,
                    };
                    break;
                default:
                    break;
            }
        }
    }

    internal static int? Number(JsonElement value, string property)
    {
        if (value.ValueKind != JsonValueKind.Object || !value.TryGetProperty(property, out var element))
        {
            return null;
        }

        return element.ValueKind switch
        {
            JsonValueKind.Number when element.TryGetInt32(out var number) => number,
            JsonValueKind.String when int.TryParse(element.GetString(), System.Globalization.NumberStyles.None,
                System.Globalization.CultureInfo.InvariantCulture, out var number) => number,
            _ => null,
        };
    }

    internal static string? Text(JsonElement value) => value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    // The machine counts progress in percent.
    private static double? Fraction(JsonElement value)
        => value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var percent) && double.IsFinite(percent)
            ? Math.Clamp(percent / 100, 0, 1)
            : null;

    private static QueuedOrder? ToQueued(JsonElement value, int index)
        => Number(value, "orderNumber") is { } number
            ? new(number, Property(value, "orderName"), Property(value, "drinkId"), Number(value, "queuePlace") ?? index)
            : null;

    private static string? Property(JsonElement value, string name)
        => value.TryGetProperty(name, out var element) ? Text(element) : null;
}

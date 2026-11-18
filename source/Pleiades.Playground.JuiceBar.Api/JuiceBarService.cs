using Microsoft.Extensions.Options;

namespace Pleiades.Playground.JuiceBar.Api;

/// <summary>What REST and MCP both offer: the card, the status, and an order with its guards.</summary>
internal sealed class JuiceBarService(MixerClient mixer, LiveState live, IOptions<JuiceBarOptions> options, TimeProvider time)
    : IDisposable
{
    internal const string StartButtonHint =
        "The order waits in the queue. A person puts a glass under the outlet and presses the start button on the machine; this service never starts the production.";

    // The states of the production in which the machine takes an order and can soon make it.
    // One order at a time: the check of the queue and the order it allows belong together.
    private readonly SemaphoreSlim _ordering = new(1, 1);

    private static readonly HashSet<string> Ready = new(StringComparer.Ordinal)
    {
        "waitingOrder", "waitingStart", "startProcessing", "processingOrder", "finished",
    };

    public void Dispose() => _ordering.Dispose();

    /// <summary>
    /// The card, each ingredient with whether the bottle of its pump warns. The warnings come over the socket of
    /// the machine; while none are known, the ingredients say nothing about their bottles.
    /// </summary>
    internal async Task<IReadOnlyList<Drink>> DrinksAsync(CancellationToken cancellationToken)
    {
        var drinks = await mixer.DrinksAsync(cancellationToken).ConfigureAwait(false);
        var warnings = live.Snapshot().AmountWarnings;
        if (warnings.Count == 0)
        {
            return drinks;
        }

        IReadOnlyList<Pump> pumps;
        try
        {
            pumps = await mixer.PumpsAsync(warnings, cancellationToken).ConfigureAwait(false);
        }
        catch (JuiceBarUnavailableException)
        {
            return drinks;
        }

        var low = pumps.Where(p => p.ComponentId is not null && p.AmountWarning is not null)
            .GroupBy(p => p.ComponentId!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.Any(p => p.AmountWarning == true), StringComparer.OrdinalIgnoreCase);
        return [.. drinks.Select(drink => drink with
        {
            Components = [.. drink.Components.Select(c => low.TryGetValue(c.Id, out var runsLow) ? c with { RunsLow = runsLow } : c)],
        })];
    }

    // The machine answers an unknown id with an error of its marketplace, so the card decides what exists.
    internal async Task<Drink> DrinkAsync(string id, CancellationToken cancellationToken)
        => (await DrinksAsync(cancellationToken).ConfigureAwait(false))
            .FirstOrDefault(d => string.Equals(d.Id, id, StringComparison.OrdinalIgnoreCase))
            ?? throw new KeyNotFoundException($"No drink with the id '{id}' is on the card.");

    internal async Task<JuiceBarStatus> StatusAsync(CancellationToken cancellationToken)
    {
        var snapshot = live.Snapshot();
        IReadOnlyList<Pump> pumps;
        try
        {
            pumps = await mixer.PumpsAsync(snapshot.AmountWarnings, cancellationToken).ConfigureAwait(false);
        }
        catch (JuiceBarUnavailableException) when (!snapshot.Connected)
        {
            // A machine that is switched off has a status too: not connected, and nothing known about its pumps.
            pumps = [];
        }

        return new(snapshot.Connected, snapshot.ProductionState, snapshot.PumpControlMode, snapshot.PumpControlServiceState,
            snapshot.ProgressFraction, snapshot.Queue, pumps, options.Value.EnableOrdering, options.Value.MaximumQueueLength,
            time.GetUtcNow());
    }

    internal async Task<Order> OrderAsync(int orderNumber, CancellationToken cancellationToken)
    {
        var order = await mixer.OrderAsync(orderNumber, cancellationToken).ConfigureAwait(false)
            ?? throw new KeyNotFoundException($"The juice bar knows no order {orderNumber}.");
        return WithLiveState(order);
    }

    internal async Task<Order> CreateOrderAsync(string drinkId, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(drinkId);
        if (!options.Value.EnableOrdering)
        {
            throw new InvalidOperationException("Ordering is switched off in this service (JUICEBAR_ENABLE_ORDERING).");
        }

        await _ordering.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var snapshot = live.Snapshot();
            if (!snapshot.Connected)
            {
                throw new JuiceBarUnavailableException("The state of the juice bar is unknown, so no order is placed.");
            }

            if (snapshot.ProductionState is not { } state || !Ready.Contains(state))
            {
                throw new InvalidOperationException(
                    $"The juice bar takes no order now (production state: {snapshot.ProductionState ?? "unknown"}).");
            }

            // The machine lists an order a moment after it answered it, so the orders placed here count too.
            var waiting = snapshot.Queue.Count + live.PlacedNotQueued();
            if (waiting >= options.Value.MaximumQueueLength)
            {
                throw new InvalidOperationException(
                    $"{waiting} orders wait at the juice bar; the limit is {options.Value.MaximumQueueLength}. Try again when one is made.");
            }

            var drink = await DrinkAsync(drinkId, cancellationToken).ConfigureAwait(false);
            var order = await mixer.CreateOrderAsync(drink.Id, cancellationToken).ConfigureAwait(false);
            live.Placed(order.OrderNumber);
            return WithLiveState(order) with { NextStep = StartButtonHint };
        }
        finally
        {
            _ordering.Release();
        }
    }

    private Order WithLiveState(Order order)
    {
        var known = live.Order(order.OrderNumber);
        var place = live.Snapshot().Queue.FirstOrDefault(q => q.OrderNumber == order.OrderNumber)?.QueuePlace;
        return order with { State = known?.State, ProgressFraction = known?.ProgressFraction, QueuePlace = place };
    }
}

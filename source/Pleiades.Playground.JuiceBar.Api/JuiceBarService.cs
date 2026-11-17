using Microsoft.Extensions.Options;

namespace Pleiades.Playground.JuiceBar.Api;

/// <summary>What REST and MCP both offer: the card, the status, and an order with its guards.</summary>
internal sealed class JuiceBarService(MixerClient mixer, LiveState live, IOptions<JuiceBarOptions> options, TimeProvider time)
{
    internal const string StartButtonHint =
        "The order waits in the queue. A person puts a glass under the outlet and presses the start button on the machine; this service never starts the production.";

    // The states of the production in which the machine takes an order and can soon make it.
    private static readonly HashSet<string> Ready = new(StringComparer.Ordinal)
    {
        "waitingOrder", "waitingStart", "startProcessing", "processingOrder", "finished",
    };

    internal Task<IReadOnlyList<Drink>> DrinksAsync(CancellationToken cancellationToken) => mixer.DrinksAsync(cancellationToken);

    internal async Task<Drink> DrinkAsync(string id, CancellationToken cancellationToken)
        => await mixer.DrinkAsync(id, cancellationToken).ConfigureAwait(false)
            ?? throw new KeyNotFoundException($"No drink with the id '{id}' is on the card.");

    internal async Task<JuiceBarStatus> StatusAsync(CancellationToken cancellationToken)
    {
        var snapshot = live.Snapshot();
        var pumps = await mixer.PumpsAsync(snapshot.AmountWarnings, cancellationToken).ConfigureAwait(false);
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

        if (snapshot.Queue.Count >= options.Value.MaximumQueueLength)
        {
            throw new InvalidOperationException(
                $"{snapshot.Queue.Count} orders wait at the juice bar; the limit is {options.Value.MaximumQueueLength}. Try again when one is made.");
        }

        var drink = await DrinkAsync(drinkId, cancellationToken).ConfigureAwait(false);
        var order = await mixer.CreateOrderAsync(drink.Id, cancellationToken).ConfigureAwait(false);
        return WithLiveState(order) with { NextStep = StartButtonHint };
    }

    private Order WithLiveState(Order order)
    {
        var known = live.Order(order.OrderNumber);
        var place = live.Snapshot().Queue.FirstOrDefault(q => q.OrderNumber == order.OrderNumber)?.QueuePlace;
        return order with { State = known?.State, ProgressFraction = known?.ProgressFraction, QueuePlace = place };
    }
}

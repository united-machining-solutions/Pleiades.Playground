// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Pleiades.Playground.Simulator.Spec;

/// <summary>
/// What the routes of a machine keep across restarts: the next number of each route it starts, and the job orders
/// it has taken from the machine before it, so that it takes none twice.
/// </summary>
internal sealed class RouteState
{
    /// <summary>The number of the next job order of each route this machine starts, by route.</summary>
    public Dictionary<string, int> NextJobOrderNumbers { get; init; } = new(StringComparer.Ordinal);

    /// <summary>The job orders taken from the machine before, as <c>{route} {JobOrderID}</c>, oldest first.</summary>
    public List<string> Taken { get; init; } = [];
}

/// <summary>
/// A job order of the machine before, from its two retained lists: the entry of <c>JobMonitoring.JobOrders</c>
/// and, once it started, the one of <c>JobMonitoring.JobOrderResults</c>.
/// </summary>
/// <param name="JobOrderId">Its <c>JobOrderID</c>.</param>
/// <param name="State">Its <c>State</c>.</param>
/// <param name="WorkMasterId">Its <c>WorkMasterID</c>; it tells the route.</param>
/// <param name="RunsPlanned">Its <c>RunsPlanned</c>.</param>
/// <param name="GoodQuantity">The <c>GoodQuantity</c> of its result; null without a result.</param>
/// <param name="ResultFinal">Whether its result has an <c>EndTime</c>: the good parts are final.</param>
internal sealed record UpstreamJobOrder(
    string JobOrderId, string State, string? WorkMasterId, long? RunsPlanned, double? GoodQuantity, bool ResultFinal)
{
    /// <summary>
    /// The job orders of a machine from the <c>value</c> of its two retained lists (the arrays, or null while one is
    /// not known). An entry without a <c>JobOrderID</c> is left out.
    /// </summary>
    public static IReadOnlyList<UpstreamJobOrder> FromLists(JsonNode? jobOrders, JsonNode? results)
    {
        var resultsById = new Dictionary<string, JsonObject>(StringComparer.Ordinal);
        if (results is JsonArray resultList)
        {
            foreach (var entry in resultList.OfType<JsonObject>())
            {
                if (TextOf(entry, "JobOrderID") is { } id)
                {
                    resultsById[id] = entry;
                }
            }
        }
        if (jobOrders is not JsonArray list)
        {
            return [];
        }
        var orders = new List<UpstreamJobOrder>();
        foreach (var entry in list.OfType<JsonObject>())
        {
            if (TextOf(entry, "JobOrderID") is not { } id)
            {
                continue;
            }
            resultsById.TryGetValue(id, out var result);
            orders.Add(new UpstreamJobOrder(
                id,
                TextOf(entry, "State") ?? string.Empty,
                TextOf(entry, "WorkMasterID"),
                NumberOf(entry, "RunsPlanned") is { } runs ? (long)runs : null,
                result is null ? null : NumberOf(result, "GoodQuantity"),
                result?["EndTime"] is JsonValue));
        }
        return orders;
    }

    private static string? TextOf(JsonObject entry, string property)
    {
        return entry[property] is JsonValue value && value.GetValueKind() == JsonValueKind.String ? value.GetValue<string>() : null;
    }

    private static double? NumberOf(JsonObject entry, string property)
    {
        if (entry[property] is not JsonValue value || value.GetValueKind() != JsonValueKind.Number)
        {
            return null;
        }
        // Parsed from the wire it is a JSON number; built in the process it may be a long or an int.
        return value.TryGetValue(out double number) ? number
            : value.TryGetValue(out long integer) ? integer
            : value.TryGetValue(out int small) ? small
            : null;
    }
}

/// <summary>The routes of the virtual machine: job orders that pass several machines under one <c>JobOrderID</c>.</summary>
internal sealed partial class VirtualMachine
{
    /// <summary>How many taken job orders the state keeps; older ones have long left the list of the machine before.</summary>
    private const int TakenKept = 1000;

    private readonly List<RouteStep> _routeSteps = [];
    private readonly Dictionary<string, DateTimeOffset> _nextRouteJobOrder = new(StringComparer.Ordinal);
    private readonly Dictionary<string, int> _nextRouteNumbers = new(StringComparer.Ordinal);
    private readonly List<string> _taken = [];
    private readonly HashSet<string> _takenSet = new(StringComparer.Ordinal);
    private string _machineId = string.Empty;

    /// <summary>The machine id of this machine, as the routes name it.</summary>
    public string MachineId => _machineId;

    /// <summary>The machines this one follows in a route: the machine ids of the steps before its own.</summary>
    public IReadOnlyCollection<string> Upstream =>
        [.. _routeSteps.Where(s => s.Previous is not null).Select(s => s.Previous!.MachineId).Distinct(StringComparer.Ordinal)];

    /// <summary>Whether the state of the routes changed since it was last taken.</summary>
    public bool RouteStateChanged { get; private set; }

    /// <summary>The state of the routes to keep across a restart; it is no longer <see cref="RouteStateChanged"/>.</summary>
    public RouteState TakeRouteState()
    {
        RouteStateChanged = false;
        return new RouteState
        {
            NextJobOrderNumbers = new Dictionary<string, int>(_nextRouteNumbers, StringComparer.Ordinal),
            Taken = [.. _taken],
        };
    }

    /// <summary>
    /// Takes what the machine before said: its job orders, from its two retained lists. A job order of the route
    /// that shows up there is added as <c>NotAllowedToStart</c>; once it ended there it is released with the good
    /// parts as <c>RunsPlanned</c>; aborted or cancelled there, or ended without a good part, or gone from the list
    /// before it ended, it is cancelled here. A job order taken once is never taken again, also after a restart.
    /// </summary>
    /// <param name="upstreamMachineId">The machine id of the machine whose lists these are.</param>
    /// <param name="orders">Its job orders, the whole list.</param>
    public void ObserveUpstream(string upstreamMachineId, IReadOnlyList<UpstreamJobOrder> orders)
    {
        ArgumentNullException.ThrowIfNull(upstreamMachineId);
        ArgumentNullException.ThrowIfNull(orders);
        foreach (var step in _routeSteps.Where(s => string.Equals(s.Previous?.MachineId, upstreamMachineId, StringComparison.Ordinal)))
        {
            var workMaster = step.Previous!.ToTemplate(1).WorkMasterId;
            var ofRoute = orders.Where(o => string.Equals(o.WorkMasterId, workMaster, StringComparison.Ordinal)).ToList();
            foreach (var order in ofRoute)
            {
                Follow(step, order);
            }

            // A job order that left the list of the machine before without having ended there will not come.
            var listed = ofRoute.Select(o => o.JobOrderId).ToHashSet(StringComparer.Ordinal);
            foreach (var job in _jobOrders.Where(j => j.Route == step.Route && j.State == "NotAllowedToStart" && !listed.Contains(j.Id)).ToList())
            {
                CancelRouteJobOrder(job);
            }
        }
    }

    private void InitialiseRoutes(RouteState state)
    {
        _machineId = SpecManifest.MachineId(_identity, _config);
        foreach (var taken in state.Taken.TakeLast(TakenKept))
        {
            if (_takenSet.Add(taken))
            {
                _taken.Add(taken);
            }
        }
        foreach (var (name, route) in _config.Routes.Where(r => r.Value.Enabled && r.Value.Steps.Count > 0))
        {
            for (var index = 0; index < route.Steps.Count; index++)
            {
                if (string.Equals(route.Steps[index].MachineId, _machineId, StringComparison.Ordinal))
                {
                    _routeSteps.Add(new RouteStep(name, route, index));
                }
            }
            if (string.Equals(route.Steps[0].MachineId, _machineId, StringComparison.Ordinal))
            {
                _nextRouteNumbers[name] = Math.Max(route.FirstJobOrderNumber, state.NextJobOrderNumbers.GetValueOrDefault(name));
                _nextRouteJobOrder[name] = _now;
            }
        }
        // The first job order of a route comes with the start, before the machine takes its first job order.
        AddRouteJobOrders();
    }

    /// <summary>
    /// The machine of the first step of a route adds its job orders: one every <see cref="RouteConfig.Interval"/>,
    /// none while one of the route still waits here. It is released at once; it goes before the own queue.
    /// </summary>
    private void AddRouteJobOrders()
    {
        foreach (var name in _nextRouteJobOrder.Keys.ToList())
        {
            if (_now < _nextRouteJobOrder[name]
                || _jobOrders.Any(j => j.Route == name && j.State is "NotAllowedToStart" or "AllowedToStart"))
            {
                continue;
            }
            var route = _config.Routes[name];
            var number = _nextRouteNumbers[name];
            _nextRouteNumbers[name] = number + 1;
            RouteStateChanged = true;
            var job = new JobOrder(string.Create(CultureInfo.InvariantCulture, $"{number}/01"), route.Steps[0].ToTemplate(route.Quantity))
            {
                State = "NotAllowedToStart",
                StateSince = _now,
                Route = name,
            };
            _jobOrders.Add(job);
            _jobOrdersChanged = true;
            EmitJob(SpecElements.JobOrderAdded, job);
            ChangeJobState(job, "AllowedToStart");
            _nextRouteJobOrder[name] = _now + route.Interval;
        }
    }

    private void Follow(RouteStep step, UpstreamJobOrder order)
    {
        var job = _jobOrders.FirstOrDefault(j => j.Route == step.Route && j.Id == order.JobOrderId);
        if (job is null)
        {
            if (!Take($"{step.Route} {order.JobOrderId}") || order.State == "Aborted" || Final(order) is <= 0)
            {
                return;
            }
            var planned = Final(order) ?? order.RunsPlanned ?? step.Config.Quantity;
            job = new JobOrder(order.JobOrderId, step.Step.ToTemplate((int)Math.Min(planned, 100_000)))
            {
                State = "NotAllowedToStart",
                StateSince = _now,
                Route = step.Route,
            };
            _jobOrders.Add(job);
            _jobOrdersChanged = true;
            EmitJob(SpecElements.JobOrderAdded, job);
        }
        if (job.State != "NotAllowedToStart")
        {
            return;
        }
        if (order.State == "Aborted" || Final(order) is <= 0)
        {
            CancelRouteJobOrder(job);
            return;
        }
        if (Final(order) is not { } good)
        {
            return;
        }
        if (job.RunsPlanned != good)
        {
            job.RunsPlanned = good;
            _jobOrdersChanged = true;
            EmitJob(SpecElements.JobOrderChanged, job);
        }
        ChangeJobState(job, "AllowedToStart");
    }

    /// <summary>The good parts of a job order that ended, once its result is final; null before.</summary>
    private static long? Final(UpstreamJobOrder order)
    {
        return order.State == "Ended" && order.ResultFinal && order.GoodQuantity is { } good ? (long)Math.Round(good) : null;
    }

    /// <summary>Notes a job order as taken; false if it was taken before.</summary>
    private bool Take(string key)
    {
        if (!_takenSet.Add(key))
        {
            return false;
        }
        _taken.Add(key);
        if (_taken.Count > TakenKept)
        {
            _takenSet.Remove(_taken[0]);
            _taken.RemoveAt(0);
        }
        RouteStateChanged = true;
        return true;
    }

    /// <summary>Cancels a job order of a route that has not started: it ends as aborted without having run.</summary>
    private void CancelRouteJobOrder(JobOrder job)
    {
        job.EndTime = _now;
        ChangeJobState(job, "Aborted");
    }

    /// <summary>A step of a route this machine does.</summary>
    private sealed record RouteStep(string Route, RouteConfig Config, int Index)
    {
        public RouteStepConfig Step => Config.Steps[Index];

        public RouteStepConfig? Previous => Index > 0 ? Config.Steps[Index - 1] : null;
    }
}

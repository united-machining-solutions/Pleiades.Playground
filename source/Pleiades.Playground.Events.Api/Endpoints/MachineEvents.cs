// SPDX-License-Identifier: Apache-2.0
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Pleiades.Playground.Common.Authorization;
using Pleiades.Playground.Common.Exceptions;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Events.Api.DataAccessObjects;
using Pleiades.Playground.Events.Api.Mapping;
using Pleiades.Playground.Events.Api.Projections;
using Pleiades.Playground.Events.Api.Repositories.MachineEvent;
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Endpoints;

/// <summary>
/// Endpoints of the CloudEvents of machines, stored as they came, and of the views put together from them when they
/// are read: alerts, job orders, program executions and the gaps in the numbers of the events.
/// </summary>
internal static class MachineEvents
{
    /// <summary>Maps <c>/machineEvents</c>: store, read and find gaps.</summary>
    internal static RouteGroupBuilder MapMachineEvents(this RouteGroupBuilder group)
    {
        group.MapGet("/", GetMachineEvents)
            .WithName("GetMachineEvents")
            .WithSummary("Retrieves the CloudEvents of machines as stored, with pagination and optional filters")
            .RequireFeatureRead(EventsFeature.Name);

        group.MapGet("/gaps", GetSequenceGaps)
            .WithName("GetSequenceGaps")
            .WithSummary("Retrieves the gaps in the numbers (sequence) of the events of each machine and group")
            .RequireFeatureRead(EventsFeature.Name);

        group.MapPost("", PostMachineEvent)
            .WithName("PostMachineEvent")
            .WithSummary("Stores one CloudEvent of a machine as it came")
            .RequireFeatureWrite(EventsFeature.Name);

        group.MapPost("/bulk", BulkPostMachineEvents)
            .WithName("BulkPostMachineEvents")
            .WithSummary("Stores several CloudEvents of machines as they came")
            .RequireFeatureWrite(EventsFeature.Name);

        return group;
    }

    /// <summary>Maps <c>/alerts</c>: active alerts, alerts from raise to clear, and their statistics.</summary>
    internal static RouteGroupBuilder MapAlerts(this RouteGroupBuilder group)
    {
        group.MapGet("/active", GetActiveAlerts)
            .WithName("GetActiveAlerts")
            .WithSummary("Retrieves the alerts that stand now: raised and not cleared")
            .RequireFeatureRead(EventsFeature.Name);

        group.MapGet("/pairs", GetAlertPairs)
            .WithName("GetAlertPairs")
            .WithSummary("Retrieves the alerts that stood in a time range, AlertRaised paired with AlertCleared, with their duration")
            .RequireFeatureRead(EventsFeature.Name);

        group.MapGet("/statistics", GetAlertStatistics)
            .WithName("GetAlertStatistics")
            .WithSummary("Retrieves how many alerts of each NE 107 severity stood in a time range, and for how long")
            .RequireFeatureRead(EventsFeature.Name);

        return group;
    }

    /// <summary>Maps <c>/jobOrders</c>: the last state of each job order and the history of one.</summary>
    internal static RouteGroupBuilder MapJobOrders(this RouteGroupBuilder group)
    {
        group.MapGet("/", GetJobOrders)
            .WithName("GetJobOrders")
            .WithSummary("Retrieves the last known state of each job order, its result included, put together from its events")
            .RequireFeatureRead(EventsFeature.Name);

        // A job order id may contain '/', such as 4711/01: the catch-all takes the rest of the path as it is.
        group.MapGet("/{mId}/{**jobOrderId}", GetJobOrder)
            .WithName("GetJobOrder")
            .WithSummary("Retrieves one job order with its result, its events and its program executions")
            .RequireFeatureRead(EventsFeature.Name);

        return group;
    }

    /// <summary>
    /// Maps <c>/jobs</c>: one job across the machines it passes, by its job order id. A job is what a MES orders under
    /// one id; on each machine it is a job order, at <c>/jobOrders</c>.
    /// </summary>
    internal static RouteGroupBuilder MapJobs(this RouteGroupBuilder group)
    {
        // A job order id may contain '/', such as 4711/01: the catch-all takes the rest of the path as it is.
        group.MapGet("/{**jobOrderId}", GetJob)
            .WithName("GetJob")
            .WithSummary("Retrieves one job across machines: its job order on each machine as a step, the waiting between them and where it stands")
            .RequireFeatureRead(EventsFeature.Name);

        return group;
    }

    /// <summary>Maps <c>/programExecutions</c>.</summary>
    internal static RouteGroupBuilder MapProgramExecutions(this RouteGroupBuilder group)
    {
        group.MapGet("/", GetProgramExecutions)
            .WithName("GetProgramExecutions")
            .WithSummary("Retrieves program executions, Started paired with Ended or Aborted, with duration and sums")
            .RequireFeatureRead(EventsFeature.Name);

        return group;
    }

    /// <summary>Retrieves the CloudEvents of machines as stored, newest first by default.</summary>
    /// <param name="mId">Optional machine id. Example: alcyone-machines_AX-400_P-04</param>
    /// <param name="group">Optional group: JobMonitoring, WorkMasterMonitoring or Notification.</param>
    /// <param name="type">Optional type of the CloudEvent. Example: Notification.AlertRaised</param>
    /// <param name="correlationId">Optional ExecutionId of a program execution.</param>
    /// <param name="jobOrderId">Optional job order: the field JobOrderID of the data. Example: 4711/01</param>
    /// <param name="from">Optional earliest time of the event (inclusive). Example: 2026-11-17T06:00:00Z</param>
    /// <param name="to">Optional latest time of the event (inclusive). Example: 2026-11-17T18:00:00Z</param>
    /// <param name="paging">Pagination parameters (skip, take, sorting by time).</param>
    /// <param name="repository">Repository of the events.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A page of events.</returns>
    internal static async Task<Ok<PagedResponse<MachineEventDtoV1>>> GetMachineEvents(
        [FromQuery] string? mId,
        [FromQuery] string? group,
        [FromQuery] string? type,
        [FromQuery] string? correlationId,
        [FromQuery] string? jobOrderId,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [AsParameters] PagedRequest paging,
        IMachineEventRepository repository,
        CancellationToken cancellationToken)
    {
        var page = paging.Validated();
        var (items, totalCount) = await repository.QueryAsync(
            new MachineEventFilter(mId, group, type, correlationId, jobOrderId, from, to), page.Skip, page.Take, page.Sorting, cancellationToken)
            .ConfigureAwait(false);
        return TypedResults.Ok(PagedResponse.Create(MachineEventMapper.ToDtos(items), totalCount, page));
    }

    /// <summary>
    /// Retrieves the gaps in the numbers of the events: per machine, group and run of the adapter, the counts of
    /// <c>sequence</c> that never arrived. Without <paramref name="from"/>, a run that does not begin with number 1
    /// has a gap before its first event.
    /// </summary>
    /// <param name="mId">Optional machine id.</param>
    /// <param name="group">Optional group: JobMonitoring, WorkMasterMonitoring or Notification.</param>
    /// <param name="from">Optional earliest time of the events (inclusive).</param>
    /// <param name="to">Optional latest time of the events (inclusive).</param>
    /// <param name="repository">Repository of the events.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The gaps.</returns>
    internal static async Task<Ok<List<SequenceGapDtoV1>>> GetSequenceGaps(
        [FromQuery] string? mId,
        [FromQuery] string? group,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        IMachineEventRepository repository,
        CancellationToken cancellationToken)
    {
        var events = await repository.FindForViewAsync(new MachineEventFilter(mId, group, From: from, To: to), cancellationToken).ConfigureAwait(false);
        return TypedResults.Ok(MachineEventViews.Gaps(events, fromStart: from is null));
    }

    /// <summary>Stores one CloudEvent of a machine as it came.</summary>
    /// <param name="dto">The machine id and the CloudEvent.</param>
    /// <param name="repository">Repository of the events.</param>
    /// <param name="timeProvider">The clock.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>201 with the stored event, 400 for an event that is no CloudEvent, 409 for one stored before.</returns>
    internal static async Task<Results<Created<MachineEventDtoV1>, BadRequest<string>, Conflict<string>>> PostMachineEvent(
        MachineEventInputDtoV1 dto,
        IMachineEventRepository repository,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dto);
        MachineEventDao dao;
        try
        {
            dao = MachineEventMapper.ToDao(dto.MId, dto.CloudEvent, timeProvider.GetUtcNow().UtcDateTime);
        }
        catch (ArgumentException ex)
        {
            return TypedResults.BadRequest(ex.Message);
        }

        try
        {
            await repository.CreateAsync(dao, cancellationToken).ConfigureAwait(false);
        }
        catch (PleiadesDuplicateDataException ex)
        {
            return TypedResults.Conflict(ex.Message);
        }

        return TypedResults.Created(new Uri($"/{Uri.EscapeDataString(dao.EventId)}", UriKind.Relative), MachineEventMapper.ToDto(dao));
    }

    /// <summary>Stores several CloudEvents of machines as they came; one stored before is skipped.</summary>
    /// <param name="dtos">The machine ids and the CloudEvents.</param>
    /// <param name="repository">Repository of the events.</param>
    /// <param name="timeProvider">The clock.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>201, 400 when one is no CloudEvent (nothing is stored), 409 when some were stored before (the others are).</returns>
    internal static async Task<Results<Created, BadRequest<string>, Conflict<string>>> BulkPostMachineEvents(
        List<MachineEventInputDtoV1> dtos,
        IMachineEventRepository repository,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dtos);
        var now = timeProvider.GetUtcNow().UtcDateTime;
        List<MachineEventDao> daos;
        try
        {
            daos = [.. dtos.Select(d => MachineEventMapper.ToDao(d.MId, d.CloudEvent, now))];
        }
        catch (ArgumentException ex)
        {
            return TypedResults.BadRequest(ex.Message);
        }

        try
        {
            await repository.CreateManyAsync(daos, cancellationToken).ConfigureAwait(false);
        }
        catch (PleiadesDuplicateDataException ex)
        {
            return TypedResults.Conflict(ex.Message);
        }

        return TypedResults.Created(new Uri("/bulk", UriKind.Relative));
    }

    /// <summary>Retrieves the alerts that stand now: raised and not cleared, in the order they came up.</summary>
    /// <param name="mId">Optional machine id.</param>
    /// <param name="paging">Pagination parameters (skip, take, sorting by the time raised).</param>
    /// <param name="repository">Repository of the events.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A page of alerts.</returns>
    internal static async Task<Ok<PagedResponse<AlertDtoV1>>> GetActiveAlerts(
        [FromQuery] string? mId,
        [AsParameters] PagedRequest paging,
        IMachineEventRepository repository,
        CancellationToken cancellationToken)
    {
        var page = paging.Validated();
        var alerts = await ReadActiveAlertsAsync(repository, mId, cancellationToken).ConfigureAwait(false);
        var (items, totalCount) = MachineEventViews.Page(alerts, a => a.RaisedAt, page);
        return TypedResults.Ok(PagedResponse.Create(items, totalCount, page));
    }

    /// <summary>
    /// Retrieves every alert that stood at some time in the range: raised before <paramref name="to"/> and not
    /// cleared before <paramref name="from"/>, paired by its id, with when it was cleared and how long it stood.
    /// </summary>
    /// <param name="mId">Optional machine id.</param>
    /// <param name="severity">Optional NE 107 severity: Failure, CheckFunction, OffSpec or MaintenanceRequired.</param>
    /// <param name="from">Optional start of the range (inclusive).</param>
    /// <param name="to">Optional end of the range (inclusive).</param>
    /// <param name="paging">Pagination parameters (skip, take, sorting by the time raised).</param>
    /// <param name="repository">Repository of the events.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A page of alerts with their clear.</returns>
    internal static async Task<Ok<PagedResponse<AlertPairDtoV1>>> GetAlertPairs(
        [FromQuery] string? mId,
        [FromQuery] string? severity,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [AsParameters] PagedRequest paging,
        IMachineEventRepository repository,
        CancellationToken cancellationToken)
    {
        var page = paging.Validated();
        var pairs = await ReadAlertPairsAsync(repository, mId, severity, from, to, cancellationToken).ConfigureAwait(false);
        var (items, totalCount) = MachineEventViews.Page(pairs, p => p.RaisedAt, page);
        return TypedResults.Ok(PagedResponse.Create(items, totalCount, page));
    }

    /// <summary>Retrieves how many alerts of each NE 107 severity stood in the range, how many still stand and how long the others stood.</summary>
    /// <param name="mId">Optional machine id.</param>
    /// <param name="from">Optional start of the range (inclusive).</param>
    /// <param name="to">Optional end of the range (inclusive).</param>
    /// <param name="repository">Repository of the events.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>One entry per severity that occurred.</returns>
    internal static async Task<Ok<List<AlertStatisticDtoV1>>> GetAlertStatistics(
        [FromQuery] string? mId,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        IMachineEventRepository repository,
        CancellationToken cancellationToken)
    {
        var pairs = await ReadAlertPairsAsync(repository, mId, null, from, to, cancellationToken).ConfigureAwait(false);
        return TypedResults.Ok(MachineEventViews.AlertStatistics(pairs));
    }

    /// <summary>
    /// Retrieves the last known state of each job order, one per machine and job order id, put together from its
    /// events when it is read. A job that passes several machines has the same job order id on each of them.
    /// </summary>
    /// <param name="mId">Optional machine id.</param>
    /// <param name="jobOrderId">Optional job order id, on every machine that has it. Example: 4711/01</param>
    /// <param name="orderNumber">Optional order number of the ERP: one of the OrderNumbers of the job order. Example: SO-4711</param>
    /// <param name="state">Optional state after the last event, such as Running or Ended.</param>
    /// <param name="from">Optional earliest time of the last change (inclusive).</param>
    /// <param name="to">Optional latest time of the last change (inclusive).</param>
    /// <param name="paging">Pagination parameters (skip, take, sorting by the last change).</param>
    /// <param name="repository">Repository of the events.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A page of job orders.</returns>
    internal static async Task<Ok<PagedResponse<JobOrderDtoV1>>> GetJobOrders(
        [FromQuery] string? mId,
        [FromQuery] string? jobOrderId,
        [FromQuery] string? orderNumber,
        [FromQuery] string? state,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [AsParameters] PagedRequest paging,
        IMachineEventRepository repository,
        CancellationToken cancellationToken)
    {
        var page = paging.Validated();
        var jobOrders = await ReadJobOrdersAsync(
            repository, new JobOrderQuery(mId, jobOrderId, orderNumber, state, from, to), cancellationToken).ConfigureAwait(false);
        var (items, totalCount) = MachineEventViews.Page(jobOrders, j => j.LastChange, page);
        return TypedResults.Ok(PagedResponse.Create(items, totalCount, page));
    }

    /// <summary>Retrieves one job order: its last known state with its result, its events and its program executions, oldest first.</summary>
    /// <param name="mId">Machine id. Example: alcyone-machines_AX-400_P-04</param>
    /// <param name="jobOrderId">Job order, as the machine names it; it may contain '/'. Example: 4711/01</param>
    /// <param name="repository">Repository of the events.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The job order with its history, or 404 if no event names it.</returns>
    internal static async Task<Results<Ok<JobOrderHistoryDtoV1>, NotFound>> GetJobOrder(
        string mId,
        string jobOrderId,
        IMachineEventRepository repository,
        CancellationToken cancellationToken)
    {
        var jobs = await repository.FindForViewAsync(new MachineEventFilter(mId, "JobMonitoring", JobOrderId: jobOrderId), cancellationToken).ConfigureAwait(false);
        var executions = await repository.FindForViewAsync(new MachineEventFilter(mId, "WorkMasterMonitoring", JobOrderId: jobOrderId), cancellationToken).ConfigureAwait(false);
        var history = MachineEventViews.History(MachineEventMapper.ToDtos(jobs), MachineEventMapper.ToDtos(executions), mId, jobOrderId);
        return history is null ? TypedResults.NotFound() : TypedResults.Ok(history);
    }

    /// <summary>
    /// Retrieves one job across machines by its job order id, the id of the MES that stands on every machine the job
    /// passes. Each machine with a job order of that id is a step: its last life there, with its result and the sums
    /// of the program executions that started from its start on. The steps are sorted by start, then planned start,
    /// then first seen; each says how long the job waited for it after the step before.
    /// </summary>
    /// <param name="jobOrderId">Job order id; it may contain '/'. Example: 4711/01</param>
    /// <param name="repository">Repository of the events.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The job with its steps, or 404 if no event names the job order.</returns>
    internal static async Task<Results<Ok<JobDtoV1>, NotFound>> GetJob(
        string jobOrderId,
        IMachineEventRepository repository,
        CancellationToken cancellationToken)
    {
        var job = await ReadJobAsync(repository, jobOrderId, cancellationToken).ConfigureAwait(false);
        return job is null ? TypedResults.NotFound() : TypedResults.Ok(job);
    }

    /// <summary>Retrieves program executions: the events of each paired by its ExecutionId, with duration, parts and energy of its end.</summary>
    /// <param name="mId">Optional machine id.</param>
    /// <param name="jobOrderId">Optional job order the program executions belong to.</param>
    /// <param name="workMasterId">Optional work master. Example: WM-SHAFT-4711</param>
    /// <param name="from">Optional earliest time of the events (inclusive).</param>
    /// <param name="to">Optional latest time of the events (inclusive).</param>
    /// <param name="paging">Pagination parameters (skip, take, sorting by start time).</param>
    /// <param name="repository">Repository of the events.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A page of program executions.</returns>
    internal static async Task<Ok<PagedResponse<ProgramExecutionDtoV1>>> GetProgramExecutions(
        [FromQuery] string? mId,
        [FromQuery] string? jobOrderId,
        [FromQuery] string? workMasterId,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [AsParameters] PagedRequest paging,
        IMachineEventRepository repository,
        CancellationToken cancellationToken)
    {
        var page = paging.Validated();
        var executions = await ReadProgramExecutionsAsync(repository, mId, jobOrderId, workMasterId, from, to, cancellationToken).ConfigureAwait(false);
        var (items, totalCount) = MachineEventViews.Page(executions, p => p.StartTime, page);
        return TypedResults.Ok(PagedResponse.Create(items, totalCount, page));
    }

    // ─── reads shared with the MCP tools ───────────────────────────────────────

    internal static async Task<List<AlertDtoV1>> ReadActiveAlertsAsync(IMachineEventRepository repository, string? mId, CancellationToken cancellationToken)
    {
        var events = await repository.FindForViewAsync(new MachineEventFilter(mId, "Notification"), cancellationToken).ConfigureAwait(false);
        return MachineEventViews.ActiveAlerts(MachineEventMapper.ToDtos(events));
    }

    internal static async Task<List<AlertPairDtoV1>> ReadAlertPairsAsync(
        IMachineEventRepository repository, string? mId, string? severity, DateTime? from, DateTime? to, CancellationToken cancellationToken)
    {
        // An alert raised before the range may stand in it: read every alert event up to its end.
        var events = await repository.FindForViewAsync(new MachineEventFilter(mId, "Notification", To: to), cancellationToken).ConfigureAwait(false);
        return [.. MachineEventViews.AlertPairs(MachineEventMapper.ToDtos(events), from, to)
            .Where(p => string.IsNullOrEmpty(severity) || string.Equals(p.Severity, severity, StringComparison.OrdinalIgnoreCase))];
    }

    internal static async Task<List<JobOrderDtoV1>> ReadJobOrdersAsync(
        IMachineEventRepository repository, JobOrderQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        // The state of a job order needs all its events, not only those in the range: read them all, then filter.
        // The job order id is a field of the events of a job order and of its program executions: the store filters on it.
        var jobs = await repository.FindForViewAsync(
            new MachineEventFilter(query.MId, "JobMonitoring", JobOrderId: query.JobOrderId), cancellationToken).ConfigureAwait(false);
        var executions = await repository.FindForViewAsync(
            new MachineEventFilter(query.MId, "WorkMasterMonitoring", JobOrderId: query.JobOrderId), cancellationToken).ConfigureAwait(false);
        return [.. MachineEventViews.JobOrders(MachineEventMapper.ToDtos(jobs), MachineEventMapper.ToDtos(executions))
            .Where(j => string.IsNullOrEmpty(query.OrderNumber) || (j.OrderNumbers?.Contains(query.OrderNumber, StringComparer.Ordinal) ?? false))
            .Where(j => string.IsNullOrEmpty(query.State) || string.Equals(j.State, query.State, StringComparison.OrdinalIgnoreCase))
            .Where(j => query.From is null || j.LastChange >= query.From)
            .Where(j => query.To is null || j.LastChange <= query.To)];
    }

    internal static async Task<JobDtoV1?> ReadJobAsync(IMachineEventRepository repository, string jobOrderId, CancellationToken cancellationToken)
    {
        var jobs = await repository.FindForViewAsync(
            new MachineEventFilter(Group: "JobMonitoring", JobOrderId: jobOrderId), cancellationToken).ConfigureAwait(false);
        var executions = await repository.FindForViewAsync(
            new MachineEventFilter(Group: "WorkMasterMonitoring", JobOrderId: jobOrderId), cancellationToken).ConfigureAwait(false);
        return MachineEventViews.Job(MachineEventMapper.ToDtos(jobs), MachineEventMapper.ToDtos(executions), jobOrderId);
    }

    internal static async Task<List<ProgramExecutionDtoV1>> ReadProgramExecutionsAsync(
        IMachineEventRepository repository, string? mId, string? jobOrderId, string? workMasterId,
        DateTime? from, DateTime? to, CancellationToken cancellationToken)
    {
        var events = await repository.FindForViewAsync(
            new MachineEventFilter(mId, "WorkMasterMonitoring", JobOrderId: jobOrderId, From: from, To: to), cancellationToken).ConfigureAwait(false);
        return [.. MachineEventViews.ProgramExecutions(MachineEventMapper.ToDtos(events))
            .Where(p => string.IsNullOrEmpty(workMasterId) || p.WorkMasterId == workMasterId)];
    }
}

/// <summary>The filters of the list of job orders; every part that is null filters nothing.</summary>
/// <param name="MId">Machine id.</param>
/// <param name="JobOrderId">Job order id, on every machine that has it.</param>
/// <param name="OrderNumber">Order number of the ERP, one of the OrderNumbers of the job order.</param>
/// <param name="State">State after the last event.</param>
/// <param name="From">Earliest last change, inclusive.</param>
/// <param name="To">Latest last change, inclusive.</param>
internal sealed record JobOrderQuery(
    string? MId = null,
    string? JobOrderId = null,
    string? OrderNumber = null,
    string? State = null,
    DateTime? From = null,
    DateTime? To = null);

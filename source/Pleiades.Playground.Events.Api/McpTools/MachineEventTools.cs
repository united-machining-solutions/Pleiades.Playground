// SPDX-License-Identifier: Apache-2.0
using System.ComponentModel;
using Microsoft.Extensions.Options;
using ModelContextProtocol;
using ModelContextProtocol.Server;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Events.Api.Endpoints;
using Pleiades.Playground.Events.Api.Mapping;
using Pleiades.Playground.Events.Api.Projections;
using Pleiades.Playground.Events.Api.Repositories.MachineEvent;
using Pleiades.Playground.Events.Api.Services;
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.McpTools;

[McpServerToolType]
internal sealed class MachineEventTools(IMachineEventRepository repository, IOptions<MongoDbSettings> settings, TimeProvider timeProvider)
{
    private const string MachineDescription =
        "Machine id, the second level of its MQTT topic: <manufacturer>_<model>_<serial number>, e.g. " +
        "'alcyone-machines_AX-400_P-04'. Omit for all machines.";

    private static readonly string[] Groups = ["JobMonitoring", "WorkMasterMonitoring", "Notification"];

    [McpServerTool(Name = "events_machine_events_query", ReadOnly = true),
     Description(
         "Search the CloudEvents of industrial machines as they were stored. Each event has a type, the path of the " +
         "event in the umati data model (e.g. Notification.AlertRaised, JobMonitoring.JobOrderStarted, " +
         "WorkMasterMonitoring.ProgramExecutionEnded), a group (JobMonitoring, WorkMasterMonitoring, Notification), " +
         "the source time, a sequence number per group, a correlationId (the ExecutionId of the program execution, if " +
         "any) and the data of the event in the units of the data model (energy in watt hours, durations in seconds). " +
         "Returns paged results with items and totalCount.")]
    public async Task<PagedResponse<MachineEventDtoV1>> QueryMachineEvents(
        [Description(MachineDescription)] string? mId = null,
        [Description("Group filter: JobMonitoring, WorkMasterMonitoring or Notification")] string? group = null,
        [Description("Type filter, e.g. Notification.AlertRaised")] string? type = null,
        [Description("ExecutionId of a program execution")] string? correlationId = null,
        [Description("Job order, the field JobOrderID of the data, e.g. '4711/01'")] string? jobOrderId = null,
        [Description("Start of time range (ISO 8601, e.g. '2026-11-17T06:00:00Z')")] DateTime? fromDate = null,
        [Description("End of time range (ISO 8601)")] DateTime? toDate = null,
        [Description("Number of records to skip (default: 0)")] int skip = 0,
        [Description("Number of records to return (default: 20, max: 100)")] int take = 20,
        [Description("Sort by time: Ascending or Descending (default: Descending)")] string sortDirection = "Descending",
        CancellationToken cancellationToken = default)
    {
        var page = EventToolArguments.Page(skip, take);
        var (items, totalCount) = await repository.QueryAsync(
            new MachineEventFilter(mId, ParseGroup(group), type, correlationId, jobOrderId, fromDate, toDate),
            page.Skip, page.Take, EventToolArguments.ParseSorting(sortDirection), cancellationToken).ConfigureAwait(false);
        return new PagedResponse<MachineEventDtoV1>(MachineEventMapper.ToDtos(items), totalCount, page.Skip, page.Take);
    }

    [McpServerTool(Name = "events_sequence_gaps_query", ReadOnly = true),
     Description(
         "Find gaps in the event numbers of industrial machines: per machine, group and run of the adapter, the " +
         "sequence counts that never arrived (lost events), within the time the events are kept. An empty list means " +
         "no event is missing between the first and the last stored event of each run; events lost at the end of a " +
         "run cannot be seen, and a gap before the first stored event is named only when the run started within the " +
         "retention and the range.")]
    public async Task<List<SequenceGapDtoV1>> QuerySequenceGaps(
        [Description(MachineDescription)] string? mId = null,
        [Description("Group filter: JobMonitoring, WorkMasterMonitoring or Notification")] string? group = null,
        [Description("Start of time range (ISO 8601)")] DateTime? fromDate = null,
        [Description("End of time range (ISO 8601)")] DateTime? toDate = null,
        CancellationToken cancellationToken = default)
    {
        return await MachineEvents.ReadGapsAsync(
            repository, mId, ParseGroup(group), fromDate, toDate, timeProvider.GetUtcNow().UtcDateTime,
            settings.Value.DataRetentionPeriod, cancellationToken).ConfigureAwait(false);
    }

    [McpServerTool(Name = "events_active_alerts_query", ReadOnly = true),
     Description(
         "List the alerts of industrial machines that stand now (raised, not cleared): error code, message, " +
         "severity after NAMUR NE 107 (Failure, CheckFunction, OffSpec, MaintenanceRequired), severity value, the " +
         "component, when it came up and the program execution it came up in. An alert of an earlier run of the " +
         "adapter that the new run did not name again does not stand any more; stale=true means events of its group " +
         "are missing after it, so its clear may have been lost. Returns paged results.")]
    public async Task<PagedResponse<AlertDtoV1>> QueryActiveAlerts(
        [Description(MachineDescription)] string? mId = null,
        [Description("Number of records to skip (default: 0)")] int skip = 0,
        [Description("Number of records to return (default: 20, max: 100)")] int take = 20,
        CancellationToken cancellationToken = default)
    {
        var page = EventToolArguments.Page(skip, take);
        var alerts = await MachineEvents.ReadActiveAlertsAsync(repository, mId, cancellationToken).ConfigureAwait(false);
        var (items, totalCount) = MachineEventViews.Page(alerts, a => a.RaisedAt, new PagedRequest(page.Skip, page.Take, Sorting.Descending));
        return new PagedResponse<AlertDtoV1>(items, totalCount, page.Skip, page.Take);
    }

    [McpServerTool(Name = "events_alert_pairs_query", ReadOnly = true),
     Description(
         "List the alerts of industrial machines that stood in a time range, AlertRaised paired with AlertCleared by " +
         "the alert id: when it came up, when it was cleared (null while it stands) and how long it stood in seconds, " +
         "with error code, message and NE 107 severity. clearedBy says what cleared it: Event (its AlertCleared) or " +
         "AdapterRestart (the adapter started anew and did not name it again; clearedAt is then the start of the new " +
         "run and the duration at most). Answers 'which failures did the machine have today and how long did they " +
         "last?'. Returns paged results.")]
    public async Task<PagedResponse<AlertPairDtoV1>> QueryAlertPairs(
        [Description(MachineDescription)] string? mId = null,
        [Description("Severity filter: Failure, CheckFunction, OffSpec or MaintenanceRequired")] string? severity = null,
        [Description("Start of time range (ISO 8601)")] DateTime? fromDate = null,
        [Description("End of time range (ISO 8601)")] DateTime? toDate = null,
        [Description("Number of records to skip (default: 0)")] int skip = 0,
        [Description("Number of records to return (default: 20, max: 100)")] int take = 20,
        [Description("Sort by the time raised: Ascending or Descending (default: Descending)")] string sortDirection = "Descending",
        CancellationToken cancellationToken = default)
    {
        var page = EventToolArguments.Page(skip, take);
        var (pairs, _) = await MachineEvents.ReadAlertPairsAsync(repository, mId, ParseSeverity(severity), fromDate, toDate, cancellationToken).ConfigureAwait(false);
        var (items, totalCount) = MachineEventViews.Page(
            pairs, p => p.RaisedAt, new PagedRequest(page.Skip, page.Take, EventToolArguments.ParseSorting(sortDirection)));
        return new PagedResponse<AlertPairDtoV1>(items, totalCount, page.Skip, page.Take);
    }

    [McpServerTool(Name = "events_alert_statistics_query", ReadOnly = true),
     Description(
         "Count the alerts of industrial machines by NE 107 severity in a time range: how many stood, how many still " +
         "stand, and how long the cleared ones stood together in seconds (one cleared by a restart of the adapter " +
         "counts until the restart, at most). Useful for a quick health check.")]
    public async Task<List<AlertStatisticDtoV1>> QueryAlertStatistics(
        [Description(MachineDescription)] string? mId = null,
        [Description("Start of time range (ISO 8601)")] DateTime? fromDate = null,
        [Description("End of time range (ISO 8601)")] DateTime? toDate = null,
        CancellationToken cancellationToken = default)
    {
        var (pairs, _) = await MachineEvents.ReadAlertPairsAsync(repository, mId, null, fromDate, toDate, cancellationToken).ConfigureAwait(false);
        return MachineEventViews.AlertStatistics(pairs);
    }

    [McpServerTool(Name = "events_job_orders_query", ReadOnly = true),
     Description(
         "List job orders of industrial machines with their last known state, put together from their events: state " +
         "(NotAllowedToStart, AllowedToStart, Running, Interrupted, Ended, Aborted), what is ordered (job name, work " +
         "master, runs planned), the result (start and end time, produced and good quantity, runs completed, " +
         "jobResult), how many program executions they had and their electric energy in watt hours. stale=true: it " +
         "has not ended, and the adapter started anew since its last event or events are missing after it, so its " +
         "state may have changed unseen. Answers 'which job orders did the machine end today, with how many parts " +
         "and how much energy?'. The time range filters on the last change. Returns paged results.")]
    public async Task<PagedResponse<JobOrderDtoV1>> QueryJobOrders(
        [Description(MachineDescription)] string? mId = null,
        [Description("State filter, e.g. Running, Ended or Aborted")] string? state = null,
        [Description("Earliest last change (ISO 8601)")] DateTime? fromDate = null,
        [Description("Latest last change (ISO 8601)")] DateTime? toDate = null,
        [Description("Number of records to skip (default: 0)")] int skip = 0,
        [Description("Number of records to return (default: 20, max: 100)")] int take = 20,
        [Description("Sort by last change: Ascending or Descending (default: Descending)")] string sortDirection = "Descending",
        CancellationToken cancellationToken = default)
    {
        var page = EventToolArguments.Page(skip, take);
        var (jobOrders, _) = await MachineEvents.ReadJobOrdersAsync(repository, mId, state, fromDate, toDate, cancellationToken).ConfigureAwait(false);
        var (items, totalCount) = MachineEventViews.Page(
            jobOrders, j => j.LastChange, new PagedRequest(page.Skip, page.Take, EventToolArguments.ParseSorting(sortDirection)));
        return new PagedResponse<JobOrderDtoV1>(items, totalCount, page.Skip, page.Take);
    }

    [McpServerTool(Name = "events_program_executions_query", ReadOnly = true),
     Description(
         "List program executions of industrial machines from start to end: the Started event paired with Ended or " +
         "Aborted by the ExecutionId, with the work master, the job order, how often it was interrupted, and at its " +
         "end the duration in seconds (interruptions included), the parts produced and the electric energy in watt " +
         "hours. One without an end still runs; endType AdapterRestart means the adapter started anew while it ran " +
         "and did not name it again (no sums), stale=true that events are missing after it. Useful for cycle times, " +
         "energy per part and aborts. Returns paged results.")]
    public async Task<PagedResponse<ProgramExecutionDtoV1>> QueryProgramExecutions(
        [Description(MachineDescription)] string? mId = null,
        [Description("Job order the program executions belong to (e.g. '4711/01')")] string? jobOrderId = null,
        [Description("Work master filter (e.g. 'WM-SHAFT-4711')")] string? workMasterId = null,
        [Description("Start of time range of the events (ISO 8601)")] DateTime? fromDate = null,
        [Description("End of time range of the events (ISO 8601)")] DateTime? toDate = null,
        [Description("Number of records to skip (default: 0)")] int skip = 0,
        [Description("Number of records to return (default: 20, max: 100)")] int take = 20,
        [Description("Sort by start time: Ascending or Descending (default: Descending)")] string sortDirection = "Descending",
        CancellationToken cancellationToken = default)
    {
        var page = EventToolArguments.Page(skip, take);
        var (executions, _) = await MachineEvents.ReadProgramExecutionsAsync(repository, mId, jobOrderId, workMasterId, fromDate, toDate, cancellationToken).ConfigureAwait(false);
        var (items, totalCount) = MachineEventViews.Page(
            executions, p => p.StartTime, new PagedRequest(page.Skip, page.Take, EventToolArguments.ParseSorting(sortDirection)));
        return new PagedResponse<ProgramExecutionDtoV1>(items, totalCount, page.Skip, page.Take);
    }

    private static string? ParseGroup(string? group) => EventToolArguments.ParseName(group, nameof(group), Groups);

    private static string? ParseSeverity(string? severity) => EventToolArguments.ParseName(severity, nameof(severity), MachineEventViews.Severities);
}

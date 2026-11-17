# Pleiades Events API - Skill Guide

This guide helps AI agents use the Events API tools to analyse the events of industrial machines.

## Domain Overview

The Events API stores the **CloudEvents** of Pleiades machines as they came, after the umati data model, and puts
views together from them when they are read. A machine is identified by its **machine id (mId)**, the second level
of its MQTT topic: `<manufacturer>_<model>_<serial number>`, e.g. `alcyone-machines_AX-400_P-04`. Units are those
of the data model: durations in seconds, energy in **watt hours** (1 kWh = 1000 Wh).

Three groups of events:
- **Notification**: `AlertRaised`, `AlertChanged`, `AlertCleared` and `NotificationEvent`. An alert has an `Id`,
  an `ErrorCode`, a `Message` and a **severity after NAMUR NE 107**: `Failure`, `CheckFunction`, `OffSpec`,
  `MaintenanceRequired` (most to least urgent), and the `correlationId` of the program execution it came up in.
- **JobMonitoring**: job orders (`JobOrderAdded`, `…Released`, `…Started`, `…Interrupted`, `…Resumed`, `…Ended`,
  `…Aborted`, `…Cancelled`, `…Changed`, `…Removed`) and their result (`JobOrderResultChanged`).
- **WorkMasterMonitoring**: program executions (`ProgramExecutionStarted`, `…Interrupted`, `…Resumed`, `…Ended`,
  `…Aborted`); Ended and Aborted carry the sums.

## Tools

- `events_active_alerts_query` — the alerts that stand now
- `events_alert_pairs_query` — alerts that stood in a time range, from raise to clear, with their duration
- `events_alert_statistics_query` — alerts per severity in a range: how many, how many still stand, how long
- `events_job_orders_query` — the last state of each job order with its result and energy
- `events_program_executions_query` — program executions from start to end: duration, parts, energy
- `events_machine_events_query` — the stored events themselves, filtered by machine, group, type, time
- `events_sequence_gaps_query` — events that never arrived (gaps in the numbers per group)

## Recommended Workflows

### Assess Machine Health
1. `events_active_alerts_query` with `mId` — what stands now
2. `events_alert_statistics_query` with `fromDate`/`toDate` — how often each severity occurred today
3. `events_alert_pairs_query` with `severity=Failure` — which failures, and how long they lasted

### Production of a Day
1. `events_job_orders_query` with `mId`, `state=Ended` and `fromDate`/`toDate` — which job orders ended, with how
   many parts and how much energy
2. `events_program_executions_query` with `jobOrderId` — cycle times and aborts of one job order
3. `events_machine_events_query` with `group=JobMonitoring` — every event of the job orders, in order

### Trust the Data
`events_sequence_gaps_query` — an empty list means no event is missing between the first and the last stored
event of each run of the adapter, within the time the events are kept (30 days in the demo). Events lost at the
end of a run cannot be seen, and a gap before the first stored event of a run is named only when the run started
within that time and the range.

### Restarts and Gaps
A new start of the adapter begins a new prefix of `sequence`. An alert or a program execution that was open in an
earlier run and that the new run did not name again is closed by the view: `clearedBy` / `endType` is
`AdapterRestart`, its end the start of the new run, its duration at most. A job order is never closed that way; it
is `stale`, its state may have changed unseen. `stale` also marks an open alert, program execution or job order
after whose last event events of its group are missing (a gap). Say so when you report them.

### Large Ranges
The alert pairs, statistics, job orders and program executions are put together from at most the newest 100 000
events they ask for; older ones are then left out, and the result may miss old entries or show too small sums. Ask
for one machine (`mId`) or a time range when a machine has run for weeks. The active alerts and the gaps are not
limited.

## Pagination Tips

- Query tools return `{ items, totalCount, skip, take }`
- Default: `skip=0, take=20`, max `take=100`
- If `totalCount > skip + take`, there are more results — increase `skip`
- Use `Descending` sort (default) for the most recent first

# Pleiades Events API - Skill Guide

This guide helps AI agents effectively use the Events API tools to analyze industrial machine events.

## Domain Overview

The Events API tracks notification events, job events and work master events from **Pleiades industrial machines**. Each machine is identified by a **machine ID (mId)**, e.g. `9000-0001`. Events have severity levels: Silent, Information, Warning, Error.

## Event Types

### Notification Events (`events_notification_query`)
System alerts with a **Raised/Reset lifecycle**:
- **Raised** = condition detected (e.g. temperature too high)
- **Reset** = condition cleared
- Linked via `correlationId` — use `events_notification_pairs` to see durations
- Severity levels indicate urgency: Silent < Information < Warning < Error

### Job Events (`events_job_events_query`)
What happened to **job orders**:
- The action is named after the state reached: `Added`, `Released`, `Revoked`, `Started`, `Interrupted`,
  `Resumed`, `Ended`, `Aborted`, `Cancelled` (aborted before it started), `Removed`; or `Changed` (the order
  changed) and `ResultChanged` (a quantity or the end changed)
- Every event carries the whole job order after it: what is ordered (`jobName`, `workMasterId`, `runsPlanned`)
  and, from its start, its result (`producedQuantity`, `goodQuantity`, `runsCompleted`, `jobResult`); before the
  start the result fields are null. `correlationId` is the jobOrderId
- `events_job_orders_query` gives the last known state of each job order (state, result, energy)

### Work Master Events (`events_work_master_events_query`)
What happened to **program executions**, the machine carrying out a work master:
- `Started`, `Interrupted`, `Resumed`, `Ended`, `Aborted`; `correlationId` is the executionId
- `Ended` and `Aborted` carry the duration in seconds, the parts and the energy in **joule** (1 kWh = 3 600 000 J)
- `events_program_executions_query` pairs each program execution from start to end, with duration, parts and energy

## Recommended Workflows

### Production of a Day
1. `events_job_orders_query` with `mId`, `state=Ended` and `fromDate`/`toDate` — which job orders ended, with how many parts and how much energy
2. `events_program_executions_query` with `jobOrderId` — the program executions of one job order, cycle times and aborts
3. `events_job_events_query` with `jobOrderId` — every event of one job order, in order


### Assess Machine Health
1. `events_notification_level_distribution` — check severity distribution
2. If errors/warnings found → `events_notification_query` with level filter for details
3. `events_notification_message_stats` — identify most frequent issues

### Investigate a Time Window
1. `events_notification_query` — with `fromDate`/`toDate` for the window
2. `events_notification_pairs` — check active notification durations

### Analyze Notification Trends
1. `events_notification_time_buckets` — visualize trends with bucket size (e.g. `1h`, `1d`)
2. `events_notification_message_stats` — find most frequent/longest notifications
3. `events_notification_pairs` — examine individual notification lifecycles

## Pagination Tips

- All query tools return `{ items, totalCount, skip, take }`
- Default: `skip=0, take=20`, max `take=100`
- If `totalCount > skip + take`, there are more results — increase `skip`
- Use `Descending` sort (default) for most recent events first

## Bucket Size Format (Time Buckets)
- Minutes: `15m`, `30m`
- Hours: `1h`, `6h`, `12h`
- Days: `1d`, `7d`, `30d`

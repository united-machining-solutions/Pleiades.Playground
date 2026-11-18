# Ultimaker telemetry adapter (draft)

This contract proposes a source under the existing MQTT binding, without changing contracts/mqtt.
The requesting user's printer supplies observations through GET /api/v1/printer and GET /api/v1/print_job.
Faults come from GET /api/v1/system/log and GET /api/v1/history/print_jobs.
No authentication or printer write is needed. A separate .NET adapter publishes the existing
BaseUnitValueDto/StringValueDto envelopes and MQTT 5 content types to the configured broker.

The configurable logical serial number defaults to UM3-01. It is not claimed to be the hardware serial.
All topics start with machines/{MachineId}/, the machine id `<manufacturer>_<model>_<serial number>` of the
MQTT binding, `ultimaker_UM3_UM3-01` by default. Manufacturer signals lie below `oem/`, as in that binding.
It follows the tree of that binding, not yet its payloads: values come as the value DTOs with their content
types, which the Timeseries persistence still takes, and the adapter publishes no manifest, no snapshot
`State/Status` (only its field `MachineryItemState` as a value of its own) and no CloudEvents but those of
its alerts, see "Notifications". UTC timestamps identify the adapter's observation
of the live snapshot; they are not reconstructed hardware sampling times.

| Topic suffix | Kind | Unit / meaning |
|---|---|---|
| umati/Connection/State | string | Running when the last poll succeeded and is fresh, otherwise CommunicationFault |
| umati/Connection/Heartbeat | number | one; independent monotonic process counter every 10 seconds |
| umati/Identification/{Manufacturer,Model,SerialNumber} | string | who the printer is; with the first heartbeat and every five minutes |
| umati/State/Status/MachineryItemState | string | Executing for an actively printing job; NotExecuting for known idle/paused/wait states; omitted for unknown states |
| oem/Ultimaker/PrinterStatus | string | Unmodified manufacturer state |
| oem/Ultimaker/Bed/Temperature | number | degreeCelsius |
| oem/Ultimaker/Bed/TargetTemperature | number | degreeCelsius |
| oem/Ultimaker/Extruder/{index}/Temperature | number | degreeCelsius; manufacturer indices start at zero |
| oem/Ultimaker/Extruder/{index}/TargetTemperature | number | degreeCelsius |
| oem/Ultimaker/Extruder/{index}/MaterialRemainingLength | number | metre; unknown negative values omitted |
| oem/Ultimaker/Position/{X,Y,Z} | number | metre |
| oem/Ultimaker/FanFraction | number | one; 0..1 |
| oem/Ultimaker/Print/State | string | Manufacturer job state, or none when HTTP 404/no job |
| oem/Ultimaker/Print/JobId | string | Printer job UUID, if known |
| oem/Ultimaker/Print/Result | string | Manufacturer result, if present |
| oem/Ultimaker/Print/Progress | number | one; 0..1, omitted when unknown |
| oem/Ultimaker/Print/TimeElapsed | number | second |
| oem/Ultimaker/Print/TimeTotal | number | second; manufacturer's estimate |
| events/notifications | CloudEvents | Faults of the printer log and failed or aborted jobs, see "Notifications" |

The MQTT binding explicitly uses degreeCelsius rather than kelvin. This existing documented
exception is followed here; the REST/MCP printer API continues to use kelvin.
No operation mode, power, heater duty, material flow or step-count unit is guessed.
The temperature.html diagnostics buffer is not scraped or replayed as live observations.
No filenames, user names, credentials or printer network configuration are published.

Polls default to every 2 seconds. Missing/invalid/non-finite measurements are omitted, never replaced
by zero. Failed polls publish no sensor observations; the independent heartbeat reports CommunicationFault.
MQTT reconnects through the shared managed client, with a bounded queue. No messages are retained.
Consumers must respect observation timestamps and heartbeat age; missing job metrics are not reset
to artificial zeroes. Heartbeats restart from zero when the adapter process restarts.

## Notifications

Faults and failed jobs are events of the group `Notification` of the data model, as the MQTT binding
describes them: CloudEvents 1.0 in structured mode on `machines/{MachineId}/events/notifications`, QoS 1,
not retained, with the content type `application/cloudevents+json`. Every 30 seconds the adapter reads the
500 newest lines of GET /api/v1/system/log, the 10 newest jobs of GET /api/v1/history/print_jobs and
GET /api/v1/print_job.

| What | `type` | `ErrorCode` | `Severity` | `time` |
|---|---|---|---|---|
| A fault line of the log | `Notification.AlertRaised` | the code of the manufacturer, for example `48` | `Failure` | the time of the log line |
| A job starts after that fault | `Notification.AlertCleared` | as raised | as raised | the start of that job |
| A job ended with the result `Failed` | `Notification.AlertRaised` | `PrintFailed` | `Failure` | the job finished |
| The build plate of that job is reported as cleared | `Notification.AlertCleared` | as raised | as raised | the plate was cleared |
| A job ended with the result `Aborted` | `Notification.NotificationEvent` | `PrintAborted` | none | the job finished |

`data` is the alert with the fields of the binding: `Id`, `ErrorCode`, `Message`, `Severity`, `Time` (since
when it stands) and `SourceName` (`Printer`). `AlertCleared` carries the alert as it was raised. The `Id` of a
fault is `fault-<code>-<time of the log line>`, the one of a job `print-<job UUID>`. The `Message` of a fault
is the English text of the firmware, at most 300 characters; the one of a job is fixed and names no file and
no user. There is no `SeverityValue`: the level of the manufacturer has no known scale. There is no
`correlationid`: the adapter reports no program execution.

`source` is the `ProductInstanceUri` of the printer, `{ManufacturerUri}/{Model}/{SerialNumber}`, by default
`https://ultimaker.com/UM3/UM3-01`. `sequence` counts the events from 1 from the start of the adapter, `id`
follows from source and sequence, and `dataschema` names the event schema of the data model 0.17.1. While
the broker is away up to 1000 events wait in the order they came up; when more wait, the oldest is dropped
and its count stays a gap. The adapter publishes no manifest, so no manifest names these events, and the
value `Notification/ActiveAlerts` is not published: the events are the only source of the alerts.

The printer reports no acknowledgement of a fault, so a fault is cleared when a job starts after it. The
printer status `error` was not observed and raises nothing of its own. What the printer shows when the
adapter starts is the baseline and raises nothing; a fault from the time the adapter was down is not
reported afterwards. A failed poll raises and clears nothing. The manufacturer does not document the format
of a log line: with another firmware than 5.3.0 the fault events can be missing while the job events remain.
The discussion is [issue #134](https://github.com/united-machining-solutions/Pleiades.Playground/issues/134).

## Deployment

The adapter is opt-in under the ultimaker Compose profile and waits for broker and timeseries
persistence health. It uses the existing wildcard subscriptions and the existing machine card;
no MQTT binding, persistence implementation or UI code is changed. The Events persistence stores the
alert events when it runs; the adapter does not wait for it.
The discussion is [issue #117](https://github.com/united-machining-solutions/Pleiades.Playground/issues/117).

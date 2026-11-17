# Ultimaker telemetry adapter (draft)

This contract proposes a source under the existing MQTT binding, without changing contracts/mqtt.
The requesting user's printer supplies observations through GET /api/v1/printer and GET /api/v1/print_job.
Faults come from GET /api/v1/system/log and GET /api/v1/history/print_jobs.
No authentication or printer write is needed. A separate .NET adapter publishes the existing
BaseUnitValueDto/StringValueDto envelopes and MQTT 5 content types to the configured broker.

The configurable logical machine ID defaults to UM3-01. It is not claimed to be the hardware serial.
All topics start with machines/{SerialNumber}/. UTC timestamps identify the adapter's observation
of the live snapshot; they are not reconstructed hardware sampling times.

| Topic suffix | Kind | Unit / meaning |
|---|---|---|
| umati/Connection/State | string | Connected when the last poll succeeded and is fresh, otherwise Disconnected |
| umati/Connection/Heartbeat | number | one; independent monotonic process counter every 10 seconds |
| umati/State/MachineryItemState | string | Executing for an actively printing job; NotExecuting for known idle/paused/wait states; omitted for unknown states |
| vendor/Ultimaker/PrinterStatus | string | Unmodified manufacturer state |
| vendor/Ultimaker/Bed/Temperature | number | degreeCelsius |
| vendor/Ultimaker/Bed/TargetTemperature | number | degreeCelsius |
| vendor/Ultimaker/Extruder/{index}/Temperature | number | degreeCelsius; manufacturer indices start at zero |
| vendor/Ultimaker/Extruder/{index}/TargetTemperature | number | degreeCelsius |
| vendor/Ultimaker/Extruder/{index}/MaterialRemainingLength | number | metre; unknown negative values omitted |
| vendor/Ultimaker/Position/{X,Y,Z} | number | metre |
| vendor/Ultimaker/FanFraction | number | one; 0..1 |
| vendor/Ultimaker/Print/State | string | Manufacturer job state, or none when HTTP 404/no job |
| vendor/Ultimaker/Print/JobId | string | Printer job UUID, if known |
| vendor/Ultimaker/Print/Result | string | Manufacturer result, if present |
| vendor/Ultimaker/Print/Progress | number | one; 0..1, omitted when unknown |
| vendor/Ultimaker/Print/TimeElapsed | number | second |
| vendor/Ultimaker/Print/TimeTotal | number | second; manufacturer's estimate |
| events/notifications | notification event | Faults of the printer log and failed or aborted jobs, see "Notifications" |

The MQTT binding explicitly uses degreeCelsius rather than kelvin. This existing documented
exception is followed here; the REST/MCP printer API continues to use kelvin.
No operation mode, power, heater duty, material flow or step-count unit is guessed.
The temperature.html diagnostics buffer is not scraped or replayed as live observations.
No filenames, user names, credentials or printer network configuration are published.

Polls default to every 2 seconds. Missing/invalid/non-finite measurements are omitted, never replaced
by zero. Failed polls publish no sensor observations; the independent heartbeat reports Disconnected.
MQTT reconnects through the shared managed client, with a bounded queue. No messages are retained.
Consumers must respect observation timestamps and heartbeat age; missing job metrics are not reset
to artificial zeroes. Heartbeats restart from zero when the adapter process restarts.

## Notifications

The adapter publishes notification events as the MQTT binding describes them, with the content type
`notificationeventdtov1`, on `machines/{SerialNumber}/events/notifications`. Every 30 seconds it reads
the 500 newest lines of GET /api/v1/system/log, the 10 newest jobs of GET /api/v1/history/print_jobs and
GET /api/v1/print_job. Coming and going carry the same `correlationId`; every `timestamp` is a time the
printer gave, in UTC.

| What | `notificationId` | `level` | `Raised` at | `Reset` at |
|---|---|---|---|---|
| A fault line of the log | `ultimaker-fault-<code>` | `Error` | the time of the log line | the start of the next print job |
| A job with the result `Failed` | `ultimaker-print-failed` | `Error` | the job finished | the build plate is reported as cleared |
| A job with the result `Aborted` | `ultimaker-print-aborted` | `Warning` | the job finished | the build plate is reported as cleared |

The title of a fault is the English text of the firmware, at most 300 characters; the title of a job is
fixed and names no file and no user. The printer reports no acknowledgement of a fault, so a fault goes
when a job starts after it. The level of the manufacturer is not mapped: a fault that reaches the display
is an `Error`. The printer status `error` was not observed and raises nothing of its own.

What the printer shows when the adapter starts is the baseline and raises nothing; a fault from the time
the adapter was down is not reported afterwards. A failed poll, or a broker that is not connected, raises
and resets nothing. The manufacturer does not document the format of a log line: with another firmware
than 5.3.0 the fault events can be missing while the job events remain. The discussion is
[issue #134](https://github.com/united-machining-solutions/Pleiades.Playground/issues/134).

## Deployment

The adapter is opt-in under the ultimaker Compose profile and waits for broker and timeseries
persistence health. It uses the existing wildcard subscriptions and the existing machine card;
no MQTT binding, persistence implementation or UI code is changed. The Events persistence stores the
notification events when it runs; the adapter does not wait for it.
The discussion is [issue #117](https://github.com/united-machining-solutions/Pleiades.Playground/issues/117).

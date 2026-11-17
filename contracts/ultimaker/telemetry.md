# Ultimaker telemetry adapter (draft)

This contract proposes a source under the existing MQTT binding, without changing contracts/mqtt.
The requesting user's printer supplies observations through GET /api/v1/printer and GET /api/v1/print_job.
No authentication or printer write is needed. A separate .NET adapter publishes the existing
BaseUnitValueDto/StringValueDto envelopes and MQTT 5 content types to the configured broker.

The configurable logical serial number defaults to UM3-01. It is not claimed to be the hardware serial.
All topics start with machines/{MachineId}/, the machine id `<manufacturer>_<model>_<serial number>` of the
MQTT binding, `ultimaker_UM3_UM3-01` by default. Manufacturer signals lie below `oem/`, as in that binding.
It follows the tree of that binding, not yet its payloads: values come as the value DTOs with their content
types, which the Timeseries persistence still takes, and the adapter publishes no manifest, no snapshot
`State/Status` (only its field `MachineryItemState` as a value of its own) and no CloudEvents. UTC timestamps identify the adapter's observation
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

The adapter is opt-in under the ultimaker Compose profile and waits for broker and timeseries
persistence health. It uses the existing wildcard subscriptions and the existing machine card;
no MQTT binding, persistence implementation or UI code is changed.
The discussion is [issue #117](https://github.com/united-machining-solutions/Pleiades.Playground/issues/117).

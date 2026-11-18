# Ultimaker telemetry adapter (draft)

This contract describes a source under the MQTT binding of machines ([contracts/mqtt](../mqtt/README.md),
"Machines: the binding of the data model"), without changing that binding.
The requesting user's printer supplies observations through GET /api/v1/printer and GET /api/v1/print_job.
No authentication or printer write is needed. A separate .NET adapter publishes them to the configured broker
as the binding says, with the shared publisher of the binding (`MachinePublisher` in
`Pleiades.Playground.Mqtt.Extensions`), as the simulators do.

The configurable logical serial number defaults to UM3-01. It is not claimed to be the hardware serial.
All topics start with machines/{MachineId}/, the machine id `<manufacturer>_<model>_<serial number>` of the
binding, formed by its rule from `ManufacturerUri`, `Model` and `SerialNumber`: `https://ultimaker.com`, `UM3`
and `UM3-01` give `ultimaker_UM3_UM3-01` by default. UTC timestamps identify the adapter's observation of the
live snapshot; they are not reconstructed hardware sampling times, and the manifest says so
(`"timestampSource": "adapter"`).

## Delivery

- Every value and the manifest: the envelope `{timestamp, value, unit}`, retained, QoS 1, MQTT 5 content type
  `application/json`. A number carries the name of its unit; a value goes out when it changes.
- `umati/Manifest`, retained, before the values: model version 0.17.1, the profile `Core`, `machineId`, the
  heartbeat interval and every element the adapter publishes. Of `Core` the printer lacks `ProductCode`,
  `YearOfConstruction`, `State.FeedOverride`, `Notification.ActiveAlerts` and
  `OperationCounters.PowerOnDuration`: the manifest names them with `"available": false`, and each goes out once
  with `value: null`. The signals of the manufacturer are named with the prefix `x-ultimaker-com`, which the
  binding maps to `oem/`, each with its type, unit and description. A printer that reports more extruders than
  the manifest names (two by default) gets a new manifest before their values.
- `umati/Connection/State`: `Initializing` at the start, then manifest, identification and every value known;
  `Running` once the printer answers; `CommunicationFault` while a poll fails (the values stand with their time,
  only the heartbeat goes on); every value anew and `Running` when it answers again and after every reconnect
  to the broker; `Shutdown` at a clean stop. The last will sets `CommunicationFault`, retained, QoS 1.
- The identification goes out retained at every connect, not repeatedly.
- No events. The faults of the printer as CloudEvents are a separate change.

| Topic suffix | Kind | Unit / meaning |
|---|---|---|
| umati/Manifest | manifest | – |
| umati/Connection/State | string | Initializing, Running, CommunicationFault, Shutdown |
| umati/Connection/Heartbeat | integer | no unit, as the catalogue; a counter from 1 every 10 seconds, also while printer requests are blocked |
| umati/Identification/{Manufacturer,SerialNumber,ProductInstanceUri,ManufacturerUri,Model} | string | who the printer is; `ProductInstanceUri` is `https://ultimaker.com/UM3/UM3-01` unless set |
| umati/Identification/{ProductCode,YearOfConstruction}, umati/State/FeedOverride, umati/Notification/ActiveAlerts, umati/OperationCounters/PowerOnDuration | null | `"available": false` |
| umati/State/Status | snapshot | `MachineryItemState`: Executing for an actively printing job; NotExecuting for known idle/paused/wait states; OutOfService for `error`, `maintenance` and every state the model has no word for; NotAvailable while `booting`. `MachineryOperationMode`: None |
| oem/Ultimaker/PrinterStatus | string | Unmodified manufacturer state |
| oem/Ultimaker/Bed/Temperature | number | degreeCelsius |
| oem/Ultimaker/Bed/TargetTemperature | number | degreeCelsius |
| oem/Ultimaker/Extruder/{index}/Temperature | number | degreeCelsius; manufacturer indices start at zero |
| oem/Ultimaker/Extruder/{index}/TargetTemperature | number | degreeCelsius |
| oem/Ultimaker/Extruder/{index}/MaterialRemainingLength | number | metre; unknown negative values are left out |
| oem/Ultimaker/Position/{X,Y,Z} | number | metre |
| oem/Ultimaker/FanFraction | number | one; 0..1 |
| oem/Ultimaker/Print/State | string | Manufacturer job state, or none when HTTP 404/no job |
| oem/Ultimaker/Print/JobId | string | Printer job UUID, if known |
| oem/Ultimaker/Print/Result | string | Manufacturer result, if present |
| oem/Ultimaker/Print/Progress | number | one; 0..1 |
| oem/Ultimaker/Print/TimeElapsed | number | second |
| oem/Ultimaker/Print/TimeTotal | number | second; manufacturer's estimate |

The path of a signal in the manifest is `x-ultimaker-com.` and its topic below `oem/` with dots, for example
`x-ultimaker-com.Ultimaker.Bed.Temperature`.

The MQTT binding uses degreeCelsius rather than kelvin, as the catalogue of the model does; the REST/MCP
printer API continues to use kelvin.
`MachineryOperationMode` is `None`: the schema of the snapshot asks for the field, and the catalogue of the
model says an adapter reports `None` when it does not know the operation mode.
A printer that answers always has a `MachineryItemState`, never `null`: values go out when they change, so a
`null` would leave the last state standing, and a printer that falls from printing into an error would still
show `Executing`. A state the model has no word for is `OutOfService`, which the catalogue describes as
"available but unable to perform any activity (e.g., error)": the printer answers, so it is not switched off
(`NotAvailable`, which the catalogue keeps for a known state such as switched off), and it does not wait for an
order (`NotExecuting`). Only `booting`, a printer that is not yet available, is `NotAvailable`. The state of the
manufacturer stays on `oem/Ultimaker/PrinterStatus` and `oem/Ultimaker/Print/State`. No power, heater duty, material flow or step-count unit is
guessed. The temperature.html diagnostics buffer is not scraped or replayed as live observations.
No filenames, user names, credentials or printer network configuration are published.

Polls default to every 2 seconds. A value the printer does not give (missing, invalid, non-finite, or a job
metric without a job) is left out, never replaced by zero; one it gave before goes out once as `null`, not
available right now. Failed polls publish no sensor observations.
Heartbeats restart from 1 when the adapter process restarts; retained values of a stopped adapter stay at the
broker with their time, under `CommunicationFault` from its last will.

The adapter is opt-in under the ultimaker Compose profile and waits for broker and timeseries
persistence health. It uses the existing wildcard subscriptions and the existing machine card: the Timeseries
persistence keeps the snapshot field by field, as `umati/State/Status/MachineryItemState`, the topic the cards
read. The discussion is [issue #117](https://github.com/united-machining-solutions/Pleiades.Playground/issues/117).

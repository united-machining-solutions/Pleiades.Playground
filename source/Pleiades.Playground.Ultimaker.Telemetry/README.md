# Ultimaker telemetry

A separate .NET adapter publishes read-only live observations from the requesting user's Ultimaker
to the existing Pleiades MQTT broker, as the [MQTT binding of machines](../../contracts/mqtt/README.md) says:
retained values with QoS 1 in the envelope of the data model, a manifest, `Connection/State` as the state of
the adapter and a last will. It uses the same managed MQTT client, the same publisher of the binding
(`Pleiades.Playground.Mqtt.Extensions.Machines`) and the same health-check libraries as the simulator. Its
contract is [telemetry.md](../../contracts/ultimaker/telemetry.md); the shared MQTT binding is unchanged.

## Run

From the repository root, on the existing demo stack:

```bash
docker compose --profile ultimaker up -d --build --wait ultimaker-telemetry
```

Use the same Compose project name as the existing broker/persistence stack. If that stack already
runs under `pleiades-playground`, specify `-p pleiades-playground`; do not launch a second broker on
the same host ports. The service waits for broker and timeseries-persistence health. It does not
depend on the slicer, require printer pairing or enable printing.

Settings in .env.example: ULTIMAKER_SERIAL_NUMBER (logical serial number, default UM3-01), ULTIMAKER_PRINTER_URL,
ULTIMAKER_POLL_INTERVAL_SECOND (default 2), ULTIMAKER_MQTT_URL, ULTIMAKER_MQTT_USER and
ULTIMAKER_MQTT_PASSWORD. The logical serial number is not asserted to be the physical one. The machine id
is `<manufacturer>_<model>_<serial number>` by the rule of the binding, `ultimaker_UM3_UM3-01` by default: the
domain of `Config:ManufacturerUri` (`https://ultimaker.com`) without its ending, `Config:Model` and
`Config:SerialNumber`. `Config:ManufacturerName` is `Identification/Manufacturer`, `Config:ProductInstanceUri`
the globally unique id (empty: `https://ultimaker.com/UM3/UM3-01`).
Secrets are configured by the operator, never logged or copied into code.

## Observations and units

The adapter polls GET /api/v1/printer and GET /api/v1/print_job. The temperature.html page uses a
diagnostic history buffer; its opaque heater/flow/step signals are not assigned guessed units.
We use the live snapshots for bed/nozzle current and target temperatures, XYZ position, fan
fraction, known material length, printer/job states, progress and duration estimates.
See the contract table for every topic under `machines/{MachineId}/`.

Temperatures use `degreeCelsius`, the explicit exception already documented in the MQTT binding.
Positions and lengths are converted from manufacturer millimetres to metre; fan percentages to
fractions. Unknown negative material lengths and missing job measurements are omitted, not zeroed.
Job filenames and user names are not published. A printer state the model has no word for is
`OutOfService` in `State/Status` (see the contract); the original state of the manufacturer remains available
below `oem/`.

UTC timestamps are the adapter's observation time of each live snapshot. No printer clock or
diagnostics boot-relative timestamp is substituted. Every value is retained and goes out when it changes.
An independent ten-second heartbeat counter runs even while printer requests are blocked. The
connection state says Initializing until the printer first answers, Running while it answers,
CommunicationFault while a poll fails, and Shutdown at a clean stop; the last will sets CommunicationFault
when the connection to the broker breaks off. After every connect the adapter publishes the manifest and every
value again, then the state. The counter resets on process restart.
The shared MQTT client reconnects and has a bounded outgoing queue. Consumers must still respect timestamps and
age.

`/health` checks broker connectivity; `/healthcheck` also reports whether printer observations are
fresh. This distinguishes an alive adapter from an unreachable printer.

## Verify and view

Subscribe to `machines/ultimaker_UM3_UM3-01/#` with an MQTT 5 client and compare bed/nozzle values with the printer.
Then query the Timeseries API at <http://localhost:5500/> for those exact topics and observation
times. The existing `genui_machine_list` discovers ultimaker_UM3_UM3-01 from stored connection/state topics, and
`genui_machine_show` renders the existing machine card. No new UI component or card is needed.
The existing card focuses on state; numeric temperatures are available through Timeseries.

Run `dotnet test --project source/Pleiades.Playground.Ultimaker.Telemetry.Test/Pleiades.Playground.Ultimaker.Telemetry.Test.csproj`.
The tests cover unit conversion, unknown-value handling, state mapping, the manifest and the values against
the JSON schemas of the data model (with a clone of it, as for the simulator), the states of the adapter
against a fake printer that answers and fails, and an independent heartbeat while the printer request is
blocked. Build and run the container to verify the actual broker path.
The Images workflow publishes `ghcr.io/united-machining-solutions/pleiades.playground.ultimaker.telemetry`
after a merge to main or release tag. Enable `COMPOSE_PROFILES=ultimaker` in the deployment computer's
private .env; see [deployment](../../docs/deployment.md#enable-the-ultimaker-services).

## Decision

[ADR-0012](../../docs/adr/0012-headless-ultimaker-tool-service.md) records the decision; the discussion is
[issue #117](https://github.com/united-machining-solutions/Pleiades.Playground/issues/117).

# Ultimaker telemetry

A separate .NET adapter publishes read-only live observations from the requesting user's Ultimaker
to the existing Pleiades MQTT broker. It uses the same managed MQTT client, value DTOs, content
types and health-check libraries as the simulator. Its proposed contract is
[telemetry.md](../../contracts/ultimaker/telemetry.md); the shared MQTT binding is unchanged.

## Run

From the repository root, on the existing demo stack:

```bash
docker compose --profile ultimaker up -d --build --wait ultimaker-telemetry
```

Use the same Compose project name as the existing broker/persistence stack. If that stack already
runs under `pleiades-playground`, specify `-p pleiades-playground`; do not launch a second broker on
the same host ports. The service waits for broker and timeseries-persistence health. It does not
depend on the slicer, require printer pairing or enable printing.

Settings in .env.example: ULTIMAKER_MACHINE_ID (logical ID, default UM3-01), ULTIMAKER_PRINTER_URL,
ULTIMAKER_POLL_INTERVAL_SECOND (default 2), ULTIMAKER_MQTT_URL, ULTIMAKER_MQTT_USER and
ULTIMAKER_MQTT_PASSWORD. The logical ID is not asserted to be a physical serial number.
Secrets are configured by the operator, never logged or copied into code.

## Observations and units

The adapter polls GET /api/v1/printer and GET /api/v1/print_job. The temperature.html page uses a
diagnostic history buffer; its opaque heater/flow/step signals are not assigned guessed units.
We use the live snapshots for bed/nozzle current and target temperatures, XYZ position, fan
fraction, known material length, printer/job states, progress and duration estimates.
See the contract table for every topic under `machines/{SerialNumber}/`.

Temperatures use `degreeCelsius`, the explicit exception already documented in the MQTT binding.
Positions and lengths are converted from manufacturer millimetres to metre; fan percentages to
fractions. Unknown negative material lengths and missing job measurements are omitted, not zeroed.
Job filenames and user names are not published. Unknown machine states are not fabricated into an
umati state; the original vendor state remains available.

UTC timestamps are the adapter's observation time of each live snapshot. No printer clock or
diagnostics boot-relative timestamp is substituted. Messages are not retained.
An independent ten-second heartbeat counter runs even while printer requests are blocked. The
connection state reports Disconnected when polling fails or the last success becomes stale.
Abrupt process loss is detected by a missing heartbeat; the counter resets on process restart.
The shared MQTT client reconnects and has a bounded outgoing queue. The adapter skips sensor
publishing while disconnected from the broker. Consumers must still respect timestamps and age.

`/health` checks broker connectivity; `/healthcheck` also reports whether printer observations are
fresh. This distinguishes an alive adapter from an unreachable printer.

## Verify and view

Subscribe to `machines/UM3-01/#` with an MQTT 5 client and compare bed/nozzle values with the printer.
Then query the Timeseries API at <http://localhost:5500/> for those exact topics and observation
times. The existing `genui_machine_list` discovers UM3-01 from stored connection/state topics, and
`genui_machine_show` renders the existing machine card. No new UI component or card is needed.
The existing card focuses on state; numeric temperatures are available through Timeseries.

Run `dotnet test --project source/Pleiades.Playground.Ultimaker.Telemetry.Test/Pleiades.Playground.Ultimaker.Telemetry.Test.csproj`.
The tests cover unit conversion, unknown-value handling, state mapping and an independent heartbeat
while the printer request is blocked. Build and run the container to verify the actual broker path.
The Images workflow publishes `ghcr.io/united-machining-solutions/pleiades.playground.ultimaker.telemetry`
after a merge to main or release tag. Enable `COMPOSE_PROFILES=ultimaker` in the deployment computer's
private .env; see [deployment](../../docs/deployment.md#enable-the-ultimaker-services).

## Decision

[ADR-0012](../../docs/adr/0012-headless-ultimaker-tool-service.md) records the decision; the discussion is
[issue #117](https://github.com/united-machining-solutions/Pleiades.Playground/issues/117).

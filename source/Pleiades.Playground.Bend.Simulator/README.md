# Pleiades.Playground.Bend.Simulator

Simulates one bending machine, a press brake, that reports to its host through RCI telegram files
([protocol](../Pleiades.Playground.Bend.Protocol/README.md)). It runs in a container of its own with a web page to
drive it. Its [adapter](../Pleiades.Playground.Bend.Adapter/README.md) reads the same files and publishes the machine
to the broker, so the app, the chat and every tool show it like any other machine.

The simulator only sends: it writes the messages of the machine (RCI interface description, chapter 4.2) and reads
no command of a host. A host such as Oseon can read the same exchange folder.

## Run it

It starts with the stack:

```sh
docker compose up -d --build --wait
```

The web page: <http://localhost:5614> (`BENDING_PRESS_PORT` in `.env`). Without Docker, from this folder:
`dotnet run --launch-profile BendingPress`; the telegrams then go to `.bend/exchange` at the root of the repository
(`appsettings.Development.json`). A new machine starts with three demo packages (`SeedDemoOrders`).

## The web page

- **Machine**: manufacturer, model, serial number and the ProductInstanceUri the adapter publishes,
  `{ManufacturerUri}/{Model}/{SerialNumber}` unless one is configured, the exchange folder and the name of the telegrams. All read only: they come from the configuration, which the
  adapter shares.
- **Production plan**: the packages with the status and progress of every position.
- **Automatic processing**: one position or a whole package. For each position it sends `OperatingStateFeedback` 1
  (running), `ProductionPackageFeedback` (processed quantity 0), `ProcessingStarted` (status 7, active), one
  `ManufacturingOrderFeedback` per part, `ProcessingStopped` (status 14, finished), `ProductionPackageFeedback` (+1) once every position of the package is
  finished, and `OperatingStateFeedback` 0 (idle); then a finished package leaves the plan. Cancelled, a position ends
  with `ProcessingStopped` (status 12, paused) and `OperatingStateFeedback` 0. After `ProcessingStopped` the adapter
  shows no program.
- **MDE**: report the operating state by hand: running, idle, maintenance, fault with error number and text.
- **Test data**: a package by hand or a generated dataset. Test data stays local; no telegram is sent.
- **Sent messages**: every telegram, live.

The page talks to `/api/simulator/*`, its own backend, not a public interface.

## Configuration

Section `Config` of `appsettings.json`, or the environment (`Config__SerialNumber` and so on). In compose, the values
stand at the service `bending-press`; the adapter takes serial number, manufacturer, its web address and model from
there (YAML anchors). Only the port of the web page comes from `.env`.

| Setting | Default | Compose | Meaning |
|---|---|---|---|
| `SerialNumber` | empty | `AE325085TB46` | The serial number, as the adapter publishes it |
| `Manufacturer` | `Manufacturer_A` | `Trumpf` | The manufacturer |
| `ManufacturerUri` | `https://www.trumpf.com` | `https://www.trumpf.example` | The web address of the manufacturer, as the adapter publishes it |
| `Model` | empty | `5085` | The model |
| `ProductInstanceUri` | empty | | The ProductInstanceUri, as the adapter publishes it; empty: `{ManufacturerUri}/{Model}/{SerialNumber}` |
| `ExchangeDirectory` | `/exchange` | volume `bending-press-exchange` mounted there | The folder of the telegram files |
| `ExchangeDirectorySource` | empty | `bending-press-exchange` | What the folder is mounted from, for the web page only |
| `MachineFilePrefix` | `RCIMaschToServ` | | The name of the telegram files without the running number |
| `PartFeedbackInterval` | `00:00:02` | | The pause between two part feedbacks |
| `PositionChangeInterval` | `00:00:05` | | How long the machine stands idle between two positions of a package processed as a whole |
| `StatePath` | `/data/state.json` | | Where the production plan survives a restart; empty: nowhere |
| `SeedDemoOrders` | `true` | | Fill an empty plan with three demo packages on the first start |

Timestamps are local time of the container, UTC unless `TZ` is set. `/healthcheck` fails while the exchange folder is
not writable.

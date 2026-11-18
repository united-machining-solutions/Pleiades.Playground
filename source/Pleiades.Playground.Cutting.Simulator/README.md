# Pleiades.Playground.Cutting.Simulator

Simulates one cutting machine that takes its jobs through telegram files. One container is one machine;
an environment variable chooses which:

| `Config__MachineType` | Machine | What it does per program run |
|---|---|---|
| `Laser2D` | Flat-bed laser with pallet changer and sheet loader | Loads a sheet, measures it, changes the pallet, cuts, unloads |
| `Tube` | Tube laser with tube loader | Loads a tube, starts a tube allocation, cuts, ends it, unloads |
| `Punch` | Punching machine with sheet handler | Loads a sheet, punches, unloads the parts one by one |

The web page shows the machine, with its serial number, and lets you drive it: switch it on and off, start and stop
the plan, raise and acknowledge alarms, edit the production plan, fill or empty a stack, send any notification by
hand, and watch every telegram in and out.

The serial number (`Config__SerialNumber`) is the last part of the machine id in Pleiades: the adapter publishes
below `machines/<manufacturer>_<model>_<serial number>/`, such as `machines/trumpf_Laser2D_L-01/`. The telegrams do
not carry it, so simulator and adapter are each told it; in `compose.yaml` one YAML anchor gives both the same value.

## Endless mode

For a machine that produces all day without anyone at it, switch on *Endless mode* on the Overview page (or set
`Config__EndlessMode`). Switched on, it starts the plan, and:

- whenever the plan holds no free order, the machine writes a new one into it: the demo orders of its type in turn,
  named `L-E00001`, `T-E00002`, `P-E00003` …, with a quantity from 1 to 5 and three orders to a job (`JOB-E0001`).
  The host sees each one as any other change of the plan (`ProdPlanGeaendert`, `PRD_SHOW`);
- when it waits for an empty supply or a full stack, it reports it as always (`MaschinenMeldung` 2 or 1) and fills
  or empties the stack itself after `EndlessRestockAfter`, then sends `PalletSituation`, as after `LOCAVAIL`;
- of the orders it wrote, only the last ten done ones stay in the plan. Orders of a person or the host stay.

A stop ends the run as without it. With `AutoRun` on the plan starts again by itself, also after a restart; the
setting survives one.

The other side, the host, is a separate program. In this repository it is the
[cutting adapter](../Pleiades.Playground.Cutting.Adapter/README.md), which brings the data into Pleiades; the
stack starts one per simulator. The simulator itself does not publish to the MQTT broker.

## Run it

With the stack, three machines, one of each type:

```sh
docker compose up -d --build --wait
```

| Machine | Web page | Telegram files |
|---|---|---|
| `cutting-laser-2d` | <http://localhost:5611/> | volume `cutting-laser-2d-exchange` |
| `cutting-tube` | <http://localhost:5612/> | volume `cutting-tube-exchange` |
| `cutting-punch` | <http://localhost:5613/> | volume `cutting-punch-exchange` |

Without Docker, from this folder: `dotnet run --launch-profile Laser2D` (or `Tube`, `Punch`).
The telegram files then lie in `.cutting/` at the root of the repository, which git ignores.

## How a host connects

The telegram protocol does not run over a network socket. Both sides read and write ASCII files in one folder
(§2.2 of the specification):

| File | Written by | Read and deleted by |
|---|---|---|
| `/exchange/s1_to_m1.dat` | the host | the machine |
| `/exchange/m1_to_s1.dat` | the machine | the host |

`X.wr` next to a file says that someone writes it, `X.rd` that someone reads it; at rest neither exists. The
writer waits until `X.rd` is gone, creates `X.wr`, appends its telegrams, one per line, and deletes `X.wr`. The
reader waits until `X.wr` is gone, creates `X.rd`, reads and deletes `X.dat`, and deletes `X.rd`.
[`Pleiades.Playground.Cutting.Protocol`](../Pleiades.Playground.Cutting.Protocol) does this for both sides; a host
creates its channel with `CuttingRole.Host`.

A host container mounts the same named volume, for example `cutting-laser-2d-exchange:/exchange`. The folder may be
written by every user, so the host may run as another user than the simulator.

1. The machine announces itself with `$$src9_server_connect$$` when it starts.
2. The host connects with `SRC9CONN`. The reply lists the commands this machine type answers.
3. From then on the machine writes its notifications. Until a host has connected, it holds them: the web
   page shows them as *held*, and the file does not grow without a reader.

Try it by hand:

```sh
docker compose exec cutting-laser-2d sh -c \
  'printf "SRC9CONNR+000000000000000000010001|0000^2.1.0^\r\nPRD_SHOWR+000000000000000000020001|0000^1^\r\n" > /exchange/s1_to_m1.dat'
docker compose exec cutting-laser-2d cat /exchange/m1_to_s1.dat
```

## What it answers

The machine number of every request is field 1; another number gets `-11`. A command the machine type does
not have gets `-10`, "function not possible at the moment".

| Command | 2D laser | Tube | Punch | What the simulator does |
|---|---|---|---|---|
| `SRC9CONN`, `SRC9DISC` | ✓ | ✓ | ✓ | Connects and disconnects the host |
| `SPLITPRG` | ✓ | ✓ | ✓ | Answers `Config__SplitProgramReturnCode`; it does not read complete files |
| `PRDINSER` | ✓ | | ✓ | Creates an order; its NC program goes into the archive |
| `PRDDELET`, `PRGDELET` | ✓ | ✓ | ✓ | Deletes orders by number (`-1` = all), name or job; deletes a program |
| `PRD_SHOW` | ✓ | ✓ | ✓ | The plan, 15 fields per order, split into `A` and `L` replies above 2467 bytes |
| `PRD_INFO` | ✓ | | | Remaining runtime of the current order and the plan |
| `MODSTATE` | ✓ | ✓ | ✓ | Free (0) and locked (9); pause (5, shown as 8) on the punch only |
| `PRD_MOVE` | ✓ | | ✓ | Moves an order or a job |
| `PRGSTART` | ✓ | ✓ | ✓ | `*` starts the plan; a program name runs that program once |
| `PRD_STOP` | ✓ | ✓ | ✓ | Mode 1 stops after the program, mode 2 after the order |
| `PALSSHOW` | ✓ | ✓ | | The places of the pallet changer, or of the tube loader with batch |
| `SYSTTIME`, `MACHINFO` | ✓ | ✓ | ✓ | The time; the plan type and the type code (0 laser, 1 punch, 3 tube), then `$$Feedrate$$` (§6.4) |
| `PALPSHOW` | ✓ | | | Replies 0, then sends `$$PalletChangerPos$$` |
| `SMLDACKN`, `LOCAVAIL` | | | ✓ | Notes the preloading choice; makes a reported stack available again |

## What it sends

Each program run:
`StartNCP`, `MaschineLaeuft` … `EndeNCP` (or `ResetNCP` after an abort), `MaschineSteht` 2,
`ProdPlanGeaendert`. An alarm sends `MaschineSteht` 1 and `AktuelleAlarme`. Acknowledging it sends
`MaschineLaeuft` when a program was running, which then runs on (at a real machine, NC start as well), and
`MaschineSteht` 2 when none was. The protocol has no notification for an alarm that goes; a host learns it from this
state.

What each type adds:

- **2D laser:** `MaschinenMeldung` 3 and 4, `MeasureOffset`, `PalletChangerPos` and `PalletSituation`. When
  the supply stack is empty or the parts stack full, it sends `MaschinenMeldung` 2 or 1 and waits.
- **Tube:** `ProdPlanStat`, `MaschinenMeldung` 8, 3, 7 and 4 with profile, length, diameter and duration,
  `StartBelegung` and `EndeBelegung`. It also sends `PalletSituation`, and the allocation and profile in
  `StartNCP` and `EndeNCP`.
- **Punch:** `MaschinenMeldung` 3, and three `SMPartUnloadFinished` per sheet. When the supply stack is empty or
  the parts stack full, it sends `MaschinenMeldung` 2 or 1 with position and height ID and waits for `LOCAVAIL`.

Lengths and diameters stay in millimetre, and runtimes in seconds, as the protocol carries them. An adapter converts
them to SI units when it publishes to the broker.

## Configuration

| Key (`Config__…`) | Default | Meaning |
|---|---|---|
| `MachineType` | `Laser2D` | `Laser2D`, `Tube` or `Punch` |
| `MachineNumber` | `1` | Field 1 of every request, at most ten letters or digits |
| `MachineName` | type and number | The name on the web page |
| `SerialNumber` | empty | The machine id in Pleiades, shown on the web page; no `/`, `+` or `#` |
| `ExchangeDirectory` | `/exchange` | The folder of the telegram files |
| `MachineFileName`, `HostFileName` | `m1_to_s1.dat`, `s1_to_m1.dat` | The two telegram files |
| `PollInterval` | `00:00:00.250` | How often the machine looks for a telegram of the host |
| `LockTimeout` | `00:00:10` | How long it waits for the host to release a file |
| `AutoRun` | `true` | Start the plan by itself when it holds a free order |
| `EndlessMode` | `false` | See [Endless mode](#endless-mode); the web page switches it |
| `EndlessRestockAfter` | `00:00:30` | How long the endless mode waits before it fills or empties a stack, in simulated time |
| `TimeScale` | `1` | Real time per simulated time; `0.1` runs ten times faster. Runtimes in telegrams stay simulated |
| `MinProgramDuration`, `MaxProgramDuration` | `00:00:20`, `00:01:00` | The runtime of one program run, in simulated time |
| `StateBeforeProgram` | `false` | `MaschineLaeuft` before `StartNCP` and `MaschineSteht` before `EndeNCP`, as real machines often send them; the specification sets no order |
| `SplitProgramReturnCode` | `0` | The reply to `SPLITPRG` |
| `ProductionPlanType` | `0` | Field 2 of the reply to `MACHINFO`; the specification lists no values |
| `StatePath` | `/data/state.json` | Plan, archive and stock across restarts; empty for none |
| `SeedDemoOrders` | `true` | A few orders in a new, empty plan |

`/healthcheck` fails when the simulator cannot write into the folder of the telegram files.

## Limits

- The 3D laser (the second type of the specification) is not simulated.
- `SPLITPRG` does not read the complete file: the plan comes from `PRDINSER`, the web page or the demo orders.
- The specification itself is not part of this repository. The field names follow it.

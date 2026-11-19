# Juice bar API

A juice bar as a tool of the stack: a machine that mixes drinks from up to eight bottles and is controlled by
[MixerControl](https://github.com/IUNO-TDM/MixerControl). This service puts its card, its state and an order
behind REST and MCP, and publishes its state to the broker like any other machine.

It is optional. It starts only with the Compose profile `juicebar`, and it needs a real machine.

The machine has to run the branch
[`001-reactivate-local-marketplace`](https://github.com/IUNO-TDM/MixerControl/tree/001-reactivate-local-marketplace)
of MixerControl, where an order goes into the queue directly. On the default branch an order starts the flow
of the marketplace and reaches the queue only after a payment, which this service never makes.

```bash
docker compose --profile juicebar up -d --build
```

## What it does, and what it never does

| | |
|---|---|
| Reads | The card, the pumps with their ingredients, the state of the production, the queue, the orders. |
| Writes | One thing: it places an order (`POST /orders`, `juicebar_order_create`). |
| Never | Starts the production, changes a pump, switches the service mode, runs a program of its own. |

An order joins the queue of the machine. Then a person puts a glass under the outlet and presses the start
button on the machine. That button is the safeguard: no drink runs without someone standing there. MixerControl
has no route that cancels an order, so an order stays in the queue until it is made.

An order is refused, and nothing is sent to the machine,

- while `JUICEBAR_ENABLE_ORDERING` is `false`,
- while the machine does not answer or is not ready (service mode, paused, pump control not connected),
- while `JUICEBAR_MAX_QUEUE_LENGTH` orders wait (default 3). The machine lists an order a moment after it
  answered it, so an order placed here counts from its answer on, and orders are placed one at a time,
- for a drink that is not on the card.

A request to the machine that places an order is sent once and never repeated.

The service has no sign-in in the demo stack, like the rest of it. So its port answers on this computer only
(`JUICEBAR_BIND=127.0.0.1`); the containers of the stack reach it as `http://juicebar-api:8080`. Open it to a
network only where everyone on that network may order, or switch sign-in on first: `JUICEBAR_AUTH_ENABLED=true`
with the three `JUICEBAR_AUTH_*` values of `.env.example` puts reading behind the permission `juicebar:read` and
an order behind `juicebar:write`, as in the other APIs. The chat of the example app sends no token, so it
reaches the service only while sign-in is off.

## REST

| Route | |
|---|---|
| `GET /drinks` | The drinks the machine can mix now, each with its colour, the picture of a glass its author chose, and its ingredients, each with its colour and whether its bottle runs low (see below). |
| `GET /drinks/{id}` | One drink. |
| `GET /status` | Connection, production state, progress, queue, pumps and warnings. For a machine that is switched off: not connected, and no pumps. |
| `GET /orders/{orderNumber}` | One order with its state and its place in the queue. |
| `POST /orders` | Body `{ "drinkId": "..." }`. Answers 201 with the order, 409 with the reason of a refusal. |
| `GET /health`, `GET /healthcheck` | Liveness, and whether the machine answers (`Degraded` if not). |
| `GET /openapi/v1.json` | The description of the routes above. |

Errors: 404 for an unknown drink or order, 409 for a refused order, 502 when the machine does not answer a
request for its card or an order.

## MCP

`http://localhost:5550/mcp`, streamable HTTP. The tools are the routes above:
`juicebar_drinks_list`, `juicebar_drink_get`, `juicebar_status`, `juicebar_order_get`, `juicebar_order_create`,
and the two discovery tools `juicebar_describe_server` and `juicebar_get_skill_guide`.

```json
{ "servers": { "pleiades-juicebar": { "type": "http", "url": "http://localhost:5550/mcp" } } }
```

## In the chat of the example app

Add `juicebar=http://juicebar-api:8080/mcp` to `APP_MCP_SERVERS` in `.env`, and the chat of the
[example app](../../apps/app/README.md) gets the tools above: it answers what the bar can mix and how busy it
is, and orders a drink when a person asks for one. The chat has no sign-in, so everyone who reaches the app
can order then.

For the result of `juicebar_drinks_list` the chat draws the drink card: the drinks whose bottles do not warn,
each in its glass, one to pick, and a button that orders it. The button orders at once, without a question
of the language model, over the same MCP server; the card then follows the order (`juicebar_order_get`, once a
second) and shows the glass waiting for the start button, filling while the pumps run, and full.

## Values

SI units, in the answers of REST and MCP and on the broker.

- Progress is a fraction from 0 to 1; the machine counts in percent.
- `bottleVolumeCubicMetre` is the configured size of a full bottle; the machine keeps it in millilitre. It is
  not a fill level: the machine measures none. `amountWarning` says that a bottle runs low.
- States are the words of MixerControl, unchanged: `waitingOrder`, `waitingStart`, `processingOrder`, ...
- A drink and an ingredient carry the colour the marketplace shows them in, as `#rrggbb`; a colour in any
  other form is left out. Anyone in the network of the machine can publish a recipe, so a display takes these
  values as they are checked here, never as markup.
- `picture` names the picture of a glass the author of a drink chose in the marketplace, by the id of the
  first group of its SVG (`GET /api/drinks/{id}/image` of MixerControl, read once per drink): `AkiSchorle` is
  the one a recipe gets without a choice, `_22` a cocktail glass, `_63` a margarita glass, `_2` and `_6` a
  long drink with a straw. The service does not interpret it.
- `runsLow` of an ingredient is the `amountWarning` of the pump that holds its bottle; null while the warnings
  are not known, because the machine sends them only over its socket.

## On the broker

With a broker configured, the service publishes the state of the machine below `machines/{MachineId}/`, as the
[MQTT binding of machines](../../contracts/mqtt/README.md) says, with the same publisher of the binding as the
Ultimaker telemetry (`Pleiades.Playground.Mqtt.Extensions.Machines`). The machine id is
`<manufacturer>_<model>_<serial number>` by the rule of the binding, `trumpf_JuiceBar_JUICEBAR-01` by default:
the juice bar of the demo was built by TRUMPF, and the domain of `JUICEBAR_MANUFACTURER_URI`
(`https://www.trumpf.com`) without `www.` and its ending gives `trumpf`. The machine is not in the umati data
model, so its own values are signals of the manufacturer, named with the prefix `x-trumpf-com` in the manifest
and lying in the namespace `oem`, below `oem/JuiceBar/`.

- Every value and the manifest: the envelope `{timestamp, value, unit}`, retained, QoS 1, content type
  `application/json`. The state of the machine is looked at every second; a value goes out when it changes. The
  heartbeat comes every ten seconds.
- `umati/Manifest`, before the values: the profile `Core`, `machineId` and every element the service publishes.
  Of `Core` the machine lacks `ProductCode`, `YearOfConstruction`, `State.FeedOverride`,
  `Notification.ActiveAlerts` and `OperationCounters.PowerOnDuration`: `"available": false`, published once as
  `null`. A pump is named once the machine reports it, with a new manifest before its value.
- `umati/Connection/State`: `Initializing` at the start, `Running` while the machine answers, `CommunicationFault`
  while it does not (the values stand with their time, only the heartbeat goes on), every value anew and
  `Running` when it answers again and after every reconnect to the broker, `Shutdown` at a clean stop. The last
  will sets `CommunicationFault`, retained. The machine card and the list of machines show a machine whose
  adapter is not `Running` as "No data".

| Topic | Kind | Unit |
|---|---|---|
| `umati/Manifest` | manifest | – |
| `umati/Connection/State` | string | – |
| `umati/Connection/Heartbeat` | integer, a counter from 1 | – |
| `umati/Identification/Manufacturer`, `umati/Identification/SerialNumber`, `umati/Identification/ProductInstanceUri`, `umati/Identification/ManufacturerUri`, `umati/Identification/Model` | string, retained at every connect | – |
| `umati/Identification/ProductCode`, `umati/Identification/YearOfConstruction`, `umati/State/FeedOverride`, `umati/Notification/ActiveAlerts`, `umati/OperationCounters/PowerOnDuration` | `null`, `"available": false` | – |
| `umati/State/Status` | snapshot: `MachineryItemState` `Executing` while it mixes, else `NotExecuting`; `MachineryOperationMode` `None` | – |
| `oem/JuiceBar/Production/State` | string | – |
| `oem/JuiceBar/Production/QueueLength` | integer | `one` |
| `oem/JuiceBar/Production/Progress` | number, `null` when it does not mix | `one` |
| `oem/JuiceBar/PumpControl/Mode` | string | – |
| `oem/JuiceBar/Pump/{n}/AmountWarning` | boolean | – |

The Timeseries store keeps the snapshot field by field, as `umati/State/Status/MachineryItemState`, the topic the
cards read. `MachineryOperationMode` is `None`, the value of the model for a machine without operation modes:
the schema of the snapshot asks for the field.

## Settings

| Variable in `.env` | Default | |
|---|---|---|
| `JUICEBAR_URL` | `http://juicebar.local:3000/` | Address of MixerControl as the container reaches it. |
| `JUICEBAR_ENABLE_ORDERING` | `true` | `false` makes the service read-only. |
| `JUICEBAR_MAX_QUEUE_LENGTH` | `3` | No order while this many wait. |
| `JUICEBAR_BIND` | `127.0.0.1` | The address the port is published on. |
| `JUICEBAR_API_PORT` | `5550` | |
| `JUICEBAR_SERIAL_NUMBER` | `JUICEBAR-01` | The serial number, the last part of the machine id in the topics. It was `JUICEBAR_MACHINE_ID` before; an existing `.env` no longer applies. |
| `JUICEBAR_MANUFACTURER_URI` | `https://www.trumpf.com` | The web address of the manufacturer, `Identification/ManufacturerUri`. Its domain without `www.` and its ending is the first part of the machine id, and with dashes the prefix of the signals (`x-trumpf-com`). It replaces `JUICEBAR_MANUFACTURER`, which no longer applies. |
| `JUICEBAR_MANUFACTURER_NAME` | `TRUMPF` | The name of the manufacturer, `Identification/Manufacturer`; it must not be empty. |
| `JUICEBAR_MODEL` | `JuiceBar` | The model, the second part of the machine id. |
| `JUICEBAR_LANGUAGE` | `en` | `en` or `de`, for the names of drinks and ingredients. |
| `JUICEBAR_AUTH_ENABLED` | `false` | `true` switches sign-in on; it needs `JUICEBAR_AUTH_METADATA_ADDRESS`, `JUICEBAR_AUTH_VALID_ISSUER` and `JUICEBAR_AUTH_AUDIENCE`. |

## How it talks to the machine

MixerControl has a REST interface without sign-in and tells its state only over Socket.IO 1.x. The service
reads the card and the pumps over REST (`GET` only) and listens to the state over one WebSocket
(`MixerLiveWorker`): it joins the rooms of the namespaces `/production` and `/orders`, which is a subscription
and changes nothing. It reconnects every five seconds while the machine is away.

## Tests

`Pleiades.Playground.JuiceBar.Api.Test` runs the service against a stand-in for MixerControl
(`FakeMixerControl`) that records every request. The tests show that reading sends nothing but `GET` and
subscriptions, that an order is sent once, and that no route that starts the production or changes a pump is
ever called.

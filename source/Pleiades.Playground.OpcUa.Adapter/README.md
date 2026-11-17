# OPC UA adapter (proof of concept)

Brings machines that speak OPC UA into the stack. The adapter holds a session to the OPC UA server of every
registered machine, subscribes to the nodes its registration names, and publishes their values to the broker by
the [MQTT binding](../../contracts/mqtt/README.md). From there a machine is stored and shown like a simulated
one, without a change to another service.

> **Status: proof of concept**, on the branch `feat/opcua-adapter-poc`. It has not been agreed in an issue yet,
> as [Contributing](../../CONTRIBUTING.md#how-to-contribute) asks for a new service. The management API below is
> a proposal and has no contract under `contracts/`. It was tried against one kind of server, the TRUMPF OPC UA
> simulator.

## Goal

A machine with an OPC UA server becomes a machine of the platform like the simulated ones:

1. A person names a machine or the address of an OPC UA server in the chat of the example app.
2. The chat scans the server with the OPC UA MCP tools, finds the endpoint with the best security, and
   matches its nodes to the data model (at least the profile Core).
3. The person reviews the proposal, sees what is unclear or derived, and adds the machine with a click.
4. From then on the adapter runs the machine from the stored registration alone: after a full restart,
   without the MCP tools and without a language model, until the machine is removed.
5. On request the chat scans an added server again and shows what changed, for example new profiles.

## Decisions

| Question | Decision |
|---|---|
| Who drives the discovery | The chat of the example app, with the language model of `.env` |
| Where the OPC UA MCP tools run | Inside the adapter, from the library `OPCFoundation.NetStandard.Opc.Ua.Mcp.Core` 2.0.2, not as a container of their own |
| How a person starts a discovery, lists servers, reviews a mapping | In the chat only, no new page. Slash commands with `/help` guide the person |
| Who adds and removes a machine | A person, with a button on a card in the chat. No tool of the MCP server adds or removes one |
| How a machine is added and removed | The management API of the adapter; the registrations live in its volume |
| Lists of Core (`Notification.ActiveAlerts`, `Production.JobOrders`) | By the MQTT binding: alarms as notification events, job orders not published |
| Test server | The TRUMPF OPC UA simulator, definition `L26`, machine `A0280O0001` |
| Optional or not | Part of the stack, locally, in CI and in the deployment: no compose profile |

## The idea: discover once, run from the registration

Matching the nodes of a server to the data model takes judgement: a server may follow a Companion
Specification, the interface of its maker, or both. That is done once, by the language model of the chat with
the tools of the [OPC UA MCP server](https://github.com/OPCFoundation/UA-.NETStandard/blob/master/docs/McpServer.md)
of the OPC Foundation, and its result is a **registration**: the endpoint, the security, and one node per
element.

The adapter runs from the registration alone. It needs no MCP tools and no language model, so a machine is
there again after every restart, as long as the volume `/data` is.

```text
  chat (example app) ──MCP──▶ opcua-adapter /mcp
     │  cards: server list, mapping, proposal          ├─ opcua_ua_*  (OPC UA MCP library: find, connect, browse, read)
     │                                                 └─ opcua_server_list, opcua_mapping_show,
     │                                                    opcua_endpoint_rank, opcua_registration_propose
     └─ button "Add machine" / "Remove" ──REST──▶ opcua-adapter /drafts/{id}/commit, /machines/{serialNumber}

  opcua-adapter ──OPC UA (SignAndEncrypt)──▶ OPC UA server of the machine
  opcua-adapter ──MQTT──▶ broker ──▶ timeseries and events persistence ──▶ the app shows the machine
```

The scan and the running machine are one OPC UA client application with one certificate in `/data/pki`, so a
server has to trust the adapter once. The tools of the OPC UA MCP library are reduced to the read-only ones and
renamed `opcua_ua_*`; the model's guide to a scan is the tool `opcua_get_skill_guide`
([`Resources/skill.md`](Resources/skill.md)).

## Start

The adapter and a simulated machine are part of the demo stack. They start with the others:

```bash
docker compose up -d --build --wait
```

The simulated machine is the TRUMPF OPC UA simulator with its definition `L26`, a TruLaser, from the image
that umati publishes for amd64 and arm64,
[`ghcr.io/umati/trumpf/edge/opc-simulator:1.3.1`](https://github.com/orgs/umati/packages/container/package/trumpf%2Fedge%2Fopc-simulator).
`OPC_SIMULATOR_IMAGE` in `.env` names another one, for example a build of your own. The simulator is not
registered at the start: the stack shows it once a person adds it in the chat, `/discover A0280O0001`, or with
the request below.

| | |
|---|---|
| Management API | <http://localhost:5530/machines>, on this computer only (`OPCUA_ADAPTER_BIND`) |
| MCP endpoint | `http://opcua-adapter:8080/mcp` in the network of the stack; the app finds it by `OPCUA_MCP_URL` |
| Web UI of the simulator | <http://localhost:8090/> |
| Liveness | `/healthcheck`, healthy while the adapter is connected to the broker |

Register the simulated machine without the chat, with the registration that ships as an example:

```bash
curl -X PUT -H "content-type: application/json" \
  --data-binary @source/Pleiades.Playground.OpcUa.Adapter/samples/trumpf-trulaser-l26.registration.json \
  http://localhost:5530/machines/A0280O0001
```

The machine `A0280O0001` then appears in the example app, <http://localhost:5600/>, beside the simulated ones.

## The example is TRUMPF-specific

The simulator, its machine `A0280O0001` and the example registration
([`samples/trumpf-trulaser-l26.registration.json`](samples/trumpf-trulaser-l26.registration.json)) are
TRUMPF-specific. The simulator serves the address space of a TRUMPF TruLaser: a MachineTool instance after
OPC 40501-1 in the namespace `http://trumpf.com/UA/MachineTool/`, and beside it the TRUMPF interface
`http://trumpf.com/TRUMPF-Interfaces/` with the power-on time, the energy meter and the alarm type
`TcMachineAlarmType`. Every node of the example names one of these namespaces.

The OPC UA server of another machine, from TRUMPF or another maker, has other nodes, often totally different
ones: other namespaces, other node ids, other units, another alarm type, a Companion Specification followed fully,
in part or not at all, or only an interface of the maker. The example registration does not fit such a server.
Its nodes, units and derivations are not a template to copy: every server is scanned on its own, and the scan
decides from what that server offers. The guide of the model says so, and the adapter refuses a registration
whose nodes the server does not have.

The images of umati, `1.3.0` and later, report `A0280O0001`. An image of the simulator built before its machine numbers
were replaced reports `A0280E0062` instead: the example registration is then refused or publishes under the wrong
number.

## In the chat

Typing `/` in the chat field opens the list of commands; `/help` shows it as well. A command becomes a plain
question to the model, so the person can also just ask. The OPC UA commands appear only when the app has the
adapter (`OPCUA_MCP_URL`).

| Command | What it does | Tools the model calls | What the chat draws |
|---|---|---|---|
| `/help` | Lists the commands with a sentence each, without asking the model | none | the list of commands |
| `/opcua` | Lists the added OPC UA servers with endpoint, security, state and mapping health | `opcua_server_list` | server list card, with a Remove button per server |
| `/discover <machine or opc.tcp://host:port>` | Scans a server and proposes its registration | `opcua_endpoint_rank`, `opcua_ua_*`, `opcua_registration_propose` | proposal card, with the button "Add machine" |
| `/mapping <serial number>` | Shows mismatches and unclear mappings of one machine | `opcua_mapping_show` | mapping card, what needs a look first |
| `/rescan <serial number>` | Scans an added server again and says what would change | as `/discover` | proposal card with the changes, with the button "Replace registration" |

Removal is the Remove button on the server list, behind a confirmation. The model can neither add nor remove a
machine, and is told never to say that it did.

A machine named without an address gets the default endpoint, its name as host name and the port of OPC UA:

| The person asks | Endpoint scanned |
|---|---|
| `/discover A0280O0001`, or "add the OPC UA server of A0280O0001" | `opc.tcp://A0280O0001:4840` |
| `/discover opc.tcp://10.0.0.7:4841` | `opc.tcp://10.0.0.7:4841`, as given |

If the default endpoint does not answer, the chat asks for the endpoint. It tries no other port and no other
address of its own: a guessed address may be another machine. In the demo stack the simulator answers under its
host name `A0280O0001`.

## The mapping review

Every element of a registration has one of five states. The chat and the API show what needs a look first.

| State | Meaning |
|---|---|
| Mismatch | The node is gone from the server, or its value does not fit the element |
| Unclear | The scan marked the match as a guess, or the node gives no good value |
| Derived | Computed from another signal, for example `MachineryItemState` from the state of the active program |
| Missing | The server does not offer the element (with the reason) |
| Ok | The node is the element |

## Management API

| Request | What it does |
|---|---|
| `GET /endpoints?url=opc.tcp://host:4840` | The endpoints the server offers, strongest first. The first one is the one to register. |
| `PUT /machines/{SerialNumber}?dryRun=true` | Tries a registration: connects, reads every node once, and answers with each raw and converted value. Nothing is stored or published. |
| `PUT /machines/{SerialNumber}` | Registers the machine, or replaces its registration, and starts it. |
| `POST /drafts/{draftId}/commit` | Registers what a proposal of the chat holds. The button on the proposal sends it; a draft works once and is kept for 30 minutes. |
| `GET /machines` | The registered machines with their state. |
| `GET /machines/{SerialNumber}` | One machine: its registration, the last value of every element, the alarms that stand. |
| `GET /machines/{SerialNumber}/mapping` | The mapping review of one machine, element by element. |
| `DELETE /machines/{SerialNumber}` | Removes the machine. |

A registration is refused with the reasons, one per line of `problems`: `400` if it is malformed, `409` if it
does not fit its server, `502` if the server does not answer.

The API has no sign-in. Whoever reaches its port can add and remove machines, so the port answers on this
computer only unless `OPCUA_ADAPTER_BIND` opens it.

## The registration

[`samples/trumpf-trulaser-l26.registration.json`](samples/trumpf-trulaser-l26.registration.json) is a complete one. Its parts:

- `serialNumber`: the machine id in every topic. It is the value of `Identification.SerialNumber`.
- `profiles`: the profiles of the data model the elements cover. For `Core` its mandatory values must be
  there: the three of the identification, `State.MachineryItemState`, `State.MachineryOperationMode` and
  `OperationCounters.PowerOnDuration`.
- `endpoint`: the URL, `securityMode` and `securityPolicy`. `serverCertificateThumbprint` is filled in by
  the adapter at the first connect.
- `elements`: one per value.
  - `path` and `area` give the topic: `Channel[1].ChannelState` in the area `umati` is
    `machines/{SerialNumber}/umati/Channel/1/ChannelState`; the area `vendor` is for a value of the maker.
  - `kind` is `Number`, `Text` or `Boolean`. A number has a `unit` of the binding.
  - `node` carries its namespace as a URI, `nsu=http://example.com/;i=42`. An index, `ns=2;i=42`, is refused:
    it may change when the server restarts.
  - `scale` and `offset` convert a number once, to the SI unit: 0.01 for percent, 3600 for hours.
  - `map` turns a raw value into a text, for an enumeration or a state that is derived; `mapDefault` is the
    text for every other value.
  - `match` is `Direct`, `Derived` or `Unclear`: how sure the scan is.
  - `evidence` says why this node was matched. It is for the person who reviews the registration.
- `alerts`: the event type of an alarm and the field with the code of the maker.
- `missing`: what the discovery looked for and did not find, with the reason.

## What the adapter publishes

| What | Topic below `machines/{SerialNumber}/` | How |
|---|---|---|
| Every element | `umati/<path>` or `vendor/<path>` | On a change, with the time of the source. A bad value is not published. |
| `Connection.State` | `umati/Connection/State` | `Connected` once the values of a new session are out, `Disconnected` when the session is lost, the machine is removed or the adapter stops. |
| `Connection.Heartbeat` | `umati/Connection/Heartbeat` | Every ten seconds while the machine is registered, also while it does not answer. |
| Alarms | `events/notifications` | An alarm condition of the server that becomes active is `Raised`, one that ends is `Reset`, both with the same correlation id. Severity 667 and above is an error, 334 and above a warning. |

The lists of the profile Core, `Notification.ActiveAlerts` and `Production.JobOrders`, are no values in the
binding. The alarms travel as notification events; the job orders are not published.

After a reconnect, and after a restart of the adapter, the server is asked for the conditions that still stand
(`ConditionRefresh`). An alarm that went while nobody listened is reset then, so none stays open for ever.

## Security

- The adapter orders the endpoints of a server itself: encryption before signing only, then the strength of
  the policy. A registration that names a weaker endpoint than the strongest one is refused, unless
  `endpoint.allowWeaker` is true. That is the decision of a person, never a default.
- The certificate a server presents at the registration is the one the machine is known by. If it presents
  another one later, the adapter does not connect and says so in `lastError`.
- The adapter is one OPC UA client, with one certificate in `/data/pki`. A server that does not accept unknown
  clients has to trust it once.
- Not in the proof of concept: a session with a user name or a user certificate. Every session is anonymous.

## Restart, removal, a server that changed

- **Restart.** The registrations are files in `/data/machines`, one per machine. At start the adapter reads
  them and connects. `docker compose down` keeps the volume; `docker compose down -v` deletes it, and with it
  every registration.
- **Removal.** The session is closed, `Disconnected` is published, the alarms that stand are reset and the
  registration is deleted. What the machine published stays stored until the retention ends.
- **A server that changed.** If a registered node is gone, the element says so and the machine has
  `needsRescan: true`. `/rescan` is the discovery again; its proposal says what would change, and the button
  replaces the registration. The subscription is built anew without a restart of the service. That is also how
  a profile is added that the server supports now.

## How the example registration was made

The first scan of the simulator, before the chat could do it, with the tools of
`OPCFoundation.NetStandard.Opc.Ua.Mcp` 2.0.2:

1. `GetEndpoints`: the endpoints and their security.
2. `Connect`, then `machinery_list_machines` and `machinetool_read_machine`: the machine and what its
   MachineTool instance offers.
3. `BrowseAll` from the machine and from the interface of the maker, `ReadNode` and `ReadValues` for data
   types, units, enumerations and live values.
4. One element per node, with its conversion and its evidence. Then `PUT ...?dryRun=true` to see every
   converted value before the registration is stored.

What the scan of the TRUMPF simulator found, and what it did not. Another server gives another table:

| Element | Source |
|---|---|
| Identification, `State.FeedOverride`, `Channel[1]`, `Production.ActiveProgram` | The MachineTool instance, as OPC 40501-1 names them. |
| `State.MachineryItemState`, `State.MachineryOperationMode` | Derived: the server has neither building block. From the state of the active program and from `OperationMode`. |
| `OperationCounters.PowerOnDuration`, electrical power and energy | The interface of the maker: hours, kilowatt and kilowatt hours, converted. |
| `OperationCounters.PartsProducedInLifetime` | Not there: the server counts parts per program only. |

## What is verified

- The adapter connects to the simulator with SignAndEncrypt and `Aes256_Sha256_RsaPss`, the strongest of seven
  endpoints. A weaker endpoint is refused with 409, an unknown node too.
- All 15 elements of the example registration read Good and are stored with their SI units. The machine
  appears in the example app beside the simulated ones, with its alarms.
- Restart of the adapter: the machine comes back from the volume in about a second, without the MCP tools.
- Loss of the server: the machine goes Disconnected and is Connected again a few seconds after the server is back.
- Removal, also with the button in the app: session closed, Disconnected published, open alarms reset,
  registration deleted.
- The MCP endpoint of the adapter: an encrypted scan session through the hosted library, a proposal with 2
  derived and 2 unclear elements, a commit that works once and answers 404 the second time.
- The default endpoint: in the stack the adapter resolves `A0280O0001` and gets the endpoints of
  `opc.tcp://A0280O0001:4840`.
- Checks: the solution builds and its tests pass, the 54 of the adapter among them; `pnpm typecheck`,
  `pnpm test` and `pnpm build` pass with the chat commands and cards.

Not verified: a discovery through the chat from the first question to the click, with a language model.

## Known limits

- The management API and the MCP tools of the adapter have no contract under `contracts/` yet.
- The adapter was tried against TRUMPF simulators only, not against the server of a real machine or of
  another maker.
- The tools of the OPC UA library serialize with their own JSON settings; the convention check of the
  repository warns about it at start.
- The MCP endpoint has no sign-in, like the other services of the demo; every request is the one demo caller.
- Sessions to a server are anonymous only; a user name or a user certificate is not supported yet.
- One registration is one session: the adapter knows no server that serves several machines.
- `PartsProducedInLifetime` is not offered by the simulator; `Production.JobOrders` is not published.

## Deployment

The workflow "Images" builds the image of the adapter with the others, for amd64 and arm64, and "Deploy" starts
the stack from them ([deployment](../../docs/deployment.md)), the adapter and the simulator with it. The image
of the simulator is pulled from umati. Registrations live in the volume of the deployment: a machine added there
stays across deployments.

## Next steps

- **Machines behind an OPC UA aggregation server.** A gateway serves the address spaces of several machines
  under one endpoint, each machine below `Machines` (OPC 40001-1) or a folder of the gateway. A sample runs on
  the development computer as the Docker container `opcgateway`, with three aggregated machines. To do:
  - a scan that lists every machine of one endpoint and proposes one registration per machine, each with the
    serial number read below that machine;
  - one session per endpoint, shared by the machines behind it, instead of one per registration;
  - a removal that closes the session only with the last machine of its endpoint;
  - in the chat, a gateway is named by its address: the default endpoint `opc.tcp://<machine>:4840` does not
    apply, since the machine is not the host.
- **Strict mappings for known namespaces.** Where a server uses a namespace whose meaning is fixed, the mapping
  should not be left to the judgement of the model. For example:
  - `http://opcfoundation.org/UA/MachineTool/` (OPC 40501-1), with `http://opcfoundation.org/UA/Machinery/`
    (OPC 40001-1): identification, `MachineryItemState`, `MachineryOperationMode`, operation counters,
    channels and spindles by their browse paths and data types;
  - `http://trumpf.com/TRUMPF-Interfaces/`: power-on time, energy meter and the alarm type
    `TcMachineAlarmType`, with their units.

  A strict mapping is code in the adapter, with a unit test per element: element, browse path from the
  instance, unit and conversion, enumeration. The adapter resolves it on the server, marks those elements
  `Direct`, and the model only fills what no strict mapping covers. A proposal that maps such an element
  otherwise is refused. That makes the registration of a known server the same on every scan, and faster.
- A discovery through the chat with a language model, from `/discover A0280O0001` to the click, as an
  automated end-to-end test.
- A server that is not TRUMPF's, before the proof of concept counts as done.
- The issue for the new service ([#105](https://github.com/united-machining-solutions/Pleiades.Playground/issues/105)),
  and a contract under `contracts/` for the management API and the MCP tools.
- Sessions with a user name or a user certificate.

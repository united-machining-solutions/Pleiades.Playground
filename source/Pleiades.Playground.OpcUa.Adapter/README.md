# OPC UA adapter (proof of concept)

Brings machines that speak OPC UA into the stack. The adapter holds a session to the OPC UA server of every
registered machine, one session per endpoint, so the machines behind one gateway share it. It subscribes to the
nodes each registration names, and publishes their values to the broker by the
[MQTT binding](../../contracts/mqtt/README.md). From there a machine is stored and shown like a simulated
one, without a change to another service.

How machines, sessions and topics fit together, and where the adapter keeps its OPC UA configuration (endpoints,
pinned server certificates, its own certificate): [Architecture](Architecture.md).

> **Status: proof of concept**, on the branch `feat/opcua-adapter-poc`. It has not been agreed in an issue yet,
> as [Contributing](../../CONTRIBUTING.md#how-to-contribute) asks for a new service. The management API below is
> a proposal and has no contract under `contracts/`. It was tried against one kind of server, the TRUMPF OPC UA
> simulator.

## Goal

A machine with an OPC UA server becomes a machine of the platform like the simulated ones:

1. A person names a machine or the address of an OPC UA server in the chat of the example app.
2. The chat scans the server with the OPC UA MCP tools, finds the endpoint with the best security, and
   matches its nodes to the data model by their browse paths, units, enumerations and descriptions.
3. The person reviews the proposal, sees whether the machine fulfils the core of the data model, which
   profiles are complete, and what is unclear or derived, and adds the machine with a click. What the core
   lacks is declared not available; only the parts of the machine id are required
   ([Core and profiles](#core-and-profiles)).
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
| Core and profiles | Those of the data model 0.17.1. The core is declared whole, what the machine lacks `"available": false`, as the other adapters do; required are only `ManufacturerUri`, `Model` and `SerialNumber`, the machine id; without a `ManufacturerUri` the `Manufacturer` stands in. Of another profile only a complete one is published |
| What goes to the broker | The [binding of machines](../../contracts/mqtt/README.md#machines-the-binding-of-the-data-model) of the data model 0.17.1, with the publisher every adapter of the stack shares: manifest, values in the units of the catalogue, `Connection/State`, last will |
| How a machine is named on the broker | By its machine id, `<manufacturer>_<model>_<serial number>`, formed from the identification read when it is added and kept with its registration |
| One MQTT connection per machine | Yes: the binding wants a last will per machine, and a connection has one |
| Alarms | As the list `Notification.ActiveAlerts` and as the events `Notification.AlertRaised` and `AlertCleared`; job orders are not published |
| Test server | The TRUMPF OPC UA simulator: in the stack definition `K09`, machine `A1121O0001`; first tried with definition `L26`, machine `A0280O0001` |
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
     │                                                 └─ opcua_server_list, opcua_mapping_show, opcua_endpoint_rank,
     │                                                    opcua_machine_list, opcua_registration_propose
     └─ button "Add the machine" / "Remove" ──REST──▶ opcua-adapter /drafts/{id}/commit, /machines/{serialNumber}

  opcua-adapter ──OPC UA (SignAndEncrypt)──▶ OPC UA server of the machine
  opcua-adapter ──MQTT──▶ broker ──▶ timeseries and events persistence ──▶ the app shows the machine
  opcua-adapter ──REST, delete a removed machine──▶ timeseries-api, events-api
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

The simulated machine is the TRUMPF OPC UA simulator with its definition `K09`, a TruMatic, from the image
that umati publishes,
[`ghcr.io/umati/trumpf/edge/opc-simulator:1.4.0-alpha3`](https://github.com/orgs/umati/packages/container/package/trumpf%2Fedge%2Fopc-simulator).
That image is built for amd64 only; `1.3.1` is the last one for arm64 as well. `OPC_SIMULATOR_IMAGE` in `.env`
names another one, for example a build of your own. The simulator is not
registered at the start: the stack shows it once a person adds it in the chat, `/discover A1121O0001`, or with
the request below.

| | |
|---|---|
| Management API | <http://localhost:5560/machines>, on this computer only (`OPCUA_ADAPTER_BIND`) |
| MCP endpoint | `http://opcua-adapter:8080/mcp` in the network of the stack; the app finds it by `OPCUA_MCP_URL` |
| Web UI of the simulator | <http://localhost:8090/> |
| Liveness | `/healthcheck`, healthy while the adapter is connected to the broker |

Register the simulated machine without the chat, with the registration that ships as an example:

```bash
curl -X PUT -H "content-type: application/json" \
  --data-binary @source/Pleiades.Playground.OpcUa.Adapter/samples/trumpf-trumatic-k09.registration.json \
  http://localhost:5560/machines/A1121O0001
```

The machine `A1121O0001` then appears in the example app, <http://localhost:5600/>, beside the simulated ones.

## The example is TRUMPF-specific

The simulator, its machines and the example registrations are TRUMPF-specific:
[`samples/trumpf-trumatic-k09.registration.json`](samples/trumpf-trumatic-k09.registration.json) for the
TruMatic `A1121O0001` of definition `K09`, the one in the stack, and
[`samples/trumpf-trulaser-l26.registration.json`](samples/trumpf-trulaser-l26.registration.json) for the
TruLaser `A0280O0001` of definition `L26`, the first one scanned. In the image `1.4.0-alpha3` both definitions
also serve the namespace `urn:umati2:datamodel:opcua`, which has the whole core, the list of the alarms included
([A machine in `urn:umati2:datamodel:opcua`](#a-machine-in-urnumati2datamodelopcua)). The example of `K09` names
that machine, `machineNode` `nsu=urn:umati2:datamodel:opcua;s=Machine`: the adapter maps the core from it, with the
model `TruMatic 1000 fiber` and the web address of TRUMPF, so the machine id is
`trumpf_TruMatic-1000-fiber_A1121O0001`. The example adds what the data model does not have, from the TRUMPF
interface and the MachineTool instance: the active program, power and energy, and the drive time as a signal of
the maker. The example of `L26` maps the MachineTool instance only, which has no `ManufacturerUri`,
`ProductCode` and `YearOfConstruction`: it does not fulfil the core and is refused. The simulator serves the address space of a TRUMPF machine:
a MachineTool instance after
OPC 40501-1 in the namespace `http://trumpf.com/UA/MachineTool/`, and beside it the TRUMPF interface
`http://trumpf.com/TRUMPF-Interfaces/` with the power-on time, the energy meter and the alarm type
`TcMachineAlarmType`. Every node of the example names one of these namespaces.

The OPC UA server of another machine, from TRUMPF or another maker, has other nodes, often totally different
ones: other namespaces, other node ids, other units, another alarm type, a Companion Specification followed fully,
in part or not at all, or only an interface of the maker. The example registration does not fit such a server.
Its nodes, units and derivations are not a template to copy: every server is scanned on its own, and the scan
decides from what that server offers. The guide of the model says so, and the adapter refuses a registration
whose nodes the server does not have.

The images of umati, `1.3.0` and later, report `A0280O0001` for `L26`. An image of the simulator built before its
machine numbers were replaced reports `A0280E0062` instead: the example registration of `L26` is then refused or
publishes under the wrong number. The machine of `K09` is `A1121O0001` in the images `1.3.1` and `1.4.0-alpha3`.

## In the chat

Typing `/` in the chat field opens the list of commands; `/help` shows it as well. A command becomes a plain
question to the model, so the person can also just ask. The OPC UA commands appear only when the app has the
adapter (`OPCUA_MCP_URL`).

| Command | What it does | Tools the model calls | What the chat draws |
|---|---|---|---|
| `/help` | Lists the commands with a sentence each, without asking the model | none | the list of commands |
| `/opcua` | Lists the added OPC UA servers with endpoint, security, state and mapping health | `opcua_server_list` | server list card, with a Remove button per server |
| `/discover <machine or opc.tcp://host:port>` | Scans a server and proposes a registration for each machine it serves | `opcua_endpoint_rank`, `opcua_machine_list`, `opcua_ua_*`, `opcua_registration_propose` | the machines of the server, and a proposal card per machine, each with the button "Add the machine" |
| `/mapping <serial number>` | Shows mismatches and unclear mappings of one machine | `opcua_mapping_show` | mapping card, what needs a look first |
| `/rescan <serial number>` | Scans an added server again and says what would change | as `/discover` | proposal card with the changes, with the button "Replace the registration" |

Removal is the Remove button on the server list, behind a confirmation. It removes the machine and its
retained messages on the broker; what the stores kept of it stays
([Restart, removal, a server that changed](#restart-removal-a-server-that-changed)).
The model can neither add nor remove a machine, and is told never to say that it did.

A machine named without an address gets the default endpoint, its name as host name and the port of OPC UA:

| The person asks | Endpoint scanned |
|---|---|
| `/discover A1121O0001`, or "add the OPC UA server of A1121O0001" | `opc.tcp://A1121O0001:4840` |
| `/discover opc.tcp://10.0.0.7:4841` | `opc.tcp://10.0.0.7:4841`, as given |

If the default endpoint does not answer, the chat asks for the endpoint. It tries no other port and no other
address of its own: a guessed address may be another machine. In the demo stack the simulator answers under its
host name `A1121O0001`.

An address may be a gateway that serves several machines, "Add machine via OPC UA server at
opc.tcp://opcgateway:11878/": the default endpoint does not apply, since the machine is not the host. See
[Machines behind a gateway](#machines-behind-a-gateway).

## Machines behind a gateway

An aggregation server, a gateway, serves the address spaces of several machines under one endpoint, each
machine below `Machines` (OPC 40001-1) or a folder of the gateway. The adapter treats every machine as a
machine of its own, with a registration of its own, and every machine on one endpoint shares one session.

- **Which machines.** `opcua_machine_list`, or `GET /endpoints/machines?url=`, connects with the strongest
  endpoint and lists every object below Objects that has an `Identification` with a `SerialNumber`, with its
  node, its path and the serial number read below it. That is code, not the judgement of the model. A server of
  one machine lists one.
- **TRUMPF machines behind a gateway.** A gateway may leave the `Machines` folder of OPC 40001-1 out, as the
  TRUMPF OPC gateway does: its MachineTool instance is then on the gateway, but no browse from Objects leads to
  it. Two facts of every TRUMPF machine find it anyway ([`OpcUa/TrumpfMachines.cs`](OpcUa/TrumpfMachines.cs)):
  the root of its TRUMPF interface is `s=1` in `http://trumpf.com/TRUMPF-Interfaces/`, with the display name
  `<Model>.<SerialNumber>`, and its MachineTool instance is `i=3000` in `http://trumpf.com/UA/MachineTool/`.
  The gateway puts the same prefix before both namespaces of one machine, `urn:A1121O0001:TRUMPF:OpcSimulator/`
  for example. The list names the instance as the machine, with the identification read below it and the model
  from the display name; the scan browses from there, and the registration has the nodes of the instance in the
  prefixed namespaces.
- **One registration per machine.** The chat scans each machine from its node and proposes one registration per
  machine, with `machineNode` and the serial number from the list. A person adds each with the button on its
  proposal.
- **Checks.** On a server of several machines a registration is refused (409) if it names no `machineNode`, if
  its serial number is not the one read below that machine, or if one of its nodes lies in a namespace that only
  another machine of the endpoint has. On every server the serial number has to be the value its element
  `Identification.SerialNumber` reads.
- **One session per endpoint.** Machines with the same address (case and a slash at the end do not count), the
  same security and the same server certificate share one session. Each machine keeps a subscription of its own
  on it and its own connection to the broker, says `Running` and `CommunicationFault` itself, and is tried again
  on its own if its nodes fail, while the session and the other machines go on. A lost session makes every
  machine on it `CommunicationFault`.
- **Removal.** The machine leaves the session: its subscription is deleted and its alarms are cleared. The
  session closes only with the last machine of its endpoint.
- **Alarms.** A gateway reports the alarms of all its machines at its Server object. A machine with a
  `machineNode` keeps those whose source or condition lies in one of its namespaces: those of its elements and
  of its node, and the TRUMPF interface if its alarm type is `TcMachineAlarmType`. That needs a gateway that
  gives every machine namespaces of its own, as the UaGateway of Unified Automation does with
  `NamespacePrefixOption` `ServerUri`. A machine in `urn:umati2:datamodel:opcua` reads its alarms from its own
  list, `Notification.ActiveAlerts`, and needs no filter.

### A gateway on the development computer

The gateway is not part of the stack and not of `compose.yaml`: its image is not public. A gateway that runs as
a container of its own, here named `opcgateway`, is reached by the adapter once both are in one network:

```bash
docker network connect pleiades-playground_default opcgateway
```

The gateway has to trust the adapter once. After the first try, the certificate of the adapter,
`Pleiades Playground OPC UA Adapter [<thumbprint>].der`, lies among the rejected certificates of the gateway; for
the UaGateway that is `pki/pkiserver/rejected` in its configuration folder. Move it to `pki/pkiserver/trusted/certs`.
`GET /endpoints/machines?url=opc.tcp://opcgateway:11878` then lists the machines the gateway reaches. A gateway
that reaches none of its machines lists none: its own folders hold nothing then. The UaGateway reaches a machine
in the way its configuration names, for example by reverse connect, where the server of the machine dials in to
the gateway.

## The mapping review

Every element of a registration has one of five states. The chat and the API show what needs a look first.

| State | Meaning |
|---|---|
| Mismatch | The node is gone from the server, or its value does not fit the element |
| Unclear | The scan marked the match as a guess, or the node gives no good value |
| Derived | Computed from another signal, for example `MachineryItemState` from the state of the active program |
| Missing | The server does not offer the element (with the reason) |
| Ok | The node is the element |

## Known mappings

For namespaces whose meaning is fixed, the mapping is not left to the judgement of the model. The adapter
knows these rules ([`Mapping/KnownMappings.cs`](Mapping/KnownMappings.cs)) and applies them to every
registration before it is checked, proposed or stored, from the chat and from `PUT /machines` alike. An
element a rule covers is set by the rule, whatever the scan proposed for it, and is no longer missing.
Applying the rules twice changes nothing more.

Besides mapping a machine in `urn:umati2:datamodel:opcua` whole (below), there is one rule so far:

| When the node of | is in the namespace | the element | is |
|---|---|---|---|
| `Identification.SerialNumber` | `http://trumpf.com/UA/MachineTool/` | `Identification.Model` | the same node, `Derived`: the TRUMPF instance has no `Identification/Model` and names the machine by its serial number |

A rule compares the namespace as written, without a prefix. That has three consequences:

- **On the server of a TRUMPF machine** the rule applies to a registration that maps the MachineTool instance:
  `Identification.Model` from the node of its serial number, `i=3005`, with the value `A1121O0001`. The model is
  a part of the machine id, so such a machine is named `<manufacturer>_A1121O0001_A1121O0001`. Where the server
  has the namespace `urn:umati2:datamodel:opcua`, as the simulator `1.4.0-alpha3` has, register that machine
  instead: its `Identification.Model` is the model, and the rule does not apply, since the serial number is not
  in the MachineTool namespace. The example of `K09` does so.
- **Behind a gateway** the namespace carries the prefix of the gateway, for example
  `urn:A1121O0001:TRUMPF:OpcSimulator/http://trumpf.com/UA/MachineTool/`, and the rule does not apply: the
  registration has the model only if the scan mapped it.
- **The machine list** of an endpoint names the model differently: for a TRUMPF machine it takes the part
  before the dot of the display name of the TRUMPF root, `TruMatic` for `TruMatic.A1121O0001`
  ([Machines behind a gateway](#machines-behind-a-gateway)). The rule gives the serial number instead.

### A machine in `urn:umati2:datamodel:opcua`

Some servers publish the data model itself, in the namespace `urn:umati2:datamodel:opcua`: an object
`s=Machine` with one variable per element, whose node id is the path of the element
(`s=State.FeedOverride`), with its unit in the description of the node. The gateway of an edge device shows it
with its prefix, `urn:Z0009A0033:TRUMPF:UAInterfaces/urn:umati2:datamodel:opcua`. When the `machineNode` of a
registration, or else the node of its serial number, is in that namespace, with or without a prefix, the
adapter maps the machine whole ([`Mapping/Umati2DataModel.cs`](Mapping/Umati2DataModel.cs)):

| Element | Node | How |
|---|---|---|
| `Identification.Manufacturer`, `.SerialNumber`, `.ProductInstanceUri`, `.ManufacturerUri`, `.Model`, `.ProductCode`, `.SoftwareRevision` | `s=Identification.<Element>` | as it is, `Direct` |
| `Identification.YearOfConstruction` | `s=Identification.YearOfConstruction` | a UInt16 year, in `one` |
| `State.FeedOverride` | `s=State.FeedOverride` | a Double in `one`, no scale |
| `OperationCounters.PowerOnDuration` | `s=OperationCounters.PowerOnDuration` | a Double in `second`, no scale |
| `State.MachineryItemState` | `s=State.Status`, member `MachineryItemState` | 0 NotAvailable, 1 OutOfService, 2 NotExecuting, 3 Executing |
| `State.MachineryOperationMode` | `s=State.Status`, member `MachineryOperationMode` | 0 None, 1 Maintenance, 2 Setup, 3 Processing |

`State.Status` is a structure, `DataType.Status`, of two enumerations. The adapter decodes its binary
encoding itself ([`Mapping/KnownStructures.cs`](Mapping/KnownStructures.cs)) and reads no type definitions from
the server; the element names the member in `field`. An element of the table that the server does not have is
moved to `missing` when the registration is tried, instead of refusing it; a missing element of the core
refuses it all the same ([Core and profiles](#core-and-profiles)). `ManufacturerUri`, `ProductCode` and
`YearOfConstruction` were not on the gateway of the edge device; the simulator `1.4.0-alpha3` has them.

The alarms come from `s=Notification.ActiveAlerts`, the list of the alerts that stand, an array of
`DataType.Alert`: the rules set `alerts.list` to it, whatever `alerts` the scan proposed. The adapter decodes the
structure itself, as it decodes `DataType.Status`: `Id`, `ErrorCode`, `Message`, `Severity` (`DataType.AlertSeverity`:
1 `Failure`, 2 `CheckFunction`, 3 `OffSpec`, 4 `MaintenanceRequired`), `SeverityValue` (UInt16), `Time`,
`SourceName` and `correlationId`. Every new value of the list is compared with the alerts that stand: one that is
new is raised, one that left is cleared, and the `Id` of the server is the condition of the alert. The severity of
the list is the server's, not one the adapter derives. An alarm event type is not needed: the conditions of
these events lie in the TRUMPF interface, outside the namespace of the machine. A server without the node moves
`Notification.ActiveAlerts` to `missing` when the registration is tried. Not mapped: `Connection.State` and
`Connection.Heartbeat`, the connection of the source on the edge device to the machine, not values of the
machine. The model of the machine is its own `Identification.Model`, so the TRUMPF rule above does not apply.

Such a server may show the same machine twice: in this namespace and by the root of its TRUMPF interface.
`/endpoints/machines` lists it once, by its node in `urn:umati2:datamodel:opcua`, with the namespaces of both. A
registration needs nothing but its machine:
[`samples/trumpf-trulaser-umati2-gateway.registration.json`](samples/trumpf-trulaser-umati2-gateway.registration.json)
names the machine only, and the rules give it the whole core, its alarms included.

A TRUMPF machine that is not in `urn:umati2:datamodel:opcua`, registered by its MachineTool instance or its
TRUMPF interface, gets the alarm events of `TcMachineAlarmType` (`i=1006` of
`http://trumpf.com/TRUMPF-Interfaces/`, a subtype of `AlarmConditionType`), with the code of the maker in its
field `AlarmIdentifier`, if its registration names no `alerts` of its own
([`Mapping/TrumpfAlarms.cs`](Mapping/TrumpfAlarms.cs)). Behind a gateway the event type takes the prefix of the
machine's namespaces. A server without that type, or without it under that prefix, moves
`Notification.ActiveAlerts` to `missing` when the registration is tried. The namespace of the TRUMPF interface counts as the machine's own, so that its conditions
(`s=179.BasePlc.5.11.5.4`) pass the filter of a gateway ([Machines behind a gateway](#machines-behind-a-gateway)).

A registration that is stored already keeps its mapping until it is replaced: `/rescan` proposes the change.
A rule is code with a unit test ([`KnownMappingsTest.cs`](../Pleiades.Playground.OpcUa.Adapter.Test/KnownMappingsTest.cs)).
The rules and the machine list are to agree on the model, and the rules are to match a namespace behind the
prefix of a gateway; both are open.

## Management API

| Request | What it does |
|---|---|
| `GET /endpoints?url=opc.tcp://host:4840` | The endpoints the server offers, strongest first. The first one is the one to register. |
| `GET /endpoints/machines?url=opc.tcp://host:4840` | The machines the server serves, with node, path and serial number: one, or several behind a gateway. |
| `PUT /users` | Stores the user of a server, `{ "url", "user", "password" }`, after the server accepted it. The card in the chat sends it; `409` if the server refuses the user. |
| `GET /users` | The servers with a stored user, without the passwords. |
| `DELETE /users?url=opc.tcp://host:4840` | Forgets the user of a server. |
| `PUT /machines/{SerialNumber}?dryRun=true` | Tries a registration: connects, reads every node once, and answers with each raw and converted value. Nothing is stored or published. |
| `PUT /machines/{SerialNumber}` | Registers the machine, or replaces its registration, and starts it. `409` with `identity: …` if the server gives no value for `Identification.ManufacturerUri` (or, if the registration has it in `missing`, `.Manufacturer`), `.Model` or `.SerialNumber`, the parts of the machine id. |
| `POST /drafts/{draftId}/commit` | Registers what a proposal of the chat holds. The button on the proposal sends it; a draft works once and is kept for 30 minutes. Refused as `PUT /machines/{SerialNumber}` is. |
| `GET /machines` | The registered machines with their state, and the machines each shares its session with. |
| `GET /machines/{SerialNumber}` | One machine: its registration, the last value of every element, the alarms that stand. |
| `GET /machines/{SerialNumber}/mapping` | The mapping review of one machine, element by element. |
| `DELETE /machines/{SerialNumber}` | Removes the machine and takes its retained messages back from the broker. `204`; `404` if no such machine is added; `503` if the broker cannot be reached, so that its retained messages cannot be taken back: the machine then stays added, and the removal can be tried again. |

A registration is refused with the reasons, one per line of `problems`: `400` if it is malformed; `409` once the
server has answered, if the registration does not fit it (a node the server does not have), is not the machine it
says it is, or if the server gives no value for a part of the machine id (`identity: …`); `502` if the server does
not answer. A core the machine does not deliver whole is no reason: what it lacks is declared not available.

The API has no sign-in. Whoever reaches its port can add and remove machines, so the port answers on this
computer only unless `OPCUA_ADAPTER_BIND` opens it.

## The registration

[`samples/trumpf-trumatic-k09.registration.json`](samples/trumpf-trumatic-k09.registration.json) is a complete one. Its parts:

- `schemaVersion`: 2. A registration of version 1, with numbers in coherent SI units, is moved over when it is
  read: an energy in `joule` becomes `wattHour` (scale divided by 3600), a count in `one` becomes `piece`, a year
  loses its unit.
- `serialNumber`: the value of `Identification.SerialNumber`, how the adapter and its API name the machine.
- `identity`: `manufacturer`, `manufacturerUri`, `model` and `productInstanceUri` as the server gave them when
  the machine was added, and the `machineId` formed from them, the level below `machines/` of every topic. The
  adapter fills it in; a registration without it, from before, learns it from the values of the machine and is
  published from then on. `ManufacturerUri`, `Model` and the serial number are required: a registration whose
  server gives no value for one of them is refused (`409`). A missing `Manufacturer` is the domain of the
  `ManufacturerUri`, a missing `ProductInstanceUri` is formed as the binding forms it. It stays, so the machine
  keeps its topics whatever its server says later.
- `identity.manufacturerUriFromManufacturer`: true if the server has no `ManufacturerUri`. Some servers have
  no node for it; the registration then does not map it (it is in `missing`, by the model or because the
  server lacks a node a known namespace sets). Then the `Manufacturer` without any character but `A-Z`, `a-z`
  and `0-9` stands in, since the machine id is a level of every MQTT topic:
  `TRUMPF Werkzeugmaschinen SE + Co. KG` gives `TRUMPFWerkzeugmaschinenSECoKG`, the machine id
  `trumpfwerkzeugmaschinensecokg_<model>_<serial number>` and the prefix `x-trumpfwerkzeugmaschinensecokg` of the
  signals of the maker. That value is published as `ManufacturerUri`, and the `ProductInstanceUri`, if the
  server gives none, is formed from it, as the
  [machine id](../../contracts/mqtt/README.md#without-a-manufactureruri) of the binding describes. A mapped
  `ManufacturerUri` that has no value yet is never replaced: the registration is refused, and a machine that
  learns its identity at run time waits for it. A `Manufacturer` without any letter or digit `A-Z`, `0-9`
  cannot stand in, and the refusal says so. The proposal says what stands in in `notices`, with the
  `machineId`; the card in the chat shows it under "Good to know", and the model is told to say it.
- `profiles`: the profiles of the data model the elements deliver whole. The adapter sets it from the
  elements; what a proposal names is replaced ([Core and profiles](#core-and-profiles)).
- `endpoint`: the URL, `securityMode` and `securityPolicy`. `serverCertificateThumbprint` is filled in by
  the adapter at the first connect, and `user` from the user a person stored for the server; never a password.
- `machineNode`: the object of the machine, as `opcua_machine_list` names it. Required on a server of several
  machines; left out on a server of one.
- `elements`: one per value.
  - `path` and `area` give the topic: `Channel[1].ChannelState` in the area `umati` is
    `machines/{machineId}/umati/Channel/1/ChannelState`. The area `oem` is for a value of the maker: a signal of
    the manufacturer, `x-<domain>.<path>` in the manifest and `machines/{machineId}/oem/<path>` on the broker. A
    registration that still says `vendor`, the earlier name, is moved over.
    `State.MachineryItemState` and `State.MachineryOperationMode` go out together as the snapshot `State.Status`.
  - `kind` is `Number`, `Text` or `Boolean`. A number has a `unit` of the catalogue of the data model: an element
    of the model the one its catalogue gives, energy in `wattHour` ([`Mapping/CatalogueUnits.cs`](Mapping/CatalogueUnits.cs));
    a year has none.
  - `node` carries its namespace as a URI, `nsu=http://example.com/;i=42`. An index, `ns=2;i=42`, is refused:
    it may change when the server restarts.
  - `scale` and `offset` convert a number once, to its unit: 0.01 for percent, 3600 for hours, 1000 for kilowatt
    hours to `wattHour`.
  - `field` names the member of a structure the adapter decodes, for example `MachineryItemState` of
    `State.Status`. The adapter sets it; a scan leaves it out.
  - `map` turns a raw value into a text, for an enumeration or a state that is derived; `mapDefault` is the
    text for every other value.
  - `match` is `Direct`, `Derived` or `Unclear`: how sure the scan is.
  - `evidence` says why this node was matched. It is for the person who reviews the registration.
- `alerts`: the event type of an alarm and the field with the code of the maker; `notifier`, the object whose
  events are subscribed, is the Server object if left out. Or, instead of the events, `list`: the variable that
  lists the alerts that stand, `Notification.ActiveAlerts` of `urn:umati2:datamodel:opcua`, which the adapter
  sets itself for such a machine. Without `alerts` the core is not fulfilled.
- `missing`: what the discovery looked for and did not find, with the reason, and the elements of a profile
  that is not complete, which the adapter does not publish.

## Core and profiles

The adapter checks every registration against the core and the profiles of the data model, specification
0.17.1 (§5 and §6 of `spec/spec.md` of the data model), on the paths of its registrations
([`Mapping/DataModelProfiles.cs`](Mapping/DataModelProfiles.cs)), and publishes by the binding of the data model
0.17.1 ([`contracts/datamodel`](../../contracts/datamodel/README.md)).

- **Core.** Declared whole in every manifest: `Identification.Manufacturer`, `.SerialNumber`, `.ProductInstanceUri`,
  `.ManufacturerUri`, `.Model`, `.ProductCode`, `.YearOfConstruction`, `State.MachineryItemState` and
  `State.MachineryOperationMode` (published together as the snapshot `State.Status`), `State.FeedOverride`,
  `OperationCounters.PowerOnDuration`, and `Notification.ActiveAlerts`, which the adapter builds from `alerts`:
  the alarm events of the server, or its list. `Connection.State` and `Connection.Heartbeat` the adapter publishes
  itself. An element counts if it is mapped, also as `Derived` or `Unclear`; one in `missing` does not. What
  the machine lacks is `"available": false` in the manifest and goes out once as `null`, as with the Ultimaker
  telemetry and the juice bar. A registration is refused only without the parts of the machine id:
  `Identification.ManufacturerUri` (or, if the server has no node for it, `.Manufacturer`, see
  [The registration](#the-registration)), `.Model` and `.SerialNumber` must be mapped and give a value.
- **Profiles.** `IdentificationExtended`, `MonitoringExtended`, `ChannelMonitoring`, `Spindle` and
  `EnergyElectricity`. A profile is published only if all its elements are mapped; otherwise its elements go
  to `missing` with the reason, and nothing of it reaches the broker. Of a profile with instances, a channel, a
  spindle or a measuring point, each complete instance is published; `EnergyElectricity` needs the measuring
  point `Main`.
- **Not checked.** The profiles of lists and events the adapter does not build: `Components`, `Stacklight`,
  `JobMonitoring`, `WorkMasterMonitoring` and `AlertsEvents` (of which it publishes `AlertRaised` and
  `AlertCleared`, not `AlertChanged` and `NotificationEvent`); and `EnergyCompressedAir`, whose `MassFlowRate`
  is in kilogram per second, a unit the adapter does not know yet.
- **Elements of no profile** are published as they are: every value in the area `oem`, and
  `Production.ActiveProgram` as `WorkMasterMonitoring.ActiveWorkMaster`, the active work master, which on a
  machine without work masters of its own is the name of its program. `Identification.SoftwareRevision` is no
  element of the model 0.17.1 (it lists the software in `Components.Software`) and goes out as a signal of the
  manufacturer, below `oem/`. The manifest declares the core and the complete profiles.

The proposal card in the chat and the list of the added servers show it: `Core complete` or how many
elements of the core are not available, a badge per complete profile, and what an incomplete one lacks. The answers carry it as
`conformance`, one entry per profile with `name`, `mandatory`, `fulfilled`, `offered`, `missing` and the complete
`instances`.
`profiles` names the complete ones. A machine added before the core was checked keeps running from its
registration; the list shows what it lacks, and `/rescan` proposes a registration that fulfils it, or says
why it cannot.

## What the adapter publishes

Every machine has a connection of its own to the broker, with the client id `opcua-adapter-<machineId>` and a last
will. What goes out follows the
[binding of machines](../../contracts/mqtt/README.md#machines-the-binding-of-the-data-model), through the
publisher the Ultimaker telemetry and the juice bar use too
([`Mapping/MachineOutput.cs`](Mapping/MachineOutput.cs)):

| What | Topic below `machines/{machineId}/` | How |
|---|---|---|
| The manifest | `umati/Manifest` | Retained, before the values, at every connect to the broker: the complete profiles, every element on its path, the signals of the maker with type, unit and description, and the alert events. |
| The identification | `umati/Identification/Manufacturer`, `SerialNumber`, `ProductInstanceUri`, `ManufacturerUri`, `Model` | From the `identity` of the registration, at every connect. |
| Every element of the model | `umati/<path>` | Retained, in the envelope `{timestamp, value, unit}`, with the time of the source, when it changes. A bad value is not published, the last good one stands. |
| `State.Status` | `umati/State/Status` | The snapshot `{MachineryItemState, MachineryOperationMode}` of the two elements. |
| A signal of the maker | `oem/<path>` | As an element of the model; the manifest names it `x-<domain>.<path>`, the domain that of `ManufacturerUri`. |
| `Notification.ActiveAlerts` | `umati/Notification/ActiveAlerts` | The alarms that stand, a list of `Id`, `ErrorCode`, `Message`, `Severity`, `SeverityValue`, `Time` and `SourceName` if the server names one; `[]` without one. |
| Alarms | `events/notifications` | CloudEvents, not retained: `Notification.AlertRaised` when an alarm condition of the server becomes active or an alert appears in its list, `AlertCleared` when it ends or leaves the list, both with the same `Id`. `source` is the `ProductInstanceUri`, `sequence` the start of the adapter and a count. `Severity` is the category of NAMUR NE 107: the one of the list of `urn:umati2:datamodel:opcua`, and for an alarm event, from the severity of OPC UA: from 667 `Failure`, from 334 `OffSpec`, below `MaintenanceRequired`. |
| `Connection.State` | `umati/Connection/State` | `Initializing` at the start, `Running` once the values of a new session are out, `CommunicationFault` while the server does not answer (the values stand), `Shutdown` when the adapter stops or the registration is replaced. The last will says `CommunicationFault`. |
| `Connection.Heartbeat` | `umati/Connection/Heartbeat` | A count from 1, every ten seconds while the machine is registered, also while it does not answer. |

The job orders are not published. After a reconnect, and after a restart of the adapter, the server is asked for
the conditions that still stand (`ConditionRefresh`); a machine with a list of alerts gets the list once, as every
new subscription does. An alarm that went while nobody listened is cleared then, so none stays open for ever. An alarm that stood before a restart of the adapter and still stands is raised once
more in the new run, with its `Id` and its `Time`: the events of every run name every alarm that stands, so a
consumer that ends the alarms of an earlier run at the start of the next one does not lose it.

## Security

- The adapter orders the endpoints of a server itself: encryption before signing only, then the strength of
  the policy. A registration that names a weaker endpoint than the strongest one is refused, unless
  `endpoint.allowWeaker` is true. That is the decision of a person, never a default.
- The card of `opcua_endpoint_rank` shows the endpoint the adapter takes in one line, and folds the others
  away behind "n more endpoints", since a person cannot choose one there. Without unfolding, the card says
  one thing more: that the server also accepts sessions without security, if one of the others has none.
  Choosing a weaker endpoint in the card, for example after the strongest one failed, is not built yet;
  until then nothing in the app sets `endpoint.allowWeaker`. The rule is `endpointSummary` in
  `apps/app/src/cards/opcua/results.ts`.
- The certificate a server presents at the registration is the one the machine is known by. If it presents
  another one later, the adapter does not connect and says so in `lastError`.
- The adapter is one OPC UA client, with one certificate in `/data/pki`. A server that does not accept unknown
  clients has to trust it once.
- **A server that wants a user.** A session is anonymous, or logs in with a user name and a password that a
  person stored for the server. One user per server; a user certificate is not supported.
  - The person enters user name and password in the card of `opcua_endpoint_rank`, and only there: a turn of
    the chat that does not call that tool shows no form. The app sends them from its server to `PUT /users`;
    they are never part of the chat, so the language model does not see them.
  - Whether the card shows the form follows from what the server offers on its endpoints. `acceptsUser` is
    true if at least one `SignAndEncrypt` endpoint accepts a user name token; `needsUser` is true if no
    endpoint accepts an anonymous session.

    | The server offers | `needsUser` | `acceptsUser` | The card |
    | --- | --- | --- | --- |
    | A user name on an encrypted endpoint, no anonymous session | true | true | Asks for user name and password before the scan can go on; once stored, "change the user" |
    | A user name on an encrypted endpoint, and an anonymous session | false | true | The endpoint the adapter takes, with "Log in with a user instead" (folded) |
    | Anonymous sessions only, or a user name only on endpoints that sign or have no security | – | false | The endpoint the adapter takes, no form |

    A server with anonymous sessions only, the opc-simulator among them, has no form, by design. To see it,
    configure a user on the server. The rule is `userStep` in `apps/app/src/cards/opcua/results.ts`.
  - The adapter tries the user on the server first, on its strongest encrypted endpoint, and keeps it only if
    the server accepts it: `secrets/credentials.json` in the data directory, readable by the adapter only.
    No answer of the adapter contains a password; `GET /users` names the servers and users.
  - A password goes over an encrypted endpoint only (`SignAndEncrypt`). The ranking offers a session with a
    user no endpoint that only signs or has no security, and a registration with a user and another mode is
    refused.
  - A registration names the user in `endpoint.user`, filled in by the adapter from the stored user; the
    password stays in the store. Machines share a session only with the same user.
  - The scan logs in with the stored user too: the connect tool of the chat, `opcua_ua_connect`, takes no user
    name and no password, although the library behind it would. A filter of the MCP server puts the stored
    user into the call on the side of the adapter, and refuses a call that brings a user of its own.
  - Removing the user of a server, `DELETE /users?url=`, stops the machines registered with it from
    connecting; removing a machine keeps the user.

## Restart, removal, a server that changed

- **Restart.** The registrations are files in `/data/machines`, one per machine. At start the adapter reads
  them and connects. `docker compose down` keeps the volume; `docker compose down -v` deletes it, and with it
  every registration.
- **Removal.** The machine leaves its session, the alarms that stand are cleared, every retained message of the
  machine is taken back from the broker with an empty one, its connection to the broker ends without its last
  will, and the registration is deleted, the manifest last. While the broker cannot be reached the machine is not
  removed (`503`): its retained messages could not be taken back, and a new subscriber would still see it.
  The session closes with the last machine of its endpoint. The broker brings nothing of the machine back to a new
  subscriber. What the stores kept of it stays:
  the machine leaves Home once its values are older than the list looks back, and its history remains. Deleting
  the stored data of a machine is a step of its own, with a contract of its own, in a later pull request.
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
| Identification, `State.FeedOverride`, `Channel[1]`, `Production.ActiveProgram` | The MachineTool instance, as OPC 40501-1 names them. `Channel[1]` is found but not published: it has no `RapidOverride`, so the profile ChannelMonitoring is not complete and its elements are in `missing`. |
| `State.MachineryItemState`, `State.MachineryOperationMode` | Derived: the server has neither building block. From the state of the active program and from `OperationMode`. |
| `OperationCounters.PowerOnDuration`, electrical power and energy | The interface of the maker: hours, kilowatt and kilowatt hours, converted. |
| `OperationCounters.PartsProducedInLifetime` | Not there: the server counts parts per program only. |

## What is verified

- The alarms of `Notification.ActiveAlerts` (2026-11-18, the adapter of this branch run on the development
  computer against the TRUMPF OPC UA simulator of definition `L26`, `opc.tcp://localhost:4842`, and the broker of
  the stack): the machine, registered by its `machineNode` in `urn:umati2:datamodel:opcua` alone, is added as
  `trumpf_TruLaser-3030-fiber_A0280O0001` with `Core`, `alerts.list` set by the rules. The two alerts of the
  simulator (`BasePlc.5.11.5.4` and `.5`, `MaintenanceRequired`, 400) are on
  `umati/Notification/ActiveAlerts`; when the simulator raised and cleared one, `AlertRaised` and `AlertCleared`
  went to `events/notifications`, each followed by the list. Registered instead by its MachineTool instance,
  without `alerts`, the same machine got `TcMachineAlarmType` with `AlarmIdentifier` and listed the same two
  alerts from the events. The namespace filter behind a gateway with `TcMachineAlarmType` is covered by a unit
  test only: no gateway with prefixed TRUMPF namespaces was at hand. After removal no retained message was left.
- After the review (2026-11-18, same stack): the K09 example is added again as
  `trumpf_TruMatic-1000-fiber_A1121O0001`; without its alarm subscription it is added all the same, the manifest
  declares `Core` with `Notification.ActiveAlerts` `"available": false` and the list goes out once as `null`. With
  the simulator stopped the machine says `CommunicationFault` within 10 seconds, with the reason in `lastError`
  and on the broker, and every connect fails at once and backs off (4, 8, 16, 32 s); started again, it is
  `Running` within 20 seconds. Removal answers `204`, a second one `404`, and no retained message of the machine
  is left. `/openapi/v1.json` lists the management API.
- The binding of machines (2026-11-18, the stack of `main` with this branch, simulator `1.4.0-alpha3`, definition
  `K09`): the example registration, on the machine in `urn:umati2:datamodel:opcua`, is added as
  `trumpf_TruMatic-1000-fiber_A1121O0001`. The broker holds the manifest (profiles `Core` and
  `EnergyElectricity`), the whole identification with model, web address, product code and year,
  `State.Status`, the numbers with `one`, `second`, `watt` and `wattHour`, `WorkMasterMonitoring/ActiveWorkMaster`,
  `oem/ActivityMeters/DrivesOnDuration`, `Notification.ActiveAlerts`, the heartbeat and `Running`, all retained;
  the alarms of the simulator are stored as `AlertRaised` and `AlertCleared`, and Home shows "TruMatic 1000 fiber
  A1121O0001" with its alarm and its program. On removal no retained message of the machine was left on the
  broker. (That run still deleted the stored data too, 149 values and 12 events; that part has left this pull
  request.) The earlier example, on the MachineTool instance, was added as `unknown_A1121O0001_A1121O0001`: there
  `ManufacturerUri`, `ProductCode` and `YearOfConstruction` answer `BadWaitingForInitialData`, and the known
  mapping gives the serial number as the model. The points below were tried with the earlier binding.
- The adapter connects to the simulator with SignAndEncrypt and `Aes256_Sha256_RsaPss`, the strongest of seven
  endpoints. A weaker endpoint is refused with 409, an unknown node too.
- Before the core was checked, all 15 elements of the example registration then read Good and were stored with
  their SI units. Today the sample has 14: its four channel elements are in `missing`, and `ManufacturerUri`,
  `ProductCode` and `YearOfConstruction` are new; the known mapping adds `Identification.Model`. The machine
  appears in the example app beside the simulated ones, with its alarms.
- Restart of the adapter: the machine comes back from the volume in about a second, without the MCP tools.
- Loss of the server: the machine goes Disconnected and is Connected again a few seconds after the server is back.
- Removal, also with the button in the app: session closed, Disconnected published, open alarms reset,
  registration deleted.
- The MCP endpoint of the adapter: an encrypted scan session through the hosted library, a proposal with 2
  derived and 2 unclear elements (before the known mapping added `Identification.Model` as a third derived one),
  a commit that works once and answers 404 the second time.
- The default endpoint: in the stack the adapter resolves `A1121O0001` and gets the endpoints of
  `opc.tcp://A1121O0001:4840`; the example registration of `K09`, which names the service `opc-simulator:4840`,
  registers the same server and its values are stored. With the simulator `1.4.0-alpha3` its dry run fulfils the
  core (2026-11-18): `ManufacturerUri`, `ProductCode` and `YearOfConstruction` are there but read
  `BadWaitingForInitialData`, so the review shows them as unclear.
- Behind a gateway, the UaGateway `opcgateway` of TRUMPF with two simulators, `L26` (`A0280O0001`) and `K09`
  (`A1121O0001`): the list names both by their MachineTool instances, with serial number, manufacturer, model and
  product instance URI read on the gateway. Before the core was checked, both registrations read all their
  elements Good, and both machines run
  on one session of the adapter (one session in the session list of the gateway), their values and alarms each
  under their own serial number. A registration without `machineNode`, with a node of the other machine, or with
  the serial number of the other machine is refused with 409. Removing the first machine keeps the session, and
  the other machine goes on publishing; removing the second closes it. Today both would be refused: `L26` lacks
  three elements of the identification, and behind the prefix of the gateway the known mapping of
  `Identification.Model` does not apply, so a registration there has to map the model itself.
- Checks: the solution builds and its tests pass, the 131 of the adapter among them; `pnpm typecheck`,
  `pnpm test` and `pnpm build` pass with the chat commands and cards.

- A user, against the UaGateway, against the K09 simulator and against a simulator that wants a user: the
  endpoints say `needsUser` and `acceptsUser` as the server offers them; a wrong password is refused with `409`
  within a second (`BadUserAccessDenied`) and nothing is stored; a server without users, or without an
  encrypted endpoint for them, is refused with a reason; without a stored user the machine list says that the
  server wants one; a stored user is filled into a scan connect on the side of the adapter, and a user from the
  model is refused. The secrets folder is `0700`, the file `0600`.

Not verified: a discovery through the chat from the first question to the click, with a language model; for a
gateway too. The gateway registrations were tried from the example registration with the prefixed namespaces,
not from a scan of the model. A session that logs in with a user: the gateway had no OPC UA user to test with,
and the simulator, OPC UA stack 2.0.0, rejects the user token of this client, 2.0.2, with
`BadIdentityTokenRejected` before it checks the password. The card of the chat was built and type-checked, not
clicked.

## Known limits

- The management API and the MCP tools of the adapter have no contract under `contracts/` yet.
- The adapter was tried against TRUMPF simulators only, not against the server of a real machine or of
  another maker.
- The tools of the OPC UA library serialize with their own JSON settings; the convention check of the
  repository warns about it at start.
- The MCP endpoint has no sign-in, like the other services of the demo; every request is the one demo caller.
- One user per server, with a user name and a password; a user certificate is not supported. The password is
  kept as written in the data volume, readable by the adapter only, not encrypted with a key of its own.
- A scan session of the OPC UA MCP library tries a refused user again and again, as the managed session of the
  stack does; the adapter's own sessions stop on a refused user. A stored user is tried before it is kept, so
  that happens only when the password changed on the server since: remove the user and enter it again.
- Behind a gateway, each machine is scanned on its own; a mapping is not yet carried over to the next machine
  of the same kind. Alarms are kept apart by namespace, so a gateway that gives its machines common namespaces
  reports the alarms of each to all.
- `PartsProducedInLifetime` is not offered by the simulator; `Production.JobOrders` is not published.

## Deployment

The workflow "Images" builds the image of the adapter with the others, for amd64, and "Deploy" starts
the stack from them ([deployment](../../docs/deployment.md)), the adapter and the simulator with it. The image
of the simulator is pulled from umati. Registrations live in the volume of the deployment: a machine added there
stays across deployments.

## Next steps

- **Machines of one kind behind a gateway.** Map the first machine, and let the adapter carry the mapping over
  to the next ones by their browse paths, so a gateway of ten machines does not take ten scans. A button that
  adds every proposal of one gateway at once.
- **More [known mappings](#known-mappings).** The first rule takes one element from the node of another. More
  rules need a browse path from the machine instance, resolved on the server. For example:
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
- Sessions with a user certificate, and a password encrypted at rest.

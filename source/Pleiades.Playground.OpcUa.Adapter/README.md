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
   profiles are complete, and what is unclear or derived, and adds the machine with a click. A machine
   without the whole core is not added ([Core and profiles](#core-and-profiles)).
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
| Core and profiles | Those of the data model, specification 0.17.0, on the paths of the MQTT binding of today. The whole core or no machine; of another profile only a complete one is published |
| Lists (`Notification.ActiveAlerts`, `Production.JobOrders`) | By the MQTT binding: alarms as notification events, job orders not published |
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
| Management API | <http://localhost:5530/machines>, on this computer only (`OPCUA_ADAPTER_BIND`) |
| MCP endpoint | `http://opcua-adapter:8080/mcp` in the network of the stack; the app finds it by `OPCUA_MCP_URL` |
| Web UI of the simulator | <http://localhost:8090/> |
| Liveness | `/healthcheck`, healthy while the adapter is connected to the broker |

Register the simulated machine without the chat, with the registration that ships as an example:

```bash
curl -X PUT -H "content-type: application/json" \
  --data-binary @source/Pleiades.Playground.OpcUa.Adapter/samples/trumpf-trumatic-k09.registration.json \
  http://localhost:5530/machines/A1121O0001
```

The machine `A1121O0001` then appears in the example app, <http://localhost:5600/>, beside the simulated ones.

## The example is TRUMPF-specific

The simulator, its machines and the example registrations are TRUMPF-specific:
[`samples/trumpf-trumatic-k09.registration.json`](samples/trumpf-trumatic-k09.registration.json) for the
TruMatic `A1121O0001` of definition `K09`, the one in the stack, and
[`samples/trumpf-trulaser-l26.registration.json`](samples/trumpf-trulaser-l26.registration.json) for the
TruLaser `A0280O0001` of definition `L26`, the first one scanned. The two differ in the machine and in the
identification: the MachineTool instance of `K09` has `ManufacturerUri`, `ProductCode` and
`YearOfConstruction`, the one of `L26` has not, so the example of `L26` does not fulfil the core and is refused.
In the image `1.4.0-alpha3` both definitions also serve the namespace `urn:umati2:datamodel:opcua`, which has
the whole core but the alarms ([A machine in `urn:umati2:datamodel:opcua`](#a-machine-in-urnumati2datamodelopcua)). The simulator serves the address space of a TRUMPF machine:
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

Removal is the Remove button on the server list, behind a confirmation. It removes the machine completely, its
stored values and notifications too ([Restart, removal, a server that changed](#restart-removal-a-server-that-changed)).
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
  on it, says `Connected` and `Disconnected` itself, and is tried again on its own if its nodes fail, while the
  session and the other machines go on. A lost session makes every machine on it `Disconnected`.
- **Removal.** The machine leaves the session: its subscription is deleted, it says `Disconnected` and its alarms
  are reset. The session closes only with the last machine of its endpoint.
- **Alarms.** A gateway reports the alarms of all its machines at its Server object. A machine with a
  `machineNode` keeps those whose source or condition lies in one of its namespaces: those of its elements and
  of its node. That needs a gateway that gives every machine namespaces of its own, as the UaGateway of Unified
  Automation does with `NamespacePrefixOption` `ServerUri`.

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

- **On the server of a TRUMPF machine** the rule applies. The K09 simulator of the stack registers
  `Identification.Model` from the node of its serial number, `i=3005`, with the value `A1121O0001`.
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
`YearOfConstruction` were not on the gateway of the edge device; the simulator `1.4.0-alpha3` has them. Not
mapped: `Notification.ActiveAlerts`, a list of `DataType.Alert`, which the binding does not publish: the core
takes the alarms from `alerts` instead, so such a machine is added only with the alarm event type of its server
in `alerts`. Not mapped either: `Connection.State` and `Connection.Heartbeat`,
the connection of the source on the edge device to the machine, not values of the machine. The model of the
machine is its own `Identification.Model`, so the TRUMPF rule above does not apply.

Such a server may show the same machine twice: in this namespace and by the root of its TRUMPF interface.
`/endpoints/machines` lists it once, by its node in `urn:umati2:datamodel:opcua`, with the namespaces of both. A
registration needs nothing but its machine and its alarms:
[`samples/trumpf-trulaser-umati2-gateway.registration.json`](samples/trumpf-trulaser-umati2-gateway.registration.json)
names the machine only. The alarm event type of that gateway is not known, so the sample does not fulfil the
core and is refused until `alerts` is set.

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
| `PUT /machines/{SerialNumber}` | Registers the machine, or replaces its registration, and starts it. |
| `POST /drafts/{draftId}/commit` | Registers what a proposal of the chat holds. The button on the proposal sends it; a draft works once and is kept for 30 minutes. |
| `GET /machines` | The registered machines with their state, and the machines each shares its session with. |
| `GET /machines/{SerialNumber}` | One machine: its registration, the last value of every element, the alarms that stand. |
| `GET /machines/{SerialNumber}/mapping` | The mapping review of one machine, element by element. |
| `DELETE /machines/{SerialNumber}` | Removes the machine and then deletes its stored values and notifications. Answers how many, `{ "valuesDeleted", "eventsDeleted", "problems": [] }`; `404` if no such machine is added; `502` with the reasons if a store did not delete or the adapter knows no `Config:TimeseriesApi:Uri` or `Config:EventsApi:Uri`. The machine is removed all the same. |

A registration is refused with the reasons, one per line of `problems`: `400` if it is malformed, `409` if it
does not fit its server, is not the machine it says it is or does not fulfil the core (checked once the server
has answered), `502` if the server does not answer.

The API has no sign-in. Whoever reaches its port can add and remove machines, so the port answers on this
computer only unless `OPCUA_ADAPTER_BIND` opens it.

## The registration

[`samples/trumpf-trumatic-k09.registration.json`](samples/trumpf-trumatic-k09.registration.json) is a complete one. Its parts:

- `serialNumber`: the machine id in every topic. It is the value of `Identification.SerialNumber`.
- `profiles`: the profiles of the data model the elements deliver whole. The adapter sets it from the
  elements; what a proposal names is replaced ([Core and profiles](#core-and-profiles)).
- `endpoint`: the URL, `securityMode` and `securityPolicy`. `serverCertificateThumbprint` is filled in by
  the adapter at the first connect, and `user` from the user a person stored for the server; never a password.
- `machineNode`: the object of the machine, as `opcua_machine_list` names it. Required on a server of several
  machines; left out on a server of one.
- `elements`: one per value.
  - `path` and `area` give the topic: `Channel[1].ChannelState` in the area `umati` is
    `machines/{SerialNumber}/umati/Channel/1/ChannelState`; the area `vendor` is for a value of the maker.
  - `kind` is `Number`, `Text` or `Boolean`. A number has a `unit` of the binding.
  - `node` carries its namespace as a URI, `nsu=http://example.com/;i=42`. An index, `ns=2;i=42`, is refused:
    it may change when the server restarts.
  - `scale` and `offset` convert a number once, to the SI unit: 0.01 for percent, 3600 for hours.
  - `field` names the member of a structure the adapter decodes, for example `MachineryItemState` of
    `State.Status`. The adapter sets it; a scan leaves it out.
  - `map` turns a raw value into a text, for an enumeration or a state that is derived; `mapDefault` is the
    text for every other value.
  - `match` is `Direct`, `Derived` or `Unclear`: how sure the scan is.
  - `evidence` says why this node was matched. It is for the person who reviews the registration.
- `alerts`: the event type of an alarm and the field with the code of the maker; `notifier`, the object whose
  events are subscribed, is the Server object if left out. Without `alerts` the core is not fulfilled.
- `missing`: what the discovery looked for and did not find, with the reason, and the elements of a profile
  that is not complete, which the adapter does not publish.

## Core and profiles

The adapter checks every registration against the core and the profiles of the data model, specification
0.17.0 (§5 and §6 of `spec/spec.md` of the data model), on the paths the MQTT binding uses today
([`Mapping/DataModelProfiles.cs`](Mapping/DataModelProfiles.cs)). The binding still follows the data model
0.8.0 ([`contracts/datamodel`](../../contracts/datamodel/README.md)); its topics change in a pull request of
their own.

- **Core.** Mandatory, every element: `Identification.Manufacturer`, `.SerialNumber`, `.ProductInstanceUri`,
  `.ManufacturerUri`, `.Model`, `.ProductCode`, `.YearOfConstruction`, `State.MachineryItemState` and
  `State.MachineryOperationMode` (the snapshot `State.Status` of the specification), `State.FeedOverride`,
  `OperationCounters.PowerOnDuration`, and `Notification.ActiveAlerts`, which the binding carries as the alarm
  events of the subscription in `alerts`. `Connection.State` and `Connection.Heartbeat` the adapter publishes
  itself. An element counts if it is mapped, also as `Derived` or `Unclear`; one in `missing` does not. A
  registration without the whole core is refused with what it lacks.
- **Profiles.** `IdentificationExtended`, `MonitoringExtended`, `ChannelMonitoring`, `Spindle` and
  `EnergyElectricity`. A profile is published only if all its elements are mapped; otherwise its elements go
  to `missing` with the reason, and nothing of it reaches the broker. Of a profile with instances, a channel, a
  spindle or a measuring point, each complete instance is published; `EnergyElectricity` needs the measuring
  point `Main`.
- **Not checked.** The profiles of lists and events the binding cannot carry: `Components`, `Stacklight`,
  `JobMonitoring`, `WorkMasterMonitoring` and `AlertsEvents`; and `EnergyCompressedAir`, whose
  `MassFlowRate` is in kilogram per second, a unit the binding does not have.
- **Elements of no profile**, `Production.ActiveProgram`, `Identification.SoftwareRevision` and every value
  in the area `vendor`, are published as they are.

The proposal card in the chat and the list of the added servers show it: `Core fulfilled` or `Core not
fulfilled`, a badge per complete profile, and what an incomplete one lacks. The answers carry it as
`conformance`, one entry per profile with `name`, `mandatory`, `fulfilled`, `offered`, `missing` and the complete
`instances`.
`profiles` names the complete ones. A machine added before the core was checked keeps running from its
registration; the list shows what it lacks, and `/rescan` proposes a registration that fulfils it, or says
why it cannot.

## What the adapter publishes

| What | Topic below `machines/{SerialNumber}/` | How |
|---|---|---|
| Every element | `umati/<path>` or `vendor/<path>` | On a change, with the time of the source. A bad value is not published. |
| `Connection.State` | `umati/Connection/State` | `Connected` once the values of a new session are out, `Disconnected` when the session is lost, the machine is removed or the adapter stops. |
| `Connection.Heartbeat` | `umati/Connection/Heartbeat` | Every ten seconds while the machine is registered, also while it does not answer. |
| Alarms | `events/notifications` | An alarm condition of the server that becomes active is `Raised`, one that ends is `Reset`, both with the same correlation id. Severity 667 and above is an error, 334 and above a warning. |

The lists `Notification.ActiveAlerts` and `Production.JobOrders` are no values in the binding. The alarms travel as notification events; the job orders are not published.

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
- **A server that wants a user.** A session is anonymous, or logs in with a user name and a password that a
  person stored for the server. One user per server; a user certificate is not supported.
  - The person enters user name and password in the card of `opcua_endpoint_rank`, which shows a form when
    the server says it wants a user (`needsUser`), and offers one when it only accepts one. The app sends them
    from its server to `PUT /users`; they are never part of the chat, so the language model does not see them.
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
- **Removal.** The machine leaves its session, `Disconnected` is published, the alarms that stand are reset and
  the registration is deleted. The session closes with the last machine of its endpoint. Then the adapter
  deletes what the machine published, through the REST contracts of the stores: its values with
  `DELETE /machines/{serialNumber}` of the Timeseries API, its notifications with
  `DELETE /machineEvents/machines/{serialNumber}` of the Events API (`Config:TimeseriesApi:Uri`,
  `Config:EventsApi:Uri`). It waits `Config:DataSettleTime`, 8 seconds, before: the timeseries persistence
  stores in batches of 5 seconds, and the last values and the `Disconnected` are to be stored before they are
  deleted, or the machine would come back with them. The machine leaves Home and the history. The adapter
  publishes nothing retained, so the broker brings nothing back. A store that cannot be reached is named in
  the answer, and its data stays.
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

- The adapter connects to the simulator with SignAndEncrypt and `Aes256_Sha256_RsaPss`, the strongest of seven
  endpoints. A weaker endpoint is refused with 409, an unknown node too.
- Before the core was checked, all 15 elements of the example registration then read Good and were stored with
  their SI units. Today the sample has 14: its four channel elements are in `missing`, and `ManufacturerUri`,
  `ProductCode` and `YearOfConstruction` are new; the known mapping adds `Identification.Model`. The machine
  appears in the example app beside the simulated ones, with its alarms.
- Restart of the adapter: the machine comes back from the volume in about a second, without the MCP tools.
- Loss of the server: the machine goes Disconnected and is Connected again a few seconds after the server is back.
- Removal, also with the button in the app: session closed, Disconnected published, open alarms reset,
  registration deleted. With the stored data (2026-11-18, simulator `1.4.0-alpha3`, definition `L26` in the
  namespace `urn:umati2:datamodel:opcua`): 13 topics stored, the removal answered after 9 seconds with 19
  values deleted, and 12 seconds later no topic of the machine was left.
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

The workflow "Images" builds the image of the adapter with the others, for amd64 and arm64, and "Deploy" starts
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

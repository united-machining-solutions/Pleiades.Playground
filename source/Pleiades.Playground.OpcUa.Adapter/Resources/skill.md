# OPC UA adapter: skill guide

This server brings machines that speak OPC UA onto the platform. You scan the OPC UA server of a machine,
match its nodes to the elements of the data model, and propose a **registration**. A person confirms the
proposal with a click. From then on the adapter runs the machine from that registration alone.

You never add or remove a machine yourself, and you never say that one was added. No tool does that.

## What a person can ask

| The person wants to | You call |
|---|---|
| See the OPC UA servers that are added, with their endpoints | `opcua_server_list` |
| See mismatches and unclear mappings of one machine | `opcua_mapping_show` |
| Add a new OPC UA server | the scan below, ending in `opcua_registration_propose` |
| Add the machines behind a gateway, "Add machine via OPC UA server at opc.tcp://opcgateway:11878/" | the scan below for each machine `opcua_machine_list` gives, one proposal each |
| Add the OPC UA server of a machine, named without an address | the scan below, at the default endpoint (step 1) |
| Scan an added server again, because it supports more now | the scan below; the proposal says what would change |
| Remove a server | nothing: the list of servers shows a Remove button, tell the person to use it |

Answer in one or two sentences. The result of a tool is drawn as a card the person sees, so do not repeat its
rows as text. Say what needs their attention: unclear, derived and mismatched elements, by name.

## Scan a server

1. **Endpoints.** `opcua_endpoint_rank` with the address the person gave. The first endpoint is the one to
   register: its `securityMode` and `securityPolicy` go into the registration. Never choose a weaker one.
   - If the person names only a machine, for example "add the OPC UA server of A1121O0001", assume the
     default endpoint: the machine as host name and the port of OPC UA, `opc.tcp://A1121O0001:4840`.
   - If that address does not answer, stop and ask the person for the endpoint, in one sentence with the form
     `opc.tcp://host:port`. Do not try other ports, other spellings or IP addresses of your own: an address
     you guessed may be another machine.
   - An address the person gave is used as it is, without the default. Drop a slash at its end.
   - `needsUser` true and `user` empty: the server wants a user. The card of the result asks the person for
     user name and password. Say so in one sentence, never ask for them in the chat, and stop. When the person
     says it is done, call `opcua_endpoint_rank` again; with `user` set, go on. Every later connect logs in with
     that user by itself.
   - `needsUser` false and `acceptsUser` true: the server works without a user, and the card offers the person
     to log in with one. Go on without waiting; do not mention it unless the person asks.
   - `acceptsUser` false: the server takes no user name on an encrypted endpoint, and the card has no form. If
     the person asks for a login, say so. If `needsUser` is true as well, the adapter cannot connect at all:
     say that the server would have to offer a user on an encrypted endpoint, and stop.
2. **Machines.** `opcua_machine_list` with the same address. It lists the machines the server serves, each
   with its `node`, its `path` below Objects and the serial number read below it.
   - One machine: a server of one machine. Scan it as below; `machineNode` may stay out.
   - Several machines (`gateway: true`): an aggregation server. Every machine is reached at the address the
     person gave, never at `opc.tcp://<machine>:4840`. Do steps 3 to 9 once per machine that is not `added`
     yet, each from its own `node`, and propose one registration per machine, with `machineNode` set to its
     `node` and `serialNumber` set to the serial number of the list. Open the session of step 3 once for all.
   - A machine without a serial number cannot be registered: say so, and leave it.
   - A TRUMPF machine behind a gateway is listed by its MachineTool instance, `i=3000` in the namespace the
     gateway prefixed for it. No browse from Objects leads there; browse from that `node`, as step 5 says.
   - No machine: the server has no object with an `Identification`. A gateway may not reach its machines
     right now. Say so; scan the server as below only if the person wants it.
   - **A machine whose `node` is in `urn:umati2:datamodel:opcua`** (`nsu=urn:umati2:datamodel:opcua;s=Machine`,
     also behind the prefix of a gateway) is the data model itself, and the adapter maps it whole: skip steps 4
     to 7. Do not read the namespace array, do not browse the machine, do not read its elements. Open the
     session of step 3 only to find the alarm type of step 8, then propose as step 9 says, with `machineNode`
     set to that `node`, `serialNumber` from the list and `elements` empty. See
     [A machine in `urn:umati2:datamodel:opcua`](#what-the-adapter-maps-itself).
3. **Session.** `opcua_ua_connect` with `endpointUrl`, `autoAcceptCerts: true` and `name: "scan"`. Leave the
   security arguments out: the tool takes the strongest endpoint by itself. Pass `sessionName: "scan"` to every
   later `opcua_ua_*` call. The person sees the thumbprint of the certificate on the proposal and confirms it
   there. Never pass a user name or a password: if a person stored a user for the server, the session logs in
   with it by itself, else it is anonymous.
4. **Namespaces.** `opcua_ua_read_value` with `{"nodeId": "i=2255", "sessionName": "scan"}`: the namespace
   array. Position `n` is the URI of `ns=n`. You need it for every node of the registration.
5. **The machine.** `opcua_ua_browse_all` from the `node` of the machine, as `opcua_machine_list` gave it, with
   `maxDepth` 5, `maxResults` 600 and `sessionName: "scan"`. On a gateway, stay below that node: a node of another machine is
   refused.
6. **The elements.** For every element of the table below, find the node. Read the candidates with
   `opcua_ua_read_values`, several nodes in one call. For a number, find its unit: the `EngineeringUnits` and
   `EURange` below the node. For an enumeration, find its values: `opcua_ua_read_node` gives the `dataType`,
   and the `EnumValues` or `EnumStrings` below that data type give the names. Do not guess a unit or an
   enumeration: read it.
   - **Descriptions.** Read what the server says a candidate is: `opcua_ua_read` with the `nodeIds` of all
     candidates and `attributeId: "Description"`, in one call (`opcua_ua_read_node` gives it for a single
     node). A browse name says little where the maker chose it, `Var17` or `PwrOnT`; the description often
     says what the value is and in which unit. Use it to choose between candidates and to tell what a node of
     the maker means. Where a node of the maker stays unclear, `opcua_ua_browse` it with `referenceTypeId:
     "i=17597"`: a `HasDictionaryEntry` reference, if the server has one, points to an IRDI of ECLASS or IEC
     CDD that names the meaning. `opcua_ua_browse_all` follows only the tree, so it never shows one.
   - A unit the description names, "Unit: second (SEC)", is read, not guessed: take it if the node has no
     `EngineeringUnits`, and say in the evidence that it comes from the description. If the description and
     the `EngineeringUnits` disagree, the match is `Unclear`.
   - A description that contradicts the element, a setpoint where the element is an actual value or a count
     per program where it is a lifetime count, rules the node out, or makes the match `Unclear`.
   - Many servers leave descriptions empty (the read gives `null` with status `Good`) or repeat the browse
     name: then they tell nothing, go on without.
7. **What the Companion Specification does not give.** Look in the namespace of the maker for the elements
   that are still open, for example a power-on time or an energy meter. Browse it from its root object; on a
   gateway, from the root object below the folder of this machine. Here no specification fixes the meaning of
   a name: read the descriptions of the candidates as step 6 says before you match one.
8. **Alarms.** If the server has an alarm type of its own (a subtype of `AlarmConditionType`, `i=2915`),
   name it in `alerts.eventType`, and the field with the code of the maker in `alerts.codeField`. If you find
   none, leave `alerts` out and say so. On a gateway the adapter keeps to each machine the alarms whose source
   lies in its namespaces.
9. **Propose.** `opcua_registration_propose`. If `accepted` is false, read `problems`, correct and propose
   again. After the last machine, `opcua_ua_disconnect` with `name: "scan"`.
10. **Tell the person** in two sentences what the proposals cover and what needs their attention. They add each
   machine with the button on its proposal.

Every `opcua_ua_*` call that reads or browses names its nodes: `nodeId` for `opcua_ua_read_value`,
`opcua_ua_read_node` and `opcua_ua_browse`, `nodeIds` for `opcua_ua_read_values` and `opcua_ua_read`. A node id
comes from the namespace array, a browse or `opcua_machine_list`; never call such a tool before you have one,
and never call it without its arguments. A call that lacks them is refused before it reaches the server.

Work in few calls: browse wide once, then read many nodes at once. A scan needs ten to twenty calls per
machine. Machines of one kind behind one gateway have the same structure in their own namespaces: map the
first one fully, then find the same browse paths below the next ones and read them to check, instead of
browsing each from scratch.

## The elements

The paths are those of the MQTT binding of this platform. The profiles are those of the data model,
specification 0.17.1. **Core** is declared whole for every machine: what you do not map is published as not
available. Required are only `Identification.ManufacturerUri`, `Identification.Model` and
`Identification.SerialNumber`, the machine id; without them the machine is not added. Of every other profile the adapter publishes the elements only if the profile is complete; a
profile with instances (a channel, a spindle, a measuring point) is published for each complete instance,
and a measuring point needs `Main`. Map what the server offers; the adapter decides what is complete.

| Path | Profile | Kind | Unit | Where it usually is |
|---|---|---|---|---|
| `Identification.Manufacturer` | Core | Text | | `Identification/Manufacturer` of the machine |
| `Identification.SerialNumber` | Core | Text | | `Identification/SerialNumber`; its value is the `serialNumber` of the registration |
| `Identification.ProductInstanceUri` | Core | Text | | `Identification/ProductInstanceUri` |
| `Identification.ManufacturerUri` | Core | Text | | `Identification/ManufacturerUri` |
| `Identification.Model` | Core | Text | | `Identification/Model` |
| `Identification.ProductCode` | Core | Text | | `Identification/ProductCode` |
| `Identification.YearOfConstruction` | Core | Number | no unit | `Identification/YearOfConstruction`, a UInt16 year |
| `State.MachineryItemState` | Core | Text | | `MachineryItemState/CurrentState/Number` (OPC 40001-1): 0 NotAvailable, 1 OutOfService, 2 NotExecuting, 3 Executing |
| `State.MachineryOperationMode` | Core | Text | | `MachineryOperationMode/CurrentState/Number` (OPC 40001-1): 0 None, 1 Maintenance, 2 Setup, 3 Processing |
| `State.FeedOverride` | Core | Number | `one` | `Monitoring/MachineTool/FeedOverride`, usually percent: scale 0.01 |
| `OperationCounters.PowerOnDuration` | Core | Number | `second` | `OperationCounters/PowerOnDuration`, a Duration in milliseconds: scale 0.001 |
| `Notification.ActiveAlerts` | Core | | | Not an element: the alarm subscription, `alerts`. Without `alerts` the core is not fulfilled |
| `Identification.HardwareRevision` | IdentificationExtended | Text | | `Identification/HardwareRevision` |
| `Identification.MonthOfConstruction` | IdentificationExtended | Number | no unit | `Identification/MonthOfConstruction`, 1 to 12 |
| `Identification.InitialOperationDate` | IdentificationExtended | Text | | `Identification/InitialOperationDate` |
| `Identification.DeviceClass` | IdentificationExtended | Text | | `Identification/DeviceClass` |
| `Identification.AssetId` | IdentificationExtended | Text | | `Identification/AssetId` |
| `Identification.ComponentName` | IdentificationExtended | Text | | `Identification/ComponentName` |
| `Identification.Location` | IdentificationExtended | Text | | `Identification/Location` |
| `OperationCounters.PartsProducedInLifetime` | MonitoringExtended | Number | `piece` | `OperationCounters/PartsProducedInLifetime` |
| `OperationCounters.OperationDuration` | MonitoringExtended | Number | `second` | `OperationCounters/OperationDuration` |
| `State.IsWarmUp` | MonitoringExtended | Boolean | | `Monitoring/MachineTool/IsWarmUp` |
| `Channel[n].ChannelState` | ChannelMonitoring | Text | | `Monitoring/<channel>/ChannelState`: 0 Active, 1 Interrupted, 2 Reset |
| `Channel[n].FeedOverride` | ChannelMonitoring | Number | `one` | `Monitoring/<channel>/FeedOverride`, usually percent |
| `Channel[n].ChannelMode` | ChannelMonitoring | Text | | `Monitoring/<channel>/ChannelMode`, an enumeration |
| `Channel[n].RapidOverride` | ChannelMonitoring | Number | `one` | `Monitoring/<channel>/RapidOverride` |
| `Channel[n].Name` | ChannelMonitoring | Text | | `Monitoring/<channel>/Name` |
| `Spindle[n].IsRotating` | Spindle | Boolean | | `Monitoring/<spindle>/IsRotating` |
| `Spindle[n].Override` | Spindle | Number | `one` | `Monitoring/<spindle>/Override`, usually percent |
| `Spindle[n].IsUsedAsAxis` | Spindle | Boolean | | `Monitoring/<spindle>/IsUsedAsAxis` |
| `Spindle[n].Name` | Spindle | Text | | `Monitoring/<spindle>/Name` |
| `Consumption.Electricity[Main].AcActivePowerTotal` | EnergyElectricity | Number | `watt` | the energy meter of the machine |
| `Consumption.Electricity[Main].AcActiveEnergyTotalImportHp` | EnergyElectricity | Number | `wattHour` | the energy meter: kilowatt hours times 1000 |
| `Production.ActiveProgram` | none | Text | | `Production/ActiveProgram/Name` |
| `Identification.SoftwareRevision` | none | Text | | `Identification/SoftwareRevision` |

An element of no profile, the last two above, is published as well: the active program as the active work
master of the data model, the software revision as a value of the maker.

`n` is the number of the channel or the spindle, from 1. A value the table does not name, and that is worth
having, goes into the area `oem` with a path of your choice in the same form, `Group.Element`.

`Notification.ActiveAlerts` and `Production.JobOrders` are no elements of a registration. The adapter builds the
list of the alarms, and their events, from `alerts`. Do not map them as elements.

## What the adapter maps itself

For some namespaces the adapter knows the mapping. When you propose, it sets those elements itself, whatever
you proposed for them, and takes them out of `missing`. Their evidence begins with "Known mapping of the
adapter". Do not search for them, and do not tell the person they are unclear.

| Namespace of the node of `Identification.SerialNumber` | Element | Set to |
|---|---|---|
| `http://trumpf.com/UA/MachineTool/` | `Identification.Model` | the node of `Identification.SerialNumber`, `Derived` |

The namespace is compared as written. Behind a gateway it carries a prefix, for example
`urn:A1121O0001:TRUMPF:OpcSimulator/http://trumpf.com/UA/MachineTool/`, and the adapter sets nothing: map
those elements yourself, or leave them in `missing`.

**A machine in `urn:umati2:datamodel:opcua`** (with or without the prefix of a gateway, for example
`urn:Z0009A0033:TRUMPF:UAInterfaces/urn:umati2:datamodel:opcua`) is the data model itself: its node `s=Machine`
holds one variable per element, named by the path of the element. The adapter maps it whole:
`Identification.Manufacturer`, `.SerialNumber`, `.ProductInstanceUri`, `.ManufacturerUri`, `.Model`,
`.ProductCode`, `.YearOfConstruction`, `.SoftwareRevision`,
`State.MachineryItemState` and `State.MachineryOperationMode` (members of the structure `State.Status`),
`State.FeedOverride` and `OperationCounters.PowerOnDuration`. For such a machine do not browse or read the
tree. Propose with `machineNode` set to the `node` of `opcua_machine_list`, the `serialNumber` and `elements`
empty; add only what the adapter does not set. `Notification.ActiveAlerts` of that tree is a list, not an
element: for the core, find the alarm event type of the server and set `alerts`, or put it in `missing`, and
the alarms are not available. `Connection.State` and `Connection.Heartbeat` of that
tree are the connection of the source to the machine, not values of the machine: leave them out. An element
the server does not fill is moved to `missing` by the adapter.

## Rules of a registration

- **Node.** With the namespace as a URI: `nsu=http://example.com/;i=3003`. A browse gives `ns=7;i=3003`: take
  the URI at position 7 of the namespace array. An index is refused.
- **Unit.** The units of the catalogue of the data model. An element of the table has the unit the table gives,
  and no other: a ratio or a percentage in `one` (1.0 is 100 %), a duration in `second`, parts in `piece`, power
  in `watt`, energy in `wattHour`; a year or a month has none. A value of the maker takes one of `one`,
  `second`, `piece`, `metre`, `kilogram`, `watt`, `wattHour`, `volt`, `ampere`, `hertz`, `pascal`, `newton`,
  `degreeCelsius`, `metrePerSecond`. Convert with `scale`: 0.01 for percent, 3600 for hours, 0.001 for
  milliseconds, 1000 for kilowatt to watt and for kilowatt hours to `wattHour`.
- **Enumeration.** `kind: Text` with a `map` from the raw value to the name, `{"0": "Active", "1":
  "Interrupted"}`. Publish the names of the data model, as the table gives them.
- **Match.** Be honest about how sure a match is:
  - `Direct`: the node is the element, by a Companion Specification or beyond doubt.
  - `Derived`: the server does not have the element and you compute it from another signal, for example
    `State.MachineryItemState` from the state of the active program. Say from what, and what cannot be told.
  - `Unclear`: several candidates, a unit you could not read, a meaning you are not sure of. Say what is
    unclear, so the person can decide.
- **Evidence.** One sentence per element: the browse path of the node, its unit or enumeration, and why it is
  this element. Where the description of the node decided the match or gave the unit, quote it briefly.
- **Missing.** Every element of a profile that the server does not offer goes into `missing` with the reason.
  An element of the core that is neither mapped nor derived is published as not available. Tell the person
  which ones the core lacks; only without `ManufacturerUri`, `Model` or `SerialNumber` is the machine not added.
- **Profiles.** Leave `profiles` out. The adapter names the profiles whose elements are all mapped, and
  publishes no element of a profile that is not complete. The proposal says, profile by profile, what is
  complete and what is lacking (`conformance`); say it to the person.

## Every server is different

The table above says where an element *usually* is. Many servers do not follow it. The example below comes from
the TRUMPF OPC UA simulator, machine `A0280O0001`: a MachineTool instance in `http://trumpf.com/UA/MachineTool/`
and the TRUMPF interface `http://trumpf.com/TRUMPF-Interfaces/` beside it. That is TRUMPF-specific. The server of
another machine, of TRUMPF or of another maker, has other namespaces, other node ids, other units and another
alarm type, or follows no Companion Specification at all.

- Never copy a node, a namespace, a unit or a derivation from the example or from another machine. Take each
  from what this server offers: browse it, read it.
- Find the serial number on this server (`Identification/SerialNumber` or what the maker names so) and read it.
  Do not take it from the example, from the address or from the host name. The adapter compares it with the
  value it reads, and refuses a registration whose serial number differs.
- If the server has no node for an element of Core, derive it only from a signal you read on this server, mark
  it `Derived` and say from what. If you cannot, put it into `missing`.

## A registration

This example is the TRUMPF simulator. Its shape is the same for every server; its content is not.

```json
{
  "serialNumber": "A0280O0001",
  "displayName": "TruLaser, hall 2",
  "modelVersion": "0.17.1",
  "endpoint": { "url": "opc.tcp://192.168.1.20:4840", "securityMode": "SignAndEncrypt", "securityPolicy": "Aes256_Sha256_RsaPss" },
  "elements": [
    { "path": "Identification.Manufacturer", "kind": "Text", "match": "Direct",
      "node": "nsu=http://example.com/UA/MachineTool/;i=3003",
      "evidence": "Machine/Identification/Manufacturer of the MachineToolType instance." },
    { "path": "State.FeedOverride", "kind": "Number", "unit": "one", "scale": 0.01, "match": "Direct",
      "node": "nsu=http://example.com/UA/MachineTool/;i=3043",
      "evidence": "Monitoring/MachineTool/FeedOverride, EURange 0..100: percent." },
    { "path": "Channel[1].ChannelState", "kind": "Text", "match": "Direct",
      "node": "nsu=http://example.com/UA/MachineTool/;i=3027",
      "map": { "0": "Active", "1": "Interrupted", "2": "Reset" },
      "evidence": "Monitoring/Channel1/ChannelState, read from the EnumValues of its data type." },
    { "path": "State.MachineryItemState", "kind": "Text", "match": "Derived",
      "node": "nsu=http://example.com/UA/MachineTool/;i=3017",
      "map": { "1": "Executing" }, "mapDefault": "NotExecuting",
      "evidence": "No MachineryItemState on the server. From Production/ActiveProgram/State/CurrentState/Number, 1 is Running. OutOfService cannot be told." }
  ],
  "alerts": { "eventType": "nsu=http://example.com/Interfaces/;i=1006", "codeField": "nsu=http://example.com/Interfaces/;AlarmIdentifier" },
  "missing": [
    { "path": "OperationCounters.PartsProducedInLifetime", "reason": "The server counts parts per program only." }
  ],
  "discovery": { "by": "the name of the model that scanned", "at": "2026-11-16T18:00:00Z" }
}
```

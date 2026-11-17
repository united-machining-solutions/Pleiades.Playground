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
3. **Session.** `opcua_ua_connect` with `endpointUrl`, `autoAcceptCerts: true` and `name: "scan"`. Leave the
   security arguments out: the tool takes the strongest endpoint by itself. Pass `sessionName: "scan"` to every
   later `opcua_ua_*` call. The person sees the thumbprint of the certificate on the proposal and confirms it
   there. Never pass a user name or a password: if a person stored a user for the server, the session logs in
   with it by itself, else it is anonymous.
4. **Namespaces.** `opcua_ua_read_value` of `i=2255`: the namespace array. Position `n` is the URI of
   `ns=n`. You need it for every node of the registration.
5. **The machine.** `opcua_ua_browse_all` from the `node` of the machine, as `opcua_machine_list` gave it, with
   `maxDepth` 5 and `maxResults` 600. On a gateway, stay below that node: a node of another machine is
   refused.
6. **The elements.** For every element of the table below, find the node. Read the candidates with
   `opcua_ua_read_values`, several nodes in one call. For a number, find its unit: the `EngineeringUnits` and
   `EURange` below the node. For an enumeration, find its values: `opcua_ua_read_node` gives the `dataType`,
   and the `EnumValues` or `EnumStrings` below that data type give the names. Do not guess a unit or an
   enumeration: read it.
7. **What the Companion Specification does not give.** Look in the namespace of the maker for the elements
   that are still open, for example a power-on time or an energy meter. Browse it from its root object; on a
   gateway, from the root object below the folder of this machine.
8. **Alarms.** If the server has an alarm type of its own (a subtype of `AlarmConditionType`, `i=2915`),
   name it in `alerts.eventType`, and the field with the code of the maker in `alerts.codeField`. If you find
   none, leave `alerts` out and say so. On a gateway the adapter keeps to each machine the alarms whose source
   lies in its namespaces.
9. **Propose.** `opcua_registration_propose`. If `accepted` is false, read `problems`, correct and propose
   again. After the last machine, `opcua_ua_disconnect` with `name: "scan"`.
10. **Tell the person** in two sentences what the proposals cover and what needs their attention. They add each
   machine with the button on its proposal.

Work in few calls: browse wide once, then read many nodes at once. A scan needs ten to twenty calls per
machine. Machines of one kind behind one gateway have the same structure in their own namespaces: map the
first one fully, then find the same browse paths below the next ones and read them to check, instead of
browsing each from scratch.

## The elements

The paths are those of the MQTT binding of this platform. `M` is mandatory in the profile Core, `C` is
mandatory if the machine has the function.

| Path | Profile | Kind | Unit | Where it usually is |
|---|---|---|---|---|
| `Identification.Manufacturer` | Core M | Text | | `Identification/Manufacturer` of the machine |
| `Identification.SerialNumber` | Core M | Text | | `Identification/SerialNumber`; its value is the `serialNumber` of the registration |
| `Identification.ProductInstanceUri` | Core M | Text | | `Identification/ProductInstanceUri` |
| `State.MachineryItemState` | Core M | Text | | `MachineryItemState/CurrentState/Number` (OPC 40001-1): 0 NotAvailable, 1 OutOfService, 2 NotExecuting, 3 Executing |
| `State.MachineryOperationMode` | Core M | Text | | `MachineryOperationMode/CurrentState/Number` (OPC 40001-1): 0 None, 1 Maintenance, 2 Setup, 3 Processing |
| `OperationCounters.PowerOnDuration` | Core M | Number | `second` | `OperationCounters/PowerOnDuration`, a Duration in milliseconds: scale 0.001 |
| `State.FeedOverride` | Core C | Number | `one` | `Monitoring/MachineTool/FeedOverride`, usually percent: scale 0.01 |
| `Channel[n].ChannelState` | Core C | Text | | `Monitoring/<channel>/ChannelState`: 0 Active, 1 Interrupted, 2 Reset |
| `OperationCounters.PartsProducedInLifetime` | Core C | Number | `one` | `OperationCounters/PartsProducedInLifetime` |
| `Channel[n].ChannelMode` | Channel | Text | | `Monitoring/<channel>/ChannelMode`, an enumeration |
| `Channel[n].FeedOverride` | Channel | Number | `one` | `Monitoring/<channel>/FeedOverride`, usually percent |
| `Channel[n].RapidOverride` | Channel | Number | `one` | `Monitoring/<channel>/RapidOverride` |
| `Channel[n].Name` | Channel | Text | | `Monitoring/<channel>/Name` |
| `Spindle[n].IsRotating` | Spindle | Boolean | | `Monitoring/<spindle>/IsRotating` |
| `Spindle[n].Override` | Spindle | Number | `one` | `Monitoring/<spindle>/Override`, usually percent |
| `Production.ActiveProgram` | Production | Text | | `Production/ActiveProgram/Name` |
| `OperationCounters.OperationDuration` | MonitoringExtended | Number | `second` | `OperationCounters/OperationDuration` |
| `Identification.Model` | IdentificationExtended | Text | | `Identification/Model` |
| `Identification.SoftwareRevision` | IdentificationExtended | Text | | `Identification/SoftwareRevision` |
| `Consumption.Electricity[Main].AcActivePowerTotal` | Energy | Number | `watt` | the energy meter of the machine |
| `Consumption.Electricity[Main].AcActiveEnergyTotalImportHp` | Energy | Number | `joule` | the energy meter: watt hours times 3600 |

`n` is the number of the channel or the spindle, from 1. A value the table does not name, and that is worth
having, goes into the area `vendor` with a path of your choice in the same form, `Group.Element`.

`Notification.ActiveAlerts` and `Production.JobOrders` are no values here. Alarms travel as events, see
`alerts`. Do not map them as elements.

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

## Rules of a registration

- **Node.** With the namespace as a URI: `nsu=http://example.com/;i=3003`. A browse gives `ns=7;i=3003`: take
  the URI at position 7 of the namespace array. An index is refused.
- **Unit.** One SI unit per quantity: `one` for a ratio, a count or a percentage (1.0 is 100 %), `second`,
  `watt`, `joule`, `pascal`, `degreeCelsius`, `metre`, `kilogram`, `ampere`, `volt`, `hertz`. Convert with
  `scale`: 0.01 for percent, 3600 for hours, 0.001 for milliseconds, 1000 for kilowatt, 3600000 for kilowatt
  hours.
- **Enumeration.** `kind: Text` with a `map` from the raw value to the name, `{"0": "Active", "1":
  "Interrupted"}`. Publish the names of the data model, as the table gives them.
- **Match.** Be honest about how sure a match is:
  - `Direct`: the node is the element, by a Companion Specification or beyond doubt.
  - `Derived`: the server does not have the element and you compute it from another signal, for example
    `State.MachineryItemState` from the state of the active program. Say from what, and what cannot be told.
  - `Unclear`: several candidates, a unit you could not read, a meaning you are not sure of. Say what is
    unclear, so the person can decide.
- **Evidence.** One sentence per element: the browse path of the node, its unit or enumeration, and why it is
  this element.
- **Missing.** Every element of Core that the server does not offer goes into `missing` with the reason. A
  mandatory one that is neither mapped nor derived makes the proposal fail: derive it or do not name the
  profile Core.
- **Profiles.** Name a profile only if you mapped its elements: `Core`, `Channel`, `Spindle`, `Production`,
  `Energy`, `IdentificationExtended`, `MonitoringExtended`.

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
  "modelVersion": "0.8.0",
  "profiles": ["Core", "Channel"],
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

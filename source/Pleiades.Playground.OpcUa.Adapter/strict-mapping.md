# Strict mappings (plan)

The next step of the [known mappings](README.md#known-mappings): for namespaces whose meaning is fixed, the
adapter maps the elements itself, by a browse path from the machine instance that it resolves on the server.
The model only fills what no strict mapping covers, and a proposal that maps such an element otherwise is
refused. That makes the registration of a known server the same on every scan, and faster.

> **Status: plan, one part implemented.** The plan was written against the branch `feat/opcua-adapter-poc` at
> `e3b20ce`. The browse paths below were checked read-only on the TRUMPF OPC UA simulator of the stack on
> 2026-11-17; for this document no session was opened again. The rules of the TRUMPF interface follow its
> information model, the repository `Trumpf.MOS.InformationModel.Trumpf` (TRUMPF-internal): the documentation
> of every node, with data type and unit, and the NodeSet `trumpf.trumpf-interfaces.xml`, model 1.1.0. The
> elements are those of the [data model](../../contracts/datamodel/README.md) in the version this repository
> refers to, 0.8.0.
>
> **Implemented** (working tree after `767279f`, not committed yet): the mapping of the namespace
> `urn:umati2:datamodel:opcua`, the first namespace the adapter maps whole, with the parts of this plan it needed:
> the member of a structure (`ElementRegistration.Field` and a decoder of the adapter), the match of a namespace
> behind the prefix of a gateway, an element the server does not have moved to `missing`, and one machine per
> serial number in the machine list. See [section 0](#0-implemented-the-namespace-urnumati2datamodelopcua).
> The rules of OPC 40001-1, OPC 40501-1 and the TRUMPF interface (sections 1 to 4) are still a plan.

## Constraints

- **No reconnect.** The rules are resolved in the session the probe opens anyway for a proposal, a
  `PUT /machines` and a commit. Resolving opens no connection of its own, and a running machine is never
  reconnected for it.
- **Run from the registration.** Rules are resolved when a registration is made, never at run time. The stored
  registration holds the resolved nodes as `nsu=` node ids, so a restart needs neither the rules nor the server's
  browse service.
- **A stored registration keeps its mapping** until it is replaced; `/rescan` proposes the strict version and
  shows what changes.

## What was found on the simulator

Checked with the read-only `opcua_ua_*` tools of the adapter, anonymous, `SignAndEncrypt`, on
`opc.tcp://opc-simulator:4840`: definition `K09`, machine `A1121O0001`. Every definition of the simulator has the
same nodes; `L26` (`A0280O0001`) was not checked on its own.

- The service TranslateBrowsePathsToNodeIds resolves every path marked verified below, from the MachineTool
  instance `TrumpfMachine` (`i=3000`, type `MachineToolType`, below `Machinery:Machines`) and from the root of
  the TRUMPF interface (`s=1`).
- `Identification/Model` **is** there (`i=6060`), and so are `SoftwareRevision`, `ProductCode`,
  `ManufacturerUri`, `Location`, `DeviceClass` and `YearOfConstruction`. All of them read
  `BadWaitingForInitialData`. The README says the instance has no `Identification/Model`; that is to be
  corrected. A rule therefore needs a good value, and the known rule that takes the model from the serial number
  stays as the fallback.
- `Monitoring` is in the MachineTool namespace (index 7 on the simulator); index 5 is Machinery. The evidence of
  the example registrations says `5:Monitoring`; that is to be corrected.
- `MachineryBuildingBlocks`, `MachineryItemState` and `OperationCounters` answer `BadNoMatch`: the simulator has
  none of them. It has no spindle and no `RapidOverride`.
- **Behind a gateway** (the UaGateway `opcgateway`) only the namespaces of the instance carry the prefix,
  `urn:A0280O0001:TRUMPF:OpcSimulator/http://trumpf.com/UA/MachineTool/` and the same for
  `TRUMPF-Interfaces`. DI, Machinery, MachineTool and the TRUMPF type namespaces stay without one. A browse name
  in a type namespace resolves as it is; one in an instance namespace takes the prefix of the machine. That
  answers the open point of the README. Resolving a path through the gateway was not verified: its machines
  answered `BadInvalidState` and `BadNodeIdUnknown`, they did not seem connected.

### What was found on the gateway of an edge device

Checked the same way on 2026-11-17, anonymous, `SignAndEncrypt` with `Aes256_Sha256_RsaPss`, on
`opc.tcp://Z0009A0033.sfh.edge-device.net:11878`, a UaGateway on the edge device `Z0009A0033` in front of the
TruLaser `A0280O0001` (`L26`).

- **The prefix is the edge device's, not the machine's.** Every instance namespace carries
  `urn:Z0009A0033:TRUMPF:UAInterfaces/`: the MachineTool instance, the TRUMPF interface, and
  `urn:umati2:datamodel:opcua`. The rule of [`TrumpfMachines`](OpcUa/TrumpfMachines.cs) that a prefix names the
  machine does not hold here; that a prefix ends with a slash does.
- **`urn:umati2:datamodel:opcua` is the data model.** Below `s=Machine` (a `BaseObjectType`) are folders
  `Identification`, `Connection`, `State`, `Notification`, `OperationCounters`, each with one
  `BaseDataVariableType` per element. The node id is the path of the element: `s=State.FeedOverride`. The browse
  names are in the same namespace. The description of a number names its unit: "Unit: one (C62)",
  "Unit: second (SEC)".
- **Values read:** Manufacturer "TRUMPF", SerialNumber `A0280O0001`, ProductInstanceUri, ManufacturerUri, Model
  "TruLaser 3030 fiber", ProductCode "L26", YearOfConstruction 2020 (UInt16) Good; SoftwareRevision
  `BadWaitingForInitialData`; `State.FeedOverride` Double 1; `OperationCounters.PowerOnDuration` Double
  64762488.
- **`State.Status`** is a structure, `DataType.Status` (`s=DataType.Status`, encoding
  `s=DataType.Status.DefaultBinary`), with two members, `MachineryItemState` (`DataType.MachineryItemState`:
  0 NotAvailable, 1 OutOfService, 2 NotExecuting, 3 Executing) and `MachineryOperationMode`
  (`DataType.MachineryOperationMode`: 0 None, 1 Maintenance, 2 Setup, 3 Processing), each an Int32 in the binary
  encoding. Read: `AwAAAAMAAAA=`, Executing and Processing. The definition was read from the attribute
  DataTypeDefinition.
- **`Notification.ActiveAlerts`** is a list of `DataType.Alert`: the condition node in the TRUMPF interface
  (`nsu=http://trumpf.com/TRUMPF-Interfaces/;s=179.BasePlc.5.11.5.4`), the code, the text, the category
  (`DataType.AlertSeverity`, an Int32: 1 Failure, 2 CheckFunction, 3 OffSpec, 4 MaintenanceRequired), the severity
  (UInt16, 400), the time, the source (`BasePlc`) and `correlationId`, the execution of the program. The
  definition was read from the attribute DataTypeDefinition of the simulator of `L26` on 2026-11-18.
- **`Connection.State`** (`DataType.AdapterState`: 0 Running, 4 Shutdown, 6 CommunicationFault, 8 Initializing)
  and **`Connection.Heartbeat`** (UInt32) are the connection of the source on the edge device to the machine.
- **The same machine twice.** `/endpoints/machines` listed `s=Machine` in `urn:umati2:datamodel:opcua` (found by
  its `Identification`) and `i=3000` in the MachineTool namespace (found by the root of its TRUMPF interface),
  both with the serial number `A0280O0001`.
- Later the same evening the gateway answered `BadConnectionClosed` for every node of the aggregated namespaces
  and listed no machine: its link to the source was down. The dry run of the implementation against this server
  is therefore still open.

## 0. Implemented: the namespace `urn:umati2:datamodel:opcua`

The node ids of this namespace are the paths of the elements, so a rule needs neither a browse path nor
TranslateBrowsePaths: the node is `nsu=<namespace of the machine>;s=<path>`. The rules are applied without a
session, in `KnownMappings.Apply`, before the registration is checked, and the probe that reads every node once
tells which of them the server has.

| File | What |
|---|---|
| [`Mapping/Umati2DataModel.cs`](Mapping/Umati2DataModel.cs) | The rules, `Apply`, and `WithoutAbsent`. |
| [`Mapping/KnownStructures.cs`](Mapping/KnownStructures.cs) | `StructureValue`, and the decoder of `DataType.Status`. |
| [`OpcUa/RawValues.cs`](OpcUa/RawValues.cs) | The raw value of a node for the converter, the same for the probe and the subscription; a binary `ExtensionObject` of a known encoding becomes a `StructureValue`. |
| [`Mapping/KnownMappings.cs`](Mapping/KnownMappings.cs) | `Apply` runs `Umati2DataModel.Apply` first; `IsNamespace` matches a namespace behind a prefix that ends with `/`. |
| [`Mapping/ValueConverter.cs`](Mapping/ValueConverter.cs) | An element with a `field` takes that member of a `StructureValue`; a structure without a `field` is not converted. |
| [`Registrations/MachineRegistration.cs`](Registrations/MachineRegistration.cs) | `ElementRegistration.Field`, optional; `schemaVersion` stays 1. |
| [`MachineSupervisor.cs`](MachineSupervisor.cs) | After the probe, an element of a rule whose node the server does not have is moved to `missing`, and Core is checked again. |
| [`OpcUa/MachineFinder.cs`](OpcUa/MachineFinder.cs) | `Merge`: one entry per serial number; the one in `urn:umati2:datamodel:opcua` is kept and takes the namespaces of the others. |

**When it applies.** The `machineNode` of the registration, or else the node of its
`Identification.SerialNumber`, is in `urn:umati2:datamodel:opcua`, as it is or behind a prefix.

**The rules.** All `Direct`, evidence "Known mapping of the adapter for urn:umati2:datamodel:opcua: ...".

| Element | Node | Kind, unit, map |
|---|---|---|
| `Identification.Manufacturer`, `.SerialNumber`, `.ProductInstanceUri`, `.ManufacturerUri`, `.Model`, `.ProductCode`, `.SoftwareRevision` | `s=Identification.<Element>` | Text |
| `Identification.YearOfConstruction` | `s=Identification.YearOfConstruction` | Number, `one`, no scale |
| `State.MachineryItemState` | `s=State.Status`, field `MachineryItemState` | Text, map 0 NotAvailable, 1 OutOfService, 2 NotExecuting, 3 Executing |
| `State.MachineryOperationMode` | `s=State.Status`, field `MachineryOperationMode` | Text, map 0 None, 1 Maintenance, 2 Setup, 3 Processing |
| `State.FeedOverride` | `s=State.FeedOverride` | Number, `one`, no scale |
| `OperationCounters.PowerOnDuration` | `s=OperationCounters.PowerOnDuration` | Number, `second`, no scale |

`ManufacturerUri`, `ProductCode` and `YearOfConstruction` were not on the gateway of the edge device; they are
rules since the core of the specification 0.17.0 asks for them, and the simulator `1.4.0-alpha3` has them. The
guide of the model ([`Resources/skill.md`](Resources/skill.md)) says: propose with `machineNode`, `serialNumber`
and `elements` empty, set `alerts` for the alarms of the core, and leave `Connection.*` of the tree out; the
adapter names the profiles ([Core and profiles](README.md#core-and-profiles)). The sample is
[`samples/trumpf-trulaser-umati2-gateway.registration.json`](samples/trumpf-trulaser-umati2-gateway.registration.json).

**Where it differs from the plan below.**

- A proposal that maps an element of a rule otherwise is **overwritten**, as the known rules do, not refused
  with a `409` (section 3, open question 4).
- There is no field `rule`, and no tool `opcua_strict_mapping` (section 3, open question 6). The guide names the
  elements instead.
- The decoder is keyed by the encoding of the structure, a node with its namespace as a URI, and matched behind a
  prefix. `TsMachineState` (`http://trumpf.com/UA/Types/;i=3076`) is to be added to `KnownStructures` the same way;
  `ElementRegistration.Field` and the converter are ready for it.
- An element the server does not have is moved to `missing` after the probe, in `RegisterAsync`; the plan resolves
  before it applies.
- The TRUMPF rule of `KnownMappings.All` still compares its namespace as written. `IsNamespace` would let it match
  behind a prefix; that is open question 11.

**Tests** ([`Umati2DataModelTest.cs`](../Pleiades.Playground.OpcUa.Adapter.Test/Umati2DataModelTest.cs), and in
[`GatewayTest.cs`](../Pleiades.Playground.OpcUa.Adapter.Test/GatewayTest.cs) and
[`RegistrationTest.cs`](../Pleiades.Playground.OpcUa.Adapter.Test/RegistrationTest.cs)): every element and Core
from `machineNode` alone; the units without scale; the two members of `State.Status`; a guess of the scan
replaced, an `oem` element kept, `missing` cleared; the namespace from the serial number; another namespace left
alone; applying twice; an absent element moved to `missing`, an absent mandatory one failing Core; the match
behind a prefix; the decoder with the bytes of the server, another structure and a short body; an
`ExtensionObject` of the stack decoded by `RawValues`; the converter taking a member; the machine list merging
the umati2 machine and its TRUMPF root; the sample registration accepted.

## 1. The shape of a strict mapping

A new folder `Mapping/Strict/`, beside [`Mapping/KnownMappings.cs`](Mapping/KnownMappings.cs), which stays for the
known derived rules.

```text
StrictRule(
  Element      "State.FeedOverride" | "Channel[{n}].ChannelState"
  Spec         "OPC 40501-1"                       for the evidence
  Anchor       MachineInstance | TrumpfInterfaceRoot
  Instances?   the type definition that numbers {n} (ChannelMonitoringType, SpindleMonitoringType)
  Path         [(namespaceUri, name), ...]           browse names by URI, never by index
  DataType     the data type expected, by URI       (MachineTool;i=64, i=11, i=290 ...)
  Field?       the member of a structure            (TsMachineState.ItemState)
  Area         umati, or oem for a value of the maker
  Kind, Unit, Scale, Offset
  UnitCheck    EngineeringUnits accepted, each with its scale, or "asserted by the specification"
  Map, MapDefault
  Priority     a Companion Specification before the interface of a maker)
```

| File | What |
|---|---|
| `Mapping/Strict/StrictRule.cs` | The types. |
| `Mapping/Strict/MachineryRules.cs` | The rules of OPC 40001-1. |
| `Mapping/Strict/MachineToolRules.cs` | The rules of OPC 40501-1. |
| `Mapping/Strict/TrumpfInterfaceRules.cs` | The rules of `http://trumpf.com/TRUMPF-Interfaces/`. |
| `Mapping/Strict/StrictMappings.cs` | Apply a resolution, find conflicts, list what the rules cover. |
| `OpcUa/StrictResolver.cs` | Resolve the rules on the server. |

`ElementRegistration` gets an optional field `rule`, for example
`"OPC 40501-1 MachineTool:Monitoring/MachineTool:FeedOverride"`. The adapter sets it; a value the model sends is
ignored. The field is added, so `schemaVersion` stays 1.

## 2. Resolving on the server

In the session of [`OpcUa/RegistrationProbe.cs`](OpcUa/RegistrationProbe.cs), in this order:

1. Connect, and find the machines (`MachineFinder`), as today.
2. Find the anchors. The instance is `machineNode`, or else the one machine found. The root of the TRUMPF
   interface is `nsu=<prefix>http://trumpf.com/TRUMPF-Interfaces/;s=1`, with the prefix of the instance, as
   [`OpcUa/TrumpfMachines.cs`](OpcUa/TrumpfMachines.cs) finds it; on a server of one machine the prefix is empty.
3. Resolve: one TranslateBrowsePathsToNodeIds for all paths, one Read of the data type, the status of the value
   and the `EngineeringUnits`, and one Browse with type definitions for channels and spindles. If
   TranslateBrowsePaths fails with anything but `BadNoMatch`, as the gateway answered, resolve step by step with
   Browse.
4. Refuse a conflict (section 3).
5. Apply the strict rules, then `KnownMappings.Apply` for the derived ones.
6. Read every node once, as today.

The probe returns the applied registration in `ProbeResult`. The resolver works on the existing interface
`IAddressSpace` of `MachineFinder`, extended by translate and attribute reads, so its tests need no server.

**Structures.** The machine state of the TRUMPF interface is one structure, `TsMachineState`, with the item
state and the operation mode as members. A rule with a `field` names the member; the registration has the field
(`ElementRegistration.Field`, implemented), and the value converter takes the member from the structure before it
converts (implemented). The structure is decoded by a decoder of the adapter for the known data type, not by
loading the type system of the server: no reconnect, and no read of data type definitions at run time. The same
decoder serves the probe and the running machine ([`OpcUa/RawValues.cs`](OpcUa/RawValues.cs), implemented). What
is left is the decoder itself in [`Mapping/KnownStructures.cs`](Mapping/KnownStructures.cs), beside the one of
`DataType.Status`: `http://trumpf.com/UA/Types/;i=3076`, Int32 `ItemState`, Int32 `OperationMode`, String
`Version`, Int32 `Sequence`, keyed by its binary encoding, whose node id is to be read from the server or the
NodeSet.

A rule applies only if its path resolves, the data type is the expected one, the unit check passes and the value
is Good or Uncertain. Otherwise the element is left to the derived rules or to the model. An element a rule sets
is `Direct`, its evidence begins with "Strict mapping of the adapter (<specification>)" and names the path and
the unit, and it is taken out of `missing`.

[`Registrations/RegistrationValidator.cs`](Registrations/RegistrationValidator.cs) is split: the checks of the
shape stay before the connect, so a malformed registration is still a cheap `400`; the check of the mandatory
elements of Core moves behind the apply, because the model may now leave them out.

## 3. Refusing a proposal, and the guide of the model

`StrictMappings.Conflicts(proposed, resolution)` gives a `409` problem per element that the proposal maps with
another `node`, `kind`, `unit`, `scale`, `offset`, `map` or `mapDefault` than its rule. `match` and `evidence` are
not compared. For example:

```text
elements[umati/State.FeedOverride]: mapped by the adapter (OPC 40501-1,
MachineTool:Monitoring/MachineTool:MachineTool/MachineTool:FeedOverride, nsu=...;i=3043, one, scale 0.01). Leave it out.
```

A proposal that names the element exactly as the rule does, or leaves it out, is accepted. An entry in `missing`
for such an element is dropped. The same applies to `opcua_registration_propose`, `PUT /machines` and the commit
of a draft.

A new read-only tool, `opcua_strict_mapping(url, machineNode?)`, lists the elements the adapter sets on a machine,
with their nodes. The model calls it after `opcua_machine_list` and does not search for them; that is where the
scan gets faster.

[`Resources/skill.md`](Resources/skill.md) changes:

- "What the adapter maps itself" becomes the table of the strict rules, with the instruction: call
  `opcua_strict_mapping`, leave its elements out of `elements` and `missing`, map only the rest; a proposal that
  maps one of them otherwise is refused.
- The example registration of the guide shows only elements no strict rule covers.
- "Every server is different" stays as it is.

## 4. The rules

Namespaces: `DI` `http://opcfoundation.org/UA/DI/`, `Mach` `http://opcfoundation.org/UA/Machinery/`, `MT`
`http://opcfoundation.org/UA/MachineTool/`, `TI` `http://trumpf.com/TRUMPF-Interfaces/` (an instance namespace,
with a prefix behind a gateway), `0` `http://opcfoundation.org/UA/`.

### OPC 40001-1 and DI, from the instance

| Element | Path | Data type, unit, enumeration | Simulator |
|---|---|---|---|
| `Identification.Manufacturer` | `DI:Identification/DI:Manufacturer` | String | verified, `i=3003`, "TRUMPF" |
| `Identification.SerialNumber` | `DI:Identification/DI:SerialNumber` | String | verified, `i=3005` |
| `Identification.ProductInstanceUri` | `DI:Identification/DI:ProductInstanceUri` | String | verified, `i=3004` |
| `Identification.Model` | `DI:Identification/DI:Model` | String, value must be Good | resolves to `i=6060`, reads Bad: the derived rule applies |
| `Identification.SoftwareRevision` | `DI:Identification/DI:SoftwareRevision` | String, value must be Good | resolves to `i=6066`, reads Bad |
| `State.MachineryItemState` | `Mach:MachineryBuildingBlocks/Mach:MachineryItemState/0:CurrentState/0:Number`, also without the folder | UInt32: 0 NotAvailable, 1 OutOfService, 2 NotExecuting, 3 Executing | not there, unverified |
| `State.MachineryOperationMode` | `Mach:MachineryBuildingBlocks/Mach:MachineryOperationMode/0:CurrentState/0:Number`, also without the folder | 0 None, 1 Maintenance, 2 Setup, 3 Processing | not there, unverified |
| `OperationCounters.PowerOnDuration` | `Mach:MachineryBuildingBlocks/DI:OperationCounters/DI:PowerOnDuration` | Duration in milliseconds, scale 0.001, `second` | not there, unverified |
| `OperationCounters.OperationDuration` | `Mach:MachineryBuildingBlocks/DI:OperationCounters/DI:OperationDuration` | Duration in milliseconds, scale 0.001, `second` | not there, unverified |
| `OperationCounters.PartsProducedInLifetime` | to be taken from the NodeSet | `one` | not there, unverified |

The state numbers and the paths of this table are to be checked against the published NodeSet2 files of
OPC 40001-1 and DI before the rules are written.

### OPC 40501-1, from the instance

| Element | Path | Data type, unit, enumeration | Simulator |
|---|---|---|---|
| `State.FeedOverride` | `MT:Monitoring/MT:MachineTool/MT:FeedOverride` | Double, unit checked, scale 0.01, `one` | verified, `i=3043`; EngineeringUnits `%/100` (UnitId 4733235), EURange 0..100 |
| `Channel[n].ChannelState` | `MT:Monitoring/<each ChannelMonitoringType, MT;i=16>/MT:ChannelState` | `MT;i=64`: 0 Active, 1 Interrupted, 2 Reset | verified, `i=3027`, EnumValues read |
| `Channel[n].ChannelMode` | `.../MT:ChannelMode` | `MT;i=67`: 0 Automatic, 1 MdaMdi, 2 JogManual, 3 JogIncrement, 4 TeachingHandle, 5 Remote, 6 Reference, 7 Other | verified, `i=3026`, EnumValues read |
| `Channel[n].FeedOverride` | `.../MT:FeedOverride` | Double, unit checked, scale 0.01, `one` | verified, `i=3030`, EURange 0..120 |
| `Channel[n].Name` | `.../MT:Name` | String | verified, `i=3031` |
| `Channel[n].RapidOverride` | `.../MT:RapidOverride` | scale 0.01, `one` | not there, unverified |
| `Spindle[n].IsRotating` | `MT:Monitoring/<each SpindleMonitoringType>/MT:IsRotating` | Boolean | not there, unverified |
| `Spindle[n].Override` | `MT:Monitoring/<each SpindleMonitoringType>/MT:Override` | scale 0.01, `one` | not there, unverified |
| `Production.ActiveProgram` | `MT:Production/MT:ActiveProgram/MT:Name` | String | verified, `i=3012` |

The channel of the simulator has the browse name `Channel1` in the instance namespace; the rule finds a channel
by its type definition, not by its name.

On the simulator `State.MachineryItemState` and `State.MachineryOperationMode` stay derived, as in the example
registrations: from `MT:Production/MT:ActiveProgram/MT:State/0:CurrentState/0:Number` (`i=3017`, UInt32, 1 is
Running) and from `MT:Monitoring/MT:MachineTool/MT:OperationMode` (`i=3008`, `MT;i=65`: 0 Manual, 1 Automatic,
2 Setup, 3 AutoWithManualIntervention, 4 Service, 5 Other, EnumValues read). On a TRUMPF machine with `BDE` from
V04.00.00 the machine state of the TRUMPF interface gives both elements directly (see below); the simulator does
not fill it. Whether the adapter makes these two derivations rules of its own, as the last choice, is open
question 3.

### TRUMPF interface, from its root `TI;s=1`

Every node of the interface has the identifier `s=<ID>` of its documentation: "ID 335: PowerOnTime" is `TI;s=335`,
on the simulator as in the NodeSet. Its browse names are in `TI`, so behind a gateway they take the prefix of the
machine. The nodes carry no `EngineeringUnits`; their unit is the one the information model documents, and the
rule asserts it. `TT` below is `http://trumpf.com/UA/Types/`, a type namespace without a prefix.

Which nodes a machine has depends on its signal packages and their version, as the list of nodes of the model
(`OpcUaNodes.yaml`) says; the documentation names no machine ("Available on" is empty everywhere):

| Signal package | Nodes of the rules below |
|---|---|
| `MaintenanceInterface` from V01.00.00 | the activity meters (335 to 337) |
| `EnergyMetering` from V01.00.00 | power, voltage, current, grid frequency, received and supplied energy (187 to 202, 284) |
| `BDE` from V00.09.00, `P08` from V01.00.00 | `FeedrateOverride` (33), `PartProgram/Name` (32) |
| `BDE` and `P08` from V02.00.00 | `Messages` (179), the status flags of operation, stop conditions and operating mode |
| `BDE` from V02.01.00 | `PartProgram/ProgramState` (275), `OperationStatus/Status/Maintenance` (283) |
| `BDE` from V04.00.00 | `OperationStatus/MachineState` (737) |
| `CustomerSpecific`, `TruLaserCellExtension` | the counters (281, 282, 410, 411), compressed air (681 to 694), energy per phase and balanced (660 to 668) |

The nodes of `TruLaserCellExtension` and `PartsGood`, `PartsSuspect` are in the documentation and in
`OpcUaNodes.yaml`, not in the NodeSet file of model 1.1.0. A rule therefore applies where its node resolves with
the data type of the model, whatever the package; a node a machine does not have leaves the element to the next
rule or to the model.

"Simulator" says what the browse of 2026-11-17 found below `TI:Machine`: "read" with a good value, "there" for a
node seen and not read, "not there" for a node it does not have.

#### Elements of the data model

All paths are below `TI:Machine/`.

| Element | Path (ID) | Data type, unit of the model | Conversion | Simulator |
|---|---|---|---|---|
| `State.MachineryItemState` | `TI:OperationStatus/TI:MachineState` (737), member `ItemState` | `TsMachineState` (`TT;i=3076`), member `TeMachineryItemState` (`TT;i=3074`) | map 0 NotAvailable, 1 OutOfService, 2 NotExecuting, 3 Executing | there, reads `BadWaitingForInitialData`: the derivation applies |
| `State.MachineryOperationMode` | the same node, member `OperationMode` | `TeMachineryOperationMode` (`TT;i=3075`) | map 0 None, 1 Maintenance, 2 Setup, 3 Processing | as above |
| `OperationCounters.PowerOnDuration` | `TI:ActivityMeters/TI:PowerOnTime` (335) | Double, h, "total operating hours of the machine control" | scale 3600, `second` | read, 1944.9 |
| `State.FeedOverride`, if no rule of OPC 40501-1 applies | `TI:FeedrateOverride` (33) | Int32, "the effective percentage value of the feed rate override" | scale 0.01, `one` | there |
| `Production.ActiveProgram`, if no rule of OPC 40501-1 applies | `TI:PartProgram/TI:Name` (32) | String | none | there |
| `Consumption.Electricity[Main].AcActivePowerTotal` | `TI:EnergyMetering/TI:InstantaneousValues/TI:Power/TI:PowerTotal` (195) | Double, kW, "current active power across all phases" | scale 1000, `watt` | read |
| `Consumption.Electricity[Main].AcActiveEnergyTotalImportHp` | `TI:EnergyMetering/TI:MeterReadings/TI:Energy/TI:ReceivedEnergy` (202) | Double, kWh, "total active energy over all phases used from the grid" | scale 3600000, `joule` | read |
| `Consumption.CompressedAir[Main].Volume` | `TI:CompressedAirMeasurements/TI:Machine/TI:Consumption` (681) | Double, m³ | none, `cubicMetre` | not there |
| `Consumption.CompressedAir[Main].VolumeFlowRate` | `TI:CompressedAirMeasurements/TI:Machine/TI:Flow` (682) | Double, l/min | scale 1/60000, `cubicMetrePerSecond` | not there |
| `Consumption.CompressedAir[Main].Pressure` | `TI:CompressedAirMeasurements/TI:Machine/TI:Pressure` (683) | Double, bar | scale 100000, `pascal` | not there |
| `Consumption.CompressedAir[Main].Temperature` | `TI:CompressedAirMeasurements/TI:Machine/TI:Temperature` (684) | Double, °C | none, `degreeCelsius` | not there |

The two enumerations of the machine state are those of OPC 40001-1, number for number, so the item state and the
operation mode are `Direct` where the machine fills the structure. A rule of OPC 40001-1 comes first; the
derivation of section "OPC 40501-1" comes after this rule.

`TI:CompressedAirMeasurements/TI:RotationalChanger` (691 to 694) has the same four values for the rotational
changer: a sub-meter, `Consumption.CompressedAir[Sub1]`, if open question 8 says so.

#### Alarms

| Field | Value | Simulator |
|---|---|---|
| `alerts.eventType` | `TI;i=1006`, `TcMachineAlarmType`, a subtype of `AlarmConditionType` (`i=2915`) | verified |
| `alerts.codeField` | `TI;AlarmIdentifier`, String, "the message number" | verified, `TI;i=6043` |
| `alerts.notifier` | `TI:Machine/TI:Messages` (179), the event notifier of the machine messages; today the Server object | there |

The model documents the severity: 800 for an error, 400 for a warning, 200 for a notification. The adapter takes
667 and above as an error and 334 and above as a warning, so the three fall into the three levels as they are.
`AuxParameters` (`TI;i=6044`, a list of strings) is not published.

#### Values of the maker, in the area `oem`

The data model has no element for them; a rule gives each a fixed path, so a scan names them the same every time.
The paths are a proposal (open question 5).

| `oem` path | Path below `TI:Machine/` (ID) | Data type, unit of the model | Conversion | Simulator |
|---|---|---|---|---|
| `ActivityMeters.DrivesOnDuration` | `TI:ActivityMeters/TI:DrivesOnTime` (336) | Double, h | scale 3600, `second` | read; in the example registrations already |
| `ActivityMeters.LaserBeamOnDuration` | `TI:ActivityMeters/TI:LaserBeamOnTime` (337) | Double, h | scale 3600, `second` | there |
| `Electricity.VoltagePhase1` to `3` | `TI:EnergyMetering/TI:InstantaneousValues/TI:Voltage/TI:VoltagePhase1` to `3` (187 to 189) | Double, V | none, `volt` | there |
| `Electricity.CurrentPhase1` to `3` | `.../TI:ElectricalCurrent/TI:CurrentPhase1` to `3` (191 to 193) | Double, A | none, `ampere` | there |
| `Electricity.ActivePowerPhase1` to `3` | `.../TI:Power/TI:PowerPhase1` to `3` (196 to 198) | Double, kW | scale 1000, `watt` | there |
| `Electricity.GridFrequency` | `.../TI:InstantaneousValues/TI:GridFrequency` (284) | Double, Hz | none, `hertz` | there |
| `Electricity.ActiveEnergyExport` | `TI:EnergyMetering/TI:MeterReadings/TI:Energy/TI:SuppliedEnergy` (201) | Double, kWh, "fed over all phases into the grid" | scale 3600000, `joule` | there |
| `Electricity.ActiveEnergyImportPhase1` to `3` | `.../TI:Energy/TI:ReceivedEnergyPhase1` to `3` (664 to 666) | Double, kWh | scale 3600000, `joule` | not there |
| `Electricity.BalancedEnergy`, `...Phase1` to `3` | `.../TI:Energy/TI:BalancedEnergy` (660), `...Phase1` to `3` (661 to 663) | Double, kWh | scale 3600000, `joule` | not there |
| `Counter.PartsTotal`, `.PartsGood`, `.PartsSuspect`, `.ProductionCyclesTotal` | `TI:Counter/TI:PartsTotal` (282), `PartsGood` (410), `PartsSuspect` (411), `ProductionCyclesTotal` (281) | UInt32, "custom" counters | none, `one` | not there |
| `PartProgram.ProgramState` | `TI:PartProgram/TI:ProgramState` (275) | `TeProgramState` (`TI;i=3016`) | map 0 Running, 1 Stopped, 2 Aborted, 3 Ended | there |
| `OperationStatus.Active`, `.Interrupted`, `.HomedAndReadyForUse`, `.DrivesSwitchedOn`, `.Maintenance` | `TI:OperationStatus/TI:Status/TI:Active` (53), `Interrupted` (54), `HomedAndReadyForUse` (52), `DrivesSwitchedOn` (51), `Maintenance` (283) | Boolean | none | the folder is there, its members were not browsed |
| `StopConditions.EmergencyStop`, `.FeedHold` | `TI:StopConditions/TI:Status/TI:EmergencyStop` (69), `FeedHold` (70) | Boolean | none | as above |
| `OperatingMode.AutoMode`, `.JogMode`, `.MdaMode` | `TI:OperatingMode/TI:Status/TI:AutoMode` (64), `JogMode` (65), `MdaMode` (66) | Boolean | none | as above |

Not a rule:

- **`OperationCounters.PartsProducedInLifetime`.** The counters of `TI:Counter` are documented as "custom"
  counters, not as the count over the lifetime of the machine. They stay values of the maker.
- **`SuppliedEnergyPhase1`** (667) has an empty documentation page and is not in `OpcUaNodes.yaml`, unlike
  `SuppliedEnergyPhase2` (668). The supplied energy per phase waits until the model has all three.
- **Structures and lists** other than the machine state: `ProgramStateAndOrderData`, `MessageList`,
  `WorkUnitStates`, `PartitionInformation`. The binding publishes no lists.
- **The values of a technology**: laser, punching, bending, additive manufacturing, axes, lubrication,
  inspection. They depend on the machine and are left to the model, in the area `oem`, if a person wants them.

The units on the wire are those of the [MQTT binding](../../contracts/mqtt/README.md): SI only, energy in joule,
fractions in `one`.

## 5. Tests

In `Pleiades.Playground.OpcUa.Adapter.Test`, beside [`KnownMappingsTest.cs`](../Pleiades.Playground.OpcUa.Adapter.Test/KnownMappingsTest.cs):

- **`StrictRulesTest`**, one test per element: anchor, browse path with namespace URI and name of each step, data
  type, kind, unit, scale and offset, map. A rule does not change without a test failing.
- **`TrumpfMachineStateTest`**, beside `KnownStructuresTest`: the decoder of `TsMachineState` takes `ItemState` and `OperationMode` from a
  structure encoded as the model declares it; a structure of another data type, or one too short, gives no value.
- **`StrictResolverTest`**, against a fake `IAddressSpace` built from the browse of the simulator above:
  - every verified rule resolves to the node of the tables;
  - with the prefix of a gateway the nodes carry the prefix;
  - another data type, an unknown EngineeringUnits or a bad value (the model) leaves the element alone;
  - two channels give `Channel[1]` and `Channel[2]`;
  - a rule of OPC 40501-1 wins over the TRUMPF rule of the same element (`State.FeedOverride`,
    `Production.ActiveProgram`), and the TRUMPF rule applies where the instance has none;
  - a machine state that reads Bad leaves the item state and the operation mode to the derivation;
  - a failing TranslateBrowsePaths falls back to Browse.
- **`StrictMappingsTest`**:
  - a proposal that names the element as the rule does is accepted;
  - another node, unit or scale gives a problem;
  - an element left out is filled in, an entry in `missing` is dropped;
  - Core passes with the mandatory elements set by rules alone;
  - applying twice changes nothing more;
  - the derived rule of the model still applies when the strict one does not.
- **`RegistrationTest`**: both example registrations are still accepted.
- **Integration**: one test that resolves every rule on a running simulator, skipped unless
  `OPCUA_SIMULATOR_URL` is set. The simulator of the stack does not publish port 4840 on the host.

Checked by hand before the pull request: `dotnet build` and `dotnet test --solution source/Pleiades.Playground.slnx`;
a dry run of both example registrations against the stack; a proposal over the MCP endpoint without the strict
elements (accepted, filled in) and one with another `State.FeedOverride` (`409`).

## 6. Documentation to change

For `urn:umati2:datamodel:opcua` the README (section "A machine in `urn:umati2:datamodel:opcua`"), the guide, a
sample and the changelog are changed already. For the rest of the plan:

- [`README.md`](README.md): "Known mappings" becomes "Strict and known mappings" with the tables, the resolution,
  the refusal and the prefix of a gateway; the sentence that the instance has no `Identification/Model` is
  corrected; "What the scan found", "What is verified" and "Next steps" follow.
- [`Architecture.md`](Architecture.md): the flow of a scan.
- [`Resources/skill.md`](Resources/skill.md): see section 3.
- [`samples/`](samples/): `5:Monitoring` corrected to the MachineTool namespace, `rule` set, the energy elements
  `Direct` once their units are confirmed.
- [`CHANGELOG.md`](../../CHANGELOG.md): an entry under `[Unreleased]`.
- [`docs/tour.md`](../../docs/tour.md): its text stays true. The proposal card shows fewer unclear elements; its
  screenshot is retaken only with the consent of the person, since it asks the language model.
- `node .github/scripts/check-doc-links.mjs`.

## 7. Open questions

| # | Question | Proposal |
|---|---|---|
| 1 | The information model of the TRUMPF interface documents h, kW, kWh, V, A, Hz, m³, l/min, bar and °C. Is it the reference for real machines too, so that these rules are `Direct`? | Yes. The example registrations mark power and energy `Unclear` today; with the rules they become `Direct`. |
| 2 | Does `%/100` (UnitId 4733235) with EURange 0..100 count as percent, beside UNECE `P1`? | Yes. |
| 3 | Are the derivations of `MachineryItemState` and `MachineryOperationMode` from OPC 40501-1 rules of the adapter, `Derived`, after OPC 40001-1 and the TRUMPF machine state? | Yes: the registration of a TRUMPF machine is then the same on every scan, also without `BDE` V04.00.00. |
| 4 | Refuse a conflict, rather than overwrite it as the known rule does today? Refuse a strictly mapped node under another `umati` path too? | Refuse both; allow it under `oem`. |
| 5 | How are channels and spindles numbered? Are the values of the maker strict `vendor` rules, with the paths of the table? | Channels and spindles by the order of their browse names; `NumberInList` is the alternative. The `vendor` rules yes, with the paths proposed. |
| 6 | A tool of its own, `opcua_strict_mapping`, or a field of `opcua_machine_list`, whose card would change? | A tool of its own. |
| 7 | The machine state is a structure. A decoder of the adapter for `TsMachineState`, or the complex types of the OPC UA stack, which read the data type definitions from the server and need a package more? | The decoder of the adapter: strict, small, and nothing to read at run time. |
| 8 | Compressed air: is the pressure of the TRUMPF sensor absolute or gauge, as the data model asks for `pascal`? Is the rotational changer `CompressedAir[Sub1]`? | Ask the owners of the information model before the pressure becomes a rule; the rotational changer as `Sub1`. |
| 9 | Alarms: subscribe at `TI:Machine/TI:Messages` (179), the notifier the model names, instead of the Server object? | Yes for a server of one machine; behind a gateway the Server object stays, with the filter by namespace. |
| 10 | Where does the work go? | A branch `feat/opcua-strict-mappings` off `feat/opcua-adapter-poc`, with a pull request into it, signed-off commits and the template, as [AGENTS.md](../../AGENTS.md) asks. |
| 11 | Does the TRUMPF rule of `Identification.Model` match its namespace behind the prefix of a gateway, with `KnownMappings.IsNamespace`, as the rule of `urn:umati2:datamodel:opcua` does? | Yes, together with the strict rules of the TRUMPF interface, so the machine list and the rules agree on the model. |
| 12 | Alarms of a machine in `urn:umati2:datamodel:opcua`: a registration of it has nodes in that namespace only, and `MachineConnection` keeps an alarm only if its source or condition lies in a namespace of the registration. The conditions of the gateway are in the TRUMPF interface. How do its alarms pass? | Count the namespaces of the machine as `MachineFinder.Merge` found them (umati2, MachineTool, TRUMPF interface) as its own, or the namespace of `alerts.notifier`; set `alerts` for this namespace by the rule (`TI;i=1006`, `TI;AlarmIdentifier`). Alternatively derive notifications from `Notification.ActiveAlerts`. **Done (issue 180):** a machine in `urn:umati2:datamodel:opcua` takes its alarms from `Notification.ActiveAlerts`, which the adapter decodes (`alerts.list`); a TRUMPF machine outside that namespace gets `TI;i=1006` with `TI;AlarmIdentifier`, and the TRUMPF interface counts as its own namespace. |
| 13 | `Connection.State` of `urn:umati2:datamodel:opcua` says whether the source on the edge device reaches the machine. Does the adapter report `Disconnected` while it is not `Running`, though its own session stands? | Yes, as a later step; today it is left out. |
| 14 | `Production.ActiveProgram`, `Channel[n]`, `Spindle[n]` and the consumption elements were not on the server, so their node ids in `urn:umati2:datamodel:opcua` are unknown. Are they `s=<path>` too, with the instance in brackets? | Add them as rules only once a server shows them. |

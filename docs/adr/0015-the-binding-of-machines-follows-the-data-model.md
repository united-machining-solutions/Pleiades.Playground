---
title: "The tree of machines on the broker follows the data model exactly"
status: proposed
date: 2026-11-15
---

# ADR-0015: The binding of machines follows the data model

First proposed as a second tree beside the binding of the playground (`simulators/`); since 2026-11-17 it is
the only tree below `machines/`, and the whole stack reads it.

The status stays `proposed` on purpose: the binding of the model is settled at the umati hackathon
(16 to 20 November 2026), and this decision is accepted or changed with it.

## Context

The data model referenced in [`contracts/datamodel`](../../contracts/datamodel/README.md) (0.17.1) asks for things
the binding of the playground does not do: energy in watt hours, snapshots and lists as one value, events,
a manifest and retained values. [ADR-0002](0002-si-units-joule-and-one.md) puts energy in joule, and
[ADR-0003](0003-naming.md) puts every topic below `machines/{SerialNumber}/`. The services, the example app and
the chat read that binding. At the umati hackathon the working groups want a reference adapter that publishes
exactly after the model, to find a compromise for the differences.

## Decision

- `machines/{MachineId}/` follows the model exactly: its paths, types and units (energy in `wattHour`), its
  snapshots, lists, CloudEvents and manifest. The earlier binding of the playground below `machines/` (values in
  joule below `umati/` and `vendor/`, events as DTOs of the Events API) is replaced. Its topics are described in
  [`contracts/mqtt`](../../contracts/mqtt/README.md#machines-the-binding-of-the-data-model).
- [ADR-0002](0002-si-units-joule-and-one.md) applies only to `sites/`. `machines/` carries the units of the
  model, and the stores and APIs keep them as delivered; only a display converts.
- Events are meant to be stored, and a store of events must miss none. The model makes each event a CloudEvent
  with a UUID `id` and a `sequence` per group; the binding adds what MQTT needs: one topic per group
  (`events/jobs`, `events/workmasters`, `events/notifications`), so that MQTT keeps the order of
  a group, QoS 1, the content type `application/cloudevents+json; charset=utf-8`, and a bounded outbox while the
  broker is away, with the same `id` when they go out later.
- `Connection.State` is the state of the adapter (`Initializing`, `Running`, `CommunicationFault`, `Shutdown`).
  The model needs no last will; the binding keeps one as a quicker sign, with `CommunicationFault`, and names the
  choice as open.
- The machine id is `<manufacturer>_<model>_<serial number>`, formed from the domain of `ManufacturerUri` (without
  `www.` and its top-level domain), `Model` and `SerialNumber`, for example `alcyone-machines_AX-400_P-04`, by a
  rule of normalisation, so that it is unique across manufacturers and holds nothing a broker reads otherwise; the
  manifest names it as `machineId`, and carries the globally unique `ProductInstanceUri` of the model.
- Below the machine id comes a namespace level, as the namespaces of OPC UA: `umati` for the elements of the
  model, `oem` for the signals the machine manufacturer defines, `events` for the events. A signal of a
  manufacturer lies at the same place as the elements of the model, only in another namespace; in the manifest it
  has the prefix segment `x-<domain>` the model asks for, and the binding maps `x-<domain>.<path>` to
  `oem/<path>`. `umati`, `oem` and `events` are the reserved names. Consumers ignore what they do not know.
- A virtual machine, a state machine driven by a scenario, produces the tree in the simulator. The value
  generators of the earlier binding are gone from the simulator. Every simulator of the demo stack has a
  scenario of its own kind of machine and a made-up manufacturer of its own, named after the Pleiades.
- Persistence, APIs, MCP tools, genui-mcp and the app read only this tree. The Timeseries store keeps values,
  and snapshots field by field; the Events store keeps the CloudEvents as they came, unique by `source` and
  `id`, and puts alerts, job orders and program executions together when they are read. The DTOs of events of
  the earlier binding are gone.

## Consequences

- One tree, one set of units for machines; a consumer reads the data model and nothing else.
- A consumer outside the stack that read the earlier binding (topics below `machines/{SerialNumber}/`, values in
  joule, the event DTOs of the Events API) has to move to this tree.
- A consumer that keeps events can find every gap and every duplicate: by the count in `sequence` and by `id`. A
  new prefix of `sequence` shows a restart of the adapter.
- The decision ends with the hackathon: the binding of the model is settled there, and this tree follows it.

## Alternatives considered

- **Two trees side by side** (`simulators/` after the model, `machines/` for the playground), as first
  proposed here: a machine told two stories, in two units, and every consumer had to pick one.
- **Document the deviations and publish the model in joule**: the simulator would not be a reference adapter.
- **Move the binding of the playground to a prefix of its own and give `machines/{SerialNumber}/umati/` to the
  model**: every consumer would have to change now, before the hackathon.
- **A service of its own for the second tree**: one more image and container per machine for the same
  simulation, and the two outputs of one machine would no longer start and stop together.

---
title: "A second tree on the broker follows the data model exactly"
status: proposed
date: 2026-11-15
---

# ADR-0010: The spec binding beside the binding of the playground

## Context

The data model referenced in [`contracts/datamodel`](../../contracts/datamodel/README.md) (0.13.0) asks for things
the binding of the playground does not do: energy in watt hours, snapshots and lists as one value, events,
a manifest and retained values. [ADR-0002](0002-si-units-joule-and-one.md) puts energy in joule, and
[ADR-0003](0003-naming.md) puts every topic below `machines/{SerialNumber}/`. The services, the example app and
the chat read that binding. At the umati hackathon the working groups want a reference adapter that publishes
exactly after the model, to find a compromise for the differences.

## Decision

- The simulator can publish a second tree, below `umati/{machineId}/`, that follows the model exactly: its paths,
  types and units (energy in `wattHour`), its snapshots, lists, events and manifest. Its topics are described in
  [`contracts/mqtt`, "Spec binding"](../../contracts/mqtt/README.md#spec-binding-draft).
- ADR-0002 and ADR-0003 keep applying to `machines/` and `sites/`. They do not apply to `umati/`.
- Events are meant to be stored, and a store of events must miss none. So the binding adds to the model what
  that needs: events lie in a subtree of their own (`umati/{machineId}/events/`), carry the binding fields `seq`
  and `seqEpoch`, go out with QoS 1 and wait in a bounded outbox while the broker is away. The model is not
  changed; its schemas check an event once the binding fields are taken off, as with `unit`.
- The second tree is an option of the simulator (`Config:SpecOutput:Enabled`), not a service of its own. One
  container stays one machine; the image, the health check and the logging are those of the simulator.
- A virtual machine, a state machine driven by a scenario, produces the second tree. The topics below
  `machines/` keep coming from the generators, unchanged.

## Consequences

- The broker carries energy in two units, in two trees. A consumer reads one tree or the other, never both.
- No consumer changes. Persistence, APIs, app and chat do not read `umati/` until the hackathon decides how.
- A consumer that keeps events, such as a persistence of the playground, can find every gap: by `seqEpoch` and
  `seq`, whether the gap comes from a full outbox or from a broker that lost its session.
- A machine with both outputs tells two stories: the values below `machines/` are not consistent with those
  below `umati/`. Once the consumers read the second tree, the generators can go, or follow the virtual machine.
- The decision ends with the hackathon: either the binding of the playground moves to the model, or the model
  takes over what the playground does differently.

## Alternatives considered

- **Document the deviations and publish the model in joule**: the simulator would not be a reference adapter.
- **Move the binding of the playground to a prefix of its own and give `machines/{SerialNumber}/umati/` to the
  model**: every consumer would have to change now, before the hackathon.
- **A service of its own for the second tree**: one more image and container per machine for the same
  simulation, and the two outputs of one machine would no longer start and stop together.

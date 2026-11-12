---
name: add-source
description: Brings data into the stack that it does not have yet - an adapter that publishes values to the MQTT broker by the MQTT binding, so that they are stored and every tool, card and agent can read them. Use for a new data source, sensor, machine, adapter, simulator or outside API whose values should appear in the stack, or when build-your-own found that the data is missing.
---

# Add a source

A source is an adapter: a small service that fetches or measures values and publishes them to the broker, the
way a machine does. Then the stack stores them, every tool, card and agent can read them, and each value can
be traced to where it came from. A value that a card, a tool or the app fetches for itself is none of that.
Do not build it that way.

A source is the one recipe that changes what everyone shares: a contract and the stack. So it has a step the
other recipes do not have: agree first.

The example: the outside temperature.

## 1. Is it missing?

List what the stack has stored in the last ten minutes: `node .claude/skills/build-your-own/look.mjs`. Read
the example topics in [`contracts/mqtt`](../../../contracts/mqtt/README.md). If the value is there under
another name, there is nothing to add: take `create-card`.

## 2. Agree the topic, before any code

What the value is about decides its topic.

| The value belongs to | Topic | Agreed |
|---|---|---|
| A machine, and the data model names it | `machines/{SerialNumber}/umati/<path>` | Yes, by the binding |
| A machine, and it is specific to its maker | `machines/{SerialNumber}/vendor/<path>` | Yes, by the binding |
| A place, a line, anything that is not a machine | Proposed in [issue 60](https://github.com/united-machining-solutions/Pleiades.Playground/issues/60) | Not yet |

- One value per topic. One SI unit from the table of the binding: convert once, in the adapter. The time of
  the observation, in UTC.
- A topic the binding does not have, and every new service, needs an issue first
  ([Contributing](../../../CONTRIBUTING.md#how-to-contribute)). Draft it for the person: what the value is
  about, the topic you propose, its unit, where the values come from and under which terms. Show the draft.
  Open it with `gh issue create` only on a yes.
- On the person's own branch the adapter can be built and shown before the answer comes. Say so, and say that
  it can be merged once the maintainers have agreed. Where the topic is a proposal, write that into the
  README of the adapter and into your hand-over.

## 3. Build the adapter

By [Adding a service](../../../CONTRIBUTING.md#adding-a-service):

- A folder of its own with a `Dockerfile` and a short README. .NET goes under `source/` with a name of the
  pattern there, like the simulator. Any other language goes into a folder in kebab-case under `apps/`.
- It fetches, converts once to the SI unit, and publishes the value envelope of the binding.
- It says that it is there the way a machine does, with `Connection/State` and `Connection/Heartbeat`.
- A liveness endpoint, and one entry in `compose.yaml` that waits for the broker.
- Its settings come from the environment. The name of a key goes to `.env.example`, its value into the
  person's `.env`, never into a commit, a log or your answer. The person sets it.
- The README names the source of the values and the terms under which they may be used.

You touch the new folder, one entry in `compose.yaml`, names in `.env.example`, and the binding if the topic
is new. Never a service that is there.

## Done when

Run the checks. Do not assume them.

- `docker compose up -d --build --wait`: every container is healthy.
- The stack has stored the new topic: `node .claude/skills/build-your-own/look.mjs` lists it. One value of
  it is right against the source, with its unit and its time: check it by hand in the Swagger UI,
  <http://localhost:5500/>.
- The diff holds no value of a key.
- Then show it: `create-card`.

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

List what the stack has stored: `node .claude/skills/build-your-own/look.mjs`. It looks back ten minutes. For
values that come rarely, look further back: `node .claude/skills/build-your-own/look.mjs minutes=120`. Read
the example topics in [`contracts/mqtt`](../../../contracts/mqtt/README.md). If the value is there under
another name, there is nothing to add: take `create-card`.

## 2. Agree the topic, before any code

What the value is about decides its topic.

| The value belongs to | Topic | Agreed |
|---|---|---|
| A machine, and the data model names it | `machines/{SerialNumber}/umati/<path>` | Yes, by the binding |
| A machine, and it is specific to its maker | `machines/{SerialNumber}/vendor/<path>` | Yes, by the binding |
| A place, a line, anything that is not a machine | `sites/{SiteId}/{Source}/<path>` | Yes, by the binding |

- Ask the person only what you cannot look up: where the values come from, whether that needs a key, and
  whose they are. Assume the rest, and say what you assumed.
- One value per topic. One SI unit from the table of the binding: convert once, in the adapter. The time of
  the observation, in UTC.
- `{SiteId}` and `{Source}` have no list. Choose short names, the source in lower case as the binding asks,
  for example `weather`, and say in the issue that they are part of the proposal.
- A topic the binding does not have, and every new service, needs an issue first
  ([Contributing](../../../CONTRIBUTING.md#how-to-contribute)). Draft it for the person: what the value is
  about, the topic you propose, its unit, where the values come from and under which terms, and what in the
  stack has to change for it. Give the draft to the person as text: it is theirs to open. Open it with
  `gh issue create` only when they say yes to that: a yes to building is not one.
- Do not change `contracts/mqtt` on the branch. The issue is where a new topic is agreed. Until then the topic
  is a proposal, and the README of the adapter and your hand-over say so.
- On the person's own branch the adapter can be built and shown before the answer comes. Say so, and say that
  it can be merged once the maintainers have agreed.
- Read the terms of the source before you take it. Take one whose terms allow this use, and name them. For a
  device of the person's own, name whose it is.

## 3. Build the adapter

By [Adding a service](../../../CONTRIBUTING.md#adding-a-service):

- A folder of its own with a `Dockerfile` and a short README. .NET goes under `source/` with a name of the
  pattern there, like the simulator. TypeScript goes into a folder in kebab-case under `apps/` and is part of
  the pnpm workspace: its versions go into the catalog of `pnpm-workspace.yaml`, an MQTT client among them if
  the catalog has none, and `pnpm install` writes the lockfile that the images and CI install from. For any
  other language the repository has no place yet: propose one in the issue.
- It fetches, converts once to the SI unit, and publishes the value envelope of the binding, each value with
  the time it was observed.
- It says that it is there the way a machine does: `Connection/State` and `Connection/Heartbeat` below its own
  topic. The binding names them, the settings of the simulator show them
  (`source/Pleiades.Playground.Simulator/appsettings.json`): the state is `Connected`, the heartbeat counts
  up in the unit `one` every ten seconds. Send the heartbeat on a timer of its own, not with each value: a
  reader takes a source as silent after 30 seconds without a sign of life.
- A liveness endpoint like the one of `apps/genui-mcp`: `/health` answers while the adapter is connected to
  the broker, and the `Dockerfile` checks it.
- One entry in `compose.yaml`, shaped like the one of `genui-mcp`. It waits for the broker and for
  `timeseries-persistence`, each with `condition: service_healthy`, so that a first value is not lost.
- Its settings come from the environment. The name of a key goes to `.env.example`, its value into the
  person's `.env`, never into a commit, a log or your answer. The person sets it.
- The README names the source of the values, its terms, and the topic.

**A value about a place is stored like one of a machine.** The persistence listens below `machines/` and
below `sites/`. A value under any other first level is not stored, and a new first level is a change to the
binding: it needs the issue, not a topic filter on the branch.

You touch the new folder, one entry in `compose.yaml`, names in `.env.example`, and a row in `apps/README.md`
if the folder is there. For TypeScript, the catalog and the lockfile. Never the code or the settings of a
service that is there, and nothing under `.github/`: say in your hand-over that the workflow that builds the
images does not know the adapter yet.

## Done when

Run the checks. Do not assume them.

- `docker compose up -d --build --wait`: every container is healthy.
- The stack has stored the new topic: the look-up of step 1 lists it. One value of it is right against the
  source, with its unit and its time: check it by hand in the Swagger UI, <http://localhost:5500/>.
- For an adapter in TypeScript, `pnpm typecheck && pnpm test` pass, and `pnpm install --frozen-lockfile`
  installs.
- The diff holds no value of a key.
- Then show it: `create-card`.

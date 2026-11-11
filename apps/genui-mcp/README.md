# genui-mcp

The generative UI backend: an MCP server whose tools read the Timeseries API and the Events API and return
what a display needs. Every value names the topic or the notification it comes from, and numbers, order and
durations are computed here, never by a language model.

| | |
|---|---|
| In the demo stack | <http://localhost:5520/mcp> (streamable HTTP), port from `GENUI_MCP_PORT` |
| Liveness | `GET /health` |
| Image | `pleiades.playground.genui.mcp` |
| Settings | `TIMESERIES_API_URL`, `EVENTS_API_URL` |

## Tools

| Tool | What it returns |
|---|---|
| `genui_machine_list` | Every machine with what it does now: connection, heartbeat, state and operation mode with the time since when, the active program, and the warnings and errors of the last 24 hours that have not gone. |
| `genui_machine_show` | One machine (`machine`, the serial number): the same readings, and the states it went through over the last hours (`hours`, 8 if omitted) as spans without a gap. Its output is the contract of the machine card in [`@pleiades/cards`](../../packages/cards/README.md). |
| `genui_describe_server`, `genui_get_skill_guide` | The discovery tools every server of this repository has. The guide is also the resource `genui://skill`. |

Every instant of a result is ISO 8601 in UTC. The two machine tools also take a `timeZone`, an IANA name such
as `Europe/Zurich`: then every instant is a local time there with its offset, `2026-11-11T09:00:41.000+01:00`.
So whoever reads the result, a language model included, has nothing to convert.

Cards as `ui://` resources (MCP Apps) follow.

## When a machine is there

The [MQTT binding](../../contracts/mqtt/README.md) has no quality field: whether values are current is told
by `Connection/State` and `Connection/Heartbeat`. This server reads it so:

- **A value holds until the next one of its topic.** A machine may publish its state only when the state
  changes; a simulator repeats it every few seconds. Both read the same.
- **Every value is a sign of life**, and the heartbeat is one that is nothing else. A machine that gave no sign
  for more than 30 seconds is silent: it has no data, whatever its last values say.
- **A silence ends a run.** What a value was while the machine was silent is not known, so "since" is the
  first value after the silence.

## Known limit

A warning or an error that has stood for more than 24 hours is not in a result, and the history of a machine
does not show an error that was raised more than 24 hours before the history begins. The Events API returns
the notifications that were raised between two instants; it cannot be asked for the ones that are open. Reading
every notification of the retention time on each call would be the only way around it here. A filter for open
notifications in the Events API would solve it.

## When an API fails

A tool call fails with a sentence that names the API, what happened and where, for example
`The Timeseries API did not answer: ECONNREFUSED (http://timeseries-api:8080/topics).` The server writes the
same sentence to its log, once per failed request.

## Develop

```bash
pnpm install
pnpm --filter @pleiades/genui-mcp dev     # http://localhost:5520/mcp, reads the APIs of the running demo stack
pnpm --filter @pleiades/genui-mcp test
```

There is no build step. Node.js runs the TypeScript files as they are, so every import names its file with
`.ts`, and the code uses no syntax that needs compiling (enums, namespaces, parameter properties). Node.js
does that only outside `node_modules`. So the image keeps the layout of the workspace, where
`@pleiades/cards` is linked and not copied.

## What is where

- `src/main.ts`: reads the settings and serves `/mcp` and `/health`.
- `src/server.ts`: the MCP server and its tools. An application imports its type and calls it with
  `createMCPClient<typeof server>`.
- `src/machines.ts`: what a machine does now. The shape of a machine is a contract of the card catalogue,
  [`@pleiades/cards`](../../packages/cards/README.md), because cards show it.
- `src/history.ts`: the states of a machine over a stretch of time, as spans. Which values are which state
  is decided in the card catalogue, for the past as for the present.
- `src/liveness.ts`: the stretches in which a machine gave no sign of life.
- `src/apis.ts`: the two APIs over REST. Every answer is checked against the shape this server relies on.
- `src/time.ts`: the Timeseries API counts microseconds, the Events API writes ISO 8601; from here on an
  instant is ISO 8601 in UTC. A result is written in the time zone of the caller at the very end.

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
| `genui_machine_list` | Every machine with what it does now: connection, state and operation mode with the time since when, the active program, and the warnings and errors that have not gone. |
| `genui_describe_server`, `genui_get_skill_guide` | The discovery tools every server of this repository has. The guide is also the resource `genui://skill`. |

Cards as `ui://` resources (MCP Apps) follow.

## Develop

```bash
pnpm install
pnpm --filter @pleiades/genui-mcp dev     # http://localhost:5520/mcp, reads the APIs of the running demo stack
pnpm --filter @pleiades/genui-mcp test
```

There is no build step. Node.js runs the TypeScript files as they are, so every import names its file with
`.ts`, and the code uses no syntax that needs compiling (enums, namespaces, parameter properties).

## What is where

- `src/main.ts`: reads the settings and serves `/mcp` and `/health`.
- `src/server.ts`: the MCP server and its tools. An application imports its type and calls it with
  `createMCPClient<typeof server>`.
- `src/machines.ts`: what a machine does now, and the shape of that answer.
- `src/apis.ts`: the two APIs over REST. Every answer is checked against the shape this server relies on.
- `src/time.ts`: the Timeseries API counts microseconds, the Events API writes ISO 8601; from here on an
  instant is ISO 8601 in UTC.

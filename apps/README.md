# apps

TypeScript applications. Each folder is one deployable container with its own `Dockerfile` and `package.json`.

Planned:

| Folder | What it is |
|---|---|
| `genui-mcp/` | Generative UI backend: an MCP server whose tools read the Timeseries and Events APIs and return text, values and a card as a `ui://` resource (MCP Apps). |
| `app/` | The example application: a single-page app with an agent harness. It draws the cards itself and fetches only values from the MCP servers. |

Shared code goes to [`../packages`](../packages/README.md). The workspace is declared in `pnpm-workspace.yaml`.
Add each app to `compose.yaml` once it builds.

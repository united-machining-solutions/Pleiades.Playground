# apps

TypeScript applications. Each folder is one deployable container with its own `Dockerfile` and `package.json`.

| Folder | What it is |
|---|---|
| [`genui-mcp/`](genui-mcp/README.md) | Generative UI backend: an MCP server whose tools read the Timeseries and Events APIs and return text and values. Cards as `ui://` resources (MCP Apps) follow. |
| [`playground-app/`](playground-app/README.md) | The example application: a single-page app. Home lists what every machine does now; it draws that itself and fetches only values from the MCP server. Cards and an agent harness follow. |

Shared code goes to [`../packages`](../packages/README.md). The workspace is declared in `pnpm-workspace.yaml`.
Add each app to `compose.yaml` once it builds.

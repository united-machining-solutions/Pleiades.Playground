# apps

TypeScript applications. Each folder is one deployable container with its own `Dockerfile` and `package.json`.

| Folder | What it is |
|---|---|
| [`genui-mcp/`](genui-mcp/README.md) | Generative UI backend: an MCP server whose tools read the Timeseries and Events APIs and return text and values. Cards as `ui://` resources (MCP Apps) follow. |
| [`playground-app/`](playground-app/README.md) | The example application: a single-page app. An empty shell for now; it will draw the cards itself, fetch only values from the MCP servers and bring an agent harness. |

Shared code goes to [`../packages`](../packages/README.md). The workspace is declared in `pnpm-workspace.yaml`.
Add each app to `compose.yaml` once it builds.

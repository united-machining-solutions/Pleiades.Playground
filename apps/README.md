# apps

TypeScript applications. Each folder is one deployable container with its own `Dockerfile` and `package.json`.

| Folder | What it is |
|---|---|
| [`genui-mcp/`](genui-mcp/README.md) | Generative UI backend: an MCP server whose tools read the Timeseries and Events APIs and return text and values. Cards as `ui://` resources (MCP Apps) follow. |
| [`app/`](app/README.md) | The example application: a single-page app. Home lists what every machine does now, and a chat with an agent harness answers questions with the tools of the MCP server. The app draws the values itself. Cards follow. |

Shared code goes to [`../packages`](../packages/README.md). The workspace is declared in `pnpm-workspace.yaml`.
Add each app to `compose.yaml` once it builds.

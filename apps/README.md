# apps

TypeScript applications. Each folder is one deployable container with its own `Dockerfile` and `package.json`.

| Folder | What it is |
|---|---|
| [`genui-mcp/`](genui-mcp/README.md) | Generative UI backend: an MCP server whose tools read the Timeseries and Events APIs and return text and values. The values of a card keep the contract of that card. The machine card is also a `ui://` resource (MCP App): one HTML file that other hosts show. |
| [`app/`](app/README.md) | The example application: a single-page app. Home lists what every machine does now, a page per machine shows the machine card, and a chat with an agent harness answers questions with the tools of the MCP server. The app draws the values itself, with the cards of the catalogue. |

Shared code goes to [`../packages`](../packages/README.md). The workspace is declared in `pnpm-workspace.yaml`.
Add each app to `compose.yaml` once it builds.

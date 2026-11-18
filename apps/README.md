# apps

TypeScript applications, each with its own `package.json`. The two of the demo stack are one deployable
container each, with a `Dockerfile`.

| Folder | What it is |
|---|---|
| [`genui-mcp/`](genui-mcp/README.md) | Generative UI backend: an MCP server whose tools read the Timeseries and Events APIs and return text and values. The values of a card keep the contract of that card. The machine card is also a `ui://` resource (MCP App): one HTML file that other hosts show. |
| [`app/`](app/README.md) | The example application: a single-page app. Home lists what every machine does now, a page per machine shows the machine card, and a chat with an agent harness answers questions with the tools of the MCP server. The app draws the values itself, with the cards of the catalogue. |
| [`design-system/`](design-system/README.md) | The design system on one page: the tokens, every component of `packages/ui` in its variants and states, and what the card catalogue builds from them. It runs with its development server and is not part of the demo stack. |

What the first two look like when they run: the [tour of the demo](../docs/tour.md), with screenshots.

Shared code goes to [`../packages`](../packages/README.md). The workspace is declared in `pnpm-workspace.yaml`.
Add an app of the demo stack to `compose.yaml` once it builds.

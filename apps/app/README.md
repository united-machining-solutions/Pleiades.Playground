# app

The example application: a single-page app on [TanStack Start](https://tanstack.com/start). The browser renders
the app. The server delivers the document, the server routes and the server functions, and runs the agent
harness.

- **Home** asks "what needs you?": it lists the machines of the demo stack, first those in alarm, stopped or
  without data, then those in setup, then the running ones, and reads them again every ten seconds.
- **A page per machine** (`/machines/P-04`) shows the machine card of the
  [card catalogue](../../packages/cards/README.md): what the machine does now and what it did over the last
  hours. It needs no language model. Home leads to it.
- **Chat** is the panel on the right, with "New chat" and the chats so far. It opens from the button in the
  header, and a question from the field in the header or from "Ask why" on a machine starts a chat in it. A
  language model answers and calls the tools of [`genui-mcp`](../genui-mcp/README.md); the app draws the values
  of a tool call itself: a card of the catalogue, or a list with the same rows as Home. Whether the panel is
  open, and with which chat, is in the URL (`?chat=`), and the page stays where it is: you chat about what you
  see. Everything about the chat is in that panel: the pages on the left stay the same without it.

The values always come from `genui-mcp`. Without a language model the chat says which settings are missing;
everything else works.

| | |
|---|---|
| In the demo stack | <http://localhost:5600/>, port from `APP_PORT`, on this computer only (`APP_BIND`) |
| Liveness | `GET /health` |
| Image | `pleiades.playground.app` |
| Settings | `GENUI_MCP_URL`, the MCP endpoint of the generative UI backend. The language models of the chat, see below. |

## Language models

The chat offers every model the settings name, in up to three blocks. Each block is optional, and a block
counts once it is complete. Several models are separated by commas.

| Block | Settings | How the app talks to it |
|---|---|---|
| OpenAI | `OPENAI_API_KEY`, `OPENAI_MODELS` | OpenAI's Responses API |
| Anthropic | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODELS` | Anthropic's Messages API |
| Any other endpoint | `LLM_BASE_URL`, `LLM_MODELS`, and `LLM_API_KEY` if it wants one | OpenAI's chat completions, which a local model server or a gateway speaks |

The first model answers until a chat picks another one in its input field. The agent harness keeps that
choice with the chat. With one model the field shows no choice. The keys stay on the server.

**The chat has no sign-in.** The agent harness runs with open access: whoever reaches the port can chat with
the configured model, at the cost of whoever owns its key, and can list and read every chat. So the demo
stack publishes the port on this computer only (`APP_BIND`, `127.0.0.1` if unset). To show the app from another
device, set `APP_BIND=0.0.0.0`, and only in a network you trust.

## Develop

```bash
pnpm install
pnpm --filter @pleiades/app dev
pnpm --filter @pleiades/app test
```

The development server listens on <http://localhost:3000/> and reads from <http://localhost:5520/mcp>, where
the backend of the running demo stack answers.

## What is where

- `src/routes/`: one file per route. `__root.tsx` is the document and the layout with sidebar, header and chat,
  `index.tsx` is Home, `machines.$machine.tsx` the page of a machine, `health.ts` and `api/harness/$.ts` are
  server routes.
- `src/routeTree.gen.ts`: written by the build. Commit it, never edit it.
- `src/machines/`: `get-machines.ts` holds the server functions that call the backend as a typed MCP client,
  `machine-item.tsx` draws a machine as a row or a tile. Which value of the binding is which state, the signs
  and the wording come from [`@pleiades/cards`](../../packages/cards/README.md).
- `src/chat/`: `assistant.server.ts` is the agent harness ([TanStack AI](https://tanstack.com/ai), experimental)
  with the tools of the backend and one adapter per model; chats live in memory and are gone after a restart.
  `models.ts` reads which models the settings name. `chat-sidebar.tsx` is the panel with the chat on `useChat`
  and the choice of the model, `tool-results.ts` says what the app draws for which tool.
- `src/components/ui/`: [shadcn/ui](https://ui.shadcn.com) components, added with `shadcn add` and kept as
  generated. `components.json` holds the settings of the preset `b5JNecjwG`. The layout follows the block
  `sidebar-15`: the pages on the left, the chat on the right. `Badge` and `Card` live in `@pleiades/cards`,
  because the cards are built from them.
- `src/styles.css`: the theme of the preset, light only. The chart and state colours come with
  `@pleiades/cards`.

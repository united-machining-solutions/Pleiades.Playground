# app

The example application: a single-page app on [TanStack Start](https://tanstack.com/start). The browser renders
the app. The server delivers the document, the server routes and the server functions, and runs the agent
harness.

- **Home** asks "what needs you?": it lists the machines of the demo stack, first those in alarm, stopped or
  without data, then those in setup, then the running ones, and reads them again every ten seconds.
- **A page per machine** (`/machines/P-04`) shows the machine card of the
  [card catalogue](../../packages/cards/README.md): what the machine does now and what it did over the last
  hours. It needs no language model. Home leads to it. For a machine the backend does not know, the page
  says so and does not ask again.
- **Chat** is the panel on the right, with "New chat" and the chats so far. It opens from the button in the
  header, and a question from the field in the header or from "Ask why" on a machine starts a chat in it. A
  language model answers and calls the tools of [`genui-mcp`](../genui-mcp/README.md); the app draws the values
  of a tool call itself: a card of the catalogue, or a list with the same rows as Home. An answer is drawn
  from its markdown, and its times are those of your clock: the browser sends its time zone along with a
  question, and the server adds it to the tool calls. Whether the panel is open, and with which chat, is in
  the URL (`?chat=`), and the page stays where it is: you chat about what you see. Everything about the chat
  is in that panel: the pages on the left stay the same without it.

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
counts once it is complete. Several models are separated by commas. In the stack a key alone completes the
block of Anthropic or of OpenAI: `compose.yaml` fills in the model names of `.env.example` where a line of
names is missing or empty. Where a block was begun and is not complete, the chat panel says which setting is
empty.

| Block | Settings | How the app talks to it |
|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODELS` | Anthropic's Messages API |
| OpenAI | `OPENAI_API_KEY`, `OPENAI_MODELS` | OpenAI's Responses API |
| Any other endpoint | `LLM_BASE_URL`, `LLM_MODELS`, and `LLM_API_KEY` if it wants one | OpenAI's chat completions, which a local model server or a gateway speaks |

The models are offered block by block in the order of the table, each block in the order of its setting.
The first one answers until a chat picks another one in its input field: with a key of Anthropic and the
names of `.env.example`, that is Claude Haiku. The agent harness keeps that choice with the chat. With one model the field shows no choice. The keys stay on the server.

A model on your own computer goes into the third block:

```bash
LLM_BASE_URL=http://host.docker.internal:<port>/v1
LLM_MODELS=<a model your server has>
```

Then start the app again: `docker compose up -d app`. The app runs in a container, and `localhost` there is
the container; with Docker Desktop your own computer is `host.docker.internal`. The model must be able to
call tools: one that cannot answers without data.

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
  server routes. A page that stands in the sidebar names its entry itself, in the `staticData` of its route
  (`nav`: a title, an icon, an order). `src/components/app-sidebar.tsx` reads the entries from the routes
  and names no page, and `nav.ts` next to it puts them in order and finds the one a person is under.
- `src/routeTree.gen.ts`: written from the route files and not in the repository, so that two branches with
  a page each have nothing to merge in it. `pnpm install` and `pnpm typecheck` write it
  (`route-tree.mjs`), and so do the development server and the build. Never edit it. TanStack advises to
  commit this file; here everything that needs it writes it first.
- `src/machines/`: `get-machines.ts` holds the server functions that call the backend as a typed MCP client,
  `machine-item.tsx` draws a machine as a row or a tile. `chat.tsx` is the machine card in the chat: what a
  call of each of its tools is called, what the chat draws for a result (`results.ts` checks it against the
  contract), and which tool only a card calls. Which value of the binding is which state,
  the signs and the wording come from [`@pleiades/cards`](../../packages/cards/README.md).
- `src/chat/`: `assistant.server.ts` is the agent harness ([TanStack AI](https://tanstack.com/ai), experimental)
  with the tools of the backend and one adapter per model; chats live in memory and are gone after a restart.
  `models.ts` reads which models the settings name, `local-times.ts` adds the time zone of the browser to a
  tool call. `chat-sidebar.tsx` is the panel with the chat on `useChat` and the choice of the model,
  `cards.tsx` lists the cards the chat knows, one line for a card: the chat takes from it what it draws for
  which tool, and its server which tools a language model does not get. `tool-results.ts` says what a card
  may say about a tool, `blocks.ts` turns an answer into blocks, and `answer.tsx` draws what the model writes
  ([TanStack Markdown](https://tanstack.com/markdown)).
- `src/components/ui/`: [shadcn/ui](https://ui.shadcn.com) components, added with `shadcn add` and kept as
  generated. `components.json` holds the settings of the preset `b5JNecjwG`. The layout follows the block
  `sidebar-15`: the pages on the left, the chat on the right. `Badge` and `Card` live in `@pleiades/cards`,
  because the cards are built from them.
- `src/styles.css`: Tailwind and the font. The theme of the preset, light only, and the chart and state
  colours come with `@pleiades/cards`, so a card looks the same wherever it is drawn.

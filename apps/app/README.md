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
- **Live values** (`/live`) draws a graph for each physical value over the last 15 minutes, a line for each
  machine, and reads them again every ten seconds. A choice above the graphs shows one machine or all of
  them, and stays in the URL (`?machine=`).
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
| Version | At the bottom of the sidebar: `0.0.142 · 7a83c2f` for an image of the workflow "Images", linked to its commit; `dev` for a build of your own, with the commit of the checkout under `vite dev` |
| Settings | `GENUI_MCP_URL`, the MCP endpoint of the generative UI backend. The language models of the chat, see below. |

## Language models

The chat takes its models from a LiteLLM gateway, which reaches Anthropic, OpenAI and models of one's own behind
one address and one key. At the hackathon that is the gateway of the hub, with the address and the key of its
handbook.

| Setting | What it holds |
|---|---|
| `LLM_BASE_URL` | The address of the gateway up to `/v1`, as the app reaches it from its container |
| `LLM_API_KEY` | The key the gateway gave you |

The chat offers the models `GET <LLM_BASE_URL>/models` lists, in the order of the list. LiteLLM says of each
what it is for (`mode`): the chat takes those for `chat`, and those without a mode, which a model of one's own has
until the admin of the gateway sets one. Every other mode, `embedding` or `audio_transcription`, is left out.
Which models there are, and in which order, is set at the gateway, also per key. The first one answers until a
chat picks another one in its input field. The agent harness keeps that choice with the chat. With one model
the field shows no choice. The key stays on the server.

The app asks the gateway when it is first needed. A list with a model for chat is kept until the app restarts;
a new model of the gateway needs `docker compose up -d app`. Where the list does not come, the chat panel says
why ("GET /models of the gateway at LLM_BASE_URL answered 401"), and the app asks again after half a minute.
The chat panel, the harness and dictation read the same list.

**Without the gateway of the hackathon**, with a key of Anthropic or of OpenAI, the stack starts a LiteLLM
gateway of its own, with the profile `gateway`:

```bash
# in .env: LLM_BASE_URL=http://litellm:4000/v1, LLM_API_KEY=sk-<a key of your own choosing>,
# and ANTHROPIC_API_KEY or OPENAI_API_KEY
docker compose --profile gateway up -d
```

Its models, their order and what each is for are in [`stacks/litellm/config.yaml`](../../stacks/litellm/config.yaml):
delete the lines of a provider whose key you do not have, or the chat offers its models and they answer with an
error. `LLM_API_KEY` becomes the master key of the gateway, which LiteLLM wants before it starts; a long random
value after `sk-` will do. The gateway publishes no port; only the containers of the stack reach it.
Without the profile it does not start, and its image is not downloaded.

A gateway on your own computer is `http://host.docker.internal:<port>/v1`: the app runs in a container, and
`localhost` there is the container. The name works with Docker Desktop and, through `extra_hosts` in
`compose.yaml`, with Docker Engine on Linux; the gateway must then listen on more than `127.0.0.1`. A model must
be able to call tools: one that cannot answers without data.

**The chat has no sign-in.** The agent harness runs with open access: whoever reaches the port can chat with
the configured model, at the cost of whoever owns its key, and can list and read every chat. So the demo
stack publishes the port on this computer only (`APP_BIND`, `127.0.0.1` if unset). To show the app from another
device, set `APP_BIND=0.0.0.0`, and only in a network you trust.

## Dictation

With a speech-to-text model at the gateway, the chat field has a microphone. Press it, speak, press it
again: a spinner shows while the model writes down what was said, and the text goes into the field, after
what is already there. It is sent like a typed question, when you send it. After two minutes the recording
stops by itself and is written down the same way. The model hears the language itself. It also gets the
names of the machines from the backend as its prompt, so that it writes "P-04" as the stack spells it.

Dictation takes the first model the gateway marks for speech to text (`mode: audio_transcription`), at the hub
of the hackathon `openai/gpt-transcribe`. The gateway passes it on as OpenAI's audio transcriptions
(`POST /audio/transcriptions`). Where the gateway lists none, the field has no microphone, and the chat works
as before.

The browser records (`useAudioRecorder` of TanStack AI) and sends the recording to `/api/transcribe`, which
calls the model with the key of the gateway (`generateTranscription`). The route reads at most 32 MiB, as the
agent harness does, and answers a larger request with 413. A browser lets a page use the
microphone only over https or on `localhost`; elsewhere the microphone says so when pressed. The recording
is not kept.

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
  and holds what a tooltip and a toast need at the root (`TooltipProvider`, `Toaster`);
  `index.tsx` is Home, `machines.$machine.tsx` the page of a machine, `health.ts`, `api/harness/$.ts` and
  `api/transcribe.ts` are server routes. A page that stands in the sidebar names its entry itself, in the `staticData` of its route
  (`nav`: a title, an icon, an order). `src/components/app-sidebar.tsx` reads the entries from the routes
  and names no page, and `nav.ts` next to it puts them in order and finds the one a person is under. The
  breadcrumb of the header, `page-breadcrumb.tsx`, reads the same: a page is called by the title of its
  entry, or by `crumb` in its `staticData`, and a page without an entry stands behind the one it is under.
- `src/routeTree.gen.ts`: written from the route files and not in the repository, so that two branches with
  a page each have nothing to merge in it. `pnpm install` and `pnpm typecheck` write it
  (`route-tree.mjs`), and so do the development server and the build. Never edit it. TanStack advises to
  commit this file; here everything that needs it writes it first.
- `src/cards/`: a folder for each card, named like the card. `machine/chat.tsx` is the machine card in the
  chat: what a call of each of its tools is called, what the chat draws for a result (`results.ts` checks it
  against the contract), and which tool only a card calls. Which value of the binding is which state, the
  signs and the wording come from [`@pleiades/cards`](../../packages/cards/README.md). `measurement/chat.tsx`
  is the measurement card in the chat: the cards of `genui_measurement_list`, without graphs.
- `src/machines/`: what the pages and the chat both take of a machine. `get-machines.ts` holds the server
  functions that call the backend as a typed MCP client, `card-tools.ts` the names of the tools only a card
  calls, `machine-item.tsx` draws a machine as a row or a tile. A card folder imports from here, never the
  other way.
- `src/chat/`: `assistant.server.ts` is the agent harness ([TanStack AI](https://tanstack.com/ai), experimental)
  with the tools of the backend and one adapter per model; chats live in memory and are gone after a restart.
  `models.ts` reads which models the settings name, `local-times.ts` adds the time zone of the browser to a
  tool call. `chat-sidebar.tsx` is the panel with the chat on `useChat`, the choice of the model and stop,
  which also cancels the turn in the harness (`createHarnessClient(...).cancel()`),
  `dictate.tsx` the microphone in its field and `dictation.server.ts` the model behind it,
  `cards.tsx` lists the cards the chat knows, one line for a card: the chat takes from it what it draws for
  which tool, and its server which tools a language model does not get. `tool-results.ts` says what a card
  may say about a tool, `blocks.ts` turns an answer into blocks, and `answer.tsx` draws what the model writes
  ([TanStack Markdown](https://tanstack.com/markdown)).
- The [shadcn/ui](https://ui.shadcn.com) components come from [`packages/ui`](../../packages/ui/README.md),
  imported as `@pleiades/ui/components/<name>`. `components.json` holds the settings of the preset
  `b5JNecjwG` and tells `shadcn add` to write a new component there. The layout follows the block
  `sidebar-15`: the pages on the left, the chat on the right.
- `public/`: the sign of umati as the icon of the page, and the umati wordmark at the top of the sidebar.
  They are trademarks of VDW e.V. and not covered by the licences of this repository, see
  [NOTICE](../../NOTICE).
- `src/components/brand-switcher.tsx`: the top of the sidebar, the wordmark and the choice of a brand. A
  brand is a look for the whole app: a block of theme tokens in
  [`packages/ui/brands`](../../packages/ui/brands/README.md), put on by one attribute, `data-brand` on
  `<html>`. "Default" is the app without one. With no brand in that folder the wordmark stands alone.
- `src/styles.css`: Tailwind and the font. The theme of the preset, light only, comes from `@pleiades/ui`
  and the brands with it, the chart and state colours from `@pleiades/cards`, so a card looks the same
  wherever it is drawn.

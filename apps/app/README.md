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

The chat takes its models from one endpoint that speaks OpenAI's chat completions:

| Setting | What it holds |
|---|---|
| `LLM_BASE_URL` | The address up to `/v1`, as the app reaches it from its container |
| `LLM_API_KEY` | The key, if the endpoint wants one |
| `LLM_MODELS` | Empty behind a gateway; otherwise the models of the chat, separated by commas |

**A gateway first.** A gateway such as LiteLLM reaches Anthropic, OpenAI and models of one's own behind one
address and one key; at the hackathon, the gateway of the hub does, with the address and the key of its
handbook. Leave `LLM_MODELS` empty there: the chat offers the models `GET <LLM_BASE_URL>/models` lists, in the
order of the list, when it first asks the server. It leaves out a model the list marks as not for chat
(`mode`, as LiteLLM gives it: `embedding`, `audio_transcription`), and the model of `LLM_TRANSCRIPTION_MODEL`. A
model without a mark stays. A list that came is kept until the app restarts; a new model of the gateway needs
`docker compose up -d app`. Where the list does not come, the chat panel says why ("GET /models of LLM_BASE_URL
answered 401"), and the app asks again after half a minute. The chat panel and the harness read the same list.

**`LLM_MODELS`** names models to offer fewer of them, or in another order, and is needed where the endpoint
marks nothing: OpenAI itself (`https://api.openai.com/v1`) and a local model server list every model they
have, also those that cannot chat. A named model wins over the list.

The first model answers until a chat picks another one in its input field. The agent harness keeps that choice
with the chat. With one model the field shows no choice. The key stays on the server. Where settings were begun
and give no model, the chat panel says which one is empty.

A model on your own computer:

```bash
LLM_BASE_URL=http://host.docker.internal:<port>/v1
LLM_MODELS=<a model your server has>
```

Then start the app again: `docker compose up -d app`. The app runs in a container, and `localhost` there is
the container; your own computer is `host.docker.internal`, with Docker Desktop and, through `extra_hosts`
in `compose.yaml`, with Docker Engine on Linux. The server must then listen on more than `127.0.0.1`. For
Ollama, the name of the model is the one `ollama list` shows. The model must be able to call tools: one that
cannot answers without data.

**The chat has no sign-in.** The agent harness runs with open access: whoever reaches the port can chat with
the configured model, at the cost of whoever owns its key, and can list and read every chat. So the demo
stack publishes the port on this computer only (`APP_BIND`, `127.0.0.1` if unset). To show the app from another
device, set `APP_BIND=0.0.0.0`, and only in a network you trust.

## Dictation

With a speech-to-text model in the settings, the chat field has a microphone. Press it, speak, press it
again: a spinner shows while the model writes down what was said, and the text goes into the field, after
what is already there. It is sent like a typed question, when you send it. After two minutes the recording
stops by itself and is written down the same way. The model hears the language itself. It also gets the
names of the machines from the backend as its prompt, so that it writes "P-04" as the stack spells it.

`LLM_TRANSCRIPTION_MODEL` names the speech-to-text model at the endpoint of the chat, as the endpoint gives
it: at the hub of the hackathon `openai/gpt-transcribe`, at OpenAI `gpt-transcribe`. The endpoint must speak OpenAI's audio
transcriptions (`POST /audio/transcriptions`), as a gateway, OpenAI and a local speech server do. There is no
default. Without a model for it the field has no microphone, and the chat works as before.

The browser records (`useAudioRecorder` of TanStack AI) and sends the recording to `/api/transcribe`, which
calls the model with the key of the endpoint (`generateTranscription`). The route reads at most 32 MiB, as the
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
- `src/machines/`: `get-machines.ts` holds the server functions that call the backend as a typed MCP client,
  `machine-item.tsx` draws a machine as a row or a tile. `chat.tsx` is the machine card in the chat: what a
  call of each of its tools is called, what the chat draws for a result (`results.ts` checks it against the
  contract), and which tool only a card calls. Which value of the binding is which state,
  the signs and the wording come from [`@pleiades/cards`](../../packages/cards/README.md).
- `src/chat/`: `assistant.server.ts` is the agent harness ([TanStack AI](https://tanstack.com/ai), experimental)
  with the tools of the backend and one adapter per model; chats live in memory and are gone after a restart.
  `models.ts` reads which models the settings name, `local-times.ts` adds the time zone of the browser to a
  tool call. `chat-sidebar.tsx` is the panel with the chat on `useChat` and the choice of the model,
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
- `src/styles.css`: Tailwind and the font. The theme of the preset, light only, comes from `@pleiades/ui`,
  the chart and state colours from `@pleiades/cards`, so a card looks the same wherever it is drawn.

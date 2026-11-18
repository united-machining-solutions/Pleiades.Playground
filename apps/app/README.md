# app

The example application: a single-page app on [TanStack Start](https://tanstack.com/start). The browser renders
the app. The server delivers the document, the server routes and the server functions, and runs the agent
harness.

- **Home** (`/`) shows where the machines stand: site by site and hall by hall, a row for each machine, each
  site under a head with how many of its machines are in each state, and the machines that send values and stand
  on no site. "Needs you" keeps the machines that need someone, what Home used to show first; a search finds one; ten sites make a
  page, and the choice and the page stay in the URL (`?show=needs`, `?page=`). The sites come from the Sites API through `genui_site_list`; without sites, every machine stands under
  "On no site". It is live: see below. It needs no language model. The address `/sites`, where the list of the
  sites stood before, leads to `/`.
- **A page per machine** (`/sites/alcyone-machines_AX-400_P-04`, by the machine id) shows the machine card of the
  [card catalogue](../../packages/cards/README.md): what the machine does now and what it did over the last
  hours. It needs no language model. Home leads to it, and it stands under Home. An address of before, `/machines/<machine id>`, leads to it with
  the hours of its history. For a machine the backend does not know, the page
  says so and does not ask again.
- **Live values** (`/live`) draws a graph for each physical value over the last 15 minutes, a line for each
  machine, live. A choice above the graphs shows one machine or all of them, and stays in the URL
  (`?machine=`).
- **Pages** (`/pages`) are what a person keeps of the chat, in this browser. "Save as page" under an answer
  of the chat makes one: all the cards of that answer, in their order, titled with the question. It stands
  under an answer that has ended and for which the chat drew a card, and needs no language model: the app
  reads the tool calls from the answer it already has. The page opens beside the chat, which stays open, and
  the row under the answer then says "Saved as page" and links to it. Nothing is kept unless a person
  presses it. A page is a recipe: a title
  and its parts in their order, each part a tool of `genui-mcp` with its arguments. No value is kept and no
  sentence of a language model: opening a page calls the tools again and draws each answer with the card
  the chat draws for that tool, so it shows what holds now and needs no language model. It is read once, and
  its head says as of when; only while a part waits for the backend is it read again. A part whose tool
  the app has no card for stays where it is and says so; the rest of the page is whole. A page can be
  renamed, pinned and deleted from its head. "Edit" there shows above each part "Move up", "Move down" and
  "Remove", by hand and with no language model, and "Done" takes them away again; a change is kept at once,
  and no part is asked again because another one moved or went. A removed part is kept nowhere else, so the
  toast that says so has "Undo". The only part of a page stays: "Delete page" is the way to be rid of it.
  A pinned page stands in the sidebar on the top level, beside
  Home; under it a group "Pages", which folds, lists the pages that are not pinned, the newest first, and
  there is no group where there is nothing to list. `/pages` lists them all and is reached through the
  breadcrumb. Another browser, or a private window, has pages of its own. "Share" in the
  head gives a link that carries the recipe and no value, which answers for which machines and hours: whoever
  opens it, at `/pages/open`, sees the values of now, with no language model and no chat, and keeps the page
  with "Save to my pages". A link that holds no page says so, and a part whose tool the app has no card for
  says so too, the rest of the page is whole. Why:
  [ADR-0014](../../docs/adr/0014-a-page-from-the-chat-is-a-recipe-kept-in-the-browser.md).
- **Chat** is the panel on the right. It works like a chat app on a phone: a list and a chat, with a way
  back. The list, headed "Chats", shows the chats so far and, below them, the field that begins a new
  chat, with questions to begin with. A chat says in its head what it is called, on one line and cut where it
  is too long, and "All chats" at the left of the head leads back to the list; there is no "New chat" in a
  chat, a new one begins in the field of the list. A chat is called by its first question, up to 80
  characters, which the panel shows from the moment it is asked. Without a language model the head says
  "Chat". The panel opens from the button in the
  header, and a question from the field in the header or from "Ask why" on a machine starts a chat in it. A
  language model answers and calls the tools of [`genui-mcp`](../genui-mcp/README.md); the app draws the values
  of a tool call itself: a card of the catalogue, or a list with the same rows as Home. An answer is drawn
  from its markdown, and its times are those of your clock: the browser sends its time zone along with a
  question, and the server adds it to the tool calls. Whether the panel is open, and with which chat, is in
  the URL (`?chat=`), and the page stays where it is: you chat about what you see. Everything about the chat
  is in that panel: the pages on the left stay the same without it.

The values come from `genui-mcp`, and what is live comes from the broker. Without a language model the chat says
which settings are missing; everything else works.

**Live, not read again** ([ADR-0013](../../docs/adr/0013-live-values-from-the-broker.md)). Home, the page of a
machine, Live values and Charts read once, in their loader, what `genui-mcp` knows: what held when the page was opened,
and the history before it. From then on the browser subscribes at the broker, MQTT over WebSocket, to the
topics the page shows, and every value appears the moment a machine publishes it: a state, a work master, the
job order that runs, an alert that is raised or cleared, a point of a graph. The clock of the page moves on by itself, by the clock of the
server, so a machine that falls silent shows "No data" after 30 seconds, and the history of a machine keeps its
length and rolls on to now. A value stamped more than 30 seconds ahead of that clock is left out, as the backend
would not show it yet either. The line under the title
says "live" while the browser hears the broker, and "not live" while it does not; the page then reads again
once the broker is back, for what it missed. A page reads on a clock only while the backend has not answered.

| | |
|---|---|
| In the demo stack | <http://localhost:5600/>, port from `APP_PORT`, on this computer only (`APP_BIND`) |
| Liveness | `GET /health` |
| Image | `pleiades.playground.app`, the app alone. `pleiades.playground.app.showcases` is the same app built with its showcases, for a demo or a fair; `APP_SHOWCASES` in `.env` takes that one, see `src/showcases/` under [What is where](#what-is-where) |
| Version | At the bottom of the sidebar: `0.0.142 · 7a83c2f` for an image of the workflow "Images", linked to its commit; `dev` for a build of your own, with the commit of the checkout under `vite dev` |
| Settings | `GENUI_MCP_URL`, the MCP endpoint of the generative UI backend. `MQTT_WS_PORT`, the port the browser reaches the broker's WebSocket on, at the host of the page (9001 if unset); or `MQTT_WS_URL`, the whole address, for a broker behind a proxy (`wss://…`); or `MQTT_WSS_PATH`, for a page over HTTPS only, a path at the origin of the page that the proxy in front of the app forwards to the broker (`/mqtt`, the Margo app). `APP_MCP_SERVERS`, optional: further MCP servers whose tools the chat has too, as `name=address` separated by commas (`ultimaker=http://ultimaker-api:8080/mcp`); the app draws nothing for their results, the answer says them, and a chat switches each of them off and on under "Tools" in its message field. `OPCUA_MCP_URL` and `OPCUA_ADAPTER_URL`, the MCP endpoint and the API of the [OPC UA adapter](../../source/Pleiades.Playground.OpcUa.Adapter/README.md); empty, the chat has no OPC UA. The language models of the chat, see below. |

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
names of the machines from the backend as its prompt, their serial numbers, models and machine ids, so that
it writes "P-04" as the stack spells it.

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

It serves the app alone. To work on a showcase, start it with the showcases, and build with them the same
way; `src/showcases/` under [What is where](#what-is-where) says what a showcase is:

```bash
APP_SHOWCASES=true pnpm --filter @pleiades/app dev      # PowerShell: $env:APP_SHOWCASES = "true" first
APP_SHOWCASES=true pnpm --filter @pleiades/app build
```

## What is where

- `src/routes/`: one file per route. `__root.tsx` is the document and the layout with sidebar, header and chat,
  and holds what a tooltip and a toast need at the root (`TooltipProvider`, `Toaster`);
  `index.tsx` is Home, `sites.index.tsx` the address the list of the sites had before, which leads there, `sites.$machine.tsx` the page of a machine and `machines.$machine.tsx`
  the old address of it, which leads there, `charts.tsx` the last hours of every
  machine as charts (drawn by `src/charts/state-tiles.tsx`), `pages.index.tsx` the list of the pages kept
  in this browser, `pages.$page.tsx` one of them and `pages.open.tsx` one opened from a link; `health.ts`,
  `api/harness/$.ts` and
  `api/transcribe.ts` are server routes. A page that stands in the sidebar names its entry itself, in the `staticData` of its route
  (`nav`: a title, an icon, an order; `sidebar: false` for an entry that is no row, `/pages`, which the
  pages kept in this browser stand under). `src/components/app-sidebar.tsx` reads the entries from the
  routes and names no page, adds the pinned pages of this browser beside them, and `nav.ts` next to it puts
  them in order (order, then title), leaves out the entries that are no row (`sidebarPages`) and finds the
  one a person is under. Under the rows stands `page-group.tsx`, the group "Pages" of the pages that are not
  pinned: `Collapsible` around a `SidebarGroup`, as the docs of the sidebar have it, open when the app
  starts and as a person leaves it until a reload. The
  breadcrumb of the header, `page-breadcrumb.tsx`, reads the same: a page is called by the title of its
  entry, or by `crumb` in its `staticData`, and a page without an entry stands behind the one it is under.
- `src/pages/`: the pages kept from the chat. `recipe.ts` is the recipe and its schema (zod): its shape
  and its size, which is all that is checked, also of a recipe from outside. `store.ts` keeps the pages in
  the `localStorage` of the browser under one key, `pleiades-playground.pages.v1`, and is the only way to
  them: `listPages`, `getPage`, `savePage`, `renamePage`, `pinPage`, `unpinPage`, `removePart`, `movePart`,
  `putPartBack` (the undo of `removePart`), `deletePage`, and `usePages` for a component that follows every
  change. `part-controls.tsx` is what "Edit" shows above a part, and `shown-parts.ts` gives each part of the
  recipe as it is now the answer the loader already has for it. `link.ts` writes a recipe into one search
  parameter, `r`, and reads it back (`encodeRecipe`, `decodeRecipe`, `linkOf`): JSON as UTF-8 in base64url,
  at most `MAX_PARAM_LENGTH` (8,000) characters, and what is not exactly a recipe (`recipeOf`) is null.
  `share-page.tsx` is "Share" in the head of a kept page, `column.tsx` the column that a kept page and a page
  opened from a link share. `call-part.ts` is the server function that calls
  the tool of a part, only a tool the chat draws (`parts.ts`), with the time zone of the browser, and
  returns what the chat hands to `draw`. `drawn-part.tsx` asks the parts of a recipe for a loader
  (`answerParts`) and draws one (`DrawnPart`): the card of the chat, or what is missing. `pinned.ts`
  makes the entries of the sidebar for the pinned pages, `listed.ts` the rows of the group for the others
  and the row that is marked: none for a pinned page, the list of the pages or a page opened from a link. A route that opens a link is input from outside at its
  door: `pages.open.tsx` lets in nothing but `decodeRecipe`, keeps its parameter while the chat panel opens
  and closes (`retainSearchParams`), and the router has `search.strict`, so a link to any other page does not
  carry the recipe along (`router.tsx`). `from-answer.ts` reads the recipe from an answer
  of the chat, pure and without a language model (`keepOfAnswer`, for the button of the chat): the tool
  calls the chat drew a result for, in their order, without the time zone, the same call once, and the
  question as its title. An answer is everything the model said after one question, in more than one
  message; an answer with more calls than a page holds (12) keeps the first 12, and the row says so.
- `src/routeTree.gen.ts`: written from the route files and not in the repository, so that two branches with
  a page each have nothing to merge in it. `pnpm install` and `pnpm typecheck` write it
  (`route-tree.mjs`), and so do the development server and the build. Never edit it. TanStack advises to
  commit this file; here everything that needs it writes it first.
- `src/showcases/`: what is made for one demo or one fair, and is in a build only where `APP_SHOWCASES` is
  set ([ADR-0018](../../docs/adr/0018-a-showcase-is-built-in-on-request-and-only-adds.md)). A folder below
  it is a showcase: `where-is-my-job/` holds the map, the panels and the grouping of job orders into orders
  of the page "Where is My Job?", and `getFloor`, which reads its values. The pages of
  the showcases, and their server routes, are the route files under `src/routes/(showcases)/`; the brackets
  make a folder that adds nothing to an address, so `(showcases)/where-is-my-job.tsx` answers at
  `/where-is-my-job`. A page belongs to the showcase its name begins with: `titan.tsx`, `titan.faces.tsx` and
  `titan/faces.tsx` are pages of `showcases/titan/`. A build without the setting leaves that folder out
  (`vite.config.ts`): the router does not know the pages, nothing imports the folder of a showcase, and
  `.output` has nothing of one, so neither has the image. There is no switch while the app runs.
  `rule.test.ts` fails when a file of the app reads from a showcase or names the address of one of its pages,
  and when a showcase, its folder or one of its pages, reads from another. It resolves every import to a path
  from `src/` first, so `../other/data.ts` counts as `@/showcases/other/data.ts` does. The typecheck reads
  every route, with the showcases (`route-tree.mjs`). After a build without the setting, the route tree on
  disk has no showcase routes, and the editor or a plain `tsc` reports `TS2345` in the route files of the
  showcases (`'"/(showcases)/where-is-my-job"' is not assignable to parameter of type 'keyof FileRoutesByPath'`).
  `pnpm typecheck` or `node route-tree.mjs` writes the whole tree again, and the error is gone.
- `src/cards/`: a folder for each card, named like the card. `machine/chat.tsx` is the machine card in the
  chat: what a call of each of its tools is called, what the chat draws for a result (`results.ts` checks it
  against the contract), and which tool only a card calls. Which value of the binding is which state, the
  signs and the wording come from [`@pleiades/cards`](../../packages/cards/README.md). `measurement/chat.tsx`
  is the measurement card in the chat: the cards of `genui_measurement_list`, without graphs. `opcua/chat.tsx`
  holds the cards of the OPC UA adapter: the server list, a mapping, a proposal and the endpoints, and
  `results.ts` checks what its tools give back.
- `src/machines/`: what the pages and the chat both take of a machine. `get-machines.ts` holds the server
  functions that call the backend as a typed MCP client, `card-tools.ts` the names of the tools only a card
  calls, `machine-item.tsx` draws a machine as a row or a tile. A card folder imports from here, never the
  other way.
- `src/live/`: what keeps a page live. `broker.ts` is the one connection of the browser to the broker, MQTT
  over WebSocket, which only subscribes; `broker-address.ts` the server function that says where the broker
  is. `messages.ts` reads what the binding publishes, `machines.ts` and `measurements.ts` lay a message, and
  the passing of time, onto what the backend read, by the rules of `genui-mcp`; each has its tests.
  `sites.ts` keeps the machines of the sites live and counts them again by the rules of `genui_site_list`.
  `src/hooks/use-live.ts` puts it together for a route: `useLive(loaded, live)`.
- `src/sites/`: what Home chooses to show of the sites. `filter.ts` groups the values of `genui_site_list` by site
  and hall, keeps what "Needs you" and a search ask for, cuts the pages, and adds up nothing; `moved.ts` says where an old address of the page of a
  machine or of the list of the sites leads.
- `src/chat/`: `assistant.server.ts` is the agent harness ([TanStack AI](https://tanstack.com/ai), experimental)
  with the tools of the backend and one adapter per model; chats live in memory and are gone after a restart.
  `mcp-servers.ts` reads the servers whose tools the chat has and holds a chat to the ones it left on,
  `server-list.ts` asks each of them for its tools, and `tools-menu.tsx` is the list "Tools" in the message
  field, where a chat switches a further server off and on.
  `models.ts` reads which models the settings name, `local-times.ts` adds the time zone of the browser to a
  tool call. `chat-sidebar.tsx` is the panel with the chat on `useChat`, the choice of the model and stop,
  which also cancels the turn in the harness (`createHarnessClient(...).cancel()`), and holds its head:
  the title of the view, or in a chat a way back and the name of the chat; `chat-name.ts` next to it says
  what a chat is called (`chatName`, `nameOfQuestion`), `ask.ts` which chat the panel shows, in the URL
  (`?chat=`: `new` is the list), and where the first question of a new chat waits,
  `save-as-page.tsx` the row under an answer with "Save as page" (chrome of the app, never part of a card),
  `dictate.tsx` the microphone in its field and `dictation.server.ts` the model behind it,
  `cards.tsx` lists the cards the chat knows, one line for a card: the chat takes from it what it draws for
  which tool, and its server which tools a language model does not get. `tool-results.ts` says what a card
  may say about a tool, `blocks.ts` turns an answer into blocks, and `answer.tsx` draws what the model writes
  ([TanStack Markdown](https://tanstack.com/markdown)).
- `src/opcua/`: what the chat and its cards take of the OPC UA adapter. `commands.ts` holds the slash
  commands and `/help`, `adapter.ts` the server functions behind the buttons that add and remove a machine.
  The adapter's tools are a second MCP server of the harness, and its part of the instructions stands in
  `assistant.server.ts`; while the adapter does not answer, the chat offers none of it.
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

## Machine documentation in chat

Run the external documentation API and MCP service, then append an entry to `APP_MCP_SERVERS`:

```dotenv
# Playground running locally:
APP_MCP_SERVERS=docs=http://127.0.0.1:3202/mcp
# Playground in Docker, documentation service on the host:
# APP_MCP_SERVERS=docs=http://host.docker.internal:3202/mcp
```

Keep any existing entries, separated by commas. Restart the local app, or recreate the Docker app with
`docker compose up -d --no-deps app` so it receives the new environment. The external MCP service must
listen on an address reachable by that runtime and accept its Host header; loopback-only services cannot
be assumed reachable from another container. The standard demo has no documentation dependency.

Ask about a manual, for example “Which four technological machining operations does CYCLE832 distinguish?”.
The chat uses `docs_search` and `docs_read_page`, cites the document and page, and shows clickable sources.
Selecting a PDF source opens its original physical page in a PDF.js viewer, with paging, zoom, download
and literal search. Search combines native PDF text and indexed OCR page matches; only native text can
be highlighted. The **Extracted text** tab retains the plain-text evidence. The backend reads metadata and
bounded binary resources through MCP and serves PDF bytes to the browser, including HTTP ranges.
Missing, changed or unavailable sources show an error and require a new search.
See [ADR-0019](../../docs/adr/0019-documentation-sources-in-chat.md) and the [external documentation contract](../../contracts/docs/README.md).
The Playground never calls the documentation REST API or accesses its database.

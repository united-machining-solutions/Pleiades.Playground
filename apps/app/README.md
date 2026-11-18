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

The server can also register the app at the Pleiades Hub, the page that shows the apps of a Pleiades system
under one header. It does so where `HUB_MQTT_URL` is set. The demo stack sets it, so there the app registers
at the broker of the stack, see [Pleiades Hub](#pleiades-hub).

| | |
|---|---|
| In the demo stack | <http://localhost:5600/>, port from `APP_PORT`, on this computer only (`APP_BIND`) |
| Liveness | `GET /health` |
| Image | `pleiades.playground.app` |
| Settings | `GENUI_MCP_URL`, the MCP endpoint of the generative UI backend. The language models of the chat, see below. `HUB_MQTT_URL` and `HUB_APP_URL` for the registration at the [Pleiades Hub](#pleiades-hub): the demo stack sets both, and an empty `HUB_MQTT_URL` in `.env` switches the registration off. |

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

## Pleiades Hub

The Pleiades Hub (repository `umati/pleiades-hub`) is the frame of the Pleiades system: one page with a
header, for the app launcher and the user menu, and below it the apps in iframes. Apps register at it over
MQTT, at the broker of this repository, with the SDK `@pleiades/hub-sdk` from the hub's repository.

For the server the registration is opt-in. With `HUB_MQTT_URL` set, the server of the app registers when it
starts, with one app. Without the variable, or with an empty one, nothing connects, and the app behaves as
before. The demo stack sets the variable, see [In the demo stack](#in-the-demo-stack).

The start is a plugin of Nitro, the server under TanStack Start: `src/hub/plugin.ts`, which `vite.config.ts`
names. Nitro runs it once when the server starts, in development and in the built server, so the app is in
the hub before anyone opens a page.

| Variable | Default of the server | In the demo stack | Meaning |
|---|---|---|---|
| `HUB_MQTT_URL` | empty: no registration | `mqtt://broker:1883`, the broker of the stack | The MQTT broker at which the app registers: an `mqtt`, `mqtts`, `ws` or `wss` URL. In development the broker of this repository's stack, `mqtt://localhost:1883` |
| `HUB_APP_URL` | `http://localhost:3000/` | `http://localhost:5600/`, with the port of `APP_PORT` | The address under which a user's browser reaches the app: an absolute `http` or `https` URL, or a path that starts with `/`, such as `/playground/`, which the hub resolves against its own address. It should end with `/`, because the icon link is relative to it. Ignored without `HUB_MQTT_URL` |

With `HUB_MQTT_URL` set, an invalid value of either variable is an error at the start. The built server
prints one line that names the variable, never its value, and ends with exit code 1. The development server
prints the same line and runs on without the registration: Nitro starts its server process again whenever
it ends.

The client id in the topics of the hub is `pleiades-playground`, and the app it registers is this one:

```json
{
  "id": "pleiades-playground",
  "label": { "en": "Playground", "de": "Playground" },
  "description": {
    "en": "What every machine does now, with a chat for questions",
    "de": "Was jede Maschine gerade tut, mit einem Chat für Fragen"
  },
  "icon": "hub-icon.svg",
  "url": "http://localhost:3000/"
}
```

`url` is the value of `HUB_APP_URL`, here the default of the server; from the demo stack it is
`http://localhost:5600/`. Label and description stand in the code (`src/hub/settings.ts`), in English and
German; the hub shows them in the language the user chose there.

The icon is an SVG drawn for this app, `public/hub-icon.svg`, which the server of the app serves as
`/hub-icon.svg`. It is registered as the relative link `hub-icon.svg`, which the hub resolves against the
address of the app: `http://localhost:3000/hub-icon.svg` in development, `/playground/hub-icon.svg` behind
the path `/playground/`. Without the `/` at its end, `/playground` would send the hub to `/hub-icon.svg`.
The hub shows the icon as an image, so the file brings its own colours and uses no `currentColor`; if it
cannot be loaded, the hub shows the initials of the label.

A broker that cannot be reached does not stop the app: the SDK retries every two seconds, and the server
logs each distinct error once. When the server stops, the hub drops the app. On `SIGTERM` and `SIGINT` Nitro
closes the HTTP server first and then runs the sign-off of the SDK, so a request that is still open, a chat
that streams for example, delays the sign-off by up to five seconds. If the process dies without it, the
broker publishes the Last Will of the client, and the hub drops the app as well. That is also the path where
`CI` or `TEST` is set in the environment: the server then ends at the signal without closing.

The messages travel below the first level `hub/` of the [MQTT binding](../../contracts/mqtt/README.md).
Their topics and payloads are defined in the repository of the hub, in its `contracts/mqtt/README.md`.

The SDK is not on npmjs.org. It is checked in as a tarball, `vendor/pleiades-hub-sdk-0.1.0.tgz`, and
[`vendor/README.md`](../../vendor/README.md) names its version, its origin and its checksum. The catalog in
`pnpm-workspace.yaml` refers to it (`"@pleiades/hub-sdk": file:vendor/pleiades-hub-sdk-0.1.0.tgz`), and
`package.json` says `"catalog:"`, like every other dependency. The decision and what follows from it:
[ADR-0010](../../docs/adr/0010-hub-registration.md).

### In the demo stack

In the demo stack the registration is on. `compose.yaml` sets both variables for the `app` container, so the
app registers at the broker of the same stack, `mqtt://broker:1883` (the service `broker`), with the address
`http://localhost:5600/`. The address follows `APP_PORT`: with `APP_PORT=5700` it is
`http://localhost:5700/`. In `compose.yaml` the app does not wait for the broker: the SDK retries until the
broker answers.

The hub is not part of the stack. Start the hub from its repository; it then answers on
<http://localhost:3300/>, and it reaches the broker of this stack at the port the stack publishes on the
host (`MQTT_PORT`, 1883). Pleiades Documentation, from its repository, does the same. Without a hub the
registration costs one MQTT connection and one message at the start: nobody asks on `hub/discover`.

Both variables stand in [`.env.example`](../../.env.example). A line in `.env` changes one, and
`docker compose up -d app` creates the app again with it:

- `HUB_MQTT_URL=`, the line with an empty value, switches the registration off: the container gets an empty
  variable, and the app does not register. Without the line the stack keeps its default.
- `HUB_APP_URL` has to be set whenever a browser reaches the app under another address than
  `http://localhost:<APP_PORT>/`: under another host name, for example when `APP_BIND` opens the app to the
  network, behind a reverse proxy, or under a path of the hub such as `/playground/`. The hub hands the
  address to the browser of each user as it is, and `localhost` there is the computer of that user. With an
  empty value, or without the line, the stack keeps its default.

An invalid value is an error at the start here as well: the `app` container runs the built server, which
prints the line that names the variable and ends. `docker compose logs app` shows the line.

### Try it in development

It needs two things beside the app: the broker of this repository's stack, which the running demo stack
publishes on `localhost:1883`, and the hub (`pnpm dev` in a checkout of `pleiades-hub`,
<http://localhost:3300/>). The app of the running stack registers at that broker as well, under the same
client id as the development server, and the hub keeps one list for a client id, the last one it got: with
both running, "Playground" opens the one or the other. So stop the app of the stack first,
`docker compose stop app`, and start it again afterwards (`docker compose start app`). Then start the app
with the variable set:

```bash
HUB_MQTT_URL=mqtt://localhost:1883 pnpm --filter @pleiades/app dev
```

In PowerShell, set the variable first: `$env:HUB_MQTT_URL = "mqtt://localhost:1883"`. It then stays set in
that terminal, and `compose.yaml` reads a variable of the same name: start the stack from another terminal,
or the `app` container gets `localhost` as its broker.

Within seconds the app appears in the launchpad of the hub, as "Playground", and opens there in an iframe.
`HUB_APP_URL` keeps its default in development: it is the address of the development server.

## What is where

- `src/routes/`: one file per route. `__root.tsx` is the document and the layout with sidebar, header and chat,
  and holds what a tooltip and a toast need at the root (`TooltipProvider`, `Toaster`);
  `index.tsx` is Home, `machines.$machine.tsx` the page of a machine, `health.ts` and `api/harness/$.ts` are
  server routes. A page that stands in the sidebar names its entry itself, in the `staticData` of its route
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
  `cards.tsx` lists the cards the chat knows, one line for a card: the chat takes from it what it draws for
  which tool, and its server which tools a language model does not get. `tool-results.ts` says what a card
  may say about a tool, `blocks.ts` turns an answer into blocks, and `answer.tsx` draws what the model writes
  ([TanStack Markdown](https://tanstack.com/markdown)).
- `src/hub/`: the registration at the [Pleiades Hub](#pleiades-hub). `settings.ts` reads the two variables
  and holds the registration; it is pure, and `settings.test.ts` tests it. `registration.server.ts` is
  server-only and starts the client of the SDK exactly once per process: a singleton, so a hot reload of the
  development server opens no second connection. `plugin.ts` is the plugin of Nitro that calls it when the
  server starts and signs the app off when the server closes. The icon is `public/hub-icon.svg`.
- The [shadcn/ui](https://ui.shadcn.com) components come from [`packages/ui`](../../packages/ui/README.md),
  imported as `@pleiades/ui/components/<name>`. `components.json` holds the settings of the preset
  `b5JNecjwG` and tells `shadcn add` to write a new component there. The layout follows the block
  `sidebar-15`: the pages on the left, the chat on the right.
- `src/styles.css`: Tailwind and the font. The theme of the preset, light only, comes from `@pleiades/ui`,
  the chart and state colours from `@pleiades/cards`, so a card looks the same wherever it is drawn.

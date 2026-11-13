# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Timeseries: API (REST, MCP) and persistence worker (MQTT to API).
- Events: API (REST, MCP) and persistence worker, for notification events.
- Simulator for values, states and notifications of several machines.
- Shared libraries for logging, JSON, authorization, health checks, MQTT and the MCP server standard.
- Demo stack (`compose.yaml`), contracts and CI.
- TypeScript workspace for `apps/` and `packages/`: pinned Node.js and pnpm, one version catalog, a shared
  TypeScript configuration and a CI job.
- Generative UI backend `genui-mcp` in the demo stack on port 5520: an MCP server with the tool
  `genui_machine_list`, which reads the Timeseries and Events APIs.
- Example application `app` (TanStack Start, shadcn/ui) in the demo stack on port 5600. Home lists
  what every machine does now, with the values of `genui_machine_list`. A chat next to the page (TanStack AI
  harness) answers questions with the same tools. Its language models come from the settings: OpenAI,
  Anthropic, and any endpoint that speaks OpenAI's chat completions. With several models a chat picks one.
- Card catalogue `packages/cards`: for each card its contract (zod) and its React component. The first card
  is the machine card: what one machine does now and which states it went through over the last hours. The
  tool `genui_machine_show` returns its values, the app shows it on a page per machine
  (`/machines/<serial number>`) and in the chat.
- The machine tools of `genui-mcp` take a `timeZone` and then write every instant as a local time with its
  offset to UTC. The chat passes the time zone of the browser, so an answer gives the times of the person's
  clock, and it draws the markdown of an answer.
- `genui-mcp` takes whether a machine is there from its signs of life, the heartbeat included, and lets a
  value hold until the next one of its topic. A machine that publishes its state only on a change is shown
  with that state, not as "No data".
- `genui-mcp` serves the machine card as an MCP App: `genui_machine_show` links the resource
  `ui://genui/machine`, one HTML file that draws the result in a host that shows MCP Apps. The example
  application keeps drawing the card itself. The shadcn theme moves to the card catalogue
  (`packages/cards/src/theme.css`), so both draw the card with the same theme. The file carries the notices
  of the software in it, and it tells the host that it draws its own frame.
- `genui-mcp` answers on stdin and stdout when started with `--stdio`, so a desktop host can start it as a
  process of its own.
- The machine tools of `genui-mcp` answer in words. The text of a result says in a few lines what a display
  shows, and the values stay in `structuredContent`, so a language model no longer reads the history of a
  machine as raw data. The sums of that history come from the server (`history.totals`); the card no longer
  adds them up.
- What a language model reads of a result is short, whichever part a host gives it. The states of a machine
  over the last hours are no longer in the result of `genui_machine_show`: the machine card asks for the
  spans of its band itself, with the new tool `genui_span_list`, which only a card calls. A history too long
  for the band is thinned.
- A tour of the demo with screenshots (`docs/tour.md`): what the example app shows, stop by stop, and where
  it lives in the code. A coding agent gives the tour when asked ("give me a tour") and offers it when a
  session begins without a task (`AGENTS.md`).
- CI checks the links between the files of the repository (`.github/scripts/check-doc-links.mjs`): a moved
  or renamed file and a reworded heading cannot leave a dead pointer in the documentation. The pull request
  template, `CONTRIBUTING.md` and `AGENTS.md` ask to keep the tour current with a change to the demo.
- About the name (`docs/name.md`): where the name Pleiades comes from, what it stands for and what it does
  not, how Taurus, Pleiades and this playground relate, and how to write it. `README.md` says it in two
  sentences.
- ADR-0007 records the decisions of the TypeScript part: the three parts and their stack, the harness of the
  example app as the agentic layer, the card as one component in two wrappers, and what a language model
  reads. The layer table in `README.md` names the harness.
- Build your own (`docs/build-your-own.md`): where an idea starts, in three pictures: the way of a value, who
  calls whom, and a card and its server. How to use a language model on your own computer is in
  `apps/app/README.md`.
- Skills for building on the stack (`.claude/skills/`): `build-your-own` asks a person for the goal, looks what
  the stack already has and takes the recipe that fits; `create-page`, `create-card` and `add-source` are the
  recipes, each with the files it touches and the checks that say it is done. They load the skills of
  shadcn/ui and of the TanStack packages first; `@tanstack/intent` is a development dependency for that.
  `setup` leads a person who has never done it through getting a computer ready, in three levels: see the
  demo, build, chat.
- MQTT binding, draft 0.2.0: a second family of topics, `sites/{SiteId}/{Source}/<path>`, for a value that is
  about a place and not about a machine, such as the outside temperature. Envelope, units and content types
  are those of a machine, and a source says that it is there with `Connection/State` and
  `Connection/Heartbeat`. The Timeseries persistence of the stack stores the family (`sites/+/#`). No service
  changed its code, and nothing changes for a machine.
- The images of `main` can be pulled without signing in, and `README.md` shows the start without a build:
  `PLEIADES_VERSION=main docker compose up -d --no-build --wait`.
- For coding agents: shadcn/ui is named as the design system of the user interface (`AGENTS.md`, and a line
  in the pull request template). The agent skill of shadcn/ui (`.claude/skills/shadcn`) and the MCP server of
  its CLI (`.mcp.json`) come with the repository, so an agent reads the docs of a component before it writes
  user interface.
- A script takes the screenshots of the tour from the running stack:
  `node .github/scripts/tour-screenshots.mjs` writes six of the seven pictures under `docs/images/tour/`,
  each 1280 × 800 pixels. The two pictures of the chat need a language model and are left out without one;
  the card in another host stays a picture taken by hand. Playwright is a development dependency for that.
- `packages/ui` holds every shadcn/ui component of the style that needs no package of its own, 33 more than
  before, and `chart` on Recharts 3.8.0. Three components are its own, built on a part of Base UI that
  shadcn has no file for and styled like their neighbours: `meter.tsx` (a measurement in its range),
  `number-field.tsx` (a number with range, step and format) and `otp-field.tsx` (a short code). `sonner`,
  `command` and `input-otp` are left out on purpose, each a second way for something that is there on
  Base UI, and a test fails if one of their packages is added.
- A card can be looked at without a language model: `node .claude/skills/build-your-own/show-card.mjs <tool>`
  stands in for a host of MCP Apps. It calls the tool, reads the card file the tool links and serves a page
  that shows the card wide and narrow. The recipes `create-page` and `create-card` say what two agents had
  to guess when they built a page and a card by them: which tool has the warnings, how a list is laid out,
  what a card shares with another card, how the card file is tied to its tool and how it is checked.
- The design system on one page, `apps/design-system` (`pnpm --filter @pleiades/design-system dev`,
  <http://localhost:3100/>): a small application of its own, Vite and React, outside the demo stack. It shows
  the tokens with their measured contrast, every component of `packages/ui` in its variants and states
  with fixed values in the words of the demo, three rules as Do and Don't, and the machine card of the card
  catalogue. A test fails when a component of `packages/ui` has no block on the page.

### Changed

- Chat: the models of Anthropic are offered before those of OpenAI. With keys for both, the first model of
  `ANTHROPIC_MODELS` answers until a chat picks another; with the names of `.env.example` that is Claude Haiku.
- MQTT: MQTTnet 5 replaces MQTTnet 4. MQTTnet 5 ships no managed client, so `Pleiades.Playground.Mqtt.Extensions`
  now carries its own `ManagedMqttClient`: it reconnects every 10 s, subscribes again on every new connection
  and queues outgoing messages while there is none. Topics, payloads and content types on the broker are
  unchanged.
- `app`: the setting `LLM_MODEL` is now `LLM_MODELS` and takes several names, separated by commas. A `.env`
  that still names `LLM_MODEL` gives the chat no model: rename the line. The blocks `OPENAI_*` and
  `ANTHROPIC_*` are new beside it.
- `genui-mcp`: the origins a card file may load from are a setting, `CARD_RESOURCE_DOMAINS`, and no longer
  the font origin of one host in the code. Without it a card names none. A host that serves its font from
  an origin of its own needs it set, or the card falls back to a system font there.
- The images of `genui-mcp` and `app` carry `LICENSE` and `NOTICE` under `/app`.
- Stack: a key alone enables the chat. `compose.yaml` fills in the model names of `.env.example` for
  `ANTHROPIC_MODELS` and `OPENAI_MODELS` where the line is missing or empty. Where a block was begun and is
  not complete, the chat panel names the setting that is empty.
- Stack: the image of the simulator is built once, by `simulator-p-04`, and no longer once per simulator.
- `README.md` starts the stack with `--wait` and shows the two lines that enable the chat. The development
  setup has three more known issues: a download that breaks off, `pnpm` through the path, and a key that
  `docker compose restart` does not pick up.
- The skill `setup` starts the stack from the published images of `main` and no longer builds it: about
  half a gigabyte to download instead of a build of ten minutes or more. It first makes sure that `.env`
  names `PLEIADES_VERSION=main`, because a later start with another version there builds the whole stack.
  The skill `build-your-own` sends a stack that does not run to `setup`, and keeps that version when it
  makes `.env` for a key.
- `app`: the screens are composed as the shadcn/ui docs compose them. In the chat a question is a `Bubble`,
  the tool calls of a stretch are a `Trace`, an error is an `Alert`, and the questions to begin with are a row
  of buttons above the field. Every empty state has its icon. The path of a page is a `Breadcrumb` in the
  header; the page of a machine is titled with the machine. The band of the machine card waits as a
  `Skeleton`, which moved to `packages/cards`.
- `app`: the sidebar reads its entries from the routes. A page names its entry in the `staticData` of its
  route (`nav`: a title, an icon, an order), so a new page is one file and touches no list that every page
  shares. The mark of the sidebar follows the page a person is on; it stayed on Home before. The recipe
  `create-page` says so.
- `app`: `src/routeTree.gen.ts` is no longer in the repository. It is written from the route files, by
  `pnpm install` and `pnpm typecheck` (`apps/app/route-tree.mjs`), by the development server and by the
  build, so two branches with a page each have nothing to merge in it. After you pull this change the file
  is gone from your checkout until one of them has run.
- `genui-mcp` and `app`: a card is one module on each side and one line in a list, so two cards that are
  added at the same time no longer meet in the server, the guide and the chat. The server takes its tools,
  its card files and what its description and its guide say about a card from `src/cards/index.ts`; the
  chat takes what it draws for which tool, and which tools a language model does not get, from
  `src/chat/cards.tsx`. The card files are built from every page under `apps/genui-mcp/ui/`. For a caller
  nothing changed: the lists of tools and resources, the description, the guide and the card file are the
  same, byte for byte. The recipe `create-card` names the new places.
- The shadcn/ui components live in one package, `packages/ui` (`@pleiades/ui`), laid out as the monorepo
  template of shadcn lays it out. The example app and the card catalogue import a component as
  `@pleiades/ui/components/<name>`, and `shadcn add` writes a new one there; before, twenty lay in the app
  and three in the catalogue. The theme moved with them, from `@pleiades/cards/theme.css` to
  `@pleiades/ui/globals.css`. A card file still carries the styles of the components the cards draw and of
  no other: `packages/cards/src/styles.css` names them, and a test keeps the list right.

### Fixed

- `genui-mcp`: a state holds however long ago the machine reported it. A machine that said more than 24 hours
  ago that it is connected, and has sent only its heartbeat since, was shown as "No data".
- A serial number follows one rule, the one of the MQTT binding: everything but `/`, `+` and `#`
  (`serialNumber` in `packages/cards`). `genui_machine_show` refused a machine that the list showed, for
  example one with a space in its name.
- `genui-mcp`: the history of a machine looks back as far for an error that stands as the list does, 24 hours
  from its end, so the state on a card and the end of its band no longer contradict each other.
- `genui-mcp`: a time zone the server does not know is refused with a sentence that says what to name. The
  message used to be the one of the runtime.
- `app`: the chat no longer offers its language model `genui_span_list`, the tool only a card calls.
- `app`: the page of a machine the backend does not know says so and stops asking. It used to say "No answer
  from the backend" and ask again every ten seconds.

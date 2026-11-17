# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Example app: the setting `APP_MCP_SERVERS` gives the chat the tools of further MCP servers, such as the
  optional Ultimaker service, as `name=address` separated by commas.
- Live values: the page `/live` of the example app draws a graph for each physical value over the last 15
  minutes, a line for each machine, and shows one machine or all of them. `genui-mcp` has the tools
  `genui_measurement_list`, the newest value of each quantity for every machine with the measurement card,
  and `genui_measurement_series`, the lines of the graphs, which the card file draws below the cards.
- Optional Ultimaker 3 services: CuraEngine slicing over REST/MCP, printer-side header validation,
  current jobs and history with durable slice associations, and a separate MQTT telemetry adapter.
  Both containers are part of the root Compose stack and image-publication workflow, enabled for
  deployment with COMPOSE_PROFILES=ultimaker.

- Timeseries: API (REST, MCP) and persistence worker (MQTT to API).
- Events: API (REST, MCP) and persistence worker, for notification events.
- Simulator for values, states and notifications of several machines.
- Deployment (`docs/deployment.md`): the workflow "Deploy" starts the stack with `docker compose` on a runner of
  your own, from the images of the commit that was merged into `main`. It is off until the variable
  `DEPLOY_ENABLED` is `true`.
- Shared libraries for logging, JSON, authorization, health checks, MQTT and the MCP server standard.
- Demo stack (`compose.yaml`), contracts and CI.
- TypeScript workspace for `apps/` and `packages/`: pinned Node.js and pnpm, one version catalog, a shared
  TypeScript configuration and a CI job.
- Generative UI backend `genui-mcp` in the demo stack on port 5520: an MCP server with the tool
  `genui_machine_list`, which reads the Timeseries and Events APIs.
- Example application `app` (TanStack Start, shadcn/ui) in the demo stack on port 5600. Home lists
  what every machine does now, with the values of `genui_machine_list`. A chat next to the page (TanStack AI
  harness) answers questions with the same tools. Its language models come from a LiteLLM gateway, with two
  settings, `LLM_BASE_URL` and `LLM_API_KEY`: the chat offers the models the gateway marks for chat, in its
  order, and a chat picks one. `host.docker.internal` reaches the computer from the app on Linux too.
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
- CI checks what a pull request says (`.github/scripts/check-pull-request.mjs`, the workflow "Pull request"):
  the title is a Conventional Commit, the template is filled in, a change to a contract links its issue, and
  a `feat`, a `fix` or a breaking change (`!`) has its line here or says why not. The failure says what to
  do about each, with the commands, so a person or a coding agent can act on it. It runs again when the title
  or the text is edited, and leaves drafts and Dependabot alone.
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
- The skill `setup` gives the chat the language models of the hackathon hub: a router that speaks OpenAI's chat
  completions behind one address and one key, with a root certificate of its own. The skill checks that the
  file holds that certificate alone, by its fingerprint, and hands it to the app with a `compose.override.yaml`
  that stays on the computer. It points `LLM_BASE_URL` and `LLM_API_KEY` at the router with
  `${OPENAI_BASE_URL}` and `${UMS_AI_KEY}` of the profile, and asks the router from inside the app which chat
  models and which speech-to-text model it offers.
- Stack: a LiteLLM gateway of its own, with the profile `gateway` (`docker compose --profile gateway up -d`),
  for a key of Anthropic or OpenAI without the gateway of the hackathon. It reads `ANTHROPIC_API_KEY` and
  `OPENAI_API_KEY` from `.env`, takes `LLM_API_KEY` as its master key and its models from
  `stacks/litellm/config.yaml`, publishes no port, and
  without the profile neither starts nor downloads (`LITELLM_VERSION`, `v1.109.1`).
- Dictation in the chat field of the example application: a microphone next to send. The browser records,
  the server route `/api/transcribe` has a speech-to-text model write down what was said, and the text goes
  into the field, to send like a typed question. The model gets the names of the machines as its prompt.
  The model is the first one the gateway marks for speech to text; without one the field has no microphone.
  A recording
  stops after two minutes, and the route answers a body over 32 MiB with 413, as the agent harness does.
- "Thinking" in the chat: while an answer is coming and nothing in it moves, a running line of a `Trace`
  says so, and its title shimmers. It stands where the answer will be until the answer shows anything, after
  the shadcn chatbot template, and under the last step or card while the model reads its result, until the
  next step or text comes. Before, the chat showed nothing in those times.
- The example application wears umati: the sign of umati is the icon of the page, and the coloured umati
  wordmark stands at the top of the sidebar in place of the name. Both are trademarks of VDW e.V. and not
  covered by the licences of this repository (`NOTICE`).
- Brands (`packages/ui/brands`): a brand is a `DESIGN.md` and, written from it, one block of theme tokens
  that holds while `<html>` carries `data-brand`. It sets the colour roles, the radius, the font and a
  logo; the colours of an error, a chart and a state of a machine stay the same in every brand, and no
  component changes. The example application has the switch at the top of its sidebar, the design system
  the same choice at the top of its page, where the contrast of every colour role is measured under the
  brand. One brand comes along, `example`, which is not a company. A card served to another host wears no
  brand. The skill `add-brand` (`.claude/skills/`) leads a coding agent through a new one. Why: ADR-0011.
- The example application names its build at the bottom of the sidebar: the version and the short commit,
  `0.0.142 · 7a83c2f`, as a link to the commit. The workflow "Images" passes both, and the repository, to the
  image build as `VERSION`, `REVISION` and `SOURCE`; the build reads them as `APP_VERSION`, `APP_REVISION`
  and `APP_SOURCE`. A build without them is `dev`; `vite dev` adds the commit of the checkout.
- Stop in the chat field: while an answer comes, send is stop, after the pattern Prompt Input of shadcn.
  It stops reading the answer (`stop` of `useChat`) and cancels the turn on the server
  (`createHarnessClient(...).cancel()`), so that the model stops writing, the chat keeps what was shown,
  and the next question does not wait for the rest.
- A step in the chat opens to what its tool gave back, or why it failed, after the pattern Tool of shadcn:
  the line of a call is a `TraceCollapsible` once its result is there, with the result as text in a
  `CodeBlock` (JSON indented). `code-block` is new in `packages/ui`; it brings `shiki`, which only its
  highlighting hook loads, and the app does not use that hook.

### Changed

- `app`, for those who run `main`: the chat takes its models from a LiteLLM gateway, with two settings,
  `LLM_BASE_URL` and `LLM_API_KEY`. The settings `ANTHROPIC_*`, `OPENAI_*`, `OPENAI_TRANSCRIPTION_MODEL`,
  `LLM_MODELS` and `LLM_TRANSCRIPTION_MODEL` and the package `@tanstack/ai-anthropic` are gone. A `.env` that
  sets only the keys of Anthropic or OpenAI gives the chat no model: set the address and the key of the gateway.
- MQTT: MQTTnet 5 replaces MQTTnet 4. MQTTnet 5 ships no managed client, so `Pleiades.Playground.Mqtt.Extensions`
  now carries its own `ManagedMqttClient`: it reconnects every 10 s, subscribes again on every new connection
  and queues outgoing messages while there is none. Topics, payloads and content types on the broker are
  unchanged.
- `genui-mcp`: the origins a card file may load from are a setting, `CARD_RESOURCE_DOMAINS`, and no longer
  the font origin of one host in the code. Without it a card names none. A host that serves its font from
  an origin of its own needs it set, or the card falls back to a system font there.
- The images of `genui-mcp` and `app` carry `LICENSE` and `NOTICE` under `/app`.
- Stack: the image of the simulator is built once, by `simulator-p-04`, and no longer once per simulator.
- `README.md` starts the stack with `--wait` and shows the two lines that enable the chat. The development
  setup has three more known issues: a download that breaks off, `pnpm` through the path, and a key that
  `docker compose restart` does not pick up.
- The skill `setup` starts the stack from the published images of `main` and no longer builds it: about
  half a gigabyte to download instead of a build of ten minutes or more. It first makes sure that `.env`
  names `PLEIADES_VERSION=main`, because a later start with another version there builds the app and what
  it needs, four images. The skill `build-your-own` sends a stack that does not run to `setup`, keeps that
  version when it makes `.env` for a key, and has the person set it right in a `.env` that is there.
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
- `app`: the cards of the chat have a place of their own, `src/cards/<name>/`, named like the card everywhere
  else. The machine card moved there from `src/machines/`, which keeps what the pages and the chat both take
  of a machine: the server functions, the name of the tool only a card calls, and the row; a card folder
  imports from there, never the other way. Nothing a person sees changed. A card on a branch of your own
  moves from `src/<name>/` to `src/cards/<name>/`. The recipe `create-card` names the new place.
- The shadcn/ui components live in one package, `packages/ui` (`@pleiades/ui`), laid out as the monorepo
  template of shadcn lays it out. The example app and the card catalogue import a component as
  `@pleiades/ui/components/<name>`, and `shadcn add` writes a new one there; before, twenty lay in the app
  and three in the catalogue. The theme moved with them, from `@pleiades/cards/theme.css` to
  `@pleiades/ui/globals.css`. A card file still carries the styles of the components the cards draw and of
  no other: `packages/cards/src/styles.css` names them, and a test keeps the list right.
- `app`: the breadcrumb of the header reads its pages from the routes, as the sidebar does. It named Home
  and the page of a machine by hand, so a new page had none. A page is called by the title of its entry,
  or by `crumb` in the `staticData` of its route; what Home and the page of a machine show is unchanged.
- pnpm puts a package that is added into the catalog itself, with its exact version, and `catalog:` into
  the `package.json` (`catalogMode: strict` and an empty `savePrefix` in `pnpm-workspace.yaml`). Before,
  `pnpm add` and `shadcn add` wrote a version with a `^` into the `package.json`, and moving it into the
  catalog was a step by hand.

### Fixed

- Ultimaker pairing can be repeated after rejection or a forgotten request without removing files;
  existing credentials survive failed replacements. Invalid printer status responses return HTTP 502
  and MCP tool errors instead of unhandled server errors.
- `app`: a question asked outside the chat ("Ask why", the field in the header) is answered under
  `vite dev` too. React ran the effect that sends it twice there (StrictMode); `useChat` detached after the
  first run and cut off its stream, and the second run found the question taken: it stood in the chat and
  no answer came. The effect now waits one tick, so only the run that stays sends it. The build was not
  affected.
- `app`: dictation works in Firefox. Firefox recorded Ogg and reported no type once the recording had
  stopped, so the file went out named WebM, and the speech-to-text model refused it ("Audio file might be
  corrupted or unsupported"). The recorder now asks for WebM with Opus.
- `ui`: the buttons of a disabled number field are dimmed once, with the group, and no longer twice. The
  undo of their own dimming lost to `disabled:opacity-50` in the built stylesheet, so they stood at a
  quarter.
- `app`: the breadcrumb takes the index route of an entry for the page of that entry. Once a page got a
  detail page and its list moved to `<name>.index.tsx`, the breadcrumb on the list was the entry alone, as
  a link to the page it was on.
- `app`: a toast shows. The example app had no `Toaster` at its root, so `toast.add` on a page showed
  nothing; it has one now, and the `TooltipProvider` the docs of the tooltip ask for at the same place.
  The provider gives every tooltip the delay `tooltip.tsx` sets, which is none.
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

# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Example app: asked for a page, a dashboard or an overview, the chat proposes one with the tool of the app
  `app_page_propose`: a title and the parts, each a card with its arguments, which the app checks and the chat
  shows with "Save to my pages" and "Preview". The model composes the recipe and keeps nothing (ADR-0020).
- Example app: "Edit" in the head of a kept page moves its parts up and down and removes one, by hand and with
  no language model; "Undo" in the toast puts a removed part back, and the only part of a page stays.
- Notification card: `genui_notification_list` lists the warnings and errors of one machine over the last hours,
  each with when it was raised, when it was cleared and how long it stood, or that it has not gone, and the chat
  draws them with the notification card.
- Example app: showcases. What is made for one demo or one fair lives in a folder of its own,
  `apps/app/src/showcases/<name>/`, with its pages under `src/routes/(showcases)/`, and is built in only
  where `APP_SHOWCASES` is set. The image `pleiades.playground.app` is the app alone, with nothing of a
  showcase in it; the new image `pleiades.playground.app.showcases` is the same app built with all of
  them, and `APP_SHOWCASES` in `.env` makes the stack take it. A showcase only adds: a test fails when a
  file of the app reads from one or links to one of its pages. `AGENTS.md` and the skills `create-page`,
  `create-card` and `build-your-own` ask whether a thing is base or a showcase
  ([ADR-0018](docs/adr/0018-a-showcase-is-built-in-on-request-and-only-adds.md)).
- Documentation sources: original PDF viewer with paging, zoom and native/OCR page search, retrieved
  through bounded MCP binary resources without adding PDFs to model context.
- Example app: optional documentation MCP tools with clickable, revision-specific manual page sources in chat,
  showing printed page labels alongside differing physical pages. Margo exposes the additional MCP server setting.
- Margo app: Traefik serves the example app over HTTPS as well (setting *HTTPS port of Traefik*, 443), with the
  self-signed certificate it generates itself, and forwards `/mqtt` of that port to the broker's WebSocket, so
  that live values work over HTTPS. HTTP stays as it is.
- Example app: the setting `MQTT_WSS_PATH` sends a page over HTTPS to the broker at that path of the page's
  origin, for a proxy in front of the app that forwards it to the broker.
- SimpleCAM adapter (`simplecam-adapter-9042`): reads the state of the SimpleCAM machine 9042 from the SSE stream
  of the SimpleCAM backend and publishes it to the broker as `machines/united-grinding_simplecam_9042/umati/...`
  after the data model 0.17.1, with the job as the active work master and its progress as a signal of the
  manufacturer, and a change of its list of alerts as events on `events/notifications`. It is optional: it
  starts with the Compose profile `simplecam`, and the setting `SIMPLECAM_SSE_URL` names the stream. It is not
  part of the Margo app.
- Example app: the page `/where-is-my-job`, "Where is My Job?", a basis for discussion of how an order is
  followed across the shop floor. It shows the machines of the stack from above, one machine with its job
  orders done, running and waiting, and one order on its way: every job order that names the same order
  number. The values are those of the stack; programming, packing and the single part on its sheet have no
  source yet and stand on the page as such. The page reads the job orders from the new tool
  `genui_job_order_list` of `genui-mcp`, the job orders on the lists of the machines from the Events API, so
  they stand also after a reload or a reconnect; a job order the planner took back before it ran is left out.
  It is a page of the app with its entry in the sidebar, not a showcase: it shows only values the stack has.
- Sites API (`sites-api`, port 5540): sites with their halls and the machines placed on them, kept in MongoDB.
  REST reads and writes (writing needs `sites:write`), MCP only reads (`sites_site_list`, `sites_placement_list`).
  A placement names its machine by the machine id of the MQTT binding (`machineId`, `/placements/{machineId}`),
  as every other API does.
- Site card: `genui_site_list` in `genui-mcp` lists every site with its machines by hall and state, counted, and
  the machines that send values and stand on no site. It reads the Sites API at `SITES_API_URL`.
- Site card: a machine on no site carries what it does now (`now`), as a placed one does, so a page can keep it
  live.
- Example app: the page Sites (`/sites`) shows where the machines stand, by site and hall. The page of a
  machine moved under it to `/sites/<machine id>`; `/machines/<machine id>` leads there.
- Example app: the setting `APP_MCP_SERVERS` gives the chat the tools of further MCP servers, such as the
  optional Ultimaker service, as `name=address` separated by commas.
- Example app: the button "Tools" in the message field of the chat lists the servers that give the chat
  tools, says whether each one answers, and names its tools. A chat switches a further server off and on
  there; the server of the app gives the model no tool of a server that is off.
- Example app: where no tool answers a question, the chat says that its tools do not show it, not that it
  does not exist, and where a place fits the question names where to ask, such as the maker of the machine
  or the maintenance records.
- Page of a machine: the title switches to another machine, with a search over the serial number and the
  state, and the history of the card covers the last 1, 8 or 24 hours (`?hours=`). The page is wider, with
  room for actions on the right.
- Energy card: `genui_energy_show` says how much energy machines imported over the last 1 to 24 hours, from
  their meters, with mean and peak power; the card draws their power as a graph (`genui_energy_series`).
- Time series card: `genui_timeseries_show` draws any signal of any machine over 15 minutes to 24 hours, a line for each
  pair of a machine and a signal, on two y axes at most; a person changes the range and the lines on the card.
- Live values: the page `/live` of the example app draws a graph for each physical value over the last 15
  minutes, a line for each machine, and shows one machine or all of them. `genui-mcp` has the tools
  `genui_measurement_list`, the newest value of each quantity for every machine with the measurement card,
  and `genui_measurement_series`, the lines of the graphs, which the card file draws below the cards.
- Optional Ultimaker 3 services: CuraEngine slicing over REST/MCP, printer-side header validation,
  current jobs and history with durable slice associations, and a separate MQTT telemetry adapter.
  Both containers are part of the root Compose stack and image-publication workflow, enabled for
  deployment with COMPOSE_PROFILES=ultimaker.
- Optional juice bar service `juicebar-api` (Compose profile `juicebar`, port 5550): the card and the state of
  a machine that runs MixerControl over REST and MCP, an order on request, and its state on the broker below
  `machines/{MachineId}/`, `trumpf_JuiceBar_JUICEBAR-01` by default, with its own values below `oem/JuiceBar/`.
  It never starts the production; `JUICEBAR_ENABLE_ORDERING=false` makes it read-only. `JUICEBAR_SERIAL_NUMBER`
  names its serial number, `JUICEBAR_MANUFACTURER_URI`, `JUICEBAR_MANUFACTURER_NAME` and `JUICEBAR_MODEL` the
  rest of its machine id and its name on the screen.

- Timeseries: API (REST, MCP) and persistence worker (MQTT to API).
- Events: API (REST, MCP) and persistence worker, for notification events.
- Simulator for values, states and notifications of several machines.
- Cutting machines, part of the stack: simulators of a 2D laser, a tube laser and a punching machine that take
  their jobs through telegram files, each with a web page, and one adapter per machine that publishes it to the
  broker by the binding of machines as `trumpf_Laser2D_L-01`, `trumpf_Tube_T-01` and `trumpf_Punch_PU-01`:
  manifest, identification, `State/Status`, channel, feed override, the NC program below `oem/`, and its alarms as
  `Notification.ActiveAlerts` and CloudEvents on `events/notifications`. The web page shows the serial number, and an endless mode writes new
  orders into the plan and refills the stacks, so that a machine produces without anyone at it. They are part of
  the Margo app too, there in endless mode.
- Deployment (`docs/deployment.md`): the workflow "Deploy" starts the stack with `docker compose` on a runner of
  your own, from the images of the commit that was merged into `main`. It is off until the variable
  `DEPLOY_ENABLED` is `true`.
- Shared libraries for logging, JSON, authorization, health checks, MQTT and the MCP server standard.
- Demo stack (`compose.yaml`), contracts and CI.
- Margo app (`margo/`): the demo stack as a Margo application, from the published images, validated,
  packaged and pushed with `bart`. A version tag pushes it to the staging registry with the images of that
  version (workflow "Margo push", called by "Images"); CI validates it when `margo/` changes.
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
  (`/machines/<machine id>`) and in the chat.
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
- Pages in the example application: a page is a recipe, a title and its parts, each part a tool of
  `genui-mcp` with its arguments, kept in the `localStorage` of the browser. Opening a page calls the tools
  again on the server of the app, only those the chat draws, and draws each answer with the card of the
  chat: the values of now, no language model. A page is read once, and its head says as of when; only while
  a part waits for the backend is it read again. A part whose tool the app has no card for stays and says so.
  `/pages` lists the pages of the browser, and is reached through the breadcrumb; a page is renamed, pinned
  and deleted from its head. A pinned page stands in the sidebar on the top level, beside Home, and the
  others stand under it in a group "Pages" that folds, a plain row each, the newest first; with no page to
  list there is no group. Why: ADR-0014.
- "Save as page" under an answer of the chat: it keeps all the cards of the answer, in their order, as a page
  titled with the question, and opens it beside the chat. It needs no language model, the app reads the tool
  calls from the answer it already has, and it stands only under an answer that has ended and for which the
  chat drew a card. The row then says "Saved as page" and links to it. An answer with more than 12 cards keeps
  the first 12 and says so.
- "Share" in the head of a page: a link that carries the recipe, which answers for which machines and hours,
  and no value, in one search parameter of `/pages/open` (at most 8,000 characters). Whoever opens it sees the
  values of now, with no language model and no chat, and keeps the page with "Save to my pages". A link that
  holds no page says so, and a part without a card in that app says so while the rest of the page is whole.
  The links of the app now carry only the search that the page they lead to validates (`search.strict`), so
  the recipe does not follow a person from the page that was opened from a link.
- The page "Charts" (`/charts`) in the example application: how long each machine was in each state over
  the last hours, as stacked bars, and its state over the last 30 minutes, as a step line per machine. One
  server function, `getCharts`, reads the values over one connection, the spans of the last 30 minutes only.
  The charts are the chart of shadcn/ui; `recharts` is new in the app.
- OPC UA adapter `opcua-adapter` in the demo stack on port 5560, a proof of concept, with the TRUMPF OPC UA
  simulator as a machine to try it with (`ghcr.io/umati/trumpf/edge/opc-simulator`). It runs every registered
  OPC UA machine from its registration in the volume `/data` and publishes its values and alarms by the binding
  of machines of the data model 0.17.1, also after a restart. It hosts the read-only tools of the OPC UA MCP library of the OPC Foundation.
  In the chat of the example app, `/discover` scans a server and proposes its registration, which a person
  adds with a button; `/opcua`, `/mapping`, `/rescan` and `/help` list servers, show mismatched and unclear
  mappings and scan again. Machines behind an OPC UA aggregation server (a gateway) are listed by
  `opcua_machine_list`, each with the serial number read on the server, get one registration each, and share
  one session per endpoint. The simulator of the stack runs definition `K09`, machine `A1121O0001`. Known
  mappings: for a namespace whose meaning is fixed the adapter sets an element itself, so far
  `Identification.Model` of a TRUMPF MachineTool instance. A server that wants a user: a person enters user
  name and password in a card of the chat, the adapter tries them and keeps them in its data volume, and every
  session of that server logs in with them; the password never enters the chat. Alarms have a subscription of
  their own, apart from the values: a server built on open62541 refuses ConditionRefresh on a subscription
  that also holds values (`BadFilterNotAllowed`), so such a machine ran no values at all. A refresh that still
  fails is logged, and the machine runs without the catch-up of alarms that already stand.
- OPC UA adapter: a machine in the namespace `urn:umati2:datamodel:opcua`, the data model published one
  variable per element (`s=State.FeedOverride`), is mapped by the adapter itself, also behind the prefix of a
  gateway: identification, `State.FeedOverride` and `OperationCounters.PowerOnDuration` as they are, and the
  item state and the operation mode as the members of the structure `State.Status`, which the adapter
  decodes. An element the server does not fill is moved to `missing`. A machine a server shows twice, in that
  namespace and by the root of its TRUMPF interface, is listed once.
- OPC UA adapter: the core and the profiles of the data model 0.17.1. The core is declared whole, what the
  machine lacks `"available": false`, as the other adapters do; a machine is refused only without
  `Identification.ManufacturerUri`, `.Model` and `.SerialNumber`, the parts of its machine id. The alarms of the
  core come from `alerts`. Of `IdentificationExtended`, `MonitoringExtended`, `ChannelMonitoring`,
  `Spindle` and `EnergyElectricity` only a complete profile, or a complete channel, spindle or measuring point,
  is published; the elements of an incomplete one go to `missing`. The adapter names the profiles itself. The
  proposal card and the list of the added servers in the chat show whether the core is fulfilled and which
  profiles are complete, and the answers carry it as `conformance`.
- OPC UA adapter: removing a machine takes every retained message of it back from the broker, the manifest
  last, so that a new subscriber no longer sees it. While the broker cannot be reached the removal answers `503`
  and the machine stays added. What the stores kept of it stays; deleting it is a pull request of its own.
- OPC UA adapter: it publishes by the binding of machines, with the publisher the Ultimaker telemetry and the
  juice bar use, and one MQTT connection per machine, each with its own last will. A machine is named by its
  machine id, `<manufacturer>_<model>_<serial number>`, formed from the identification its server gave when it
  was added and kept with its registration as `identity`; a registration from before learns it from the first
  values. The manifest declares the complete profiles; `State.Status` is the snapshot of the item state and the
  operation mode; a value of the maker is a signal of the manufacturer below `oem/`; `Connection/State` says
  `Initializing`, `Running`, `CommunicationFault` and `Shutdown`. Numbers are in the units of the catalogue,
  energy in `wattHour`: a registration of version 1 is moved over when it is read (`joule` to `wattHour`, a
  count to `piece`, a year without a unit), and the examples are version 2. The alarms are the list
  `Notification.ActiveAlerts` and the CloudEvents `Notification.AlertRaised` and `AlertCleared`, with the
  category of NE 107 from the severity of OPC UA. An alarm that stood before a restart of the adapter and still
  stands is raised once more in the new run, with its `Id`, so that every run names the alarms that stand. A value of the maker is in the area `oem` of a registration, as
  the namespace level of the binding; a registration that says `vendor` is moved over. `Production.ActiveProgram`
  goes out as `WorkMasterMonitoring.ActiveWorkMaster`, and `Identification.SoftwareRevision`, no element of the
  model 0.17.1, as a signal of the manufacturer. The adapter answers on port 5560 (`OPCUA_ADAPTER_PORT`), since
  5530 is the Ultimaker API; the Margo app has the adapter and the simulator too.
- OPC UA adapter: the scan in the chat reads the descriptions of the nodes. The model reads the `Description`
  attribute of all candidates in one call and uses it to choose between them, to tell what a node of the maker
  means, and as the unit of a node without `EngineeringUnits`. A description that contradicts the element, or
  disagrees with the `EngineeringUnits`, makes the match `Unclear`.

### Changed

- Example app: Home (`/`) shows where the machines stand, by site and hall; "Needs you" keeps what it showed first.
  The tiles of the running machines are gone. `/sites` leads to `/`.
- Cutting simulators: their web pages (ports 5611 to 5613) answer on the network too, not only on this
  computer, as the web UI of the OPC UA simulator does; in the stack and in the Margo app.

- The Ultimaker telemetry and the juice bar publish the payloads and the delivery of the MQTT binding of
  machines, not only its tree, as the simulators do: every value retained with QoS 1 in the envelope
  `{timestamp, value, unit}` with the content type `application/json`, a manifest before the values (profile
  `Core`, what the device lacks `"available": false`, their own signals with the prefix `x-ultimaker-com` and
  `x-trumpf-com`), the snapshot `umati/State/Status` instead of a value on `umati/State/Status/MachineryItemState` (a printer
  state the model has no word for is `OutOfService`),
  `Connection/State` `Initializing`, `Running`, `CommunicationFault` and `Shutdown`, a last will with
  `CommunicationFault`, and the identification with `ProductInstanceUri` and `ManufacturerUri` retained at every
  connect instead of every five minutes. A value goes out when it changes. The machine ids stay
  `ultimaker_UM3_UM3-01` and `trumpf_JuiceBar_JUICEBAR-01`; both adapters form them now by the rule of the binding
  from the web address of the manufacturer (`Config:ManufacturerUri`, `JUICEBAR_MANUFACTURER_URI`), which replaces
  `Config:Manufacturer` and `JUICEBAR_MANUFACTURER`. The Timeseries store keeps the same topics as before. The
  publisher, the rule of the machine id and the last will live in `Pleiades.Playground.Mqtt.Extensions.Machines`
  and the simulator uses them too; `AddClient` of the MQTT client host takes further options, such as a last will.
- `machines/{machineId}/` carries the umati data model 0.17.1 instead of the binding of the playground
  ([`contracts/mqtt`](contracts/mqtt/README.md), ADR-0015; [`contracts/datamodel`](contracts/datamodel/README.md)
  refers to commit `3a799d5`): `umati/Manifest`, `umati/<path>`, `oem/<path>` for the signals of the
  manufacturer, and CloudEvents on `events/jobs`, `events/workmasters` and `events/notifications`, each topic
  counting its own `sequence`. Values carry the units of the model, energy in `wattHour` (ADR-0002). The machine
  id is `<manufacturer>_<model>_<serial number>`, for example `alcyone-machines_AX-400_P-04`.
- Simulator: a virtual machine publishes this tree: snapshots and lists retained; job orders and their results,
  program executions and alerts with their NE 107 severity as CloudEvents, not retained, waiting in a bounded
  outbox while the broker is away; a stack light; `Connection/State` `Initializing`, `Running`,
  `CommunicationFault` and `Shutdown`. The events of the step that ends a `CommunicationFault` go out after
  `Running`; only those of the steps meanwhile are lost. Each simulator of the stack has a scenario of its own
  (`Config:SpecOutput:ScenarioName`: P-04 the default, P-07 `housings`, M-02 `small-parts`) and a made-up
  manufacturer on a domain below `.example`: Alcyone Machine Works (`alcyone-machines_AX-400_P-04`), Taygeta
  Precision (`taygeta-precision_TP-800_P-07`) and Merope Microtec (`merope-microtec_MM-120_M-02`). Its tests
  check every message against the JSON schemas of the model with JsonSchema.Net when a clone of the model lies
  next to the repository or in `UMATI_DATAMODEL_DIR`. The value and notification generators are gone.
- The stack reads this tree. A machine is named by its machine id everywhere: in the stores, the APIs, the MCP
  tools, genui-mcp and the address of its page (`/machines/alcyone-machines_AX-400_P-04`); the app shows its
  manufacturer, model and serial number from the identification.
- Timeseries persistence: subscribes to `machines/+/umati/#`, `machines/+/oem/#` and `sites/+/#`, keeps a value
  with the unit it came with (new in `BaseUnit`: `wattHour`, `piece`, `kilogramPerSecond`), keeps a snapshot
  such as `State/Status` field by field, and keeps no lists, no `null` and no manifest.
- Events: the persistence takes `application/cloudevents+json` from `machines/+/events/jobs`, `…/workmasters`
  and `…/notifications` with QoS 1 in a persistent session (`Config:MqttSource:SessionExpiry`); an event stored
  before (409, delivered again or retried) counts as stored and is logged on Debug. The Events
  API keeps the CloudEvents as they came in one collection `MachineEvent`, unique by `source` and `id`. It serves
  `/machineEvents` (by machine, group, type, correlation id, job order and time) with `/machineEvents/gaps`, `/alerts/active`, `/alerts/pairs` and `/alerts/statistics` (by
  NE 107 severity), `/jobOrders` with `/jobOrders/{mId}/{jobOrderId}`, and `/programExecutions`, and the MCP
  tools `events_machine_events_query`, `events_sequence_gaps_query`, `events_active_alerts_query`,
  `events_alert_pairs_query`, `events_alert_statistics_query`, `events_job_orders_query` and
  `events_program_executions_query`.
- The machine card shows the work master instead of the program, the job order that runs, and alerts with their
  NE 107 severity; a machine whose adapter is not `Running` has no data, since the adapter said so.
- The measurement card and the Ultimaker telemetry follow this tree: the card takes a machine by its machine id,
  labels it with its model and serial number, and reads the bearing temperature below `oem/` (energy shows in
  `Wh`); the telemetry publishes below
  `machines/ultimaker_UM3_UM3-01/` (`ULTIMAKER_SERIAL_NUMBER` instead of `ULTIMAKER_MACHINE_ID`), its signals
  below `oem/Ultimaker/`, `State/Status/MachineryItemState`, the adapter states `Running` and
  `CommunicationFault`, and its identification.
- `app`: Home, the page of a machine, Live values and Charts are live from the broker (ADR-0013). They read what the
  backend knows once, and then hear every value at the broker, MQTT over WebSocket, the moment it is
  published, instead of reading everything again every ten seconds. The browser must reach the broker's
  WebSocket: `MQTT_WS_PORT` at the host of the page, or `MQTT_WS_URL` behind a proxy. The topics of the
  machine card and the measurement card are in their contracts in `@pleiades/cards` (`READING_PATHS`,
  `NOTIFICATIONS_PATH`, `QUANTITY_PATHS`), and `genui-mcp` reads the same ones. They hear the tree of the data
  model: the snapshot `State/Status` field by field, as the store keeps it, alerts as CloudEvents, the job order
  that runs from the retained lists of job orders, and the identification. Values are retained now, so a
  machine a page has not heard of joins only with a sign of life of the last 24 hours, as the backend lists it.
- The juice bar and the Margo app follow this tree. The juice bar publishes below
  `machines/trumpf_JuiceBar_JUICEBAR-01/` (`JUICEBAR_SERIAL_NUMBER` instead of `JUICEBAR_MACHINE_ID`; an
  existing `.env` no longer applies), its own values below `oem/JuiceBar/`, and the adapter states `Running` and
  `CommunicationFault`. The Margo app runs `sites-api` with two settings for its address and port, stores
  `machines/+/oem/#`, and gives each simulator its scenario.
- Simulator: the first events of a start, the first entries of the list of job orders, go out with the first
  connect, so the count of a group begins at 1; a simulator starts once both persistence services have their
  subscriptions.
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
- Stack: the OPC UA simulator runs the image `1.4.0-alpha3` instead of `1.3.1`, still definition `K09`, machine
  `A1121O0001`. That image is built for amd64 only; on arm64, `OPC_SIMULATOR_IMAGE` names another one.
- OPC UA adapter: the example registration of `K09` names the machine in `urn:umati2:datamodel:opcua` and fulfils the core from it,
  with the model `TruMatic 1000 fiber` instead of the serial number the known mapping of the MachineTool instance
  gives; it adds the active program, power, energy and the drive time from the TRUMPF interface. Its channel
  values are no longer published: the simulator has no `RapidOverride`, so `ChannelMonitoring` is not complete.
  The example of `L26` lacks the web address of the manufacturer and is refused.
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
- The chat panel works like a chat app on a phone, a list and a chat with a way back. In a chat the head says
  what the chat is called, on one line and cut where it is too long: its first question, which the head shows
  from the moment it is asked. A button "All chats" at the left of the head leads back to the list. The list
  is the start view, now headed "Chats"; its field begins a new chat. "New chat" is gone from the head of a
  chat, since it led to the same view the way back leads to. Without a language model the head still says
  "Chat". After "All chats" or a chat of the list the focus is on the heading of the view it leads to.
- OPC UA adapter: the endpoint card of `/discover` shows the endpoint the adapter takes in one line, and says
  when the server also accepts sessions without security. The other endpoints are folded behind "n more
  endpoints", since a person cannot choose one there.

### Removed

- arm64: the workflow "Images" builds every image for `linux/amd64` only, and the Margo app asks for an amd64
  device. Some images the stack takes, such as the OPC UA simulator of umati, are built for amd64 only.
- `NotificationEventDtoV1`, its collection, the endpoints `/notificationEvents` and the MCP tools
  `events_notification_*`.
- The libraries `Pleiades.Playground.Events.Generators` and `Pleiades.Playground.Timeseries.Generators`.

### Fixed

- `genui-mcp`: the card files load the `data-*` variants of shadcn, as the example app does, so a part of `packages/ui` that is styled by one, such as a separator, is drawn in them too.
- `app`: the live pages and the chat work on a page opened over plain HTTP at the address of another computer,
  as a demo in a local network is. A browser gives `crypto.randomUUID` only to a secure context, so such a page
  never reached the broker ("not live, no connection to the broker"), and a question asked outside the chat did
  not begin one. The app makes its ids from `crypto.getRandomValues`, which is there in both.
  [`docs/deployment.md`](docs/deployment.md) says what a reverse proxy with HTTPS needs for the live pages:
  a route to the WebSocket of the broker and `MQTT_WS_URL`.
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

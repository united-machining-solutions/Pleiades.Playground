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
- About the name (`docs/name.md`): where the name Pleiades comes from, what it stands for and what it does
  not, how Taurus, Pleiades and this playground relate, and how to write it. `README.md` says it in two
  sentences.
- ADR-0007 records the decisions of the TypeScript part: the three parts and their stack, the harness of the
  example app as the agentic layer, the card as one component in two wrappers, and what a language model
  reads. The layer table in `README.md` names the harness.

### Changed

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
- `app`: the screens are composed as the shadcn/ui docs compose them. In the chat a question is a `Bubble`,
  the tool calls of a stretch are a `Trace`, an error is an `Alert`, and the questions to begin with are a row
  of buttons above the field. Every empty state has its icon. The path of a page is a `Breadcrumb` in the
  header; the page of a machine is titled with the machine. The band of the machine card waits as a
  `Skeleton`, which moved to `packages/cards`.

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

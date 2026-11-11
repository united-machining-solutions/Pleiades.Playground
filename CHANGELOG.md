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
- Example application `playground-app` (TanStack Start, shadcn/ui) in the demo stack on port 5600. Home lists
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

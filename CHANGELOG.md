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
- Example application `playground-app` (TanStack Start, shadcn/ui) in the demo stack on port 5600: an empty shell
  with a liveness endpoint.

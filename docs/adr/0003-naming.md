---
title: "Names: Pleiades.Playground.<Area>.<Part>"
status: accepted
date: 2026-11-10
---

# ADR-0003: Naming

## Decision

- .NET projects, assemblies and namespaces: `Pleiades.Playground.<Area>.<Part>`, for example
  `Pleiades.Playground.Timeseries.Api`.
- Container images: the same name in lower case, `pleiades.playground.timeseries.api`.
- Folders outside `source/`: kebab-case, named after the role, never after a company or a technology.
- MCP tools: `<area>_<subject>_<action>`, lower case with underscores.
- MQTT topics: `machines/{SerialNumber}/umati/<path>`; path segments are written as in the data model.
- Settings: `UPPER_SNAKE_CASE` in `.env`; secrets end in `_PASSWORD`, `_API_KEY` or `_TOKEN`.
- Language: English only.

## Consequences

What leaves the playground drops the `Playground` segment and keeps the rest of its name.

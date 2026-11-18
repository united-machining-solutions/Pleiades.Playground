---
title: Documentation sources and original PDFs in chat through MCP
status: proposed
date: 2026-11-18
---

# ADR-0019: Documentation sources and original PDFs in chat through MCP

## Context

An external documentation service indexes machine manuals. Chat answers need revision-specific filename
and page citations, extracted evidence, and original diagrams and layout. The service is optional and
independently deployed; the app already supports additional MCP servers. Its contract lives under
[contracts/docs](../../contracts/docs/README.md), separate from this repository's MCP server conventions.

## Decision

- Configure the service as `docs` through `APP_MCP_SERVERS`, also exposed as a Margo installation setting.
  The app uses only MCP, with no direct documentation REST, database, embedding key or filesystem access.
- Draw source references through the chat's existing tool renderer registry. Show the returned page label
  and, when different, the physical PDF page. Always navigate using the resource URI's physical page.
- Open sources in a shared shadcn dialog with Original PDF and Extracted text tabs. Read revision-specific
  text through a validated server function and render it as plain text. The browser never chooses an
  upstream URL. Assistant instructions require evidence and page citations.
- Render original PDFs with PDF.js and its bundled worker, opening at the cited physical page. Paging,
  zoom and native text search run locally; `docs_search_document` adds indexed OCR page matches.
- Serve PDF bytes through a fixed backend route that reads MCP metadata and bounded binary resources.
  Validate document identity, revision, resource URI, MIME type, byte intervals and decoded lengths.
  Translate the validated bytes into HTTP PDF responses with single-range support. No PDF bytes enter
  tool output or model context.
- Keep source references out of "Save as page" recipes, which currently execute only against the GenUI
  backend. Machine and measurement cards remain saveable; citations remain readable through MCP.

## Consequences

Telemetry tools remain available without the documentation service. Chat has no upload, processing or
mutation tools for manuals. Docker and Margo need a reachable MCP listener and an accepted Host header;
separate deployments can use the device's host address when the documentation port is reachable there.

Sources remain tied to their returned revision. Missing or replaced originals require a new search.
Original PDFs preserve diagrams and layout; extracted text remains useful for evidence. OCR matches
identify pages, while native PDF text supports highlighting. Large PDFs use bounded resources rather
than one large MCP response. PDF.js and its worker add browser assets.

## Alternatives considered

- Direct REST or file URLs add another service boundary and bypass MCP validation.
- Raw `docs://` browser links cannot read MCP resources.
- Extracted text alone omits diagrams and layout; the source dialog retains both representations.
- Full PDFs in model context consume tokens and obscure the evidence.
- Browser-native PDF embeds do not offer consistent programmatic paging and search.

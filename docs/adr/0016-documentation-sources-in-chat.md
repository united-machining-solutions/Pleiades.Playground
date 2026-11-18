---
title: Documentation sources in chat through MCP
status: proposed
date: 2026-11-17
---

# ADR-0016: Documentation sources in chat through MCP

## Context

An external documentation service indexes machine manuals. Chat answers need verifiable filename and page
citations, with a way to read the evidence. The app already supports additional MCP servers.

## Decision

Configure the service as `docs` through `APP_MCP_SERVERS`. The app uses only its MCP endpoint, with no direct
REST, database, embedding credential or filesystem dependency. Its tools provide search and page reading.
The chat draws references returned by those tools using the existing tool renderer registry. A source
opens a shared shadcn dialog; a validated server function reads the revision-specific page resource through
the configured MCP server. The browser can select only a documentation page URI, never a server URL.
Document text renders as plain text. Assistant instructions require evidence and page citations.

## Consequences

The service stays optional and independently deployed. Existing telemetry tools stay available. Source
references remain tied to the returned revision; unavailable pages require a new search. A Docker client
needs a reachable MCP listener and an accepted Host header. The source view shows extracted text, not the
original PDF layout or diagrams. No automatic processing, uploading or mutation tools are added to chat.

## Alternatives considered

- Calling the documentation REST API would add another integration boundary and bypass MCP.
- A raw `docs://` browser link cannot read an MCP resource.
- A PDF viewer requires original-file resources and a separate viewing implementation.

Documentation source references are chat evidence, not GenUI cards. They are excluded from "Save as page"
recipes, whose execution currently targets only the GenUI backend. Machine and measurement cards remain
saveable. Opening an existing documentation citation continues to read its MCP page resource.

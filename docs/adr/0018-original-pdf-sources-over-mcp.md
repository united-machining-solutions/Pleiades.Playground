---
title: Original PDF sources over MCP
status: proposed
date: 2026-11-18
---

# ADR-0018: Original PDF sources over MCP

## Context

Extracted evidence omits diagrams and layout. Users need to open the original cited PDF, page through it
and search. Communication with the documentation service must remain exclusively through MCP.

## Decision

Add an Original PDF tab to the citation dialog, alongside Extracted text. PDF.js renders the document
locally, opening at the citation's physical page. Its worker is bundled with the app. Page navigation,
zoom and native text search are local; indexed OCR page matches come from docs_search_document.

A fixed backend route reads revision-specific metadata and bounded binary resources from the configured
docs MCP server. It validates document identity, byte intervals, response URI, MIME and decoded length,
and translates base64 resources into HTTP PDF responses with single-range support. The browser cannot
choose an upstream URL. No PDF bytes are returned in tool output or added to model context.

## Consequences

Large manuals work without one large MCP response or a direct documentation REST connection. Replaced
or deleted revisions fail and require a new search. OCR search identifies matching pages, while native
PDF text also supports highlighting. The viewer adds PDF.js and its worker to the browser build.
This extends [ADR-0017](0017-documentation-sources-in-chat.md); source references remain unsaveable as pages.

## Alternatives considered

- Direct file URLs or REST calls bypass the required MCP boundary.
- Full PDFs in model context consume tokens and obscure the retrieved evidence.
- Native browser PDF embeds do not provide consistent programmatic paging and search controls.

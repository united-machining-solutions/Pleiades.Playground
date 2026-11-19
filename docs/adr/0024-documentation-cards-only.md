---
title: Documentation answers use cards exclusively
status: proposed
date: 2026-11-19
---

# ADR-0024: Documentation answers use cards exclusively

## Context

The maintainer has chosen to retire the previous prose/source-list presentation after evaluating the
answer cards. A second presentation and runtime toggle now create ambiguity.

## Decision

Remove the legacy source-list renderer and its standalone tabbed source dialog. Documentation retrieval
tools remain available to the model and visible as activity steps; their raw source lists are not drawn
as answers. Require `docs_answer` for documentation answers. A completed documentation turn without a
valid card shows the existing unavailable card, including older stored source-only turns. No prose
fallback is used for old documentation servers. Ordinary telemetry answers retain their rendering.

Remove the presentation flag from runtime code, chat status, environment examples and Docker/Margo
compose files. An old environment variable cannot disable cards or bypass package scoping. Retain the
shared PDF and extracted-page viewers used by evidence, conflict and warning-source cards.

This amends the presentation/migration decisions in ADR-0019, ADR-0022 and ADR-0023. The existing
[documentation contract](../../contracts/docs/README.md) and verified evidence checks remain in force.

## Consequences

Deploy the updated Playground app. The docs MCP must provide `docs_answer`; no indexing or data
migration is needed. Historical source-only turns cannot acquire a verified card without asking again.
The live `chat-answer` screenshot was not retaken because that invokes the configured language model;
renderer, scope and production-build checks cover the retirement without a model request.

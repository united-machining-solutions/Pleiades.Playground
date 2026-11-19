---
title: Distinct documentation conflict and review states
status: proposed
date: 2026-11-18
---

# ADR-0023: Distinct documentation conflict and review states

## Context

Conflicting requirements may occur across or within any document category, even on the same page.
A single-source answer card cannot represent these cases or distinguish incomplete checks.

## Decision

Extend the [documentation contract](../../contracts/docs/README.md) with `docs_review` and review metadata
on `docs_answer`. The documentation MCP searches topic terms across every current package file and
provides full matching pages, coverage gaps and a short-lived receipt. The existing chat model compares
meaning, scope and conditions. MCP revalidates literal quotes, coverage and source freshness. No new
model key or direct documentation API connection is added to the Playground.

Retain three review states in the contract. Render ordinary answers without a status badge when no
contradiction was found after a completed review. Conflicting requirements and incomplete review remain
explicit through text, icons and structure. Old answers without review data are incomplete. A found conflict is
never hidden by incomplete coverage. Show all verified competing alternatives in responsive source
cards, with independent evidence previews and original PDF navigation. This is an explicit exception
to the ordinary one-evidence design. Suppress the ordinary procedural answer in conflict state.

Warnings remain first and verbatim. Highlight a recommended source only when the service returns a
valid decision and complete review. Rules are comparable maximum intervals or a single manufacturer
prerequisite against customer deviations; otherwise request clarification. Category, date, majority,
document claims and user clicks do not establish approval. No approval workflow is introduced.

## Consequences

Update documentation MCP and the Playground app together. No re-embedding is required. Retrieval is
bounded and lexical, and model judgements do not certify semantic completeness or machine safety.
The earlier source-reference fallback has been retired by [ADR-0024](0024-documentation-cards-only.md); documentation answers now use cards exclusively.

General safety context may require another source page than the procedure. `docs_answer.safetyContext`
provides explicit page/quote references; `warningSources` keeps each displayed warning tied to its own
verified PDF page. These additional citations support safety context, not extra procedure claims.
All safety pages participate in review coverage. Literal validation remains strict and errors identify
the specific field/page. Review terms are individual literal codes/phrases, not joined keyword lists.

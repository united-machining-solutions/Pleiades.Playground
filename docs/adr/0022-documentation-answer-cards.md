---
title: Verified documentation answer cards alongside legacy sources
status: proposed
date: 2026-11-18
---

# ADR-0022: Verified documentation answer cards alongside legacy sources

Presentation retirement: [ADR-0024](0024-documentation-cards-only.md) supersedes the legacy source-list
presentation and runtime toggle described below. Source retrieval and PDF access remain supported.

## Context

The documentation chat needs one answer card with source warnings first, one evidence chip, an inline
preview, and navigation to the original PDF. Existing source references must remain available while
replacement is evaluated. The external documentation server owns extraction and source verification.

## Decision

- Add `DocumentationAnswerCard` and its zod contract to `packages/cards/src/documentation`. Register
  `docs_answer` through the existing GenUI renderer registry. The external docs MCP service produces
  this result; there is no duplicate retrieval implementation in `genui-mcp` and no direct REST call.
- `APP_DOCUMENTATION_ANSWER_CARDS=true` is the default. `false` hides the new tool from the model and
  retains the previous source-reference UI. Existing tools and source dialogs remain implemented.
- In card mode, show one verified result per user turn, including turns spanning multiple assistant
  messages. Suppress duplicate prose and intermediate source lists once the answer card is available.
  A finished documentation turn without a verified result shows a no-evidence card instead of unverified
  instructions. Ordinary telemetry conversations remain on their existing rendering path.
- Require one evidence object, not an array. Preserve content revision, physical page and printed label.
  The external server verifies the literal quote and warning passages against the page and returns
  original wording. Answer prose is still model-authored; lexical checks do not prove semantic grounding.
  Warning-heading detection cannot certify complete safety coverage. The model must read safety context.
- Show the server's warning passages as plain text before the numbered answer, never Markdown rewriting.
  The evidence chip expands inline while chat stays visible. Preview shows title, known chapter/version,
  page, source-category badge and the literal quote. Manufacturer logos are intentionally omitted.
- Missing title metadata falls back to filename. Unknown chapter/version is not fabricated. Manufacturer,
  customer and unclassified sources are distinguished explicitly.
- Reuse the PDF dialog at its revision-specific physical page. Map normalized quote offsets to native
  PDF text spans and mark the passage. Use the same semantic evidence highlight token in preview and PDF.
  Scans without positional OCR receive page navigation and an explicit no-coordinate message.
- An optional `APP_DOCUMENTATION_PACKAGE` pins search and answer calls to one machine's package in
  middleware. Without a fixed package, require a selected/named package before searching; do not guess
  across packages. This is source scoping, not authentication or automatic machine/package registration.
- Keep cards out of saved-page recipes, which currently replay only GenUI backend tools. This changes
  the renderer orchestration as well as the catalogue: it cannot be implemented by a tool registration
  alone because duplicate text and source messages must be suppressed across a complete answer turn.
- Scope this iteration to Playground. No external MCP App HTML bundle is added to the documentation
  server; other hosts continue using the existing text/page tools. This deliberately differs from the
  generic create-card recipe's GenUI-server tool and standalone card-file steps.

## Consequences

Deploy the updated docs MCP service and Playground together for cards, or select the legacy mode.
No language model key is added to the documentation service. Original PDF security and bounded reads
remain unchanged. A live LLM conversation requires separate verification; deterministic tools, renderer
orchestration, and the card/PDF views can be tested without contacting a language model.

Before retiring legacy mode, compare both presentations on the same machine questions: warning coverage
and exact wording, support for each answer step, single-source sufficiency, missing/conflicting evidence,
stale revisions, manufacturer/customer labels, keyboard and screen-reader use, and wide/narrow layouts.
Evaluate native text and scanned PDFs separately. Record observed failures and a maintainer's migration
decision; no automatic retirement date or deletion of legacy code is included.

## Alternatives considered

- Replacing the old renderer immediately removes the comparison and rollback path.
- A second retrieval implementation in GenUI forks the documentation service boundary.
- Model-generated HTML and source URLs bypass trusted rendering and revision checks.
- Marking an entire page on scanned PDFs would imply precision the OCR index cannot provide.

When a package is unknown, `docs_list_packages` discovers package and filename metadata without
content search or embedding requests. A unique document reference or the sole package in a complete
listing can resolve the selection; ambiguous packages require clarification. The content search remains
scoped to that package. An unknown package alone does not mean the document is unavailable.

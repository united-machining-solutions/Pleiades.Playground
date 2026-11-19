# External machine documentation

Configure the external documentation service as `docs=<MCP endpoint>` in `APP_MCP_SERVERS`.
The tools `docs_search`, `docs_read_page`, and `docs_get_guide` are read-only. Search returns
`{hits: [{text, score, source, citation, resourceUri}]}` and page reading returns
`{text, source, citation, resourceUri}`. `source` includes document ID, SHA-256 revision, package,
relative path, physical page, page label, and extraction method. Scores are ranking scores, not probabilities.
The source chip shows the printed `pageLabel` and, when different, the physical PDF page. Navigation uses
the physical page in `resourceUri`; missing labels fall back to the physical page.

The app displays citations from tool results and reads a selected page through MCP `resources/read`.
Only `docs://documents/<64 lowercase hex ID>/<64 lowercase hex revision>/pages/<positive page>`
resources are accepted. The browser chooses no server URL: the app connects only to the configured `docs`
endpoint. Changed or unavailable revisions show an error and require another search. Source text is
rendered as plain text, never as HTML.

For PDF citations, `/api/documentation/pdf` accepts the document ID and revision, never an arbitrary URL.
The backend reads `docs://documents/{id}/{revision}/metadata`, validates identity and PDF metadata, then
reads base64 byte resources at `.../original/{offset}/{length}` with a maximum of 262144 bytes each.
It validates each URI, MIME type and byte length, and serves an HTTP PDF stream with single-range support.
Only the configured `docs` MCP endpoint is contacted; the browser never calls the documentation API.
The full `.../original` application/pdf resource is available for documents up to 8 MiB but is not used by
the viewer. Binary resources never enter model context.

`docs_get_document` returns metadata only. `docs_search_document` returns literal case-insensitive
extraction/OCR page matches (query 1–200 characters), used alongside native PDF text search. The browser
can navigate matching pages; OCR matches have no positional highlight. The chat retains the extracted-text
tab and opens the original PDF at the cited physical page.

The service is optional and independently deployed; the naming and discovery rules for this repository's
MCP servers do not apply to it. See the [app setup](../../apps/app/README.md#machine-documentation-in-chat)
and [Margo configuration](../../margo/README.md#external-mcp-servers).


## Answer cards (additive)

`docs_answer` returns `{kind: "documentation-answer", status, answer: string[], warnings: string[], evidence}`.
For supported answers `evidence` is exactly one object with the normal source fields, `documentType`,
`title`, `shortTitle`, nullable `chapter`/`version`, literal `quote`, citation and resource URI.
The service verifies literal evidence and warning wording against the current revision-specific page.
An unavailable answer has one explanatory paragraph, no warnings and `evidence: null`.
The model supplies only steps supported by the selected source; word matching does not certify semantic
accuracy or completeness of safety information in a manual.

The contract and consumer validation live in
[the catalogue](../../packages/cards/src/documentation/contract.ts). Documentation answers use cards
exclusively, keeping one verified answer per user turn, and
uses a no-evidence card when verification fails. A configured `APP_DOCUMENTATION_PACKAGE` pins retrieval
and final evidence to that machine package. Existing retrieval tools remain available. Card resources are
not replayed as saved GenUI pages, and no standalone MCP App is introduced in this iteration.
See [ADR-0024](../../docs/adr/0024-documentation-cards-only.md) for retirement of the previous presentation.
A contract change needs a linked issue before a pull request is merged.

When a package is unknown, `docs_list_packages` discovers package and filename metadata without
content search or embedding requests. A unique document reference or the sole package in a complete
listing can resolve the selection; ambiguous packages require clarification. The content search remains
scoped to that package. An unknown package alone does not mean the document is unavailable.

## Conflict review

Before `docs_answer`, call `docs_review` with `packageName` and 1–8 topic terms (including source-language
synonyms). The service enumerates every current file, including unclassified files, and searches each
ready PDF's literal text/OCR index (non-PDF extracted pages are read directly) without a category filter or new embeddings. It returns complete
candidate pages, an opaque `reviewId`, and explicit coverage gaps. Include terms for conditions and
prerequisites, not just the requested action. Read and compare all returned pages, including competing
statements on the same page. Different options or a local addition are not necessarily contradictions.
The service bounds reviews to 40 files, 24 matching pages and 100,000 text characters; any exceeded bound,
unprocessed file or failed read makes coverage incomplete. Empty extraction is also incomplete. Search
terms limit recall: complete retrieval is not proof that the package contains no contradiction.

`docs_answer` accepts optional `review: {reviewId?, outcome, explanation, conflicts}`. Outcomes are
`no_conflict`, `conflict`, `incomplete`. A conflict contains `topic`, 2–8 `alternatives` and `resolution`.
Each alternative contains the same revision/page/quote/chapter/version/warnings input fields as the
original evidence plus a short model-authored `statement`. They may share a category, document or page;
identical quoted passages are not distinct alternatives. All sources must belong to the selected package.
For conflict-only calls the primary reference and answer may be omitted: the service uses the first
alternative as its compatibility reference and supplies a neutral summary, hidden in the conflict UI.
Up to six conflicts are supported. Do not omit additional conflicts; use incomplete if bounds are reached.

The service re-reads every cited page, verifies literal passages and collects warnings before rendering.
Review receipts expire after ten minutes and are bounded in memory. Changed inventories, revisions,
classifications or candidate text invalidate coverage. A receipt must include the primary evidence page
and every conflict page. Missing/expired receipts and legacy calls yield `incomplete`, never `no_conflict`.
Semantic relevance, contradiction classification and applicability remain model judgements; the service
verifies source identity and wording, not semantic truth. Documents cannot grant themselves precedence.

Resolution rules:
- `clarification`: no recommendation; explain what must be clarified. User choices do not grant approval.
- `stricter_compatible`: only maximum intervals for the same activity and conditions, explicitly declared
  `sameScope: true` and `compatible: true`, with a common `unit` (`hours`, `days`, `cycles`) and one positive
  numeric `values` entry per alternative. Every number/unit must occur in its literal quote. The service
  selects the smallest unique interval; it does not compare different units, minimum intervals or chemicals.
- `manufacturer_constraint`: only with `sameScope: true`, exactly one manufacturer alternative and all
  others customer alternatives. The model must explain the violated prerequisite. Multiple manufacturer
  sources or unknown source categories require clarification instead.

Incomplete coverage always suppresses recommendations. Source type, dates, author counts and unsupported
approval claims never establish precedence. Conflict output suppresses the ordinary action list: only
competing statements, verified sources, the rule and either a computed recommendation or clarification are
shown. All relevant warnings remain first and verbatim.

Output adds `review: {state, complete, explanation, conflicts}`. Each returned conflict has `topic`,
verified `{statement, evidence}` alternatives and `resolution: {rule, reason, recommendedIndex}`.
`recommendedIndex` is null when clarification is required. A detected conflict remains visible even when
coverage is incomplete; the UI shows both states. Without a detected conflict, incomplete reviews show
only the incomplete state. Old stored answers lacking review metadata display as review incomplete.

## Separately cited safety context

`docs_answer.safetyContext` accepts up to eight document/revision/page/quote references to verbatim
warning passages on other pages. Output `warningSources: [{text, evidence}]` links these warnings to
their own source pages. Each text equals its evidence quote, belongs to the selected package and must
be present in the displayed warnings. Safety pages participate in freshness and review coverage checks.
Older cards without warningSources remain valid. Validation errors name the field and page.
Use separate literal search terms, for example `["3402", "tool breakage", "Werkzeugbruch", "WARNING"]`;
joined multilingual keyword lists do not match a literal phrase search.

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

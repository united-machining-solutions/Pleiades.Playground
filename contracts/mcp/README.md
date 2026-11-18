# MCP tools

Every API is also an MCP server at `/mcp` (streamable HTTP). The tools are the same queries as the REST
endpoints, so an agent and an application see the same data.

Every server offers two discovery tools, `<area>_describe_server` and `<area>_get_skill_guide`. Call them first:
the server is the source of truth for tool names and parameters.

| Server | URL | Tools |
|---|---|---|
| Timeseries | `http://localhost:5500/mcp` | `timeseries_topics_query`, `timeseries_baseunit_query`, `timeseries_string_query`, `timeseries_boolean_query`, `timeseries_statistics_query` |
| Events | `http://localhost:5510/mcp` | `events_machine_events_query`, `events_sequence_gaps_query`, `events_active_alerts_query`, `events_alert_pairs_query`, `events_alert_statistics_query`, `events_job_orders_query`, `events_program_executions_query` |
| Sites | `http://localhost:5540/mcp` | `sites_site_list`, `sites_placement_list`, read-only: placing a machine is REST only |
| Generative UI | `http://localhost:5520/mcp` | `genui_machine_list`, `genui_machine_show`, `genui_measurement_list`, `genui_site_list`, and for cards `genui_span_list` and `genui_measurement_series` |
| Ultimaker (optional) | `http://localhost:5530/mcp` | Profile selection, STL storage, slicing, validation, artifacts and explicit printer pairing/start; see [contract](../ultimaker/README.md) |
| Juice bar (optional) | `http://localhost:5550/mcp` | `juicebar_drinks_list`, `juicebar_drink_get`, `juicebar_status`, `juicebar_order_get`, `juicebar_order_create`; see the [service guide](../../source/Pleiades.Playground.JuiceBar.Api/README.md) |
| OPC UA adapter (proof of concept) | `http://localhost:5560/mcp` | `opcua_server_list`, `opcua_mapping_show`, `opcua_endpoint_rank`, `opcua_machine_list`, `opcua_registration_propose`, and the read-only tools of the OPC UA MCP library of the OPC Foundation as `opcua_ua_*` (`get_endpoints`, `connect`, `disconnect`, `get_connection_status`, `browse`, `browse_next`, `browse_all`, `translate_browse_paths`, `read`, `read_node`, `read_value`, `read_values`). No tool adds or removes a machine: a person does that with the buttons of the cards, over the management API; see the [adapter](../../source/Pleiades.Playground.OpcUa.Adapter/README.md) |

The generative UI server is not an API of its own: it reads the three servers above over REST and returns what
a display needs, each value with the topic or notification it comes from. Its results are answers, not raw
data: the text of a result says in words what the values are, so its tools need no call before them.
`genui_machine_show` links the machine card, the resource `ui://genui/machine`: a host that shows MCP Apps
draws the result with it. What a language model reads of a result is short; a series, such as the states of
a machine over the last hours, is fetched by the card itself with a tool that only a card calls
(`genui_span_list`).

The chat of the example app has the tools of the generative UI server. The setting `APP_MCP_SERVERS` gives it
the tools of further servers of this table, for example `ultimaker=http://ultimaker-api:8080/mcp`: all of
them, under their own names. A server that does not answer has no tools until it does.

Example entry for an MCP client:

```json
{
  "servers": {
    "pleiades-timeseries": { "type": "http", "url": "http://localhost:5500/mcp" },
    "pleiades-events": { "type": "http", "url": "http://localhost:5510/mcp" },
    "pleiades-genui": { "type": "http", "url": "http://localhost:5520/mcp" }
  }
}
```

Rules for tools in this repository:

- Names are `<area>_<subject>_<action>` in lower case with underscores.
- Numbers come from the server, never from the model. Every value carries its source.
- Cards (MCP Apps) are `ui://` resources referenced by `_meta.ui.resourceUri`; they live with the app under `apps/`.

## External machine documentation

Configure the external documentation service as `docs=<MCP endpoint>` in `APP_MCP_SERVERS`.
The tools `docs_search`, `docs_read_page`, and `docs_get_guide` are read-only. Search returns
`{hits: [{text, score, source, citation, resourceUri}]}` and page reading returns
`{text, source, citation, resourceUri}`. `source` includes document ID, SHA-256 revision, package,
relative path, physical page, page label, and extraction method. Scores are ranking scores, not probabilities.

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

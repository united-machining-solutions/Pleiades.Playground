# MCP tools

Every API is also an MCP server at `/mcp` (streamable HTTP). The tools are the same queries as the REST
endpoints, so an agent and an application see the same data.

Every server offers two discovery tools, `<area>_describe_server` and `<area>_get_skill_guide`. Call them first:
the server is the source of truth for tool names and parameters.

| Server | URL | Tools |
|---|---|---|
| Timeseries | `http://localhost:5500/mcp` | `timeseries_topics_query`, `timeseries_baseunit_query`, `timeseries_string_query`, `timeseries_boolean_query`, `timeseries_statistics_query` |
| Events | `http://localhost:5510/mcp` | `events_notification_query`, `events_notification_pairs`, `events_notification_message_stats`, `events_notification_level_distribution`, `events_notification_time_buckets` |
| Sites | `http://localhost:5540/mcp` | `sites_site_list`, `sites_placement_list`, read-only: placing a machine is REST only |
| Generative UI | `http://localhost:5520/mcp` | `genui_machine_list`, `genui_machine_show`, `genui_measurement_list`, and for cards `genui_span_list` and `genui_measurement_series` |
| Ultimaker (optional) | `http://localhost:5530/mcp` | Profile selection, STL storage, slicing, validation, artifacts and explicit printer pairing/start; see [contract](../ultimaker/README.md) |
| Juice bar (optional) | `http://localhost:5550/mcp` | `juicebar_drinks_list`, `juicebar_drink_get`, `juicebar_status`, `juicebar_order_get`, `juicebar_order_create`; see the [service guide](../../source/Pleiades.Playground.JuiceBar.Api/README.md) |

The generative UI server is not an API of its own: it reads the two servers above over REST and returns what
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

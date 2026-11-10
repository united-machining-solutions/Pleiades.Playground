# MCP tools

Every API is also an MCP server at `/mcp` (streamable HTTP). The tools are the same queries as the REST
endpoints, so an agent and an application see the same data.

Every server offers two discovery tools, `<area>_describe_server` and `<area>_get_skill_guide`. Call them first:
the server is the source of truth for tool names and parameters.

| Server | URL | Tools |
|---|---|---|
| Timeseries | `http://localhost:5500/mcp` | `timeseries_topics_query`, `timeseries_baseunit_query`, `timeseries_string_query`, `timeseries_boolean_query`, `timeseries_statistics_query` |
| Events | `http://localhost:5510/mcp` | `events_notification_query`, `events_notification_pairs`, `events_notification_message_stats`, `events_notification_level_distribution`, `events_notification_time_buckets` |
| Generative UI | `http://localhost:5520/mcp` | `genui_machine_list` |

The generative UI server is not an API of its own: it reads the two servers above over REST and returns what
a display needs, each value with the topic or notification it comes from.

Example entry for an MCP client:

```json
{
  "servers": {
    "pleiades-timeseries": { "type": "http", "url": "http://localhost:5500/mcp" },
    "pleiades-events": { "type": "http", "url": "http://localhost:5510/mcp" }
  }
}
```

Rules for tools in this repository:

- Names are `<area>_<subject>_<action>` in lower case with underscores.
- Numbers come from the server, never from the model. Every value carries its source.
- Cards (MCP Apps) are `ui://` resources referenced by `_meta.ui.resourceUri`; they live with the app under `apps/`.

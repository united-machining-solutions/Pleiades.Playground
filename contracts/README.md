# Contracts

The agreed interfaces as files. A service reads and writes data only through one of them, and anyone who keeps
them may bring their own implementation.

| Folder | Agreed interface | Content | Source of truth |
|---|---|---|---|
| `datamodel/` | Data | Technology-independent data model for machine tools: catalogue, JSON schemas, examples | Git submodule of the umati data model project, pinned to a commit. Not licensed by this repository. |
| [`mqtt/`](mqtt/README.md) | Data | MQTT binding: topics, value envelope, units, notifications | This repository |
| [`openapi/`](openapi/README.md) | Interfaces | REST contracts of the Timeseries and Events APIs | The running services (`/openapi/v1.json`) |
| [`mcp/`](mcp/README.md) | Interfaces | MCP tools per server | The running services (`/mcp`, `tools/list`) |

Contracts are versioned on their own and change by pull request with a review from every affected maintainer.

## Fetching the data model

```bash
git submodule update --init contracts/datamodel
```

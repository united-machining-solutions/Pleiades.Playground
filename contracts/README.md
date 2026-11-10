# Contracts

The agreed interfaces as files. A service reads and writes data only through one of them, and anyone who keeps
them may bring their own implementation.

| Folder | Agreed interface | Content | Source of truth |
|---|---|---|---|
| [`datamodel/`](datamodel/README.md) | Data | Reference to the technology-independent data model for machine tools | The umati data model project, pinned to a commit. Not part of this repository and not licensed by it. |
| [`mqtt/`](mqtt/README.md) | Data | MQTT binding: topics, value envelope, units, notifications | This repository |
| [`openapi/`](openapi/README.md) | Interfaces | REST contracts of the Timeseries and Events APIs | The running services (`/openapi/v1.json`) |
| [`mcp/`](mcp/README.md) | Interfaces | MCP tools per server | The running services (`/mcp`, `tools/list`) |

Contracts are versioned on their own and change by pull request with a review from every affected maintainer.

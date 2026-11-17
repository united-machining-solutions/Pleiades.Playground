# REST contracts (OpenAPI)

Each API serves its own description; that document is the contract.

| Service | OpenAPI | Swagger UI |
|---|---|---|
| Timeseries API | `http://localhost:5500/openapi/v1.json` | `http://localhost:5500/` |
| Events API | `http://localhost:5510/openapi/v1.json` | `http://localhost:5510/` |
| Ultimaker API (optional) | `http://localhost:5530/openapi/v1.json` | No Swagger UI; see [service guide](../../source/Pleiades.Playground.Ultimaker.Api/README.md) |
| Juice bar API (optional) | `http://localhost:5550/openapi/v1.json` | No Swagger UI; see the [service guide](../../source/Pleiades.Playground.JuiceBar.Api/README.md) |

Snapshots of both documents will be committed here once the first release is tagged, so that a change to an API
shows up as a diff in review.

```bash
curl -s http://localhost:5500/openapi/v1.json -o timeseries.openapi.json
curl -s http://localhost:5510/openapi/v1.json -o events.openapi.json
```

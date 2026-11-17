# REST contracts (OpenAPI)

Each API serves its own description; that document is the contract.

| Service | OpenAPI | Swagger UI |
|---|---|---|
| Timeseries API | `http://localhost:5500/openapi/v1.json` | `http://localhost:5500/` |
| Events API | `http://localhost:5510/openapi/v1.json` | `http://localhost:5510/` |

The Events API serves notification events (`/notificationEvents`) and production events: `/productionEvents`
with `/productionEvents/correlationPairs` (program executions from start to end), and `/jobOrders` with
`/jobOrders/{mId}/{jobOrderId}` (the last known state of each job order and its history, put together from its
production events; a job order id may contain `/`).

Snapshots of both documents will be committed here once the first release is tagged, so that a change to an API
shows up as a diff in review.

```bash
curl -s http://localhost:5500/openapi/v1.json -o timeseries.openapi.json
curl -s http://localhost:5510/openapi/v1.json -o events.openapi.json
```

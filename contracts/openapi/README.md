# REST contracts (OpenAPI)

Each API serves its own description; that document is the contract.

| Service | OpenAPI | Swagger UI |
|---|---|---|
| Timeseries API | `http://localhost:5500/openapi/v1.json` | `http://localhost:5500/` |
| Events API | `http://localhost:5510/openapi/v1.json` | `http://localhost:5510/` |

The Events API serves notification events (`/notificationEvents`), job events (`/jobEvents`) with the job
orders put together from them (`/jobOrders`, and `/jobOrders/{mId}/{jobOrderId}` with the last known state, its
result included, the history and the program executions of one job order; a job order id may contain `/`), and
work master events (`/workMasterEvents`) with `/workMasterEvents/correlationPairs` (program executions from start
to end). Each type of event takes `POST` and `POST …/bulk`.

Snapshots of both documents will be committed here once the first release is tagged, so that a change to an API
shows up as a diff in review.

```bash
curl -s http://localhost:5500/openapi/v1.json -o timeseries.openapi.json
curl -s http://localhost:5510/openapi/v1.json -o events.openapi.json
```

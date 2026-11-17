# Sites API

Keeps where the machines stand: sites with their halls, and which machine is placed on which site. People enter
these; no machine sends them. The values and notifications of a machine stay in the Timeseries and Events APIs.

- A **site** is a place with a company, a plant (`name`) and its halls. Its `siteId` follows the rules of
  `sites/{SiteId}` in the [MQTT binding](../../contracts/mqtt/README.md): not blank, no `/`, `+` or `#`. It also
  holds no `%` (an encoded `/` in a path stays encoded in ASP.NET Core) and no blank at either end.
- A **placement** puts a machine on a site: serial number, site, hall (one of the halls of the site, or none) and
  a display name (or none). The serial number follows the rules of `machines/{SerialNumber}`. A machine stands on
  one site at most; putting it on another site moves it.

## Start

In the demo stack: `docker compose up -d --build sites-api`. REST and Swagger UI: <http://localhost:5540/>,
OpenAPI: <http://localhost:5540/openapi/v1.json>, MCP: <http://localhost:5540/mcp>. Liveness: `/health`;
diagnosis with MongoDB: `/healthcheck`. Data: database `Sites`, collections `Site` and `Placement`. The port
answers on this computer only unless `SITES_BIND` opens it, because writing needs no sign-in in the demo.

## REST

| Request | Answer |
|---|---|
| `GET /sites` | Every site with its halls, by site id |
| `PUT /sites/{siteId}` | 201 new, 200 changed; 400 invalid; 409 when a hall left out still has machines |
| `DELETE /sites/{siteId}` | 204; 404 unknown; 409 while machines stand on it |
| `GET /placements` | Every machine on a site, by serial number |
| `PUT /placements/{serialNumber}` | 201 placed, 200 moved or changed; 400 invalid, unknown site or hall |
| `DELETE /placements/{serialNumber}` | 204; 404 when the machine stood on no site |

`placedAt` is the time the machine was put on its current site; moving it within the site keeps it.

Every check and the write that follows it run in one MongoDB transaction, so the database must be a replica
set, as the one of the stack is (`rs0`). Putting a machine on a site also writes the site, so removing the site
or dropping the hall at the same moment conflicts, runs again and is refused.

```bash
curl -X PUT http://localhost:5540/sites/north-plant -H 'Content-Type: application/json' \
  -d '{"company":"Demo Manufacturing","name":"North plant","halls":["Hall 1","Hall 2"]}'
curl -X PUT http://localhost:5540/placements/M-02 -H 'Content-Type: application/json' \
  -d '{"siteId":"north-plant","hall":"Hall 2","displayName":"M-02"}'
curl http://localhost:5540/placements
```

## MCP

Read-only: `sites_site_list` and `sites_placement_list` return the same JSON as `GET /sites` and
`GET /placements`, plus `sites_describe_server` and `sites_get_skill_guide`. No tool writes, so a language model
cannot place or remove a machine.

## Authorization

As for the other APIs: with `Config:Auth:Enabled` on, reading needs the role `sites:read` or `sites:write`,
writing needs `sites:write`; a trusted service may use the internal API key. The demo stack runs with auth off.

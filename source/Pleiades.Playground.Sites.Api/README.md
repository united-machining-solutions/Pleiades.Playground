# Sites API

Keeps where the machines stand: sites with their halls, and which machine is placed on which site. People enter
these, on Home of the [example app](../../apps/app/README.md) or here; no machine sends them. The values and notifications of a machine stay in the Timeseries and Events APIs.

- A **site** is a place with a company, a plant (`name`) and its halls. Its `siteId` follows the rules of
  `sites/{SiteId}` in the [MQTT binding](../../contracts/mqtt/README.md): not blank, no `/`, `+` or `#`. It also
  holds no `%` (an encoded `/` in a path stays encoded in ASP.NET Core) and no blank at either end.
- A **placement** puts a machine on a site: machine id, site, hall (one of the halls of the site, or none) and
  a display name (or none). The machine id is the `{MachineId}` of `machines/{MachineId}` in the
  [MQTT binding](../../contracts/mqtt/README.md#machine-id), `<manufacturer>_<model>_<serial number>`, the same id
  the other APIs, the MCP tools and the example app name a machine by. A machine stands on
  one site at most; putting it on another site moves it.
- A placement in a hall may have a **position**: where in the hall the machine stands, on the plan of the hall
  seen from above. It is the middle of the machine, `x` to the right and `y` down, in metre from the upper left
  corner of the plan, each from 0 to 1000. A hall has no size of its own: its plan is as large as the positions
  in it need. The position stays while the machine stays in its hall, and goes when it is moved to another hall
  or site.

## Start

In the demo stack: `docker compose up -d --build sites-api`. REST and Swagger UI: <http://localhost:5540/>,
OpenAPI: <http://localhost:5540/openapi/v1.json>, MCP: <http://localhost:5540/mcp>. Liveness: `/health`;
diagnosis with MongoDB: `/healthcheck`. Data: database `Sites`, collections `Site` and `Placement`. The port
answers on this computer only unless `SITES_BIND` opens it, because writing needs no sign-in in the demo.

## REST

| Request | Answer |
|---|---|
| `GET /sites` | Every site with its halls and its entity tag (`etag`), by site id |
| `PUT /sites/{siteId}` | 201 new, 200 changed, with `ETag`; 400 invalid; 409 when a hall left out still has machines; 412 when a condition does not hold |
| `DELETE /sites/{siteId}` | 204; 404 unknown; 409 while machines stand on it; 412 when a condition does not hold |
| `GET /placements` | Every machine on a site, by machine id |
| `PUT /placements/{machineId}` | 201 placed, 200 moved or changed; 400 invalid, unknown site or hall |
| `DELETE /placements/{machineId}` | 204; 404 when the machine stood on no site |
| `PUT /placements/{machineId}/position` | 200 with the placement; 400 invalid, or the machine is in no hall; 404 when the machine stands on no site |
| `DELETE /placements/{machineId}/position` | 204, also when it had none; 404 when the machine stands on no site |

`placedAt` is the time the machine was put on its current site; moving it within the site keeps it.

A write of a site may name a condition, so that two people who write the same site at the same time do not
overwrite each other unnoticed. `If-None-Match: *` makes the site only if there is none with that id.
`If-Match: "<etag>"` changes or removes it only while it is still the site that was read; `If-Match: *` asks
only that it exists. Where the condition does not hold, the answer is 412 and nothing changes. The tag changes
with the company, the name or the halls of the site. Without these headers a write is unconditional.

Every check and the write that follows it run in one MongoDB transaction, so the database must be a replica
set, as the one of the stack is (`rs0`). Putting a machine on a site also writes the site, so removing the site
or dropping the hall at the same moment conflicts, runs again and is refused.

```bash
curl -X PUT http://localhost:5540/sites/north-plant -H 'Content-Type: application/json' -H 'If-None-Match: *' \
  -d '{"company":"Demo Manufacturing","name":"North plant","halls":["Hall 1","Hall 2"]}'
curl -X PUT http://localhost:5540/placements/merope-microtec_MM-120_M-02 -H 'Content-Type: application/json' \
  -d '{"siteId":"north-plant","hall":"Hall 2","displayName":"M-02"}'
curl -X PUT http://localhost:5540/placements/merope-microtec_MM-120_M-02/position -H 'Content-Type: application/json' \
  -d '{"x":12.5,"y":4}'
curl http://localhost:5540/placements
```

## MCP

Read-only: `sites_site_list` and `sites_placement_list` return the same JSON as `GET /sites` and
`GET /placements`, plus `sites_describe_server` and `sites_get_skill_guide`. No tool writes, so a language model
cannot place or remove a machine.

## Who writes

Home of the example app places a machine on a site, moves it and takes it off, with buttons, from the server of
the app (`SITES_API_URL`); it makes a new site or a new hall where a person asks for one, under the conditions above, and changes or removes
no site otherwise. The app has no sign-in, so whoever reaches the app writes here too, however `SITES_BIND` is
set: opening the app (`APP_BIND`, Traefik of the Margo app) opens placing and removing.

## Authorization

As for the other APIs: with `Config:Auth:Enabled` on, reading needs the role `sites:read` or `sites:write`,
writing needs `sites:write`; a trusted service may use the internal API key. The demo stack runs with auth off. The example app and `genui-mcp` send no credentials, so with auth on, Home
neither reads nor writes the sites.

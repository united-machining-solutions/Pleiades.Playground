---
title: "One read-only gateway for clients outside the stack"
status: proposed
date: 2026-11-18
---

# ADR-0017: One read-only gateway for clients outside the stack

## Context

Clients outside the stack want what the machines do now. The first one is the Oseon WorkstationConnector, which
reads the states of the machines from the Timeseries API and their active alerts from the Events API. Until now
[`compose.yaml`](../../compose.yaml) published both APIs on every address of the computer (`5500`, `5510`), and
both run with `Config__Auth__Enabled: "false"`. With sign-in off, their read and write policies admit everyone,
so whoever reached the computer could also write: values with `POST /timeseries/baseUnitValues`,
`/stringValues` and `/booleanValues`, events with `POST /machineEvents` and `POST /machineEvents/bulk`. The Sites
API, the example app and the juice bar already answer on `127.0.0.1` only, unless a `*_BIND` setting opens them.

Reading is not the same as `GET`: the Timeseries API reads its statistics with a `POST`
(`/statistics/baseUnitValues/topics/{topic}`), because the time windows travel in the body.

## Decision

- **One entry.** A service `gateway`, Traefik (`traefik:v3.7.19`, the image of the Margo app), is the single REST
  entry for clients outside the stack, on one port (`GATEWAY_PORT`, 5590). `/timeseries/...` leads to the
  Timeseries API and `/events/...` to the Events API, each with its prefix stripped. A client takes
  `http://<host>:5590/timeseries` and `http://<host>:5590/events` as the base addresses of the two APIs; the
  paths below them are those of the APIs.
- **An allowlist of method and path, reading only.** The routes are derived from the route groups in
  `source/Pleiades.Playground.Timeseries.Api/Endpoints` and `source/Pleiades.Playground.Events.Api/Endpoints`;
  a request that no route names gets 404 from Traefik and never reaches an API:

  | At the gateway | At the API |
  |---|---|
  | `GET /timeseries/health` | `GET /health` |
  | `GET /timeseries/topics` | `GET /topics` |
  | `GET /timeseries/timeseries/{baseUnitValues,stringValues,booleanValues}/topics/{topic}` | `GET /timeseries/.../topics/{topic}` |
  | `POST /timeseries/statistics/baseUnitValues/topics/{topic}` | `POST /statistics/baseUnitValues/topics/{topic}` |
  | `GET /events/health` | `GET /health` |
  | `GET /events/machineEvents`, `/events/machineEvents/gaps` | `GET /machineEvents`, `/machineEvents/gaps` |
  | `GET /events/alerts/{active,pairs,statistics}` | `GET /alerts/...` |
  | `GET /events/jobOrders`, `/events/jobOrders/{mId}/{jobOrderId}` | `GET /jobOrders`, `/jobOrders/{mId}/{jobOrderId}` |
  | `GET /events/programExecutions` | `GET /programExecutions` |

  The topic of the statistics is one segment, its slashes encoded as `%2F`, so the entry point allows an encoded
  slash. Traefik matches the decoded and cleaned path, so `..` does not lead out of an allowed route.
- **Not through the gateway, for now:** `/mcp` and `/skill`, the OpenAPI documents (`/openapi/v1.json`) and the
  Swagger UI. The MCP tools of both APIs are all read-only today, but an MCP call is a `POST` whose effect the
  path does not show, so the allowlist could not keep a write tool out that someone adds later. The OpenAPI
  documents list the writing operations as well, which the gateway refuses; their description stays where it is,
  on the APIs and in [`contracts/openapi`](../../contracts/openapi/README.md).
- **The APIs no longer answer the network.** `timeseries-api` and `events-api` are published on `127.0.0.1`
  (`TIMESERIES_BIND`, `EVENTS_BIND`), as the Sites API is. The containers of the stack reach them by their
  service names, and tools on the same computer by `localhost`, as before.
- **The gateway answers the network.** `GATEWAY_BIND` is `0.0.0.0` by default: access from other computers is
  what it is for, and it narrows what was open before (reading and writing on two ports) to reading on one.
- **A network boundary, not authorization.** Whoever reaches port 5590 reads every value and every event, without
  signing in. Step 2 is to switch `Config:Auth` on in both APIs and give an outside client a client of its own
  with the read permissions only (`timeseries:read`, `events:read`); the gateway then passes the token through,
  and the allowlist stays as a second line.
- The Margo app gets the same service with the same configuration; CI checks that both hold the same.

## Consequences

- An outside client changes its base addresses to the gateway and nothing else; the Swagger UI and the OpenAPI
  documents stay on the APIs, on the computer of the stack.
- Nothing outside the stack writes values or events over REST any more, unless a `*_BIND` setting opens an API
  again. A new reading endpoint in either API is not reachable from outside until it gets a route in the config
  `gateway`; CI checks the routes against the running stack.
- A browser on another origin cannot call the statistics: its preflight (`OPTIONS`) is not on the list.
- **Open:** the MQTT broker still takes anonymous clients on `1883` and `9001`, on every address, and they may
  publish: whoever reaches the broker can write values and events that the stack stores. Closing it needs
  users at the broker and credentials in every adapter and simulator; that is a decision of its own. The
  generative UI backend (`genui-mcp`, 5520) also stays on every address; its tools only read.

## Alternatives considered

- **Bind the APIs to `127.0.0.1` without a gateway.** Closes writing, but also the reading the WorkstationConnector
  needs.
- **Allow `GET` only.** Simpler, but loses the statistics, the one reading `POST`.
- **Switch sign-in on now instead.** The right second step, but the demo has no identity provider in the stack,
  and every client of the hackathon would need one first.
- **Prefix routing without stripping**, the paths of the APIs as they are (`/topics`, `/alerts/...`). The route
  groups of the two APIs do not overlap today, but nothing keeps them apart; a prefix per API does, and the
  client keeps one base address per API as before.

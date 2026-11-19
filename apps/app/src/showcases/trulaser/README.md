# TruLaser

A cockpit of a TRUMPF laser cutting machine (TruLaser) at `/trulaser`, named as the umati data model 0.17.1
names what it shows. Each card says whether it reads an element of the model (`umati 0.17.1`) or the
extension of TRUMPF (`x-trumpf-com.Dalle`, below `oem/Dalle/`), which fills in only where the model ends.

It is a showcase ([ADR-0018](../../../../../docs/adr/0018-a-showcase-is-built-in-on-request-and-only-adds.md)):
it needs a special device, a machine whose edge component (DALLE) publishes the extension, and none of the
simulators of the stack is one. Only a build with `APP_SHOWCASES` has the page, and nothing outside this
folder and its route, `routes/(showcases)/trulaser.tsx`, knows of it.

## What is where

| File | What it does |
|---|---|
| `contract.ts` | The shapes of the cards, the topics they read, the lanes of the timelines |
| `apis.server.ts` | The readers of the Timeseries API and the Events API it needs, a copy of those of `genui-mcp` |
| `read.server.ts` | Each card and the timelines, read on the server of the app |
| `get-trulaser.ts` | The server functions the page calls |
| `live.ts` | The page, live: the values and events of the broker merged into the cards and the history |
| `trulaser-cards.tsx`, `timelines.tsx`, `condition-guide.tsx` | The cards, drawn with the components of `packages/ui` |

The server of the app finds the data services by `TIMESERIES_API_URL` and `EVENTS_API_URL`, as the generative
UI backend does. A showcase adds no tool to the backend, so the chat has no TruLaser cards; it can still read
any of its topics with the tools of the time series.

## The data

The machine simulator of a TruLaser lives outside this repository: DALLE.Cut with a MOS simulator and a mapper
to the MQTT binding. Its mapper publishes each DALLE ProductionPlanRun as a job order of `JobMonitoring`.
Without such a machine the page says that no TruLaser published.

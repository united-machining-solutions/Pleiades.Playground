---
title: "Live values reach the browser from the broker"
status: proposed
date: 2026-11-17
---

# ADR-0013: Live values reach the browser from the broker

## Context

The pages of the example app that show what machines do now (Home, the page of a machine, Live values, Charts) read
everything again every ten seconds: the server of the app asked `genui-mcp`, which asked the Timeseries and
Events APIs, for the whole picture, the past hours included. A value was up to ten seconds old before a page
showed it, and every open page cost a full read of the stored values every ten seconds. A selectable shorter
interval would make the first faster and the second worse.

Every value already passes the broker before it is stored, and the broker publishes MQTT over WebSocket
(`MQTT_WS_PORT`, 9001). Dataverse, the data science frontend, reads its live data the same way.

## Decision

Live values are not pulled. A page reads once, through its loader, what the backend knows: what held when
it was opened, and the history before it. From then on the browser subscribes at the broker, MQTT over
WebSocket, to the topics the page shows, and lays every value onto what it read, by the rules the backend
reads the stored values with. The clock of the page moves on locally, by the clock of the server, which
the page reads once: a machine without a sign of life for `SILENT_AFTER_SECONDS` has no data, and a history
keeps its length and rolls on to now. A value stamped further ahead of that clock than `AHEAD_MS` is left
out, as the backend, which reads stored values up to now, would not show it yet either.

- The code of the app only subscribes; it never publishes. The broker does not hold a client to that: its
  WebSocket listener takes anonymous publishes, as it did before this decision.
- The topics come from the contracts: `READING_PATHS` and `NOTIFICATIONS_PATH` of the machine card,
  `QUANTITY_PATHS` of the measurement card. The backend reads the same paths in the store. Since the tree of
  machines follows the data model ([ADR-0015](0015-the-binding-of-machines-follows-the-data-model.md)), the
  broker and the store differ in three places, and the page reads the message as the store keeps it: a
  snapshot such as `State/Status` is one message at the broker and a value per field in the store; the job
  order that runs comes from the retained lists of job orders, which say what the views of the Events API
  say; and an alert is a CloudEvent, raised, changed and cleared by its id.
- Values are retained at the broker, so the last values of a machine that is long gone still stand there. A
  page takes a machine it has not heard of only with a sign of life of the last 24 hours, as the backend
  lists one.
- A page reads from the backend again in two cases only: after the connection to the broker was lost, for
  what it missed, and while the backend has not answered.
- The browser finds the broker at the host of the page and `MQTT_WS_PORT`, or at `MQTT_WS_URL` where the
  broker stands behind a proxy. On a page over HTTPS, `MQTT_WSS_PATH` names a path at the origin of the page
  instead, which the proxy that serves the page forwards to the broker.

## Consequences

A value shows the moment it is published, and an open page costs no reads. The browser now talks to a
second service besides the server of the app: whoever reaches the app must also reach the WebSocket of the
broker, which the demo stack publishes without sign-in (see `stacks/broker/mosquitto.conf`). A WebSocket is
not held back by the same-origin rule, so any other page open in the same browser can reach the broker too,
and publish to it. A listener that only lets the WebSocket read (an ACL of `topic read machines/#` on port
9001, while 1883 stays as it is) closes that; it is a change of the stack of its own. A deployment behind
TLS needs the broker behind the same proxy, `wss://`, named in `MQTT_WS_URL`.

Each live page states a part of the rules of the backend a second time, in `apps/app/src/live/`: how a run of
a value goes on, when a machine is silent, how a line of a graph holds its value. Its tests name the rules,
and a change to the rules in `genui-mcp` has to be made there too. A page shows "not live" while it does not
hear the broker, and its values then stand as they were.

## Alternatives considered

- A shorter interval, or one a person chooses: values stay late, and the reads grow with every open page.
- The server of the app subscribes and passes values on to the browser (server-sent events): the browser
  talks to one service only, but the app gets a stateful relay of its own for what the broker already does.
- `genui-mcp` gets a subscription of its own: the MCP tools answer questions; keeping a page up to date is
  not one.

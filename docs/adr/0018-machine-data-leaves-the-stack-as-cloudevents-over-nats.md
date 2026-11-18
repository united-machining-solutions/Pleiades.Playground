---
title: "Machine data leaves the stack as CloudEvents over NATS"
status: proposed
date: 2026-11-18
---

# ADR-0018: Machine data leaves the stack as CloudEvents over NATS

## Context

Everything the stack knows about machines and places passes the MQTT broker first
([contracts/mqtt](../../contracts/mqtt/README.md)). Software outside the stack that speaks NATS, such as a factory
message bus with JetStream, could not read it without an MQTT client of its own, and would then have to know the
topics, the value envelope and which messages are events.

## Decision

A service of its own, `nats-bridge`, reads the broker as the persistence services do and sends every message of the
MQTT binding on to a NATS server, one CloudEvent 1.0 in structured mode per message
([contracts/nats](../../contracts/nats/README.md)).

- The subject is a configurable prefix and the levels of the MQTT topic, every `/` a `.`. A NATS reader selects as
  an MQTT reader does, with `*` for `+` and `>` for `#`.
- An event is a CloudEvent on the broker already: it goes on byte for byte. A value, the manifest and a value of a
  place are wrapped: their envelope, unchanged, is the `data` of a CloudEvent of the bridge. Its `id` is a hash of
  topic and payload, so a retained value handed over again keeps its id.
- With JetStream the bridge waits for the acknowledgement and sets `Nats-Msg-Id`, made of `source` and `id` for
  an event; plain core NATS is a setting.
- A message is acknowledged to the MQTT broker only when its handling ends. While NATS is away the bridge waits, and
  the broker keeps what follows in the session of the bridge.
- The NATS server is not part of the stack. The bridge is an optional profile (`nats`), by default against a server
  on the same computer, and every part of the connection (address, prefix, sign-in, TLS) is configurable.
- No unit is converted (ADR-0002).

## Consequences

NATS readers get the whole picture without knowing MQTT, and the format of an event stays the one the data model
asks for. The bridge is one more consumer of the broker: a change to the MQTT binding is a change to
`contracts/nats` too. The bridge has no outbox: during a long NATS outage the queue of the MQTT broker is the
buffer, and beyond its bound the broker drops; for events the gap shows in `sequence`. Retained values come again at every connect of the
bridge, which a stream with a duplicate window absorbs only within that window.

## Alternatives considered

- Every adapter publishes to NATS too: each adapter would need a second client and its own retries.
- A NATS server with an MQTT listener in place of Mosquitto: the stack would depend on one broker product, and the
  subjects would follow that product's mapping, not a contract of this repository.
- Every message wrapped, events included: a reader of events would have to unwrap twice, and the CloudEvent the
  model asks for would no longer be the one on the wire.
- A Dapr sidecar for publishing: one more container and a runtime of its own for what one client library does.

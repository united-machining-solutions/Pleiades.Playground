# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Timeseries: API (REST, MCP) and persistence worker (MQTT to API).
- Events: API (REST, MCP) and persistence worker, for notification events.
- Simulator for values, states and notifications of several machines.
- Shared libraries for logging, JSON, authorization, health checks, MQTT and the MCP server standard.
- Demo stack (`compose.yaml`), contracts and CI.

### Changed

- MQTT: MQTTnet 5 replaces MQTTnet 4. MQTTnet 5 ships no managed client, so `Pleiades.Playground.Mqtt.Extensions`
  now carries its own `ManagedMqttClient`: it reconnects every 10 s, subscribes again on every new connection
  and queues outgoing messages while there is none. Topics, payloads and content types on the broker are
  unchanged.

# Pleiades Playground

An open playground for machine data. Three simulated machines publish their values to an MQTT broker; services
store them as time series and events in MongoDB and offer them over REST and over the Model Context Protocol
(MCP), so applications and AI agents use one set of tools. An example app shows the machines on pages and in a
chat.

**Status: playground.** Interfaces may change without notice. Do not run this in production.

## After the installation

- The example app answers on port 5600 of the device, and through Traefik on port 80 under the host names you
  set. By default both answer on the device only: set *Address of Traefik* to `0.0.0.0` to open the app to the
  network under its host names, or *Address of the example app* to open port 5600. The chat has no sign-in and
  spends the key of its language model, so open it only to a network you control.
- The chat needs a language model: set the URL and the key of a LiteLLM gateway, which can reach Anthropic,
  OpenAI and models of one's own. Everything else works without one.
- The MQTT broker (1883, WebSockets 9001) accepts anonymous clients.

## Source

<https://github.com/united-machining-solutions/Pleiades.Playground>, under the Apache License 2.0.

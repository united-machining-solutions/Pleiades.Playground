# Pleiades Playground

An open playground for machine data. Three simulated machines publish their values to an MQTT broker; services
store them as time series and events in MongoDB and offer them over REST and over the Model Context Protocol
(MCP), so applications and AI agents use one set of tools. An example app shows the machines on pages and in a
chat.

**Status: playground.** Interfaces may change without notice. Do not run this in production.

## After the installation

- The example app answers on port 5600 of the device. By default it answers on the device only; set
  *Address of the example app* to `0.0.0.0` to open it to the network.
- The chat needs a language model: set an OpenAI key, an Anthropic key, or the URL and key of an
  OpenAI-compatible endpoint. Everything else works without one.
- The MQTT broker (1883, WebSockets 9001) accepts anonymous clients.

## Source

<https://github.com/united-machining-solutions/Pleiades.Playground>, under the Apache License 2.0.

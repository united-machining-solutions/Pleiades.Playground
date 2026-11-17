---
title: "Headless Ultimaker 3 slicing and explicit print operations"
status: proposed
date: 2026-11-16
---

# ADR-0012: Headless Ultimaker tool service

## Context

A local Ultimaker 3 should be usable through MCP and REST from STL to reviewed G-code and an explicit
print request. The repository already provides .NET MCP discovery, authorization and health libraries.
The device's firmware 5.3.0 starts printing when a file is uploaded, so upload cannot be treated as staging.

## Decision

Keep the application in .NET and reuse those libraries. Run CuraEngine as a subprocess in the same
optional container, with matching pinned Cura 4.13 data and an explicitly configured PLA / left AA 0.4
profile. Do not evaluate Python expressions or promise desktop-profile parity. Expose profile IDs,
bounded SI settings and immutable hashed artifacts. G-code is the Cura layer-preview artifact.

Separate offline slicing from printer pairing/start. Pairing is explicit and needs display approval;
Digest secrets remain in a private volume file. Start requires configuration opt-in and preflight.
Never retry an upload automatically. Publish the API contract before the implementation.

Validate model dimensions and explicit nozzle movements against the travel envelope and plate-clip
exclusions. State that this is not whole-head collision simulation or proof of printability.

## Consequences

The demo's ordinary start needs no physical printer. The discussion is
[issue #117](https://github.com/united-machining-solutions/Pleiades.Playground/issues/117). Existing telemetry and UI remain independent.
CuraEngine and data have their own licences and notices, retained in the image. Runtime libraries for
the pinned engine are private to its subprocess. An administrator manages artifact retention.

## Alternatives considered

- Cura desktop in a virtual display: more dependencies and UI lifecycle, but full desktop-profile evaluation.
- A third-party MCP wrapper: would add another application runtime instead of reusing the .NET libraries.
- A service that auto-uploads after slicing: would start a physical print before the artifact is reviewed.

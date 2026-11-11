---
title: "The data model is a submodule, the binding is ours"
status: superseded
date: 2026-11-10
superseded-by: 0006
---

# ADR-0005: Data model as a submodule

## Context

The technology-independent data model for machine tools is developed in its own repository by another working
group. Its licence is not decided, its descriptions come from OPC UA Companion Specifications, and the draft
changes often.

## Decision

`contracts/datamodel` is a Git submodule pinned to a commit of that repository. Nothing from it is copied into
this repository. The MQTT binding in `contracts/mqtt` is maintained here and names every deviation from the
model.

## Consequences

- A new version of the model arrives as a one-line pull request that moves the pin.
- The services follow the model for topics and units and do not implement it completely.

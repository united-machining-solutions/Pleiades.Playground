---
title: "The data model is referenced by a pinned commit, not a submodule"
status: accepted
date: 2026-11-10
supersedes: 0005
---

# ADR-0006: Data model by reference

## Context

[ADR-0005](0005-data-model-as-submodule.md) made the data model a Git submodule. The repository of the model is
not reachable without access, so every clone that includes submodules fails: for a reader without access and for
tools that clone recursively, such as the dependency updates for NuGet. No service or test reads the model at
build time; it is a reference for the MQTT binding.

## Decision

`contracts/datamodel` holds a README that names the repository, the branch, the commit and the version of the
model this repository follows. Nothing from the model is copied into this repository. The MQTT binding in
`contracts/mqtt` stays here and names every deviation from the model.

## Consequences

- The repository clones completely without access to the model.
- A new version of the model arrives as a pull request that changes the pinned commit in the README.
- The model is no longer part of a checkout; whoever needs it clones it next to this repository.
- Once the model is public, a submodule can come back with a new ADR.

## Alternatives considered

- Keep the submodule: clones with submodules keep failing until the model is public.
- Copy the model into this repository: its licence is not decided, and it belongs to another working group.

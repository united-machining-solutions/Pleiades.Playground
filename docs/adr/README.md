# Architecture Decision Records

Short records of decisions that shape the repository, in abbreviated MADR form
(Context, Decision, Consequences, Alternatives considered).

- Numbering starts at `0001`, increases monotonically and is never reused. Files are `NNNN-kebab-title.md`.
- Write one at a design fork: layout, contracts, tooling, licence. Not for day-to-day edits.
- A proposal stays `proposed` until the maintainers accept it.

| ADR | Title | Status |
|---|---|---|
| [0001](0001-monorepo-layout.md) | Monorepo layout: `source/`, `apps/`, `packages/`, `contracts/` | accepted |
| [0002](0002-si-units-joule-and-one.md) | SI units on the wire: energy in joule, fractions in `one` | accepted |
| [0003](0003-naming.md) | Names: `Pleiades.Playground.<Area>.<Part>` | accepted |
| [0004](0004-licence-and-contributions.md) | Apache-2.0, CC BY 4.0 and DCO | accepted |
| [0005](0005-data-model-as-submodule.md) | The data model is a submodule, the binding is ours | accepted |

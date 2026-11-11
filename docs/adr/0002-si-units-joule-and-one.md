---
title: "SI units on the wire: energy in joule, fractions in one"
status: accepted
date: 2026-11-10
---

# ADR-0002: SI units on the wire

## Context

A value that says "length" without saying millimetre or metre cannot be converted safely by an application that
reads a machine of another manufacturer. The same holds for percentages (120 or 1.2) and energy (Wh or J).

## Decision

Every numeric value is transported and stored in its coherent SI unit, and the unit is named with the value.
There is exactly one unit per quantity:

- energy in `joule`, not watt hours;
- ratios, percentages and counts as fractions with the unit `one` (1.0 = 100 %);
- the full list is in [`contracts/mqtt`](../../contracts/mqtt/README.md) and in the `BaseUnit` type.

Displays convert to what people are used to (millimetre, 1/min, bar, percent, kWh). Services never do.

## Consequences

- No value is ambiguous; statistics and comparisons need no conversion table.
- Adapters convert once at the source and must know the unit of every signal.
- The data model referenced in `contracts/datamodel` lists energy in watt hours; the binding documents the deviation.

## Alternatives considered

- **Quantity instead of unit** (`Energy`, `Length`): leaves the unit open, which is the problem to solve.
- **Unit per signal chosen by the adapter**: every consumer needs a conversion table.

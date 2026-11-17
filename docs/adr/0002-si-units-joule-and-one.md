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
- The data model referenced in `contracts/datamodel` lists energy in watt hours.

## Amendment (2026-11-17)

Machines below `machines/` follow the data model exactly, its units included: energy in `wattHour`, and the
unit named by the catalogue ([ADR-0015](0015-the-binding-of-machines-follows-the-data-model.md)). The services do
not convert machine data either: the Timeseries and Events stores keep a value of a machine with the unit it came
with (`wattHour`, `degreeCelsius` …), and the APIs serve it so; converting is the matter of the display. Two
machines that deliver one quantity in two units would need a conversion in whoever compares them; the catalogue
of the data model gives one unit per quantity, so they do not. This decision applies only to values about a
place below `sites/`, which keep their coherent SI units; that services never convert holds without exception.

## Alternatives considered

- **Quantity instead of unit** (`Energy`, `Length`): leaves the unit open, which is the problem to solve.
- **Unit per signal chosen by the adapter**: every consumer needs a conversion table.

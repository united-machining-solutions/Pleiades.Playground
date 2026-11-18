---
title: "The words of a tool result may name the unit people use"
status: proposed
date: 2026-11-18
---

# ADR-0017: The words of a tool result are a display

## Context

[ADR-0002](0002-si-units-joule-and-one.md) keeps one unit per quantity on the wire and lets only a display
convert. [ADR-0015](0015-the-binding-of-machines-follows-the-data-model.md) keeps the units of the data model for
machines, energy in `wattHour`, and says the same: stores and APIs keep a value as it was delivered, a display
converts.

A tool of `genui-mcp` returns two things: the values of a card, and a few lines of words that a language model
reads and passes on to a person. The values are data. The words are what the person reads, through the model. If
the words named only the unit on the wire, the model would convert the number itself, and
[`contracts/mcp`](../../contracts/mcp/README.md) rules that out: numbers come from the server, never from the
model. The energy card (`genui_energy_show`) is the first tool that needs it: a person asks for kilowatt hours,
and a meter counts watt hours, or joule for older values.

## Decision

- The words of a tool result are a display. They may name a value in the unit people use, such as kilowatt
  hours for energy, next to the values of the result.
- The values of the result keep the unit they came with, as ADR-0002 and ADR-0015 want. Nothing on the wire, in a
  store or in an API is converted.
- The conversion lives with the wording, in the cards package, where the card converts for its own display. The
  guide of the tool tells the model to pass the words on and to convert no number itself.
- A value as it was published, such as the reading of a meter in `genui_measurement_list`, keeps its unit in the
  words too. The exception is for answers that people read in another unit, not for raw values.

## Consequences

- [AGENTS.md](../../AGENTS.md) names the exception next to "Never invent or convert units".
- A tool that converts in its words names the unit of its values in its contract, so that nobody reads a value in
  the unit of the words.
- ADR-0002 stays as it was accepted; this record amends it, as the index says.

## Alternatives considered

- **Words in the unit on the wire only:** the language model converts, against the rule that numbers come from
  the server.
- **Values in kilowatt hours:** converts on the wire, against ADR-0002 and ADR-0015.

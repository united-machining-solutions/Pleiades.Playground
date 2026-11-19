---
title: "The chat proposes where a machine stands, and the person writes it"
status: proposed
date: 2026-11-19
---

# ADR-0026: The chat proposes where a machine stands, and the person writes it

## Context

Home adds machines to sites and halls, moves them and makes sites and halls, through server functions of the app
against the REST endpoints of the Sites API, with conditional writes and an undo. The MCP tools of the Sites API
read only: placing a machine is REST only ([`contracts/mcp`](../../contracts/mcp/README.md)).

People also ask the chat for it: "add my new MFP 20", "put P-07 in North plant, Hall 2", "create a site East
plant". A language model hears a name, not an id; it does not know the sites; and it is not the one who should
change where a machine stands. [ADR-0020](0020-the-language-model-composes-a-page-and-nothing-else.md) gave it one
tool of the app that proposes and keeps nothing, and the person presses the button.

## Decision

- The language model gets a second tool of the app, `app_placement_propose`. It takes the machines as the person
  named them, each by its id, by a name, or as a name with the manufacturer, model and serial number the person
  said; and the site and the hall as the person said them, or none. It runs on the server of the app, checks the
  proposal against `genui_site_list`, writes nothing, and gives back what the model sent, the check and a sentence
  to pass on.
- The model calls it at once with what the person said and asks nothing in words: the card asks.
- The chat draws the result as one card that leads the person to what is missing, one step at a time. For a name
  that is no machine it offers the machines of a similar name to tap, or asks for the manufacturer, model and
  serial number, of which the app makes the id by the rule of the binding
  ([ADR-0015](0015-the-binding-of-machines-follows-the-data-model.md)). Then it asks where, with the fields of
  site and hall that Home has. A step that is done is one line, and a click opens it again.
- Only the button of the card writes, through the same server functions as Home, with its conditional writes and
  its undo. A site or a hall alone is the same card, without the step of the machine.
- What a person confirmed is noted in the browser by the id of the tool call, so the card says it after a reload
  instead of offering it again. Without the note, the card reads the sites and says that there is nothing left to
  do.
- The parts of the card are building blocks of `src/sites/`, shared with Home; the chat only puts them together.

## Consequences

- No contract changes: the tool belongs to the app, as `app_page_propose` does, and the Sites API is written as
  before, over REST from the server of the app.
- A machine is never placed in place of another: a name that fits no machine stays that name until the person
  taps a machine or says what it is.
- Whether a model calls the tool when it should is up to the model and its instructions. The tests cover the
  check, the id and what the card starts with, not what a model does.
- A machine that sent no data is added with the id made of what the person said, and shows "No data" until it
  sends under that id.

## Alternatives considered

- **The model asks in words first, then proposes a complete placement.** Tried: the answers were long, the person
  typed what a tap could say, and a model that guessed an answer placed the wrong machine.
- **A tool that writes.** The model would change where a machine stands by itself. The person does, as on Home.
- **Tools of the Sites API that write.** They would need a contract and a sign-in, and every host of the MCP
  servers would get them.

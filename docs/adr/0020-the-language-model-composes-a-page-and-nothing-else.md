---
title: "The language model composes a page, and nothing else"
status: proposed
date: 2026-11-18
---

# ADR-0020: The language model composes a page, and nothing else

## Context

Since [ADR-0014](0014-a-page-from-the-chat-is-a-recipe-kept-in-the-browser.md) a page is a recipe kept in the
browser, and "Save as page" reads it from an answer of the chat: the question as its title, and as its parts
the cards the model happened to draw in that one answer. A person who asked the chat "make me a page about X"
got no page: the model had no tool for that, and it said so, as its instructions tell it to say what its tools
do not show. Without a tool call the chat drew no card, and without a card there was no "Save as page".

A page should still be what ADR-0014 makes it: a title and the parts in their order, each a tool of
`genui-mcp` with its arguments, no value and no sentence of the model, kept by the person in their browser.

## Decision

- The language model of the chat gets one tool of the app itself, `app_page_propose`. It is named as the tools
  of the stack are, `<area>_<subject>_<action>`, with the app as its area.
- Its input is a recipe: a title, and the parts in their order, each a tool and its arguments. The model
  composes it and writes no value. The tool gives back the recipe as the app checked it, and each part it left
  out with the reason.
- The tool runs on the server of the app, in the harness of the chat, and calls nothing and keeps nothing. A
  part stays if a page can call its tool, an entry of the chat's list with `draw` that is neither for a card
  only nor for the chat only (`drawingTool`), and if its arguments keep the schema of a part. A time
  zone among them is dropped. A part the same as one before it, and every part beyond twelve, is left out. With
  no part left, or a title without a word, the call fails, and the model reads why.
- The tools a page can call are read from the chat's list into the description and the schema of the tool, so
  a new card is offered without another line of code.
- The chat draws the result as a proposal: the title, the parts in words, "Save to my pages" and "Preview".
  Keeping goes through `savePage`, as "Save as page" does. "Preview" opens the recipe at `/pages/open`, where a
  shared link opens: there is no second preview.
- The proposal is no part of a page. The tool is marked `saveAsPage: false` in the chat's list, as the
  source references of the manuals are ([ADR-0019](0019-documentation-sources-in-chat.md)): the chat draws its
  result, a page never calls it, and "Save as page" does not keep it.
- The instructions of the model say that it cannot keep a page, that it finds out with its tools what there is
  to show before it proposes one, that a machine id comes from a tool result, and that it says what was asked
  for that no part of the page shows.

ADR-0014 holds as it stands: a page is a recipe in the browser, it keeps no value, and opening it calls the
tools again.

## Consequences

- A person who asks for a page, a dashboard or an overview gets one composed of the cards there are, and keeps
  it or not. What no card shows, the model says in words.
- The title is the one text of the model a page keeps. It is a name, which the person sees before keeping the
  page and can rename after.
- The app checks the names of the tools and the shape of the arguments, not what the arguments mean. A part
  with an argument the tool does not take, or with a machine the backend does not know, says so when the page
  is opened; "Preview" shows it before the page is kept.
- A card whose tool a page cannot call is marked `saveAsPage: false` as well, and is then offered as no part. The cards
  of the OPC UA adapter are such: a page asks the generative UI backend alone, which has no `opcua_*` tool.
- A card names the parts of a proposed page with `part` in the chat's list, a few words. A card without it is
  named by its tool.
- An answer that proposes a page and drew cards also has "Save as page" under it, which keeps those cards
  titled with the question.
- Whether a model calls the tool when it should is up to the model and its instructions. The tests cover the
  check and what the chat draws, not what a model does.

## Alternatives considered

- **A tool of `genui-mcp`.** The backend answers for displays and knows nothing of pages; other hosts of the
  backend have none. The page is the app's, and so is the tool.
- **A tool that runs in the browser and keeps the page.** The model would keep a page by itself. A page is
  the person's to keep, so the model proposes it, and the person presses the button.
- **The model writes the page into its answer, and the app reads it from the text.** Nothing would tell the
  model what was wrong with it, and a part would fail only when the page is opened.
- **Check every part by calling its tool.** It would catch a machine the backend does not know before the page
  is kept, at the cost of a round to the backend for every proposal. "Preview" does that when the person asks.

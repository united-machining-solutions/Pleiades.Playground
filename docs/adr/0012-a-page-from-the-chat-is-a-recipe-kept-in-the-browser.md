---
title: "A page from the chat is a recipe, kept in the browser"
status: proposed
date: 2026-11-17
---

# ADR-0012: A page from the chat is a recipe, kept in the browser

## Context

A person asks the chat of the example application something, and the answer is worth seeing again: every
morning, without asking again. The answer has two kinds of content. The cards come from the results of tool
calls of `genui-mcp`, and the app draws them itself ([ADR-0007](0007-generative-ui-in-typescript.md)). The
words are the language model's, and they hold the numbers of the moment they were written.

The example application has no sign-in: its agent harness runs with open access, and the demo stack keeps no
data of a person. A page has to work without a language model and without a key, as the page of a machine
does.

## Decision

- A page is a **recipe**: a title, and the parts of the page in their order, each part one tool of
  `genui-mcp` with its arguments. It keeps no value and no sentence of the language model. A stored page
  adds an id, whether it is pinned, when it was saved, and a version, 1 for now.
- Opening a page calls the tool of each part again, on the server of the app, and draws the result with
  `draw` of that tool in the list of the chat (`apps/app/src/chat/cards.tsx`): the same card as in the
  chat, with the values of now.
- The server calls only a tool the chat draws: an entry with `draw` that only a card does not call. Any
  other name is refused before anything is called. The arguments keep no time zone; the app adds the one of
  the browser that opens the page, as the chat does.
- A part whose tool the app has no card for, or whose call gets no answer, stays where it is and says what
  is missing. The rest of the page is whole. Such a part does not make a recipe invalid.
- A recipe is checked for its shape and its size only: a cap on the parts, the title and the arguments of
  a part, and the arguments a plain JSON object. The same check holds for a recipe that comes from outside.
- The pages are kept in the `localStorage` of the browser, under one key with a version in its name. No
  service of the stack keeps them.
- A pinned page is an entry of the sidebar on the top level, beside Home. The entry "Pages" lists every page
  of the browser, pinned or not. A page is one column, and the order of its parts is its only arrangement.

## Consequences

- A page shows what holds when it is opened. A part that asked for "the last eight hours" shows the eight
  hours before it was opened, and a card drawn from it is as live as the page of a machine.
- A new card in the list of the chat can be a part of a page without another line of code.
- A page lives in one browser. Another browser, a private window or cleared site data has other pages, or
  none. Sharing a page needs a link that carries its recipe, and the receiver keeps it in their browser.
- A recipe from a link is input from outside, which the check of its shape and the list of tools on the
  server are for. It can still name any argument a tool takes.
- The arguments are kept as the language model chose them. A tool that changes its arguments can leave a
  part without an answer; the part then says why.

## Alternatives considered

- **Keep the values that were drawn.** The page would show the morning it was kept, every morning, and the
  stored values would need a contract of their own.
- **Keep the words of the language model with the cards.** Its numbers would be those of the day the page
  was kept, next to cards of today.
- **A service of the stack that keeps the pages.** Pages would follow a person to another browser, but the
  service needs a contract and a sign-in to know whose pages are whose. It can follow, with the same
  recipe, once the stack has a sign-in.

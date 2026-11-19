---
title: "A page from the chat is a recipe, kept in the browser"
status: proposed
date: 2026-11-17
---

# ADR-0014: A page from the chat is a recipe, kept in the browser

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
- A page is shared by a link, because the stack has no sign-in and keeps no page. The link carries the
  recipe in one search parameter of `/pages/open`, its JSON as UTF-8 in base64url, at most 8,000 characters:
  tools, machines and hours, never a value. Whoever opens it sees the values of that moment, with no
  language model and no chat, and keeps the page in their own browser. A recipe from a link is input from
  outside: only what `recipeOf` accepts is a page, and nothing in the link says where the app goes next.
- A pinned page is an entry of the sidebar on the top level, beside Home. Under the entries a group
  "Pages", which folds, lists the pages of the browser that are not pinned, as plain rows, the newest first;
  a pinned page is not listed a second time, and with no page to list there is no group. The route `/pages`,
  with every page of the browser, pinned or not, is no entry of the sidebar: it is reached through the
  breadcrumb, "Pages" before the title of a page. A page is one column, and the order of its parts is its
  only arrangement.

## Consequences

- A page shows what holds when it is opened. A part that asked for "the last eight hours" shows the eight
  hours before it was opened.
- A page is read once, and its head says as of when. It is not live as the page of a machine is: that page
  hears the broker ([ADR-0013](0013-live-values-from-the-broker.md)), by a rule for each kind of value of
  what a message does to it, and a page of any tools has no such rule yet. Only while a part waits for the
  backend is the page read again, as the other pages are.
- A new card in the list of the chat can be a part of a page without another line of code.
- A page lives in one browser. Another browser, a private window or cleared site data has other pages, or
  none. A page is shared by its link, and the receiver keeps it in their browser.
- A link cannot be taken back, and it is a copy of the recipe at the moment it was made: a page that is
  renamed afterwards is a new link, and the page of the receiver goes its own way. A page whose link would be
  longer than 8,000 characters has none. The limit is the one of the server of the app, a Node server that
  answers a request line and headers beyond 16 KiB with 431, with room for the cookies the browser sends.
- A recipe from a link is input from outside, which the check of its shape and the list of tools on the
  server are for. It can still name any argument a tool takes.
- The parts of a kept page are not only those the language model called in one answer: a person removes a part
  and puts one in another order by hand, with no language model, and adds a card with the arguments the input
  schema of its tool asks for; a page keeps one part at least. Such a change, like a new title, is a new link;
  a link made before keeps the parts it had.
- The arguments are kept as the language model or the person chose them. A tool that changes its arguments
  can leave a part without an answer; the part then says why.

## Alternatives considered

- **Keep the values that were drawn.** The page would show the morning it was kept, every morning, and the
  stored values would need a contract of their own.
- **Keep the words of the language model with the cards.** Its numbers would be those of the day the page
  was kept, next to cards of today.
- **A service of the stack that keeps the pages.** Pages would follow a person to another browser, but the
  service needs a contract and a sign-in to know whose pages are whose. It can follow, with the same
  recipe, once the stack has a sign-in.

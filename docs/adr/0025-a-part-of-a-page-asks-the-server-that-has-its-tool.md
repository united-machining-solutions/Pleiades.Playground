---
title: "A part of a page asks the server that has its tool"
status: proposed
date: 2026-11-19
---

# ADR-0025: A part of a page asks the server that has its tool

## Context

[ADR-0014](0014-a-page-from-the-chat-is-a-recipe-kept-in-the-browser.md) makes a page a recipe whose parts are
tools of `genui-mcp`, and [ADR-0020](0020-the-language-model-composes-a-page-and-nothing-else.md) lets the model
compose one from the tools a page can call. The chat has more servers than `genui-mcp`: the OPC UA adapter
(`OPCUA_MCP_URL`) and the further servers of `APP_MCP_SERVERS`, the optional services of a stack such as the juice
bar. The app draws cards for some of their tools: the drink card of `juicebar_drinks_list`, and the cards of the
OPC UA adapter. A page could not hold them, because it asked `genui-mcp` alone: these cards were marked
`saveAsPage: false`, "Save as page" left them out, and the juice bar got a showcase page of its own, `/juice-bar`,
to have its card on a screen without a chat ([ADR-0018](0018-a-showcase-is-built-in-on-request-and-only-adds.md)).

A page that asks other servers raises three questions: which server a part goes to, what a part says where the
stack lacks that server, and whether a tool that writes, ordering a drink for one, may be a part.

## Decision

- A recipe stays as it is: a tool by its name, as the chat lists it, and its arguments. It names no server and no
  address, and it keeps version 1: a page kept or linked before reads the same.
- A part goes to the server whose name stands before the first `_` of its tool: `genui_*` to the generative UI
  backend, `opcua_*` to the OPC UA adapter of `OPCUA_MCP_URL`, any other `<name>_*` to the entry `<name>` of
  `APP_MCP_SERVERS`. It is the convention the chat already keeps: every server names its tools with its own name,
  the chat keeps the names as they are, and the model is told so. The server of the app finds the server in its
  own settings when the part is called (`serverOfTool` in `apps/app/src/chat/mcp-servers.ts`); the browser never
  learns an address.
- A part whose server this stack does not have stays in its place and says so, with the setting that lacks it:
  "It asks the server juicebar for juicebar_drinks_list, and this app has no such server: APP_MCP_SERVERS does
  not name it." It is not asked again, as a part whose tool refused. The rest of the page is whole, and the
  recipe stays valid: the same link opens whole on a stack that has the server. A server that is named and does
  not answer is a part that waits, "No answer from the server juicebar", and the page keeps trying, as it does
  for the backend.
- A chat that switches a further server off switches it off for itself. A page has no such switch and asks
  every server of its stack.
- A part calls only a tool that reads. A page calls its tools each time it is opened, and again while a part
  waits, so a tool that starts, orders or changes something would do it each time. The list of the chat is the
  boundary: a page holds only a tool with a card that is not marked `saveAsPage: false`, and the order of a
  drink has no card. As a second guard, the server of the app calls a part only where its server marks the tool
  as reading (MCP `readOnlyHint`); a tool without that mark is refused before it is called, with a sentence
  that says why. Every tool of `genui-mcp`, the list of drinks of the juice bar and the list and the mapping of
  the OPC UA adapter carry it.
- A card on a page may still have a button that writes, pressed by a person: "Order" on the drink card,
  "Remove" on an added OPC UA server. The press is the confirmation, as in the chat, and goes through the
  card's own server function, never through a part.
- `saveAsPage: false` stays for a card that cannot work as a part: the source references of the manuals, the
  proposal of a page, and the scan of an OPC UA server (`opcua_endpoint_rank`, `opcua_machine_list`,
  `opcua_registration_propose`). Their tools reach out to an OPC UA server on every call, and each is one step
  of adding a machine, whose buttons act on what that step found. `juicebar_drinks_list`, `opcua_server_list`
  and `opcua_mapping_show` can be parts.
- The model is offered only the parts whose server the stack has: `app_page_propose` names in its description,
  and accepts, only those tools. "Add a card" lists the tools of every server a page can ask; one that does not
  answer within two seconds leaves out only its own cards.
- This record amends ADR-0014, whose parts were tools of `genui-mcp` only, and the consequence of ADR-0020 that
  the cards of the OPC UA adapter cannot be parts. Both stay as they were written; the index says so.

## Consequences

- The drink card can be kept with "Save as page" or from a proposal, pinned, and shared by a link; opened, it
  shows what the bar can mix then. A kept page does what the showcase page `/juice-bar` was made for, the card
  on a screen next to the machine without a chat, and holds other parts beside it.
- A link travels between stacks. On a stack without the juice bar, the drink card of such a page says that the
  server is missing, and the other parts show.
- The way by name holds only while the name of an entry is the prefix of its tools: an entry
  `bar=http://juicebar-api:8080/mcp` gives the chat the tools of the juice bar, and a part of
  `juicebar_drinks_list` no server. The order button of the drink card (`apps/app/src/juicebar/orders.ts`)
  needs the entry to be called `juicebar` already.
- A recipe from a link can reach every server of the stack, though only with a tool the chat draws and its
  server marks as reading. The servers are those the operator of the stack named; a page adds none.
- `readOnlyHint` is the word of a server, and the MCP specification calls it a hint, no boundary. The list of
  the chat stays the boundary; the hint catches a card that was made a part by mistake.
- The server of the app keeps one connection to each server a page has asked, as it keeps the one to the
  backend.

## Alternatives considered

- **Ask every server for its tools and send a part to the one that lists it.** It needs no convention of names,
  but a server that does not answer cannot say whether it has the tool: a part could not tell a stack without
  the server, where asking again changes nothing, from a server that is away, where the page keeps trying. And
  every page would wait for the lists of all servers before its first part.
- **Keep the server in the recipe.** It says nothing the name of the tool does not say, and it would need
  version 2 of the recipe and a check that the two agree.
- **Tools of `genui-mcp` that read the juice bar (`genui_juicebar_*`).** A page would keep to one server, but the
  generative UI backend is base, a juice bar a special device (ADR-0018), and every further server would need a
  copy of its tools there.
- **A showcase page for each card of a further server**, the way of `/juice-bar`. It needs code for each card
  and holds no other part.

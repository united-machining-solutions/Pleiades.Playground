import assert from "node:assert/strict"
import { test } from "node:test"

import type { ChatTool } from "../chat/tool-results.ts"
import { drawingTool, noCardFor, notReading, readsOnly } from "./parts.ts"

// The tools as the chat lists them (chat/cards.tsx): the two of the backend itself, without a
// card, the two the machine card draws, and the one only the card calls.
const tools: ReadonlyArray<ChatTool> = [
  { name: "genui_describe_server" },
  { name: "genui_get_skill_guide" },
  { name: "genui_machine_show", draw: () => "card" },
  { name: "genui_machine_list", draw: () => "list" },
  { name: "genui_span_list", cardOnly: true },
]

test("a page calls a tool the chat draws", () => {
  assert.equal(drawingTool("genui_machine_show", tools)?.name, "genui_machine_show")
  assert.equal(drawingTool("genui_machine_list", tools)?.name, "genui_machine_list")
})

test("a tool without a card, one only a card calls and one the app does not know are not called", () => {
  for (const name of ["genui_get_skill_guide", "genui_describe_server", "genui_span_list", "genui_alarm_list", "", "GENUI_MACHINE_SHOW"]) {
    assert.equal(drawingTool(name, tools), undefined, name)
  }
})

test("a tool only a card calls is not called, even where it would draw", () => {
  assert.equal(drawingTool("genui_span_list", [{ name: "genui_span_list", cardOnly: true, draw: () => "band" }]), undefined)
})

test("a tool of the app only the chat calls is not called, although the chat draws it: the proposal of a page", () => {
  const withProposal: ReadonlyArray<ChatTool> = [...tools, { name: "app_page_propose", saveAsPage: false, draw: () => "proposal" }]
  assert.equal(drawingTool("app_page_propose", withProposal), undefined)
  assert.equal(drawingTool("genui_machine_show", withProposal)?.name, "genui_machine_show")
})

test("a part without a card says which tool it asks for", () => {
  assert.equal(noCardFor("genui_alarm_list"), "It asks for genui_alarm_list, and this app has no card for that tool.")
})

test("a page calls only a tool its server says only reads: it calls it each time it is opened", () => {
  assert.equal(readsOnly({ metadata: { mcp: { annotations: { readOnlyHint: true } } } }), true)
  // An order, which the juice bar marks as one that changes something, and a tool without a mark.
  assert.equal(readsOnly({ metadata: { mcp: { annotations: { readOnlyHint: false } } } }), false)
  assert.equal(readsOnly({ metadata: { mcp: {} } }), false)
  assert.equal(readsOnly({}), false)
  assert.equal(
    notReading("juicebar_order_create", "the server juicebar"),
    "juicebar_order_create can change something, as the server juicebar lists it, and a page calls only a tool that reads: it calls it each time it is opened.",
  )
})

test("a card of another server is a part like one of the backend: the drink card of the juice bar", () => {
  const withDrinks: ReadonlyArray<ChatTool> = [
    ...tools,
    { name: "juicebar_drinks_list", draw: () => "drinks" },
    { name: "juicebar_order_create" },
    { name: "opcua_machine_list", saveAsPage: false, draw: () => "a scan" },
  ]
  assert.equal(drawingTool("juicebar_drinks_list", withDrinks)?.name, "juicebar_drinks_list")
  // The order has no card, and a scan is for the chat only.
  assert.equal(drawingTool("juicebar_order_create", withDrinks), undefined)
  assert.equal(drawingTool("opcua_machine_list", withDrinks), undefined)
})

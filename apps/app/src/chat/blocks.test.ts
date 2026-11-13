import assert from "node:assert/strict"
import { test } from "node:test"

import type { UIMessage } from "@tanstack/ai-react"

import { blocksOf, questionOf } from "./blocks.ts"
import { jsonOf } from "./tool-results.ts"
import type { ChatTool } from "./tool-results.ts"

type Parts = UIMessage["parts"]

const call = (id: string, name: string, state = "input-complete") =>
  ({ type: "tool-call", id, name, arguments: "{}", state }) as Parts[number]
const result = (toolCallId: string, content: string, state = "complete") =>
  ({ type: "tool-result", toolCallId, content, state }) as Parts[number]
const text = (content: string) => ({ type: "text", content }) as Parts[number]
const list = '{"asOf":"2026-11-16T09:30:00.000Z","windowSeconds":1800,"machines":[]}'
const shown = '{"asOf":"2026-11-16T09:30:00.000Z","windowSeconds":1800,"machine":{}}'

/** Whether a result has that key: a stand-in for the contract of a card. */
const has = (key: string) => (content: unknown) =>
  typeof jsonOf(content) === "object" && jsonOf(content) !== null && key in (jsonOf(content) as object)

// Tools the way a card names them: one that draws a card, one that draws a list, one that draws nothing.
const tools: ReadonlyArray<ChatTool> = [
  { name: "genui_machine_show", draw: (content) => (has("machine")(content) ? "the card" : null) },
  { name: "genui_machine_list", draw: (content) => (has("machines")(content) ? "the list" : null) },
  { name: "genui_span_list", cardOnly: true },
]

test("the calls of one stretch are one trace, a text ends it", () => {
  const blocks = blocksOf(
    [
      call("a", "genui_get_skill_guide"),
      result("a", "# The guide"),
      call("b", "genui_machine_list"),
      result("b", list),
      text("Here is what the machines do."),
    ],
    false,
    tools,
  )
  assert.deepEqual(
    blocks.map((block) => block.kind),
    ["steps", "drawn", "text"],
  )
  // The guide is not drawn, so it does not split the stretch.
  assert.deepEqual(blocks[0], {
    kind: "steps",
    calls: [
      { id: "a", name: "genui_get_skill_guide", state: "done" },
      { id: "b", name: "genui_machine_list", state: "done" },
    ],
  })
})

test("a result is drawn by the tool whose contract it keeps, whatever the order of the tools", () => {
  const drawn = (content: string, known: ReadonlyArray<ChatTool>) =>
    blocksOf([call("a", "any"), result("a", content)], false, known).flatMap((block) =>
      block.kind === "drawn" ? [block.node] : [],
    )
  assert.deepEqual(drawn(list, tools), ["the list"])
  assert.deepEqual(drawn(shown, tools), ["the card"])
  assert.deepEqual(drawn(shown, [...tools].reverse()), ["the card"])
})

test("a result that keeps no contract is drawn by nothing, and so is every result without tools", () => {
  const kinds = (content: string, known: ReadonlyArray<ChatTool>) =>
    blocksOf([call("a", "any"), result("a", content)], false, known).map((block) => block.kind)
  assert.deepEqual(kinds('{"spans":[]}', tools), ["steps"])
  assert.deepEqual(kinds("genui is the generative UI backend", tools), ["steps"])
  assert.deepEqual(kinds(list, []), ["steps"])
})

/** The state of the first call of an answer. */
const firstState = (parts: Parts, live: boolean) => {
  const [first] = blocksOf(parts, live, tools)
  return first?.kind === "steps" ? first.calls[0]?.state : undefined
}

test("a call without a result runs while the answer is live, and has failed after", () => {
  const parts = [call("a", "genui_machine_list")]
  assert.equal(firstState(parts, true), "running")
  assert.equal(firstState(parts, false), "failed")
})

test("a result with an error is a failed call", () => {
  assert.equal(firstState([call("a", "genui_machine_list"), result("a", "boom", "error")], true), "failed")
})

test("an empty text is no block, a question is its text", () => {
  assert.deepEqual(blocksOf([text("")], true, tools), [])
  assert.equal(questionOf([text("What needs me?")]), "What needs me?")
})

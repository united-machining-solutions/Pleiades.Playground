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

/** What the chat draws for the result of one call. */
const drawn = (name: string, content: string, known: ReadonlyArray<ChatTool>) =>
  blocksOf([call("a", name), result("a", content)], false, known).flatMap((block) =>
    block.kind === "drawn" ? [block.node] : [],
  )

test("a result is drawn by the card of the tool that was called", () => {
  assert.deepEqual(drawn("genui_machine_list", list, tools), ["the list"])
  assert.deepEqual(drawn("genui_machine_show", shown, tools), ["the card"])
})

test("where two contracts overlap, the tool that was called decides, not the order of the cards", () => {
  // A card that extends the machine card: its result keeps the contract of the machine card too.
  const trend = JSON.stringify({ ...JSON.parse(shown), peakAt: "2026-11-16T08:00:00.000Z" })
  const withTrend: ReadonlyArray<ChatTool> = [
    ...tools,
    { name: "genui_trend_show", draw: (content) => (has("peakAt")(content) ? "the trend" : null) },
  ]
  assert.deepEqual(drawn("genui_trend_show", trend, withTrend), ["the trend"])
  assert.deepEqual(drawn("genui_trend_show", trend, [...withTrend].reverse()), ["the trend"])
  assert.deepEqual(drawn("genui_machine_show", trend, withTrend), ["the card"])
})

test("a result is drawn by nothing if its tool draws nothing, is not known, or the contract is not kept", () => {
  assert.deepEqual(drawn("genui_span_list", '{"spans":[]}', tools), [])
  assert.deepEqual(drawn("genui_get_skill_guide", "genui is the generative UI backend", tools), [])
  // The result of another tool, whatever it looks like.
  assert.deepEqual(drawn("genui_alarm_list", list, tools), [])
  // The right tool, but not the values of its contract.
  assert.deepEqual(drawn("genui_machine_show", list, tools), [])
  assert.deepEqual(drawn("genui_machine_list", list, []), [])
})

test("a result without its call is drawn by nothing", () => {
  assert.deepEqual(
    blocksOf([result("gone", list)], false, tools).map((block) => block.kind),
    [],
  )
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

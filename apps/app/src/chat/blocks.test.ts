import assert from "node:assert/strict"
import { test } from "node:test"

import type { UIMessage } from "@tanstack/ai-react"

import { blocksOf, questionOf, thinkingLine } from "./blocks.ts"
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
      { id: "a", name: "genui_get_skill_guide", state: "done", output: "# The guide" },
      { id: "b", name: "genui_machine_list", state: "done", output: JSON.stringify(JSON.parse(list), null, 2) },
    ],
  })
})

/** The output the line of the first call opens to. */
const firstOutput = (parts: Parts, live: boolean) => {
  const [first] = blocksOf(parts, live, tools)
  return first?.kind === "steps" ? first.calls[0]?.output : "no steps"
}

test("a call opens to what its tool gave back: JSON indented, any other text as it is", () => {
  assert.equal(firstOutput([call("a", "genui_machine_list"), result("a", '{"machines":[]}')], false), '{\n  "machines": []\n}')
  assert.equal(firstOutput([call("a", "genui_get_skill_guide"), result("a", "# The guide")], false), "# The guide")
})

test("a failed call opens to why, and a call without a result does not open", () => {
  const failed = { ...result("a", "{}", "error"), error: "No machine P-09 is known." } as Parts[number]
  assert.equal(firstOutput([call("a", "genui_machine_show"), failed], false), "No machine P-09 is known.")
  // An error without its own words keeps what the tool gave back.
  assert.equal(firstOutput([call("a", "genui_machine_show"), result("a", "boom", "error")], false), "boom")
  assert.equal(firstOutput([call("a", "genui_machine_list")], true), undefined)
  assert.equal(firstOutput([call("a", "genui_machine_list")], false), undefined)
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

const message = (role: "user" | "assistant", parts: Parts) => ({ id: role, role, parts }) as UIMessage

const question = message("user", [text("What needs me?")])
/** Where the line "Thinking" stands while the answer with these parts is coming. */
const lineFor = (parts: Parts) => thinkingLine([question, message("assistant", parts)], true, tools)

test("the line stands apart while a question is out and its answer shows nothing yet", () => {
  assert.equal(thinkingLine([question], true, tools), "apart")
  // An answer that has begun, but with nothing to show: an empty text, or a thought.
  assert.equal(lineFor([text("")]), "apart")
  assert.equal(lineFor([{ type: "thinking", content: "…" } as Parts[number]]), "apart")
})

test("the line stands in the answer once its last step has ended or its last card is drawn", () => {
  // A step done whose result draws nothing, such as the guide of the backend.
  assert.equal(lineFor([call("a", "genui_span_list"), result("a", '{"spans":[]}')]), "in-answer")
  // A step that failed.
  assert.equal(lineFor([call("a", "genui_machine_list"), result("a", "boom", "error")]), "in-answer")
  // A card drawn for the result of its step.
  assert.equal(lineFor([call("a", "genui_machine_show"), result("a", shown)]), "in-answer")
  // A text, then a step that has ended.
  assert.equal(lineFor([text("Let me look."), call("a", "genui_span_list"), result("a", "{}")]), "in-answer")
  // Two steps of one stretch, both ended and both drawn.
  const both = [call("a", "genui_machine_show"), call("b", "genui_machine_show"), result("a", shown)]
  assert.equal(lineFor([...both, result("b", shown)]), "in-answer")
})

test("no line while a step runs or a text grows, or when no answer comes", () => {
  assert.equal(lineFor([call("a", "genui_machine_list")]), undefined)
  // One step of the stretch has ended, the other still runs.
  assert.equal(lineFor([call("a", "genui_span_list"), result("a", "{}"), call("b", "genui_machine_list")]), undefined)
  // Two steps of one stretch: the card of the first is drawn, the second still runs above it.
  assert.equal(
    lineFor([call("a", "genui_machine_show"), call("b", "genui_machine_show"), result("a", shown)]),
    undefined,
  )
  assert.equal(lineFor([text("Here is …")]), undefined)
  assert.equal(lineFor([call("a", "genui_machine_show"), result("a", shown), text("Here is P-04.")]), undefined)
  assert.equal(thinkingLine([question], false, tools), undefined)
  const ended = message("assistant", [call("a", "genui_span_list"), result("a", "{}")])
  assert.equal(thinkingLine([question, ended], false, tools), undefined)
  assert.equal(thinkingLine([], true, tools), undefined)
})

test("an empty text is no block, a question is its text", () => {
  assert.deepEqual(blocksOf([text("")], true, tools), [])
  assert.equal(questionOf([text("What needs me?")]), "What needs me?")
})

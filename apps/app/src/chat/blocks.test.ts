import assert from "node:assert/strict"
import { test } from "node:test"

import type { UIMessage } from "@tanstack/ai-react"

import { blocksOf, questionOf } from "./blocks.ts"

type Parts = UIMessage["parts"]

const call = (id: string, name: string, state = "input-complete") =>
  ({ type: "tool-call", id, name, arguments: "{}", state }) as Parts[number]
const result = (toolCallId: string, content: string, state = "complete") =>
  ({ type: "tool-result", toolCallId, content, state }) as Parts[number]
const text = (content: string) => ({ type: "text", content }) as Parts[number]
const list = '{"asOf":"2026-11-16T09:30:00.000Z","windowSeconds":1800,"machines":[]}'

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
  )
  assert.deepEqual(
    blocks.map((block) => block.kind),
    ["steps", "list", "text"],
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

/** The state of the first call of an answer. */
const firstState = (parts: Parts, live: boolean) => {
  const [first] = blocksOf(parts, live)
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
  assert.deepEqual(blocksOf([text("")], true), [])
  assert.equal(questionOf([text("What needs me?")]), "What needs me?")
})

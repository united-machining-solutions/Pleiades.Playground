import assert from "node:assert/strict"
import { test } from "node:test"

import { textOf, withEvent } from "./conversation.ts"
import type { Message } from "./conversation.ts"

const empty: Message = { id: "a", role: "assistant", parts: [] }

test("the text of an answer grows in one part until a tool call comes in between", () => {
  let answer = withEvent(empty, { type: "text", delta: "Ich schaue " })
  answer = withEvent(answer, { type: "text", delta: "nach." })
  answer = withEvent(answer, { type: "call", id: "1", name: "genui_machine_show" })
  answer = withEvent(answer, { type: "result", id: "1", name: "genui_machine_show", content: "{}", failed: false })
  answer = withEvent(answer, { type: "text", delta: "\n\n" })
  answer = withEvent(answer, { type: "text", delta: "P-04 steht." })
  assert.deepEqual(
    answer.parts.map((part) => part.type),
    ["text", "tool-call", "tool-result", "text"],
  )
  assert.equal(textOf(answer), "Ich schaue nach.P-04 steht.")
})

test("a tool that failed is a result in the state the chat draws as failed", () => {
  const answer = withEvent(empty, { type: "result", id: "1", name: "genui_energy_show", content: "", failed: true })
  assert.deepEqual(answer.parts, [{ type: "tool-result", toolCallId: "1", content: "", state: "error", error: "" }])
})

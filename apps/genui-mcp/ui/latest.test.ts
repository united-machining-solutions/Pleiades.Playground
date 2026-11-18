import assert from "node:assert/strict"
import { test } from "node:test"

import { lastAsked } from "./latest.ts"

test("the answer to an older result that comes back last is not drawn", async () => {
  const ask = lastAsked()
  const taken: Array<string> = []
  let answerFirst: (value: string) => void = () => {}
  const first = new Promise<string>((resolve) => (answerFirst = resolve))
  ask(first, (one) => taken.push(one))
  ask(Promise.resolve("second"), (one) => taken.push(one))
  await new Promise((resolve) => setTimeout(resolve, 0))
  answerFirst("first")
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(taken, ["second"])
})

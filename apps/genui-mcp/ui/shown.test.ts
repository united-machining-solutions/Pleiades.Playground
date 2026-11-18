import assert from "node:assert/strict"
import { test } from "node:test"

import { shownFor } from "./shown.ts"

/** A contract that takes a number only. */
const aNumber = {
  safeParse: (value: unknown) => (typeof value === "number" ? { success: true as const, data: value } : { success: false as const }),
}

test("values that keep the contract are drawn as the card", () => {
  assert.deepEqual(shownFor({ structuredContent: 4 }, aNumber, "a number card"), { values: 4 })
})

test("a tool that failed is drawn with its words, anything else says it is no card", () => {
  const failed = { isError: true, content: [{ type: "text", text: "The Timeseries API did not answer." }] }
  assert.deepEqual(shownFor(failed, aNumber, "a number card"), { note: "The Timeseries API did not answer." })
  assert.deepEqual(shownFor({ structuredContent: "four" }, aNumber, "a number card"), { note: "This result is not a number card." })
})

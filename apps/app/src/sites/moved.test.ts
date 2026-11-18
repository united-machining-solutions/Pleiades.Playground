import assert from "node:assert/strict"
import { test } from "node:test"

import { movedMachinePage } from "./moved.ts"

test("an old address of the page of a machine leads to the same machine under Sites", () => {
  const moved = movedMachinePage("alcyone-machines_AX-400_P-04", {})
  assert.equal(moved.to, "/sites/$machine")
  assert.deepEqual(moved.params, { machine: "alcyone-machines_AX-400_P-04" })
  assert.equal(moved.replace, true)
})

test("the redirect is temporary: a browser does not keep it for good while addresses may still move", () => {
  assert.equal(movedMachinePage("P-04", {}).statusCode, 307)
})

test("the hours of the history and the open chat go along", () => {
  const search = { hours: 24, chat: "c-17" }
  assert.deepEqual(movedMachinePage("P-04", search).search, { hours: 24, chat: "c-17" })
})

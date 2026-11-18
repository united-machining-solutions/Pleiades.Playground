import assert from "node:assert/strict"
import { test } from "node:test"

import { movedMachinePage, movedSitesPage } from "./moved.ts"

test("an old address of the page of a machine leads to the same machine under /sites", () => {
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

test("the old address of the list of sites leads to Home, with Needs you, the page and the open chat", () => {
  const search = { show: "needs", page: 2, chat: "c-17" }
  const moved = movedSitesPage(search)
  assert.equal(moved.to, "/")
  assert.deepEqual(moved.search, { show: "needs", page: 2, chat: "c-17" })
  assert.equal(moved.replace, true)
  assert.equal(moved.statusCode, 307)
})

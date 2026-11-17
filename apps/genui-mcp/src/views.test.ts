import assert from "node:assert/strict"
import { test } from "node:test"

import { secondsOfTimeSpan } from "./apis.ts"
import { valueOf } from "./views.ts"

test("a count of the hall is the sum of the machines, and a machine without a value is left out", () => {
  assert.equal(valueOf("errors", [{ value: 3, of: 1 }, null, { value: 4, of: 1 }]), 7)
})

test("the running share of the hall weighs each machine by the time it gave data", () => {
  // One machine ran 1 h of 2 h, the other 3 h of 4 h: together 4 h of 6 h.
  assert.equal(valueOf("running-share", [{ value: 3600, of: 7200 }, { value: 10800, of: 14400 }]), 4 / 6)
})

test("without any value there is no value", () => {
  assert.equal(valueOf("energy", [null, null]), null)
  assert.equal(valueOf("running-share", []), null)
})

test("a time span of .NET reads as seconds", () => {
  assert.equal(secondsOfTimeSpan("00:39:26.6320000"), 39 * 60 + 26.632)
  assert.equal(secondsOfTimeSpan("1.02:03:04"), 86400 + 2 * 3600 + 3 * 60 + 4)
  assert.equal(secondsOfTimeSpan("nonsense"), 0)
})

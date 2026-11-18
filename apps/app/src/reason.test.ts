import assert from "node:assert/strict"
import { test } from "node:test"

import { reasonOf } from "./reason.ts"

test("the reason is what the network said, inside what fetch wrapped it in", () => {
  const refused = new TypeError("fetch failed", { cause: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5540"), { code: "ECONNREFUSED" }) })
  assert.equal(reasonOf(refused), "ECONNREFUSED")
  assert.equal(reasonOf(new Error("socket hang up")), "socket hang up")
  assert.equal(reasonOf("plain"), "plain")
})

test("a request that ran out of time says so, not the number 23 of its DOMException", () => {
  const timedOut = new DOMException("The operation was aborted due to timeout", "TimeoutError")
  assert.equal(timedOut.code, 23)
  assert.equal(reasonOf(timedOut), "no answer in time")
  assert.equal(reasonOf(new TypeError("fetch failed", { cause: timedOut })), "no answer in time")
})

import assert from "node:assert/strict"
import { test } from "node:test"

import { trulaserShowOf } from "./results.ts"

test("what does not keep the contract of the TruLaser card is not drawn as one", () => {
  assert.equal(trulaserShowOf('{"asOf":"2026-11-18T10:00:00.000Z","machine":"m"}'), null)
  assert.equal(trulaserShowOf("genui is the generative UI backend"), null)
  assert.equal(trulaserShowOf(undefined), null)
})

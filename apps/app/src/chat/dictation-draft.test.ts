import assert from "node:assert/strict"
import { test } from "node:test"

import { DRAFT_AFTER_MS, DRAFT_EVERY_MS, draftIsDue } from "./dictation-draft.ts"

test("the first draft goes out once a second has been recorded", () => {
  assert.equal(draftIsDue({ at: 500, since: 0, last: 0, busy: false }), false)
  assert.equal(draftIsDue({ at: DRAFT_AFTER_MS, since: 0, last: -Infinity, busy: false }), true)
})

test("the next draft waits two seconds after the last went out", () => {
  assert.equal(draftIsDue({ at: 2_500, since: 0, last: 1_000, busy: false }), false)
  assert.equal(draftIsDue({ at: 1_000 + DRAFT_EVERY_MS, since: 0, last: 1_000, busy: false }), true)
})

test("no draft goes out while the last one is still on its way", () => {
  assert.equal(draftIsDue({ at: 10_000, since: 0, last: 1_000, busy: true }), false)
})

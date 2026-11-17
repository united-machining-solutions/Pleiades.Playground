import assert from "node:assert/strict"
import { test } from "node:test"

import { defaultRefreshInterval, parseRefreshInterval, refreshChoices, refreshLabel } from "./refresh-interval.ts"

test("a person chooses between 1s, 5s, 10s and 30s", () => {
  assert.deepEqual(refreshChoices.map(refreshLabel), ["1s", "5s", "10s", "30s"])
})

test("a first visit reads the values again every second", () => {
  assert.equal(defaultRefreshInterval, 1_000)
  assert.equal(parseRefreshInterval(null), 1_000)
})

test("a stored choice holds, anything else is the default", () => {
  assert.equal(parseRefreshInterval("30000"), 30_000)
  assert.equal(parseRefreshInterval(5_000), 5_000)
  assert.equal(parseRefreshInterval("2000"), defaultRefreshInterval)
  assert.equal(parseRefreshInterval("soon"), defaultRefreshInterval)
})

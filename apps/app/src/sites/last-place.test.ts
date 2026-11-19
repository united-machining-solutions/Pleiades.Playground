import assert from "node:assert/strict"
import { test } from "node:test"

import type { Backing } from "../pages/store.ts"
import { LAST_PLACE_KEY, createLastPlace, lastPlaceIn } from "./last-place.ts"

/** A storage in memory, as `localStorage` is one. */
function memory(): Backing & { held: Map<string, string> } {
  const held = new Map<string, string>()
  return { held, getItem: (key) => held.get(key) ?? null, setItem: (key, value) => void held.set(key, value) }
}

const list = {
  sites: [
    { siteId: "north-plant", company: "Demo Manufacturing", name: "North plant", machineCount: 0, counts: [], halls: [{ name: "Hall 1", machines: [] }] },
  ],
}

test("the place kept last is read back", () => {
  const storage = memory()
  const { readLastPlace, keepLastPlace } = createLastPlace(() => storage)
  assert.equal(readLastPlace(), null)
  keepLastPlace({ siteId: "north-plant", hall: "Hall 1" })
  assert.deepEqual(readLastPlace(), { siteId: "north-plant", hall: "Hall 1" })
  keepLastPlace({ siteId: "north-plant", hall: null })
  assert.deepEqual(readLastPlace(), { siteId: "north-plant", hall: null })
})

test("what is no place, and a storage that throws, give none", () => {
  const storage = memory()
  const { readLastPlace } = createLastPlace(() => storage)
  for (const raw of ["{", "null", "[]", '{"siteId":""}', '{"siteId":3}']) {
    storage.held.set(LAST_PLACE_KEY, raw)
    assert.equal(readLastPlace(), null, raw)
  }
  const broken = createLastPlace(() => ({
    getItem: () => {
      throw new Error("blocked")
    },
    setItem: () => {
      throw new Error("blocked")
    },
  }))
  assert.equal(broken.readLastPlace(), null)
  assert.doesNotThrow(() => broken.keepLastPlace({ siteId: "north-plant", hall: null }))
  assert.equal(createLastPlace(() => undefined).readLastPlace(), null)
})

test("a place is offered only while its site, and its hall, are in the list", () => {
  assert.deepEqual(lastPlaceIn(list, { siteId: "north-plant", hall: "Hall 1" }), { siteId: "north-plant", hall: "Hall 1" })
  assert.deepEqual(lastPlaceIn(list, { siteId: "north-plant", hall: "Hall 9" }), { siteId: "north-plant", hall: null })
  assert.equal(lastPlaceIn(list, { siteId: "south-plant", hall: null }), null)
  assert.equal(lastPlaceIn(list, null), null)
})

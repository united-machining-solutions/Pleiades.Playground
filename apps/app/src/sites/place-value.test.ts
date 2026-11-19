import assert from "node:assert/strict"
import { test } from "node:test"

import { NO_HALL } from "./choosing.ts"
import { placeReady } from "./place-value.ts"

const north = { siteId: "north-plant", name: "North plant", halls: ["Hall 1"] }

test("a place is whole with a site and its hall, or no hall", () => {
  assert.equal(placeReady({ site: north, hall: { name: "Hall 1", made: false }, company: "" }), true)
  assert.equal(placeReady({ site: north, hall: NO_HALL, company: "" }), true)
})

test("a place is not whole without a site, while its hall is not chosen, or with a new hall without a name", () => {
  assert.equal(placeReady({ site: null, hall: NO_HALL, company: "" }), false)
  assert.equal(placeReady({ site: north, hall: null, company: "" }), false)
  assert.equal(placeReady({ site: north, hall: { name: " ", made: true }, company: "" }), false)
})

test("a new site needs a name and a company", () => {
  assert.equal(placeReady({ site: { siteId: null, name: "", halls: [] }, hall: NO_HALL, company: "Demo" }), false)
  assert.equal(placeReady({ site: { siteId: null, name: "East plant", halls: [] }, hall: NO_HALL, company: "" }), false)
  assert.equal(placeReady({ site: { siteId: null, name: "East plant", halls: [] }, hall: NO_HALL, company: "Demo" }), true)
})

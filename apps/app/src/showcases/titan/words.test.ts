import assert from "node:assert/strict"
import { test } from "node:test"

import { inGerman, serialOf, unbroken } from "./words.ts"

test("a known message of a machine is said in short German, an unknown one as it is", () => {
  assert.equal(inGerman("Bar feeder empty"), "Stangenlader leer")
  assert.equal(inGerman("Something new"), "Something new")
})

test("a machine name and a figure with its unit are not broken apart", () => {
  assert.equal(unbroken("an M-02 seit 12 h"), "an M‑02 seit 12 h")
})

test("a machine is called by its serial number where there is room for one word", () => {
  assert.equal(serialOf("alcyone-machines_AX-400_P-04"), "P-04")
  assert.equal(serialOf("P-04"), "P-04")
  assert.equal(serialOf("a_b"), "a_b")
})

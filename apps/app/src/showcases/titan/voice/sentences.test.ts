import assert from "node:assert/strict"
import { test } from "node:test"

import { sentencesOf } from "./voice.ts"

test("a text is read in sentences, each with its mark", () => {
  assert.deepEqual(sentencesOf("P-04 steht still. Warum? Die Tür ist offen!"), ["P-04 steht still.", "Warum?", "Die Tür ist offen!"])
})

test("a text without a mark at the end is one sentence", () => {
  assert.deepEqual(sentencesOf("Alle drei Maschinen laufen"), ["Alle drei Maschinen laufen"])
})

test("an empty text has no sentences", () => {
  assert.deepEqual(sentencesOf("  "), [])
})

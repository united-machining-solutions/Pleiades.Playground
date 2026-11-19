import assert from "node:assert/strict"
import { test } from "node:test"

import { sentencesOf, unitsInWords } from "./voice.ts"

test("a text is read in sentences, each with its mark", () => {
  assert.deepEqual(sentencesOf("P-04 steht still. Warum? Die Tür ist offen!"), ["P-04 steht still.", "Warum?", "Die Tür ist offen!"])
})

test("a text without a mark at the end is one sentence", () => {
  assert.deepEqual(sentencesOf("Alle drei Maschinen laufen"), ["Alle drei Maschinen laufen"])
})

test("an empty text has no sentences", () => {
  assert.deepEqual(sentencesOf("  "), [])
})

test("a unit after a figure is said as a word, one of it or more", () => {
  assert.equal(unitsInWords("Sie lief 3 h 5 min, also 57 % der Zeit."), "Sie lief 3 Stunden 5 Minuten, also 57 Prozent der Zeit.")
  assert.equal(unitsInWords("1 h und 1 min, 8,2 kWh bei 13 kW und 40 °C"), "1 Stunde und 1 Minute, 8,2 Kilowattstunden bei 13 Kilowatt und 40 Grad Celsius")
  assert.equal(unitsInWords("nach 30 s"), "nach 30 Sekunden")
})

test("a letter that is no unit stays as it is", () => {
  assert.equal(unitsInWords("P-04 hat 3 hohe Werte und 5 Minuten Pause."), "P-04 hat 3 hohe Werte und 5 Minuten Pause.")
  assert.equal(unitsInWords("Auftrag 4717/01 steht bei 8 von 12."), "Auftrag 4717/01 steht bei 8 von 12.")
})

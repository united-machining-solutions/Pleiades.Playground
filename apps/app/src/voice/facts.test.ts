import assert from "node:assert/strict"
import { test } from "node:test"

import { briefingOf, factOf, withoutList } from "./facts.ts"

const answer = `Drei Maschinen stehen. Auf dem Plan siehst du sie rot.

- **P-07** | Steht | Die Spindel ist zu heiß, die Steuerung hat gestoppt (Alarm 2130). | seit 09:56
- **P-04** | Einrichten | Wird gerade eingerichtet, kein Fehler. | seit 09:57
- **Ursache**: Die Daten nennen keine.

Übrigens: M-02 hat denselben Fehler seit gestern Abend offen.

Soll ich dir die Details von M-02 zeigen?`

test("an answer is taken apart into summary, facts, hint and suggestion", () => {
  const briefing = briefingOf(answer)
  assert.equal(briefing.summary, "Drei Maschinen stehen. Auf dem Plan siehst du sie rot.")
  assert.equal(briefing.hint, "M-02 hat denselben Fehler seit gestern Abend offen.")
  assert.equal(briefing.suggestion, "Soll ich dir die Details von M-02 zeigen?")
  assert.deepEqual(briefing.facts, [
    { title: "P-07", status: "Steht", text: "Die Spindel ist zu heiß, die Steuerung hat gestoppt (Alarm 2130).", since: "seit 09:56" },
    { title: "P-04", status: "Einrichten", text: "Wird gerade eingerichtet, kein Fehler.", since: "seit 09:57" },
    { title: "Ursache", text: "Die Daten nennen keine." },
  ])
})

test("what is said is everything but the list", () => {
  const said = withoutList(answer)
  assert.ok(said.includes("Drei Maschinen stehen."))
  assert.ok(said.includes("Übrigens: M-02"))
  assert.ok(said.includes("Soll ich dir"))
  assert.ok(!said.includes("P-07"))
})

test("a list that is still arriving is not said", () => {
  assert.equal(withoutList("Alles klar.\n\n-").trim(), "Alles klar.")
  assert.equal(withoutList("Alles klar.\n\n- **P-0").trim(), "Alles klar.")
})

test("a single question is the answer, not a suggestion", () => {
  assert.deepEqual(briefingOf("Welche Maschine meinst du?"), { summary: "Welche Maschine meinst du?", facts: [], hint: undefined, suggestion: undefined })
})

test("a line without columns is a fact with or without a title", () => {
  assert.deepEqual(factOf("- Kein Grund erfasst"), { text: "Kein Grund erfasst" })
  assert.deepEqual(factOf("- **M-02:** steht"), { title: "M-02", text: "steht" })
})

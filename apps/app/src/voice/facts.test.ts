import assert from "node:assert/strict"
import { test } from "node:test"

import { briefingOf, factOf, withoutList, withoutSaidAdvice } from "./facts.ts"

const answer = `P-04 steht, weil der Spindelantrieb ausgefallen ist.
Empfehlung: Ruf die Instandhaltung an P-04.

- **P-04** | Der Spindelantrieb ist ausgefallen, der Auftrag wartet. | Instandhaltung rufen, Antrieb prüfen.
- **Ursache**: Die Daten nennen keine.

Übrigens: P-07 wird gerade eingerichtet.

Soll ich dir den Verlauf von P-04 zeigen?`

test("an answer is taken apart into headline, recommendation, facts, hint and suggestion", () => {
  const briefing = briefingOf(answer)
  assert.equal(briefing.summary, "P-04 steht, weil der Spindelantrieb ausgefallen ist.")
  assert.equal(briefing.recommendation, "Ruf die Instandhaltung an P-04.")
  assert.equal(briefing.hint, "P-07 wird gerade eingerichtet.")
  assert.equal(briefing.suggestion, "Soll ich dir den Verlauf von P-04 zeigen?")
  assert.deepEqual(briefing.facts, [
    { title: "P-04", text: "Der Spindelantrieb ist ausgefallen, der Auftrag wartet.", step: "Instandhaltung rufen, Antrieb prüfen." },
    { title: "Ursache", text: "Die Daten nennen keine." },
  ])
})

test("what is said is everything but the list", () => {
  const said = withoutList(answer)
  assert.ok(said.includes("P-04 steht"))
  assert.ok(said.includes("Empfehlung: Ruf"))
  assert.ok(said.includes("Übrigens: P-07"))
  assert.ok(said.includes("Soll ich dir"))
  assert.ok(!said.includes("Antrieb prüfen"))
})

test("a list that is still arriving is not said", () => {
  assert.equal(withoutList("Alles klar.\n\n-").trim(), "Alles klar.")
  assert.equal(withoutList("Alles klar.\n\n- **P-0").trim(), "Alles klar.")
})

test("a single question is the answer, not a suggestion", () => {
  assert.deepEqual(briefingOf("Welche Maschine meinst du?"), {
    summary: "Welche Maschine meinst du?",
    recommendation: undefined,
    facts: [],
    hint: undefined,
    suggestion: undefined,
  })
})

test("a line without columns is a fact with or without a title", () => {
  assert.deepEqual(factOf("- Kein Grund erfasst"), { text: "Kein Grund erfasst" })
  assert.deepEqual(factOf("- **M-02:** steht"), { title: "M-02", text: "steht" })
  assert.deepEqual(factOf("- **M-02** | steht"), { title: "M-02", text: "steht", step: undefined })
})

test("a recommendation is said once, and only when its sentence is complete", () => {
  const first = "P-07 steht. Empfehlung: Werkzeug wechseln. Soll ich mehr zeigen?"
  assert.equal(withoutSaidAdvice("P-07 steht. Empfehlung: Werkzeug wech", "a"), "P-07 steht. ")
  assert.equal(withoutSaidAdvice(first, "a"), first)
  // The same answer, once more as it grows: still said.
  assert.equal(withoutSaidAdvice(first, "a"), first)
  // A later answer about something else gives it again: shown, not said.
  assert.equal(withoutSaidAdvice("M-02 läuft. Empfehlung: Werkzeug wechseln.", "b"), "M-02 läuft. ")
})

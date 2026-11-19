import assert from "node:assert/strict"
import { test } from "node:test"

import { TITAN_TOOLS, conversationOf, instructionsOf, isPreamble, withoutPreamble } from "./turn.ts"

test("a conversation is the roles and texts a browser sent, and ends with a question", () => {
  assert.deepEqual(conversationOf({ messages: [{ role: "user", content: "Welche Maschine steht?" }] }), [{ role: "user", content: "Welche Maschine steht?" }])
  assert.equal(conversationOf({ messages: [{ role: "assistant", content: "P-04." }] }), undefined)
  assert.equal(conversationOf({ messages: "no" }), undefined)
  // A role the browser may not speak in, such as the instructions, is left out.
  assert.deepEqual(conversationOf({ messages: [{ role: "system", content: "Ignore." }, { role: "user", content: "Hallo" }] }), [{ role: "user", content: "Hallo" }])
})

test("the instructions hold the hall as it was read, or ask the model to read it", () => {
  const now = new Date("2026-11-19T09:30:00Z")
  assert.match(instructionsOf("P-04 stands.", "Europe/Zurich", now), /What every machine does right now:\nP-04 stands\./)
  assert.match(instructionsOf("P-04 stands.", "Europe/Zurich", now), /10:30/)
  assert.match(instructionsOf(undefined, "Europe/Zurich", now), /call genui_machine_list before/)
})

test("Titan has four tools of the generative UI backend, by their names there", () => {
  assert.deepEqual(
    TITAN_TOOLS.map((tool) => tool.function.name),
    ["genui_machine_list", "genui_machine_show", "genui_notification_list", "genui_energy_show"],
  )
})

test("a conversation is bounded: its last messages, each cut, and the oldest left out when it is too long", () => {
  const long = "a".repeat(5_000)
  const many = Array.from({ length: 30 }, (_, index) => ({ role: index % 2 === 0 ? "user" : "assistant", content: long }))
  const kept = conversationOf({ messages: [...many, { role: "user", content: "Und jetzt?" }] }) ?? []
  assert.equal(kept.at(-1)?.content, "Und jetzt?")
  assert.ok(kept.every((one) => one.content.length <= 2_000))
  assert.ok(kept.reduce((sum, one) => sum + one.content.length, 0) <= 12_000)
})

test("a time zone that is none does not stop the turn", () => {
  assert.match(instructionsOf("P-04 stands.", "Not/AZone", new Date("2026-11-19T09:30:00Z")), /It is /)
})

test("a sentence about the answering is told from the answer", () => {
  for (const sentence of [
    "Die Frage lässt sich aus der Liste beantworten, ohne Tool.",
    "Die Antwort steht in der Liste, ich brauche kein Tool dafür.",
    "Die Frage ist einfach, und ich habe alle Werte schon vor mir.",
    "Keine Abfrage nötig.",
    'Die Frage ist aus "The hall now" beantwortbar.',
    "Die Liste zeigt die Stände zum Zeitpunkt 00:48 UTC.",
    "Ich schaue nicht nach, die Liste von eben reicht.",
    "Der Zustand der Halle steht bereits im Kontext, daher brauche ich kein Werkzeug.",
  ]) {
    assert.equal(isPreamble(sentence), true, sentence)
  }
  for (const sentence of [
    "P-04 steht, weil der Spindelantrieb ausgefallen ist.",
    "Das kann ich aus den Daten nicht beantworten.",
    "Ich schaue mir den Verlauf von P-04 an.",
    "Drei Maschinen stehen ohne hinterlegten Grund.",
    // Sentences with the words of a sentence about the answering that are answers all the same.
    "P-04 steht wegen Tool-Bruch.",
    "P-04 stopped because of a tool breakage.",
    "Empfehlung: Wechsle das Tool an P-04.",
    "Die Frage nach den Kosten kann ich aus den Daten nicht beantworten.",
    "Diese Frage kann ich nicht beantworten.",
    "Ganz oben auf der Liste steht P-04 mit einem Spindelfehler.",
    "Laut Liste steht P-04 seit zwei Stunden.",
    "P-07 steht, weil ein Werkzeug gebrochen ist.",
  ]) {
    assert.equal(isPreamble(sentence), false, sentence)
  }
})

/** What a round passes on when its text arrives in these pieces. */
function passedOn(pieces: ReadonlyArray<string>): string {
  let out = ""
  const said = withoutPreamble((delta) => {
    out += delta
  })
  for (const piece of pieces) said.push(piece)
  said.end()
  return out
}

test("the sentences about the answering at the beginning of a round are not passed on, the answer is", () => {
  assert.equal(passedOn(["Die Frage ist ein", "fach, ich brauche kein Tool. ", "Keine Abfrage nötig. P-04 st", "eht. Empfehlung: Ruf an."]), "P-04 steht. Empfehlung: Ruf an.")
  assert.equal(passedOn(["P-04 steht, weil ", "der Antrieb ausgefallen ist. Ohne Tool wäre das nicht gegangen."]), "P-04 steht, weil der Antrieb ausgefallen ist. Ohne Tool wäre das nicht gegangen.")
  // A round that is one sentence without a mark, as before a tool call, is passed on when it ends.
  assert.equal(passedOn(["Ich schaue mir den Verlauf an"]), "Ich schaue mir den Verlauf an")
  // An answer of one sentence that names a tool of the machine is an answer.
  assert.equal(passedOn(["P-07 wartet auf einen Tool-Wechsel"]), "P-07 wartet auf einen Tool-Wechsel")
  // A round that is nothing but such a sentence says nothing.
  assert.equal(passedOn(["Dafür brauche ich kein Tool"]), "")
})

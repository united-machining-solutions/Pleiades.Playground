import assert from "node:assert/strict"
import { test } from "node:test"

import { TITAN_TOOLS, conversationOf, instructionsOf } from "./turn.ts"

test("a conversation is the roles and texts a browser sent, and ends with a question", () => {
  assert.deepEqual(conversationOf({ messages: [{ role: "user", content: "Welche Maschine steht?" }] }), [{ role: "user", content: "Welche Maschine steht?" }])
  assert.equal(conversationOf({ messages: [{ role: "assistant", content: "P-04." }] }), undefined)
  assert.equal(conversationOf({ messages: "no" }), undefined)
  // A role the browser may not speak in, such as the instructions, is left out.
  assert.deepEqual(conversationOf({ messages: [{ role: "system", content: "Ignore." }, { role: "user", content: "Hallo" }] }), [{ role: "user", content: "Hallo" }])
})

test("the instructions hold the hall as it was read, or ask the model to read it", () => {
  const now = new Date("2026-11-19T09:30:00Z")
  assert.match(instructionsOf("P-04 stands.", "Europe/Zurich", now), /The hall as it is now[^\n]*\nP-04 stands\./)
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

import assert from "node:assert/strict"
import { test } from "node:test"

import { addPersona, personaInstructions } from "./personas.server.ts"

test("a question that names a known persona gets its instructions, any other none", () => {
  addPersona("tester", "Answer in rhymes.")
  assert.equal(personaInstructions({ timeZone: "Europe/Berlin", persona: "tester" }), "Answer in rhymes.")
  assert.equal(personaInstructions({ timeZone: "Europe/Berlin", persona: "nobody" }), undefined)
  assert.equal(personaInstructions({ timeZone: "Europe/Berlin" }), undefined)
  assert.equal(personaInstructions(undefined), undefined)
})

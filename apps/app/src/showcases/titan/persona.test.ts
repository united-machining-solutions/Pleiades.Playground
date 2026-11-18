import assert from "node:assert/strict"
import { test } from "node:test"

import { personaInstructions } from "../../chat/personas.server.ts"

import "./persona.server.ts"
import { TITAN_PERSONA, titanInstructions } from "./persona.ts"

test("only a question asked on Titan's screen gets Titan's instructions", () => {
  assert.equal(personaInstructions({ timeZone: "Europe/Berlin", persona: TITAN_PERSONA }), titanInstructions)
  assert.equal(personaInstructions({ timeZone: "Europe/Berlin" }), undefined)
  assert.match(titanInstructions, /You are Titan/)
})

import assert from "node:assert/strict"
import { test } from "node:test"

import { isTitan, titanInstructions } from "./persona.ts"

test("only a question asked on Titan's screen gets Titan's instructions", () => {
  assert.equal(isTitan({ timeZone: "Europe/Berlin", persona: "titan" }), true)
  assert.equal(isTitan({ timeZone: "Europe/Berlin" }), false)
  assert.equal(isTitan(undefined), false)
  assert.match(titanInstructions, /You are Titan/)
})

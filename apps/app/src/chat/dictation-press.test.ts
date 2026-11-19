import assert from "node:assert/strict"
import { test } from "node:test"

import { HOLD_MS, onLetGo } from "./dictation-press.ts"

test("a tap starts the recording, and it goes on after the finger lets go", () => {
  assert.equal(onLetGo({ at: 0, ending: false, running: true }, 120), "go-on")
})

test("a hold ends the recording when the finger lets go", () => {
  assert.equal(onLetGo({ at: 0, ending: false, running: true }, HOLD_MS), "end")
  assert.equal(onLetGo({ at: 0, ending: false, running: true }, 5_000), "end")
})

test("a tap or a hold on a running recording ends it", () => {
  assert.equal(onLetGo({ at: 0, ending: true, running: false }, 80), "end")
  assert.equal(onLetGo({ at: 0, ending: true, running: false }, 2_000), "end")
})

test("a hold while the browser still asks for the microphone is no hold: the recording goes on", () => {
  assert.equal(onLetGo({ at: 0, ending: false, running: false }, 3_000), "go-on")
})

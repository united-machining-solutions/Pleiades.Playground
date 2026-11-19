import assert from "node:assert/strict"
import { test } from "node:test"

import { hintFor } from "./orb-hint.ts"

const idle = { state: "idle", started: true, paused: false, hearsItsName: true } as const

test("the line under the cloud says what a press does now", () => {
  assert.deepEqual(hintFor({ ...idle, started: false }), { now: "Tippen, um Titan zu starten" })
  assert.deepEqual(hintFor(idle), { now: "Gedrückt halten und sprechen", also: "oder „Hey Titan“ sagen" })
  assert.deepEqual(hintFor({ ...idle, hearsItsName: false }), { now: "Gedrückt halten und sprechen", also: undefined })
  assert.equal(hintFor({ ...idle, state: "listening" }).now, "Ich höre zu")
  assert.deepEqual(hintFor({ ...idle, state: "speaking" }), { now: "Tippen zum Unterbrechen", also: "oder gedrückt halten und weiterfragen" })
})

test("in a pause the line says how to go on, whatever the voice does", () => {
  assert.deepEqual(hintFor({ ...idle, paused: true, state: "speaking" }), { now: "Pause", also: "Tippen, um weiterzumachen" })
})

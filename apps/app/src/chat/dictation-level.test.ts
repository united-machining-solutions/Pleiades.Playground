import assert from "node:assert/strict"
import { test } from "node:test"

import { elapsed, loudness } from "./dictation-level.ts"

const steady = (amplitude: number) => new Float32Array(1024).fill(amplitude)

test("silence and nothing are no bar", () => {
  assert.equal(loudness(steady(0)), 0)
  assert.equal(loudness(new Float32Array(0)), 0)
})

test("a voice close to the microphone fills the bar, and no sound more than fills it", () => {
  assert.equal(loudness(steady(0.5)), 1)
  assert.equal(loudness(steady(1)), 1)
})

test("a quiet voice still moves the bar: -40 dB is two fifths of it", () => {
  // 0.01 is a little less as a 32-bit float.
  assert.ok(Math.abs(loudness(steady(0.01)) - 0.4) < 1e-6)
})

test("the noise of a quiet room stays at the bottom", () => {
  assert.equal(loudness(steady(0.0005)), 0)
})

test("the time since the recording began reads like a clock", () => {
  assert.equal(elapsed(0), "0:00")
  assert.equal(elapsed(7_900), "0:07")
  assert.equal(elapsed(102_000), "1:42")
  assert.equal(elapsed(-5), "0:00")
})

import assert from "node:assert/strict"
import { test } from "node:test"

import { initialArrival, observe } from "./arrival.ts"
import type { Arrival, ArrivalState, Sample } from "./arrival.ts"

/** Feeds looks half a second apart, from `start` on, and collects the arrivals. */
function run(samples: ReadonlyArray<Sample>, state: ArrivalState = initialArrival, start = 0) {
  const arrivals: Array<{ at: number; arrival: Arrival }> = []
  samples.forEach((sample, index) => {
    const at = start + index * 500
    const next = observe(state, at, sample)
    state = next.state
    if (next.arrival) arrivals.push({ at, arrival: next.arrival })
  })
  return { arrivals, state }
}

const nobody: Sample = { face: false }
const someone: Sample = { face: true }
const anna: Sample = { face: true, name: "Anna" }

test("a recognised face arrives at once, with its name", () => {
  assert.deepEqual(run([nobody, anna]).arrivals, [{ at: 500, arrival: { name: "Anna" } }])
})

test("an unknown face arrives without a name after three looks", () => {
  assert.deepEqual(run([someone, someone, someone, someone]).arrivals, [{ at: 1000, arrival: {} }])
})

test("a name that comes on the second look is still announced", () => {
  assert.deepEqual(run([someone, anna, anna]).arrivals, [{ at: 500, arrival: { name: "Anna" } }])
})

test("someone who stays is announced once", () => {
  assert.equal(run(Array.from({ length: 60 }, () => anna)).arrivals.length, 1)
})

test("looking away for a few seconds is no new arrival", () => {
  const away = Array.from({ length: 10 }, () => nobody) // 5 s
  assert.equal(run([anna, ...away, anna]).arrivals.length, 1)
})

test("after ten seconds without a face, a face arrives again", () => {
  const away = Array.from({ length: 21 }, () => nobody) // 10.5 s
  const { arrivals } = run([anna, ...away, anna])
  assert.deepEqual(
    arrivals.map((one) => one.arrival),
    [{ name: "Anna" }, { name: "Anna" }],
  )
})

test("a single look with a face, then nobody, is dropped as a glitch", () => {
  const away = Array.from({ length: 21 }, () => nobody)
  const { arrivals, state } = run([someone, ...away])
  assert.deepEqual(arrivals, [])
  assert.equal(state.present, false)
})

test("the absence can be shorter", () => {
  let state: ArrivalState = initialArrival
  state = observe(state, 0, anna).state
  state = observe(state, 1000, nobody, { absentMs: 2000 }).state
  state = observe(state, 2500, nobody, { absentMs: 2000 }).state
  assert.deepEqual(observe(state, 3000, anna, { absentMs: 2000 }).arrival, { name: "Anna" })
})

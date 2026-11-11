import assert from "node:assert/strict"
import { test } from "node:test"

import { silences, silentAt, silentBetween } from "./liveness.ts"

const start = "2026-11-16T09:00:00.000Z"
/** An instant that many seconds after the start, as text and in milliseconds. */
const at = (seconds: number) => new Date(Date.parse(start) + seconds * 1000).toISOString()
const ms = (seconds: number) => Date.parse(at(seconds))
/** A sign of life every ten seconds, as a heartbeat gives it. */
const every10s = (from: number, to: number) =>
  Array.from({ length: (to - from) / 10 + 1 }, (_, index) => at(from + index * 10))

test("a machine that gives a sign every ten seconds is never silent", () => {
  assert.deepEqual(silences(every10s(-10, 300), at(0), at(300)), [])
})

test("silence begins 30 seconds after the last sign and ends with the next one", () => {
  const signs = [...every10s(-10, 60), ...every10s(200, 300)]
  assert.deepEqual(silences(signs, at(0), at(300)), [{ from: ms(90) + 1, to: ms(200) }])
})

test("a machine that stopped giving signs is silent to the end", () => {
  assert.deepEqual(silences(every10s(-10, 60), at(0), at(300)), [{ from: ms(90) + 1, to: ms(300) }])
})

test("without a sign from just before, the machine is silent where the stretch begins", () => {
  assert.deepEqual(silences([], at(0), at(300)), [{ from: ms(0), to: ms(300) }])
  assert.deepEqual(silences([at(120)], at(0), at(300)), [
    { from: ms(0), to: ms(120) },
    { from: ms(150) + 1, to: ms(300) },
  ])
  assert.deepEqual(silences([at(-20)], at(0), at(300)), [{ from: ms(10) + 1, to: ms(300) }])
})

test("the signs of several topics count together, in any order", () => {
  const heartbeat = [at(0), at(40), at(80)]
  const state = [at(100), at(20), at(60)]
  assert.deepEqual(silences([...heartbeat, ...state], at(0), at(120)), [])
})

test("two instants have a silence between them if a silent stretch touches the time between", () => {
  const silent = silences([at(0), at(200)], at(0), at(300))
  assert.equal(silentBetween(silent, at(0), at(200)), true)
  assert.equal(silentBetween(silent, at(100), at(150)), true)
  assert.equal(silentBetween(silent, at(0), at(20)), false)
  assert.equal(silentBetween(silent, at(200), at(220)), false)
  assert.equal(silentAt(silent, ms(30)), false)
  assert.equal(silentAt(silent, ms(31)), true)
  assert.equal(silentAt(silent, ms(200)), false)
})

import assert from "node:assert/strict"
import { test } from "node:test"

import { timeTicks } from "./time-ticks.ts"

const HOUR = 3_600_000
/** A moment at 12:37:20 on the clock of the browser, where the tests run. */
const at1237 = new Date(2026, 10, 18, 12, 37, 20).getTime()
const clockOf = (at: number) => {
  const time = new Date(at)
  return `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`
}

test("eight hours are marked on the full hours", () => {
  assert.deepEqual(timeTicks(at1237, at1237 + 8 * HOUR).map(clockOf), ["13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"])
})

test("an hour is marked on the quarter hours", () => {
  assert.deepEqual(timeTicks(at1237, at1237 + HOUR).map(clockOf), ["12:45", "13:00", "13:15", "13:30"])
})

test("a day is marked every third hour", () => {
  const ticks = timeTicks(at1237, at1237 + 24 * HOUR)
  assert.equal(ticks.length, 8)
  assert.ok(ticks.every((at) => new Date(at).getMinutes() === 0 && new Date(at).getHours() % 3 === 0))
})

test("a quarter of an hour is marked every five minutes", () => {
  assert.deepEqual(timeTicks(at1237, at1237 + HOUR / 4).map(clockOf), ["12:40", "12:45", "12:50"])
})

test("a round start is a mark itself, and nothing lies outside the range", () => {
  const start = new Date(2026, 10, 18, 13, 0, 0).getTime()
  const ticks = timeTicks(start, start + 2 * HOUR)
  assert.equal(clockOf(ticks[0] ?? 0), "13:00")
  assert.ok(ticks.every((at) => at >= start && at <= start + 2 * HOUR))
})

test("an empty range has no marks", () => {
  assert.deepEqual(timeTicks(at1237, at1237), [])
})

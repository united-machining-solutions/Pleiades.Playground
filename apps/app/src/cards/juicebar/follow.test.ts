import assert from "node:assert/strict"
import { test } from "node:test"

import { readAgainAndAgain, reached } from "./follow.ts"
import { whyNoOrder } from "./results.ts"

/** Lets the promises that are due run, as the timers are mocked and setImmediate is not. */
const settle = () => new Promise((done) => setImmediate(done))

test("a call that did not reach the server of the app is a failed call, and an order then may stand", async () => {
  const answer = await reached(Promise.reject(new TypeError("Failed to fetch")))
  assert.deepEqual(answer, { ok: false, reason: "The page did not reach the app: Failed to fetch.", answered: false })
  assert.equal(whyNoOrder(answer), "unsure")
})

test("a call that reached the server of the app keeps its answer", async () => {
  const answer = { ok: true as const, json: "{}" }
  assert.equal(await reached(Promise.resolve(answer)), answer)
})

test("a read that throws is followed by the next read, until the reading is stopped", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  let reads = 0
  const stop = readAgainAndAgain(async () => {
    reads += 1
    if (reads === 1) throw new TypeError("Failed to fetch")
  }, 1000)
  t.mock.timers.tick(1000)
  await settle()
  assert.equal(reads, 1)
  t.mock.timers.tick(1000)
  await settle()
  assert.equal(reads, 2)
  stop()
  t.mock.timers.tick(5000)
  await settle()
  assert.equal(reads, 2)
})

test("the next read starts only after the last one has ended", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  let reads = 0
  let end = () => {}
  const stop = readAgainAndAgain(() => {
    reads += 1
    return new Promise<void>((done) => (end = done))
  }, 1000)
  t.mock.timers.tick(1000)
  t.mock.timers.tick(5000)
  await settle()
  assert.equal(reads, 1)
  end()
  await settle()
  t.mock.timers.tick(1000)
  assert.equal(reads, 2)
  stop()
})

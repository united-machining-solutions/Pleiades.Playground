import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { debounce, oneAtATime } from "./pacing.ts"

test("a read does not start while the last one is under way, and starts again once it has ended", async () => {
  let started = 0
  let finish: () => void = () => {}
  const read = oneAtATime(() => {
    started++
    return new Promise<void>((resolve) => {
      finish = resolve
    })
  })
  assert.equal(read(), true)
  assert.equal(read(), false)
  assert.equal(read(), false)
  assert.equal(started, 1)
  finish()
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(read(), true)
  assert.equal(started, 2)
})

test("a failed read ends too, so the next one starts", async () => {
  let started = 0
  const read = oneAtATime(() => {
    started++
    return Promise.reject(new Error("no answer")).catch(() => {})
  })
  read()
  await new Promise((resolve) => setImmediate(resolve))
  read()
  assert.equal(started, 2)
})

test("a burst of calls acts once, after the last of them", () => {
  mock.timers.enable({ apis: ["setTimeout"] })
  try {
    let acted = 0
    const later = debounce(() => acted++, 2_000)
    later.call()
    mock.timers.tick(1_500)
    later.call()
    mock.timers.tick(1_500)
    later.call()
    assert.equal(acted, 0)
    mock.timers.tick(2_000)
    assert.equal(acted, 1)
    later.call()
    later.cancel()
    mock.timers.tick(5_000)
    assert.equal(acted, 1)
  } finally {
    mock.timers.reset()
  }
})

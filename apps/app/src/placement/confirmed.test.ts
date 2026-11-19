import assert from "node:assert/strict"
import { test } from "node:test"

import { CONFIRMED_KEY, MAX_CONFIRMED, createConfirmed } from "./confirmed.ts"

function memory() {
  const items = new Map<string, string>()
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  }
}

const done = { words: "4 machines added to North plant · Hall 4", at: "2026-11-19T10:42:00.000Z" }

test("what a person confirmed is found again by the id of the tool call", () => {
  const backing = memory()
  const { confirmedOf, keepConfirmed } = createConfirmed(() => backing)
  assert.equal(confirmedOf("call_1"), undefined)
  assert.equal(keepConfirmed("call_1", done), true)
  assert.deepEqual(createConfirmed(() => backing).confirmedOf("call_1"), done)
  const titled = { ...done, title: "Add machines to a site" }
  assert.equal(keepConfirmed("call_2", titled), true)
  assert.deepEqual(confirmedOf("call_2"), titled)
})

test("the oldest notes go first", () => {
  const backing = memory()
  const { confirmedOf, keepConfirmed } = createConfirmed(() => backing)
  for (let index = 0; index <= MAX_CONFIRMED; index += 1) keepConfirmed(`call_${index}`, done)
  assert.equal(confirmedOf("call_0"), undefined)
  assert.deepEqual(confirmedOf(`call_${MAX_CONFIRMED}`), done)
})

test("a storage that holds something else, blocks or is missing keeps nothing and breaks nothing", () => {
  const backing = memory()
  backing.items.set(CONFIRMED_KEY, "{not json")
  assert.equal(createConfirmed(() => backing).confirmedOf("call_1"), undefined)
  backing.items.set(CONFIRMED_KEY, JSON.stringify([["call_1", { words: 7, at: "x" }]]))
  assert.equal(createConfirmed(() => backing).confirmedOf("call_1"), undefined)
  const blocked = { ...memory(), setItem: () => { throw new Error("quota") } }
  assert.equal(createConfirmed(() => blocked).keepConfirmed("call_1", done), false)
  assert.equal(createConfirmed(() => undefined).keepConfirmed("call_1", done), false)
  assert.equal(createConfirmed(() => backing).keepConfirmed("call_1", { words: "x", at: "not a time" }), false)
})

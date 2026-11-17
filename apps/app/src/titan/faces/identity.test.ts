import assert from "node:assert/strict"
import { test } from "node:test"

import { initialIdentity, recheck, settle } from "./identity.ts"

test("the same name again changes nothing", () => {
  const { state, changed } = recheck(settle("Tom"), "Tom")
  assert.equal(changed, false)
  assert.equal(state.name, "Tom")
})

test("a new name counts after two looks in a row", () => {
  let step = recheck(settle("Tom"), "Kathrin")
  assert.equal(step.changed, false)
  assert.equal(step.state.name, "Tom")
  step = recheck(step.state, "Kathrin")
  assert.equal(step.changed, true)
  assert.equal(step.state.name, "Kathrin")
})

test("one doubtful look in between does not rename", () => {
  let step = recheck(settle("Tom"), "Kathrin")
  step = recheck(step.state, "Tom")
  step = recheck(step.state, "Kathrin")
  assert.equal(step.changed, false)
  assert.equal(step.state.name, "Tom")
})

test("someone who is no longer recognised becomes unknown after two looks", () => {
  let step = recheck(settle("Tom"), undefined)
  step = recheck(step.state, undefined)
  assert.equal(step.changed, true)
  assert.equal(step.state.name, undefined)
})

test("an unknown face that becomes known gets its name", () => {
  let step = recheck(initialIdentity, "Tom")
  step = recheck(step.state, "Tom")
  assert.equal(step.state.name, "Tom")
})

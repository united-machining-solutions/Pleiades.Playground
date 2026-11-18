import assert from "node:assert/strict"
import { test } from "node:test"

import { afterSwitch, pickSwitchedOff, pickedSwitchedOff } from "./ask.ts"

test("switching a server changes the ones that are off, each named once", () => {
  assert.deepEqual(afterSwitch([], "ultimaker", false), ["ultimaker"])
  assert.deepEqual(afterSwitch(["ultimaker"], "ultimaker", false), ["ultimaker"])
  assert.deepEqual(afterSwitch(["ultimaker", "juicebar"], "ultimaker", true), ["juicebar"])
})

test("the next chat begins without the servers switched off last, as far as the settings still name them", () => {
  assert.deepEqual(pickedSwitchedOff(["ultimaker"]), [])
  pickSwitchedOff(["ultimaker", "juicebar"])
  assert.deepEqual(pickedSwitchedOff(["ultimaker", "juicebar"]), ["ultimaker", "juicebar"])
  // The app started again with other settings while the page stayed open: a server that is gone is not asked for.
  assert.deepEqual(pickedSwitchedOff(["juicebar"]), ["juicebar"])
  assert.deepEqual(pickedSwitchedOff([]), [])
})

import assert from "node:assert/strict"
import { test } from "node:test"

import { afterSwitch, chatOf, markPress, pickSwitchedOff, pickedSwitchedOff, takePress } from "./ask.ts"

test("a press gives the focus to what it asked for, once, and the other does not take it", () => {
  // On a page load nothing was pressed: neither the heading nor the field takes the focus.
  assert.equal(takePress("heading"), false)
  assert.equal(takePress("field"), false)
  // "All chats": the heading of the view it leads to.
  markPress()
  assert.equal(takePress("field"), false)
  assert.equal(takePress("heading"), true)
  assert.equal(takePress("heading"), false)
  // "New chat": the head of the new view asks first and leaves it to the field.
  markPress("field")
  assert.equal(takePress("heading"), false)
  assert.equal(takePress("field"), true)
  assert.equal(takePress("field"), false)
})

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

test("a link to another page takes the open chat along and nothing else", () => {
  assert.deepEqual(chatOf({ chat: "c-17", show: "needs", page: 2, hours: 24 } as { chat?: unknown }), { chat: "c-17" })
  assert.deepEqual(chatOf({ show: "needs" } as { chat?: unknown }), {})
  assert.deepEqual(chatOf({ chat: 4 }), {})
})

import assert from "node:assert/strict"
import { test } from "node:test"

import type { RecipePart } from "./recipe.ts"
import { shownParts } from "./shown-parts.ts"

/** A part as the loader answers it: the part, and what its tool said. */
type Answered = RecipePart & { answer: string }

const list: RecipePart = { tool: "genui_machine_list", args: {} }
const p04: RecipePart = { tool: "genui_machine_show", args: { machine: "P-04" } }
const m02: RecipePart = { tool: "genui_machine_show", args: { machine: "M-02" } }
const answered: Array<Answered> = [
  { ...list, answer: "the machines" },
  { ...p04, answer: "P-04" },
  { ...m02, answer: "M-02" },
]

test("each part keeps its answer when the parts change their order or one goes", () => {
  const shown = shownParts([m02, list], answered)
  assert.deepEqual(
    shown.map((one) => one.answered?.answer),
    ["M-02", "the machines"],
  )
  assert.deepEqual(
    shown.map((one) => one.part),
    [m02, list],
  )
})

test("the key stays with the part where it moves, and when the page is read again", () => {
  const before = shownParts([list, p04, m02], answered)
  const moved = shownParts([p04, list, m02], answered)
  const readAgain = shownParts([p04, list, m02], [answered[1], answered[0], answered[2]])
  const keyOf = (shown: typeof before, part: RecipePart) => shown.find((one) => one.part === part)?.key
  for (const part of [list, p04, m02]) {
    assert.equal(keyOf(moved, part), keyOf(before, part))
    assert.equal(keyOf(readAgain, part), keyOf(before, part))
  }
  assert.equal(new Set(before.map((one) => one.key)).size, 3)
})

test("a part is known by its tool and its arguments, not by the object that holds them", () => {
  const fromStore: RecipePart = JSON.parse(JSON.stringify(p04))
  assert.equal(shownParts([fromStore], answered)[0].answered?.answer, "P-04")
})

test("a part the loader did not answer has no answer yet", () => {
  const other: RecipePart = { tool: "genui_machine_show", args: { machine: "P-07" } }
  const shown = shownParts([list, other], answered)
  assert.equal(shown[0].answered?.answer, "the machines")
  assert.equal(shown[1].answered, undefined)
})

test("two parts that ask the same have keys of their own and the same answer", () => {
  const shown = shownParts([p04, list, p04], answered)
  assert.notEqual(shown[0].key, shown[2].key)
  assert.equal(shown[0].answered?.answer, "P-04")
  assert.equal(shown[2].answered?.answer, "P-04")
})

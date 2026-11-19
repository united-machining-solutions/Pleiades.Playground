import assert from "node:assert/strict"
import { test } from "node:test"

import { ROOM, SMALLEST_PLAN, planOf, waitingOf } from "./plan.ts"

const at = (name: string, x: number, y: number) => ({ name, position: { x, y } })
const nowhere = (name: string) => ({ name, position: null })

test("a hall without machines has the smallest plan and no spot", () => {
  assert.deepEqual(planOf([]), { ...SMALLEST_PLAN, spots: [] })
})

test("a machine with a position stands there, and the plan is never smaller than the smallest", () => {
  const plan = planOf([at("a", 5, 4)])
  assert.equal(plan.width, SMALLEST_PLAN.width)
  assert.equal(plan.depth, SMALLEST_PLAN.depth)
  assert.deepEqual(
    plan.spots.map(({ machine, x, y, waiting }) => [machine.name, x, y, waiting]),
    [["a", 5, 4, false]],
  )
})

test("the plan grows with the positions, in whole metre, with room for the outermost machine", () => {
  const plan = planOf([at("a", 30.2, 20.4)])
  assert.equal(plan.width, Math.ceil(30.2 + ROOM.width / 2))
  assert.equal(plan.depth, Math.ceil(20.4 + ROOM.depth / 2))
})

test("machines without a position wait in rows from the upper left corner of an empty plan", () => {
  const plan = planOf(["a", "b", "c", "d", "e"].map(nowhere))
  const inARow = SMALLEST_PLAN.width / ROOM.width
  assert.equal(inARow, 4)
  assert.deepEqual(
    plan.spots.map(({ machine, x, y, waiting }) => [machine.name, x, y, waiting]),
    [
      ["a", 2, 1.5, true],
      ["b", 6, 1.5, true],
      ["c", 10, 1.5, true],
      ["d", 14, 1.5, true],
      ["e", 2, 4.5, true],
    ],
  )
})

test("the waiting stand below the lowest machine that has a position, and the plan is deep enough for them", () => {
  const plan = planOf([at("a", 3, 8), nowhere("b")])
  const [, waiting] = plan.spots
  assert.equal(waiting?.machine.name, "b")
  assert.equal(waiting?.y, 8 + ROOM.depth / 2 + ROOM.depth / 2)
  assert.equal(plan.depth, Math.ceil(8 + ROOM.depth / 2 + ROOM.depth))
})

test("a position that is left out counts as none", () => {
  const leftOut: { name: string; position?: null } = { name: "a" }
  assert.equal(planOf([leftOut]).spots[0]?.waiting, true)
  assert.equal(waitingOf([{ position: null }, {}, { position: { x: 1, y: 1 } }]), 2)
})

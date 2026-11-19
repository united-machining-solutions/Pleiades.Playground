import assert from "node:assert/strict"
import { test } from "node:test"

import { EDGE, ROOM, SMALLEST_PLAN, lineEvery, planOf, waitingOf } from "./plan.ts"

const at = (name: string, x: number, y: number) => ({ name, position: { x, y } })
const nowhere = (name: string) => ({ name, position: null })

test("a hall without machines has the smallest plan and no spot", () => {
  assert.deepEqual(planOf([]), { ...SMALLEST_PLAN, spots: [] })
})

test("a machine with a position is drawn there, the edge in from the corner, on a plan never smaller than the smallest", () => {
  const plan = planOf([at("a", 5, 4)])
  assert.equal(plan.width, SMALLEST_PLAN.width)
  assert.equal(plan.depth, SMALLEST_PLAN.depth)
  assert.deepEqual(
    plan.spots.map(({ machine, x, y, waiting }) => [machine.name, x, y, waiting]),
    [["a", 5 + EDGE.x, 4 + EDGE.y, false]],
  )
})

test("a machine at the very corner of its hall has the room of its sign on the plan", () => {
  const [spot] = planOf([at("a", 0, 0)]).spots
  assert.deepEqual([spot?.x, spot?.y], [ROOM.width / 2, ROOM.depth / 2])
})

test("the plan grows with the positions, in whole metre, with the edge on both sides", () => {
  const plan = planOf([at("a", 30.2, 20.4)])
  assert.equal(plan.width, Math.ceil(30.2 + ROOM.width))
  assert.equal(plan.depth, Math.ceil(20.4 + ROOM.depth))
  const [spot] = plan.spots
  assert.ok(spot && spot.x + ROOM.width / 2 <= plan.width && spot.y + ROOM.depth / 2 <= plan.depth)
})

test("machines without a position wait in rows from the upper left corner of an empty plan", () => {
  const plan = planOf(["a", "b", "c", "d", "e"].map(nowhere))
  assert.equal(SMALLEST_PLAN.width / ROOM.width, 4)
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

test("the waiting stand below the room of the lowest machine that has a position, and the plan is deep enough for them", () => {
  const plan = planOf([at("a", 3, 8), nowhere("b")])
  const [placed, waiting] = plan.spots
  assert.equal(waiting?.machine.name, "b")
  assert.equal(waiting?.y, (placed?.y ?? 0) + ROOM.depth)
  assert.equal(plan.depth, Math.ceil(8 + 2 * ROOM.depth))
})

test("many waiting machines make the plan deeper, never wider", () => {
  const plan = planOf(Array.from({ length: 13 }, (_, index) => nowhere(String(index))))
  assert.equal(plan.width, SMALLEST_PLAN.width)
  assert.equal(plan.depth, 4 * ROOM.depth)
})

test("a position that is left out counts as none", () => {
  const leftOut: { name: string; position?: null } = { name: "a" }
  assert.equal(planOf([leftOut]).spots[0]?.waiting, true)
  assert.equal(waitingOf([{ position: null }, {}, { position: { x: 1, y: 1 } }]), 2)
})

test("a small plan has a line every metre, a large one every five or ten", () => {
  assert.deepEqual([16, 60, 61, 300, 301, 1004].map(lineEvery), [1, 1, 5, 5, 10, 10])
})

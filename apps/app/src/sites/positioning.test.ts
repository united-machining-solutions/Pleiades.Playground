import assert from "node:assert/strict"
import { test } from "node:test"

import type { SiteList } from "@pleiades/cards/site/contract.ts"

import { FARTHEST } from "@pleiades/cards/site/plan.ts"

import type { Send } from "./placements.ts"
import { position, positionRequestOf, withPositions } from "./positioning.ts"

const M02 = "merope-microtec_MM-120_M-02"

test("a position names a machine and two distances on the plan", () => {
  assert.deepEqual(positionRequestOf({ machine: M02, position: { x: 12.5, y: 0 }, more: 1 }), { machine: M02, position: { x: 12.5, y: 0 } })
  assert.throws(() => positionRequestOf({ machine: "a/b", position: { x: 1, y: 1 } }), /'\/'/)
  for (const off of [{ x: -1, y: 1 }, { x: 1, y: FARTHEST + 1 }, { x: Number.NaN, y: 1 }, { x: "1", y: 1 }, { x: 1 }, undefined]) {
    assert.throws(() => positionRequestOf({ machine: M02, position: off }), /between 0 and 1000 metre/)
  }
})

test("a position goes to the Sites API as one request, and its answer says what became of it", async () => {
  const calls: Array<[string, string, unknown]> = []
  const answering = (status: number, text = ""): Send => async (path, method, body) => {
    calls.push([method, path, body])
    return { status, text }
  }
  const request = { machine: M02, position: { x: 3, y: 4.5 } }

  assert.deepEqual(await position(request, answering(200)), { ok: true })
  assert.deepEqual(calls, [["PUT", `/placements/${M02}/position`, { x: 3, y: 4.5 }]])

  const gone = await position(request, answering(404))
  assert.ok(!gone.ok && /no site any more/.test(gone.reason))
  const noHall = await position(request, answering(400, JSON.stringify("The machine stands in no hall.")))
  assert.ok(!noHall.ok && /no hall/.test(noHall.reason))
  const refused = await position(request, answering(403))
  assert.ok(!refused.ok && /sites:write/.test(refused.reason))
  const away = await position(request, async () => {
    throw new Error("connect ECONNREFUSED")
  })
  assert.ok(!away.ok && /did not answer/.test(away.reason))
})

test("a machine stands where it was dropped before the list is read again, and nothing else changes", () => {
  const placed = (machine: string) => ({ machine, displayName: null, placedAt: "2026-11-18T08:00:00.000Z", position: null, state: "no-data" as const, now: null })
  const hall1 = { name: "Hall 1", machines: [placed("a"), placed("b")] }
  const hall2 = { name: "Hall 2", machines: [placed("c")] }
  const other = { siteId: "south", company: "Demo", name: "South", machineCount: 0, counts: [], halls: [] }
  const list = {
    sites: [{ siteId: "north", company: "Demo", name: "North", machineCount: 3, counts: [], halls: [hall1, hall2] }, other],
  } as unknown as SiteList

  assert.equal(withPositions(list, new Map()), list)
  assert.equal(withPositions(list, new Map([["elsewhere", { x: 1, y: 1 }]])), list)

  const moved = withPositions(list, new Map([["b", { x: 7, y: 2 }]]))
  assert.deepEqual(
    moved.sites[0]?.halls[0]?.machines.map((one) => one.position),
    [null, { x: 7, y: 2 }],
  )
  assert.equal(moved.sites[0]?.halls[0]?.machines[0], hall1.machines[0])
  assert.equal(moved.sites[0]?.halls[1], hall2)
  assert.equal(moved.sites[1], other)
})

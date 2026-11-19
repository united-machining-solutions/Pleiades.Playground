import assert from "node:assert/strict"
import { test } from "node:test"

import { ordersOf } from "../../where-is-my-job/floor.ts"
import type { FloorPage } from "../../where-is-my-job/floor.ts"

import { withWhatIf } from "./orders.ts"

const asOf = "2026-11-19T10:00:00.000Z"
const page = { asOf, machines: [], jobs: {} } as unknown as FloorPage
const clusters = [
  { id: "cutting", name: "Cutting", machines: ["laser"] },
  { id: "turning", name: "Turning", machines: ["m02"] },
  { id: "milling", name: "Milling", machines: ["p07"] },
  { id: "grinding", name: "Grinding", machines: ["p04"] },
]

test("a made-up order passes a machine of each of its steps, in their order", () => {
  const decorated = withWhatIf(page, clusters)
  const orders = ordersOf(["laser", "m02", "p07", "p04"], decorated.jobs)
  const housing = orders.find((one) => one.number === "WI-1001")!
  assert.deepEqual(
    housing.steps.map((step) => step.machine),
    ["laser", "p07", "p04"],
  )
  assert.equal(housing.state, "running")
  assert.equal(housing.at.machine, "p07")
})

test("a step without a machine is left out, and an order of one step is no order across machines", () => {
  const orders = ordersOf(["laser", "m02", "p07", "p04"], withWhatIf(page, clusters).jobs)
  // Bracket: cutting, forming, joining; only cutting has a machine.
  assert.equal(orders.find((one) => one.number === "WI-1005"), undefined)
  // Gauge: printing, milling; only milling has a machine.
  assert.equal(orders.find((one) => one.number === "WI-1006"), undefined)
})

test("an order whose steps are all through has ended", () => {
  const orders = ordersOf(["laser", "m02", "p07", "p04"], withWhatIf(page, clusters).jobs)
  assert.equal(orders.find((one) => one.number === "WI-1007")!.state, "ended")
})

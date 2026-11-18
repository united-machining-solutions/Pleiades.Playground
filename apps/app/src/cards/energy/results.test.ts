import assert from "node:assert/strict"
import { test } from "node:test"

import { energyShowOf, machinesKey, machinesOf } from "./results.ts"

const machine = {
  machine: "P-04",
  energy: {
    value: 7_200_000,
    start: { value: 1_000_000, unit: "joule", at: "2026-11-17T08:00:00.000Z" },
    end: { value: 8_200_000, unit: "joule", at: "2026-11-17T15:59:58.000Z" },
    meterWentBack: false,
    unit: "joule",
    topic: "machines/P-04/umati/Consumption/Electricity/Main/AcActiveEnergyTotalImportHp",
  },
  power: { meanWatt: 900, peakWatt: 2400, values: 14400, unit: "watt", error: null, topic: "machines/P-04/umati/Consumption/Electricity/Main/AcActivePowerTotal" },
}

test("the JSON of genui_energy_show becomes the energy of every machine", () => {
  const shown = energyShowOf(
    JSON.stringify({ from: "2026-11-17T08:00:00.000Z", to: "2026-11-17T16:00:00.000Z", hours: 8, machines: [machine] }),
  )
  assert.equal(shown?.machines[0]?.energy.value, 7_200_000)
})

test("what does not keep the contract of the card is not drawn as one", () => {
  assert.equal(energyShowOf('{"from":"2026-11-17T08:00:00.000Z","to":"2026-11-17T16:00:00.000Z","hours":8,"machines":[{"machine":"P-04"}]}'), null)
  assert.equal(energyShowOf("no energy"), null)
  assert.equal(energyShowOf(undefined), null)
})

test("a machine id with a comma stays one machine on the way to the lines of the card", () => {
  // The MQTT binding forbids only `/`, `+` and `#` in a machine id.
  assert.deepEqual(machinesOf(machinesKey(["A,1", "P-04"])), ["A,1", "P-04"])
  assert.deepEqual(machinesOf(machinesKey([])), [])
})

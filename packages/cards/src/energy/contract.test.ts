import assert from "node:assert/strict"
import { test } from "node:test"

import { energySeries, energyShow } from "./contract.ts"

const meter = "machines/P-04/umati/Consumption/Electricity/Main/AcActiveEnergyTotalImportHp"
const power = "machines/P-04/umati/Consumption/Electricity/Main/AcActivePowerTotal"
const shown = {
  from: "2026-11-17T08:00:00.000Z",
  to: "2026-11-17T16:00:00.000Z",
  hours: 8,
  machines: [
    {
      machine: "P-04",
      energy: {
        value: 7_200_000,
        start: { value: 1_000_000, unit: "joule", at: "2026-11-17T07:59:55.000Z" },
        end: { value: 8_200_000, unit: "joule", at: "2026-11-17T15:59:58.000Z" },
        meterWentBack: false,
        unit: "joule",
        topic: meter,
      },
      power: { meanWatt: 900, peakWatt: 2400, values: 14400, unit: "watt", error: null, topic: power },
    },
  ],
}

test("the energy card carries the energy in the unit of its meter and the power in watt, each with its topic", () => {
  assert.equal(energyShow.safeParse(shown).success, true)
  // A machine whose energy is not known keeps its place, without a number.
  const unknown = { ...shown.machines[0]!, energy: { ...shown.machines[0]!.energy, value: null, start: null } }
  assert.equal(energyShow.safeParse({ ...shown, machines: [unknown] }).success, true)
  // Kilowatt hours are wording: a value without its topic, or as text, is not the contract.
  const { topic: _, ...withoutTopic } = shown.machines[0]!.energy
  assert.equal(energyShow.safeParse({ ...shown, machines: [{ ...shown.machines[0]!, energy: withoutTopic }] }).success, false)
  assert.equal(energyShow.safeParse({ ...shown, machines: [{ ...shown.machines[0]!, energy: { ...shown.machines[0]!.energy, value: "2 kWh" } }] }).success, false)
})

test("the lines of the graph name their instants once, and each line carries only its values", () => {
  const series = {
    from: shown.from,
    to: shown.to,
    instants: ["2026-11-17T12:00:00.000Z", "2026-11-17T16:00:00.000Z"],
    lines: [{ machine: "P-04", topic: power, watt: [850.5, null] }],
  }
  assert.equal(energySeries.safeParse(series).success, true)
  // A point with its own instant is not a value of a line.
  const pointed = { ...series, lines: [{ ...series.lines[0], watt: [{ at: series.instants[0], value: 850.5 }] }] }
  assert.equal(energySeries.safeParse(pointed).success, false)
})

import assert from "node:assert/strict"
import { test } from "node:test"

import { energyShow } from "./contract.ts"
import { energyShowInWords } from "./in-words.ts"
import { kilowattHours, kilowatts } from "./words.ts"

test("joule are written as kilowatt hours and watt as kilowatts", () => {
  assert.equal(kilowattHours(3_600_000), "1.00 kWh")
  assert.equal(kilowattHours(1_260_000), "0.35 kWh")
  assert.equal(kilowattHours(44_640_000), "12.4 kWh")
  assert.equal(kilowatts(2410), "2.41 kW")
})

const machine = (serial: string, joule: number | null, more: Partial<{ meterWentBack: boolean; startAt: string; meanWatt: number | null }> = {}) => ({
  machine: serial,
  energy: {
    joule,
    start: joule === null && !more.meterWentBack ? null : { joule: 1_000, at: more.startAt ?? "2026-11-17T07:59:55.000Z" },
    end: joule === null && !more.meterWentBack ? null : { joule: 1_000 + (joule ?? 0), at: "2026-11-17T15:59:58.000Z" },
    meterWentBack: more.meterWentBack ?? false,
    topic: `machines/${serial}/umati/Consumption/Electricity/Main/AcActiveEnergyTotalImportHp`,
  },
  power: {
    meanWatt: more.meanWatt === undefined ? 1550 : more.meanWatt,
    peakWatt: more.meanWatt === null ? null : 3400,
    values: more.meanWatt === null ? 0 : 14400,
    topic: `machines/${serial}/umati/Consumption/Electricity/Main/AcActivePowerTotal`,
  },
})

test("the card in words: the hours, then a line for each machine in the order of the result", () => {
  const shown = energyShow.parse({
    from: "2026-11-17T08:00:00.000Z",
    to: "2026-11-17T16:00:00.000Z",
    hours: 8,
    machines: [
      machine("P-04", 44_640_000),
      machine("M-02", 1_260_000, { startAt: "2026-11-17T09:30:00.000Z" }),
      machine("P-07", null, { meterWentBack: true }),
      machine("X-01", null, { meanWatt: null }),
    ],
  })
  assert.equal(
    energyShowInWords(shown),
    [
      "Energy imported in the last 8 hours, from 08:00 UTC to 16:00 UTC, from the meter of each machine:",
      "P-04: 12.4 kWh, mean power 1.55 kW while it published, peak 3.40 kW.",
      "M-02: 0.35 kWh (counted from 09:30 UTC, its first value), mean power 1.55 kW while it published, peak 3.40 kW.",
      "P-07: energy not known, its meter went back in this time, mean power 1.55 kW while it published, peak 3.40 kW.",
      "X-01: energy not known, its meter published no value, no value of active power.",
    ].join("\n"),
  )
})

test("an empty result says so", () => {
  const empty = energyShow.parse({ from: "2026-11-17T15:00:00.000Z", to: "2026-11-17T16:00:00.000Z", hours: 1, machines: [] })
  assert.equal(
    energyShowInWords(empty),
    "No machine published active power or its energy meter in the last hour, from 15:00 UTC to 16:00 UTC.",
  )
})

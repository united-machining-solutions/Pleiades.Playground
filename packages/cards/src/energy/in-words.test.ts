import assert from "node:assert/strict"
import { test } from "node:test"

import { energyShow } from "./contract.ts"
import { energyShowInWords } from "./in-words.ts"
import { axisKilowatts, cardRange, kilowattHours, kilowatts } from "./words.ts"

test("watt hours and joule are written as kilowatt hours, and watt as kilowatts", () => {
  assert.equal(kilowattHours(3_600_000, "joule"), "1.00 kWh")
  assert.equal(kilowattHours(1_260_000, "joule"), "0.35 kWh")
  assert.equal(kilowattHours(44_640_000, "joule"), "12.4 kWh")
  assert.equal(kilowattHours(3_940, "wattHour"), "3.94 kWh")
  assert.equal(kilowattHours(31_900, "wattHour"), "31.9 kWh")
  assert.equal(kilowatts(2410), "2.41 kW")
})

type More = Partial<{ meterWentBack: boolean; startAt: string; meanWatt: number | null; meterUnit: string | null; startUnit: string; powerUnit: string | null }>
const machine = (
  id: string,
  value: number | null,
  more: More = {},
) => ({
  machine: id,
  energy: {
    value,
    start:
      value === null && !more.meterWentBack && more.startUnit === undefined
        ? null
        : { value: 1_000, unit: more.startUnit ?? more.meterUnit ?? "joule", at: more.startAt ?? "2026-11-17T07:59:55.000Z" },
    end:
      value === null && !more.meterWentBack && more.startUnit === undefined
        ? null
        : { value: 1_000 + (value ?? 0), unit: more.meterUnit ?? "joule", at: "2026-11-17T15:59:58.000Z" },
    meterWentBack: more.meterWentBack ?? false,
    unit: more.meterUnit === undefined ? "joule" : more.meterUnit,
    topic: `machines/${id}/umati/Consumption/Electricity/Main/AcActiveEnergyTotalImportHp`,
  },
  power: {
    meanWatt: more.meanWatt === undefined ? 1550 : more.meanWatt,
    peakWatt: more.meanWatt === null ? null : 3400,
    values: more.meanWatt === null ? 0 : 14400,
    unit: more.powerUnit === undefined ? (more.meanWatt === null ? null : "watt") : more.powerUnit,
    error: null,
    topic: `machines/${id}/umati/Consumption/Electricity/Main/AcActivePowerTotal`,
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
      machine("X-01", null, { meanWatt: null, meterUnit: null }),
      machine("K-01", null, { meanWatt: null, meterUnit: "kilowattHour", powerUnit: "kilowatt" }),
      machine("taygeta-precision_TP-800_P-07", 3_940, { meterUnit: "wattHour" }),
      machine("C-03", null, { startUnit: "joule", meterUnit: "wattHour" }),
    ],
  })
  assert.equal(
    energyShowInWords(shown),
    [
      "Energy imported in the last 8 hours, from 08:00 UTC to 16:00 UTC, from the meter of each machine:",
      "P-04: 12.4 kWh, mean power 1.55 kW, peak 3.40 kW.",
      "M-02: 0.35 kWh (counted from 09:30 UTC, its first value), mean power 1.55 kW, peak 3.40 kW.",
      "P-07: energy not known, its meter went back in this time, mean power 1.55 kW, peak 3.40 kW.",
      "X-01: energy not known, its meter published no value, no value of active power.",
      "K-01: energy not known, its meter publishes in kilowattHour, not in watt hours or joule, and its active power in kilowatt, not watt.",
      "taygeta-precision_TP-800_P-07: 3.94 kWh, mean power 1.55 kW, peak 3.40 kW.",
      "C-03: energy not known, its meter changed from joule to wattHour in this time, mean power 1.55 kW, peak 3.40 kW.",
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

test("an axis never writes -0.0", () => {
  assert.equal(axisKilowatts(-0), "0.0")
  assert.equal(axisKilowatts(2_250), "2.25")
})

test("hours over midnight are written with their days, in the words and on the card", () => {
  const shown = energyShow.parse({
    from: "2026-11-17T16:00:00.000Z",
    to: "2026-11-18T16:00:00.000Z",
    hours: 24,
    machines: [machine("M-02", 1_260_000, { startAt: "2026-11-17T17:30:00.000Z" })],
  })
  assert.equal(
    energyShowInWords(shown).split("\n")[0],
    "Energy imported in the last 24 hours, from 17 Nov 16:00 UTC to 18 Nov 16:00 UTC, from the meter of each machine:",
  )
  assert.match(energyShowInWords(shown), /\(counted from 17 Nov 17:30 UTC, its first value\)/)
  assert.equal(cardRange(shown.from, shown.to, 24, "UTC"), "Last 24 hours, 17 Nov 16:00 to 18 Nov 16:00")
  assert.equal(cardRange("2026-11-18T08:00:00.000Z", "2026-11-18T16:00:00.000Z", 8, "UTC"), "Last 8 hours, 08:00 to 16:00")
})

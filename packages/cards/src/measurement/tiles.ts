import { kilowattHours } from "../energy/words.ts"
import { lasting } from "../machine/format.ts"
import type { Measurement, Quantity } from "./contract.ts"
import { measuredValue } from "./words.ts"

// The words of the tiles of what a machine measures now. On the wire a value keeps the unit it was
// published in; a tile writes it as a person reads it: kilowatts, kilowatt hours, percent, hours and
// minutes (ADR-0002). A tile computes nothing else.

/** A value as a tile writes it large: the number, and its unit set apart. */
export type Written = { number: string; unit: string }

/** Where the bar of the feed override ends: the overrides of a machine tool reach 120 %. */
export const FEED_MOST = 1.2

function number(value: number, decimals: number): string {
  return new Intl.NumberFormat("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value)
}

/** The measurement of one quantity, if the machine measured it. */
export function measured(measurements: ReadonlyArray<Measurement>, quantity: Quantity): Measurement | undefined {
  const one = measurements.find((each) => each.quantity === quantity)
  return one && one.value !== null ? one : undefined
}

/** 7.77 kW from watt. A power in another unit is written as the measurement card writes it. */
export function power(one: Pick<Measurement, "value" | "unit">): Written {
  if (typeof one.value === "number" && one.unit === "watt") return { number: number(one.value / 1000, 2), unit: "kW" }
  return apart(measuredValue(one))
}

/** 155.7 kWh from the unit of the meter. */
export function energy(value: number, unit: string | null): Written {
  return apart(kilowattHours(value, unit))
}

/** A fraction as percent: 1.1 is 110 %. Another unit is written as the measurement card writes it. */
export function percent(one: Pick<Measurement, "value" | "unit">): string {
  if (typeof one.value === "number" && one.unit === "one") return `${number(one.value * 100, 0)} %`
  return measuredValue(one)
}

/** Rotating or Stopped. */
export function rotating(one: Pick<Measurement, "value">): string {
  return one.value === true ? "Rotating" : "Stopped"
}

/** 8769 h 31 min from seconds. */
export function poweredOn(one: Pick<Measurement, "value" | "unit">): string {
  if (typeof one.value === "number" && one.unit === "second") return lasting(one.value * 1000)
  return measuredValue(one)
}

/** "2,410 W" to 2,410 and W; a value without a unit keeps none. */
function apart(text: string): Written {
  const space = text.lastIndexOf(" ")
  if (space < 0 || /\d$/.test(text)) return { number: text, unit: "" }
  return { number: text.slice(0, space), unit: text.slice(space + 1) }
}

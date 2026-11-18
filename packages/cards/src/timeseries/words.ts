import { QUANTITIES, QUANTITY_PATHS } from "../measurement/contract.ts"
import { axisNumber, quantityLabel } from "../measurement/words.ts"
import type { TimeseriesRange } from "./contract.ts"

// The words of the time series card. A value keeps the unit it was published in; the card writes it as
// the measurement card does (measurement/words.ts), so the two cards never say a value two ways.

/**
 * The unit a value is shown in, and the factor from the unit it was published in: a power in watt
 * is shown in kilowatts, as a person reads it at a machine (ADR-0002: a display converts). Any other
 * unit stays as it came.
 */
export function displayed(unit: string | null): { unit: string | null; factor: number } {
  return unit === "watt" ? { unit: "kilowatt", factor: 1 / 1000 } : { unit, factor: 1 }
}

/** "the last 15 minutes", "the last hour". */
export const rangeWords: Record<TimeseriesRange, string> = {
  "15m": "the last 15 minutes",
  "1h": "the last hour",
  "8h": "the last 8 hours",
  "24h": "the last 24 hours",
}

/** What each range is called on its toggle. */
export const rangeLabel: Record<TimeseriesRange, string> = { "15m": "15 min", "1h": "1 h", "8h": "8 h", "24h": "24 h" }

/** BearingTemperature to Bearing temperature, AcActivePowerTotal to Ac active power total. */
function spaced(level: string): string {
  const words = level.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(" ")
  return words.map((word, index) => (index === 0 ? word : word.toLowerCase())).join(" ")
}

/**
 * What a signal is called, from its path below the machine: a quantity of the measurement card by
 * its name there, any other by its levels without the namespace, the last one set apart.
 * umati/Spindle/1/Override is "Spindle 1 · Override", oem/Spindle/1/BearingTemperature is "Spindle bearing
 * temperature", as on the measurement card.
 */
export function signalLabel(path: string): string {
  const quantity = QUANTITIES.find((one) => QUANTITY_PATHS[one] === path)
  if (quantity !== undefined) return quantityLabel[quantity]
  const levels = path.split("/").slice(1)
  const last = levels.pop()
  if (last === undefined) return path
  return levels.length === 0 ? spaced(last) : `${levels.map(spaced).join(" ")} · ${spaced(last)}`
}

/** How many decimals a number needs to be written whole: 0.025 needs 3, 2.5 needs 1, 500 none. */
function decimalsOf(value: number): number {
  return String(Number(value.toPrecision(6))).split(".")[1]?.length ?? 0
}

/**
 * A tick of a y axis: in the decimals of its unit, as the measurement card writes a value of it, or
 * in more where the axis steps finer, so that two ticks are never written the same: 30.025 °C on an
 * axis that steps by 0.025, where 30.0 is enough on one that steps by 1.
 */
export function tickNumber(value: number, unit: string | null, step: number | undefined): string {
  // The decimals the measurement card writes a value of this unit with: 1 for 1.0 °C.
  const ofUnit = axisNumber(1, unit).split(".")[1]?.length ?? 0
  const digits = Math.max(ofUnit, step === undefined ? 0 : decimalsOf(step))
  return new Intl.NumberFormat("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
}

import type { ConditionTile, Shown, Signal } from "./contract.ts"

// How the TruLaser cards write a value: the name of the machine, a number in the unit people use, a signal
// as text. The names are those of the data model, and of the extension of TRUMPF where the model has none.

type About = { serialNumber: string | null; machine: string }

/** The name of the machine: TruLaser and the serial number, or the machine id where there is none. */
export function trulaserTitle({ serialNumber, machine }: Pick<About, "serialNumber" | "machine">): string {
  return `TruLaser ${serialNumber ?? machine}`
}

/**
 * A stored value as a display writes it: a fraction in `one` as percent, a pressure in `pascal` as
 * millibar. A value in another unit than the one expected is written with its own unit.
 */
export function shownNumber(value: number, unit: string | null, shown: Shown): { number: string; unit: string } {
  if (shown === "percent" && unit === "one") return { number: (value * 100).toFixed(1), unit: "%" }
  if (shown === "millibar" && unit === "pascal") return { number: (value / 100).toFixed(1), unit: "mbar" }
  if (shown === "microsiemens") return { number: value.toFixed(1), unit: "µS" }
  return { number: String(value), unit: unit ?? "" }
}

/** A value of a tile, with its unit; a dash where there is none. */
export function tileValue(tile: Pick<ConditionTile, "value" | "shown">): string {
  const { value, unit } = tile.value
  if (typeof value !== "number") return "–"
  const shown = shownNumber(value, unit, tile.shown)
  return `${shown.number} ${shown.unit}`.trim()
}

/** A value as text; a dash where there is none. A yes or no is written as one. */
export function signalText(signal: Signal): string {
  if (signal.value === null || signal.value === "") return "–"
  if (typeof signal.value === "boolean") return signal.value ? "yes" : "no"
  return String(signal.value)
}

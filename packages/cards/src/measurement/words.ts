import { lasting } from "../machine/format.ts"
import type { Measurement, Quantity } from "./contract.ts"

// The words of the measurement card: what a quantity is called and how its value is written. The
// value stays in the unit it was published in; only its sign is shortened, watt to W.

export const quantityLabel: Record<Quantity, string> = {
  activePower: "Active power",
  energyImported: "Energy imported",
  bearingTemperature: "Spindle bearing temperature",
  spindleRotating: "Spindle rotating",
  feedOverride: "Feed override",
  spindleOverride: "Spindle override",
  powerOnDuration: "Power-on duration",
}

/** The sign of a unit of the MQTT binding, and how many decimals a value in it is written with. */
const units: Record<string, { sign: string; decimals: number }> = {
  watt: { sign: "W", decimals: 0 },
  joule: { sign: "J", decimals: 0 },
  degreeCelsius: { sign: "°C", decimals: 1 },
  one: { sign: "", decimals: 2 },
}

function number(value: number, decimals: number): string {
  return new Intl.NumberFormat("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value)
}

/** The sign of a unit on an axis: W, °C, s. A fraction has none. */
export function unitSign(unit: string | null): string {
  if (unit === null) return ""
  if (unit === "second") return "s"
  return units[unit]?.sign ?? unit
}

/** A number on an axis, as short as its unit allows: 2,410, 51.6, 0.95. */
export function axisNumber(value: number, unit: string | null): string {
  const decimals = unit === null ? 0 : (units[unit]?.decimals ?? 2)
  return number(value, unit === "second" ? 0 : decimals)
}

const secondsClock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })

/** 09:05:30, in the time zone of the browser. */
export function clockWithSeconds(instant: string | number): string {
  return secondsClock.format(new Date(instant))
}

/** 2,410 W, 51.6 °C, 0.95, yes, 4 h 12 min. A unit without a sign of its own keeps its name. */
export function measuredValue({ value, unit }: Pick<Measurement, "value" | "unit">): string {
  if (value === null) return "no value"
  if (typeof value === "boolean") return value ? "yes" : "no"
  if (unit === "second") return lasting(value * 1000)
  const known = unit === null ? undefined : units[unit]
  if (!known) return `${number(value, 2)}${unit ? ` ${unit}` : ""}`
  return known.sign ? `${number(value, known.decimals)} ${known.sign}` : number(value, known.decimals)
}

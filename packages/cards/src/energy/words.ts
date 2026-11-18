import type { EnergyUnit } from "./contract.ts"

// The words of the energy card. On the wire energy is in the unit of the meter, watt hours or
// joule, and power in watt; a person reads kilowatt hours and kilowatts, so they are written so
// here, and only here: this is the display that converts (ADR-0002).

/** How many of a unit of energy make one kilowatt hour. */
const PER_KILOWATT_HOUR: Record<EnergyUnit, number> = { wattHour: 1_000, joule: 3_600_000 }

/** An energy in kilowatt hours, from the unit of its meter. Null for a unit that is not one of energy. */
export function inKilowattHours(value: number, unit: string | null): number | null {
  const per = unit === null ? undefined : PER_KILOWATT_HOUR[unit as EnergyUnit]
  return per === undefined ? null : value / per
}

function number(value: number, decimals: number): string {
  return new Intl.NumberFormat("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value)
}

/** 12.4 kWh, 0.35 kWh: two decimals below ten, one above. A unit that is not one of energy keeps its name. */
export function kilowattHours(value: number, unit: string | null): string {
  const kwh = inKilowattHours(value, unit)
  if (kwh === null) return `${number(value, 0)} ${unit ?? ""}`.trim()
  return `${number(kwh, Math.abs(kwh) < 10 ? 2 : 1)} kWh`
}

/** 2.41 kW. */
export function kilowatts(watt: number): string {
  return `${number(watt / 1000, 2)} kW`
}

/** A value of the graph on its axis, in kilowatts: 2.0, 2.25. A round tick needs no more than two decimals. */
export function axisKilowatts(watt: number): string {
  return new Intl.NumberFormat("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(watt / 1000)
}

/** "the last hour", "the last 8 hours". */
export function lastHours(hours: number): string {
  return hours === 1 ? "the last hour" : `the last ${hours} hours`
}

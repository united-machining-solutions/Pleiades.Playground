import type { EnergyUnit } from "./contract.ts"

// The words of the energy card. On the wire energy is in the unit of the meter, watt hours or
// joule, and power in watt; a person reads kilowatt hours and kilowatts, so they are written so
// here, and only here: the card and the words of a tool result are displays (ADR-0002, ADR-0017).

/** How many of a unit of energy make one kilowatt hour. */
const PER_KILOWATT_HOUR: Record<EnergyUnit, number> = { wattHour: 1_000, joule: 3_600_000 }

/** An energy in kilowatt hours, from the unit of its meter. Null for a unit that is not one of energy. */
export function inKilowattHours(value: number, unit: string | null): number | null {
  const per = unit === null ? undefined : PER_KILOWATT_HOUR[unit as EnergyUnit]
  return per === undefined ? null : value / per
}

/** A number in the decimals given, as the cards write numbers: 1,234.50. */
export function number(value: number, decimals: number): string {
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

/** A value of the graph on its axis, in kilowatts: 2.0, 2.25. A round tick needs no more than two decimals; 0 has no sign. */
export function axisKilowatts(watt: number): string {
  return new Intl.NumberFormat("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(watt === 0 ? 0 : watt / 1000)
}

/** "the last hour", "the last 8 hours". */
export function lastHours(hours: number): string {
  return hours === 1 ? "the last hour" : `the last ${hours} hours`
}

/**
 * What the card says about its hours, in the time zone of the browser or the one named: "Last 8
 * hours, 08:00 to 16:00", and with the days where they cross midnight, "Last 24 hours, 17 Nov
 * 16:00 to 18 Nov 16:00".
 */
export function cardRange(from: string, to: string, hours: number, timeZone?: string): string {
  const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone })
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone })
  const [start, end] = [new Date(from), new Date(to)]
  const days = day.format(start) !== day.format(end)
  const at = (instant: Date) => (days ? `${day.format(instant)} ${clock.format(instant)}` : clock.format(instant))
  const last = hours === 1 ? "Last hour" : `Last ${hours} hours`
  return `${last}, ${at(start)} to ${at(end)}`
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/**
 * An instant as it is written, a clock at its own offset, and with its day where the hours cross
 * midnight: "17 Nov 16:00 UTC". `withDay` says whether they do.
 */
export function writtenOn(instant: string, withDay: boolean, written: (instant: string) => string): string {
  if (!withDay) return written(instant)
  return `${Number(instant.slice(8, 10))} ${MONTHS[Number(instant.slice(5, 7)) - 1]} ${written(instant)}`
}

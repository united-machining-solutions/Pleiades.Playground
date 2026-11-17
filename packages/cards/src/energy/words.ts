// The words of the energy card. On the wire energy is in joule and power in watt; a person reads
// kilowatt hours and kilowatts, so they are written so here, and only here.

const JOULE_PER_KILOWATT_HOUR = 3_600_000

function number(value: number, decimals: number): string {
  return new Intl.NumberFormat("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value)
}

/** 12.4 kWh, 0.35 kWh: two decimals below ten, one above. */
export function kilowattHours(joule: number): string {
  const kwh = joule / JOULE_PER_KILOWATT_HOUR
  return `${number(kwh, Math.abs(kwh) < 10 ? 2 : 1)} kWh`
}

/** 2.41 kW. */
export function kilowatts(watt: number): string {
  return `${number(watt / 1000, 2)} kW`
}

/** A value of the graph on its axis, in kilowatts: 2.4. */
export function axisKilowatts(watt: number): string {
  return number(watt / 1000, 1)
}

/** "the last hour", "the last 8 hours". */
export function lastHours(hours: number): string {
  return hours === 1 ? "the last hour" : `the last ${hours} hours`
}

import type { Unit } from "./contract.ts"

// How a value of a view is written. The value stays in its unit; only the writing picks a prefix.

/** 12, 83 %, 4.2 MJ. A value that is not known is a dash. */
export function valueText(value: number | null, unit: Unit): string {
  if (value === null) return "–"
  switch (unit) {
    case "count":
      return String(Math.round(value))
    case "one":
      return `${Math.round(value * 100)} %`
    case "joule":
      return joule(value)
  }
}

function joule(value: number): string {
  const prefixes: ReadonlyArray<[number, string]> = [
    [1e12, "TJ"],
    [1e9, "GJ"],
    [1e6, "MJ"],
    [1e3, "kJ"],
  ]
  for (const [size, name] of prefixes) {
    if (Math.abs(value) >= size) return `${(value / size).toFixed(1)} ${name}`
  }
  return `${Math.round(value)} J`
}

/** 1 h 05 min, 12 min, 40 s. */
export function secondsText(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`
}

/** "the last 24 h", from the two ends of a block. */
export function windowText(from: string, to: string): string {
  return `last ${Math.round((Date.parse(to) - Date.parse(from)) / 3_600_000)} h`
}

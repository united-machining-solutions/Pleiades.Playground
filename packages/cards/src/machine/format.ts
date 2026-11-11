const clockFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" })

/** 09:05, in the time zone of the browser. */
export function clock(instant: string): string {
  return clockFormat.format(new Date(instant))
}

/**
 * 09:05, the hours and minutes as the instant itself is written: a clock at its own offset. A
 * time in UTC says so. A backend writes times like this, because it has no time zone of its own:
 * the tools write every instant in the time zone of the person who asks.
 */
export function written(instant: string): string {
  return `${instant.slice(11, 16)}${instant.endsWith("Z") ? " UTC" : ""}`
}

/** 38 min, 1 h, 1 h 30 min. */
export function lasting(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60_000)
  if (minutes < 1) return "under 1 min"
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${minutes} min`
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

/** How long it is from one instant to another. */
export function duration(from: string, to: string): string {
  return lasting(Date.parse(to) - Date.parse(from))
}

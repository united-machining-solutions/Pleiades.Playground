const clockFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" })

/** 09:05, in the time zone of the browser. */
export function clock(instant: string): string {
  return clockFormat.format(new Date(instant))
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

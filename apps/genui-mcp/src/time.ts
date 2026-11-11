// The Timeseries API counts microseconds since 1970, the Events API writes ISO 8601.
// Inside this server an instant is an ISO 8601 string in UTC. A tool result keeps that, unless
// the caller names a time zone: then every instant is written as a clock there shows it.

export function fromMicroseconds(microseconds: number): string {
  return new Date(microseconds / 1000).toISOString()
}

export function secondsBefore(instant: Date, seconds: number): Date {
  return new Date(instant.getTime() - seconds * 1000)
}

/** Whether the runtime knows this name as a time zone, for example Europe/Zurich. */
export function isTimeZone(name: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: name })
    return true
  } catch {
    return false
  }
}

/**
 * The same instant as a clock in that time zone shows it, with its offset to UTC:
 * 2026-11-11T08:00:41.000Z in Europe/Zurich is 2026-11-11T09:00:41.000+01:00.
 */
export function inTimeZone(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).formatToParts(new Date(instant))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((one) => one.type === type)?.value ?? ""
  // The offset reads "GMT+01:00", and just "GMT" where it is zero.
  const offset = part("timeZoneName").replace("GMT", "") || "+00:00"
  const date = `${part("year")}-${part("month")}-${part("day")}`
  return `${date}T${part("hour")}:${part("minute")}:${part("second")}.${part("fractionalSecond")}${offset}`
}

const instantInUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/

/** A tool result with every instant in it written in that time zone. Without one it stays as it is. */
export function inTimeZoneOf<TValue>(value: TValue, timeZone: string | undefined): TValue {
  if (timeZone === undefined) return value
  const rewrite = (one: unknown): unknown => {
    if (typeof one === "string") return instantInUtc.test(one) ? inTimeZone(one, timeZone) : one
    if (Array.isArray(one)) return one.map(rewrite)
    if (typeof one === "object" && one !== null) {
      return Object.fromEntries(Object.entries(one).map(([key, inner]) => [key, rewrite(inner)]))
    }
    return one
  }
  return rewrite(value) as TValue
}

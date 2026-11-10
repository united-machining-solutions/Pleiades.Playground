// The Timeseries API counts microseconds since 1970, the Events API writes ISO 8601.
// Inside this server and in every tool result an instant is an ISO 8601 string in UTC.

export function fromMicroseconds(microseconds: number): string {
  return new Date(microseconds / 1000).toISOString()
}

export function secondsBefore(instant: Date, seconds: number): Date {
  return new Date(instant.getTime() - seconds * 1000)
}

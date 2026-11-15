import type { Machine, MachineShow, Notification, Reading, Span } from "@pleiades/cards/machine/contract.ts"

// Fixed values for the examples of the design system page, in the shape of the contract of the card
// catalogue. They are the machines, programs and notifications of the demo stack at one instant, so
// an example reads like the app and stays the same whatever the simulators do. Nothing here is read
// from the backend.

/**
 * A time of day on the clock of the reader, as an instant. The card writes its times in the time
 * zone of the browser, so 09:02 here reads 09:02 on every screen, like the examples around it.
 */
function at(time: string, seconds = 0): string {
  const [hours = 0, minutes = 0] = time.split(":").map(Number)
  return new Date(2026, 10, 16, hours, minutes, seconds).toISOString()
}

/** The instant every example is read at. */
export const asOf = at("09:30")
const justNow = at("09:29", 55)

const paths = {
  connection: "umati/Connection/State",
  heartbeat: "umati/Connection/Heartbeat",
  itemState: "umati/State/MachineryItemState",
  operationMode: "umati/State/MachineryOperationMode",
  program: "umati/Production/ActiveProgram",
} as const

function machine(
  serialNumber: string,
  values: { itemState: string; operationMode: string; program: string; since: string },
  notifications: ReadonlyArray<Omit<Notification, "correlationId" | "topic">> = [],
  /** The last sign of life: a moment ago, unless the machine went silent. */
  lastValueAt: string = justNow,
): Machine {
  const reading = (name: keyof typeof paths, value: string, since: string): Reading => ({
    value,
    at: lastValueAt,
    since: at(since),
    sinceIsLowerBound: false,
    topic: `machines/${serialNumber}/${paths[name]}`,
  })
  return {
    machine: serialNumber,
    connection: reading("connection", "Connected", "01:30"),
    heartbeat: reading("heartbeat", "2825", "09:29"),
    itemState: reading("itemState", values.itemState, values.since),
    operationMode: reading("operationMode", values.operationMode, values.since),
    program: reading("program", values.program, "08:42"),
    lastValueAt,
    notifications: notifications.map((one) => ({
      ...one,
      correlationId: `${serialNumber}-${one.notificationId}`,
      topic: `machines/${serialNumber}/events/notifications`,
    })),
  }
}

/** In alarm: an error was raised and has not gone. */
export const p04 = machine(
  "P-04",
  { itemState: "NotExecuting", operationMode: "Processing", program: "SHAFT_4711.MPF", since: "09:02" },
  [{ notificationId: "2130", level: "Error", title: "Spindle overtemperature, machine stopped", raisedAt: at("09:02") }],
)

/** Running, with an open warning: the machine keeps running. */
export const p07 = machine(
  "P-07",
  { itemState: "Executing", operationMode: "Processing", program: "HOUSING_0815.MPF", since: "07:15" },
  [{ notificationId: "3310", level: "Warning", title: "Coolant pressure below minimum", raisedAt: at("09:11") }],
)

/** In setup since 08:48, and silent for the last ten minutes: its values are the last known ones. */
export const m02 = machine(
  "M-02",
  { itemState: "NotExecuting", operationMode: "Setup", program: "SHAFT_4711.MPF", since: "08:48" },
  [],
  at("09:20"),
)

const from = at("01:30")

/** The last eight hours of P-04, oldest first and without a gap: what the band of its card draws. */
export const p04Spans: ReadonlyArray<Span> = [
  { state: "running", from, to: at("03:40") },
  { state: "no-data", from: at("03:40"), to: at("03:58") },
  { state: "running", from: at("03:58"), to: at("05:30") },
  { state: "setup", from: at("05:30"), to: at("06:10") },
  { state: "running", from: at("06:10"), to: at("08:20") },
  { state: "stopped", from: at("08:20"), to: at("08:42") },
  { state: "running", from: at("08:42"), to: at("09:02") },
  { state: "alarm", from: at("09:02"), to: asOf },
]

/** The values of the machine card of P-04. The sums are those of the spans above. */
export const p04Show: MachineShow = {
  asOf,
  windowSeconds: 1800,
  machine: p04,
  history: {
    from,
    to: asOf,
    totals: [
      { state: "running", seconds: 372 * 60 },
      { state: "setup", seconds: 40 * 60 },
      { state: "stopped", seconds: 22 * 60 },
      { state: "alarm", seconds: 28 * 60 },
      { state: "no-data", seconds: 18 * 60 },
    ],
  },
}

export const p07Spans: ReadonlyArray<Span> = [
  { state: "running", from, to: at("06:45") },
  { state: "stopped", from: at("06:45"), to: at("07:15") },
  { state: "running", from: at("07:15"), to: asOf },
]

/** The values of the machine card of P-07: running, with a warning. */
export const p07Show: MachineShow = {
  asOf,
  windowSeconds: 1800,
  machine: p07,
  history: {
    from,
    to: asOf,
    totals: [
      { state: "running", seconds: 450 * 60 },
      { state: "stopped", seconds: 30 * 60 },
    ],
  },
}

export const m02Spans: ReadonlyArray<Span> = [
  { state: "running", from, to: at("08:48") },
  { state: "setup", from: at("08:48"), to: at("09:20") },
  { state: "no-data", from: at("09:20"), to: asOf },
]

/** The values of the machine card of M-02: no data. */
export const m02Show: MachineShow = {
  asOf,
  windowSeconds: 1800,
  machine: m02,
  history: {
    from,
    to: asOf,
    totals: [
      { state: "running", seconds: 438 * 60 },
      { state: "setup", seconds: 32 * 60 },
      { state: "no-data", seconds: 10 * 60 },
    ],
  },
}

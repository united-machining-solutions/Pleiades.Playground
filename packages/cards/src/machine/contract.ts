import { z } from "zod"

// The contract of what is shown about a machine. The backend takes these shapes as the output of
// its tools, and the properties of the components are inferred from them, so the two cannot drift
// apart. Every value names the topic or the notification it comes from.

/**
 * A machine gives a sign of life every few seconds: its heartbeat, or any value it publishes.
 * Its state it may publish only when the state changes, so a value holds until the next one.
 * Silent for longer than this, the machine is not live, and a run of a value ends: what the
 * value was in between is not known.
 */
export const SILENT_AFTER_SECONDS = 30

/**
 * An instant is ISO 8601: in UTC, or as a clock in the time zone a tool was asked for shows it,
 * with its offset to UTC. Either way it is one point in time.
 */
export const instant = z.iso.datetime({ offset: true })

export const reading = z.object({
  value: z.string().nullable().describe("The newest value, or null if the topic had none."),
  at: instant.nullable().describe("When the newest value was measured."),
  since: instant.nullable().describe("Since when the value has been the same."),
  sinceIsLowerBound: z
    .boolean()
    .describe("True if the value was already the same before the values that were read, so `since` is only the earliest time known."),
  topic: z.string().describe("The MQTT topic the value comes from."),
})
export type Reading = z.infer<typeof reading>

export const notification = z.object({
  correlationId: z.string(),
  notificationId: z.string(),
  level: z.enum(["Warning", "Error"]),
  title: z.string(),
  raisedAt: instant,
  topic: z.string().describe("The MQTT topic the notification comes from."),
})
export type Notification = z.infer<typeof notification>

/** What a machine does now. */
export const machine = z.object({
  machine: z.string().describe("The serial number, which identifies the machine in every topic."),
  connection: reading,
  heartbeat: reading.describe("The sign of life of the machine. Its value counts up and says nothing else."),
  itemState: reading,
  operationMode: reading,
  program: reading,
  lastValueAt: instant.nullable().describe("The newest value of any of the readings: the last sign of life."),
  notifications: z
    .array(notification)
    .describe("Warnings and errors that were raised in the last 24 hours and have not gone."),
})
export type Machine = z.infer<typeof machine>

/** What a machine does, as a list and a card name it. `state.ts` decides which values are which state. */
export const state = z.enum(["alarm", "stopped", "no-data", "setup", "running"])
export type State = z.infer<typeof state>

export const span = z.object({ state, from: instant, to: instant })
export type Span = z.infer<typeof span>

export const total = z.object({
  state,
  seconds: z.number().describe("How long the machine was in that state between `from` and `to`, in seconds."),
})
export type Total = z.infer<typeof total>

/** The list of machines: what every machine does now. An application draws it with rows of its own. */
export const machineList = z.object({
  asOf: instant,
  windowSeconds: z.number().describe("How far back the values were read to find `since`."),
  machines: z.array(machine),
})
export type MachineList = z.infer<typeof machineList>

/** The machine card: what one machine does now, and what it did in the hours before. */
export const machineShow = z.object({
  asOf: instant,
  windowSeconds: z.number().describe("How far back the values were read to find `since`."),
  machine,
  history: z.object({
    from: instant,
    to: instant,
    spans: z.array(span).describe("The states between `from` and `to`, oldest first and without a gap."),
    totals: z
      .array(total)
      .describe(
        "How long each state lasted in total between `from` and `to`: the sums of the spans, in the order a display reads the states. A state that did not occur is not listed.",
      ),
  }),
})
export type MachineShow = z.infer<typeof machineShow>

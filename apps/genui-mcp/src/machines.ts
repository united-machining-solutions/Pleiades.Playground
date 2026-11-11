import { z } from "zod"

import { listTopics, readOpenNotifications, readStrings } from "./apis.ts"
import type { Apis, OpenNotification, Sample, Series } from "./apis.ts"
import { secondsBefore } from "./time.ts"

// What every machine does now. Each value names the topic or the notification it comes from.

/** How far back the values are read to find since when a state has lasted. */
export const WINDOW_SECONDS = 30 * 60
/** How far back a machine and its open notifications are still looked for. */
export const HORIZON_SECONDS = 24 * 60 * 60
/**
 * A machine publishes its state every few seconds. After a pause longer than this, what the value
 * was in between is not known, so the pause ends a run.
 */
export const SILENT_AFTER_SECONDS = 30

const reading = z.object({
  value: z.string().nullable().describe("The newest value, or null if the topic had none."),
  at: z.iso.datetime().nullable().describe("When the newest value was measured."),
  since: z.iso.datetime().nullable().describe("Since when the value has been the same."),
  sinceIsLowerBound: z
    .boolean()
    .describe("True if the value was already the same where the window starts, so `since` is only the earliest time known."),
  topic: z.string().describe("The MQTT topic the value comes from."),
})
export type Reading = z.infer<typeof reading>

const notification = z.object({
  correlationId: z.string(),
  notificationId: z.string(),
  level: z.enum(["Warning", "Error"]),
  title: z.string(),
  raisedAt: z.iso.datetime(),
  topic: z.string().describe("The MQTT topic the notification comes from."),
})

const machine = z.object({
  machine: z.string().describe("The serial number, which identifies the machine in every topic."),
  connection: reading,
  itemState: reading,
  operationMode: reading,
  program: reading,
  lastValueAt: z.iso.datetime().nullable().describe("The newest value of any of the readings."),
  notifications: z.array(notification).describe("Warnings and errors that have not gone."),
})
export type Machine = z.infer<typeof machine>

export const machineList = z.object({
  asOf: z.iso.datetime(),
  windowSeconds: z.number().describe("How far back the values were read to find `since`."),
  machines: z.array(machine),
})
export type MachineList = z.infer<typeof machineList>

const paths = {
  connection: "umati/Connection/State",
  itemState: "umati/State/MachineryItemState",
  operationMode: "umati/State/MachineryOperationMode",
  program: "umati/Production/ActiveProgram",
} as const
type ReadingName = keyof typeof paths

/** `machines/P-04/umati/State/MachineryItemState` belongs to the machine `P-04`. */
export function machineOf(topic: string): string | undefined {
  return /^machines\/([^/]+)\//.exec(topic)?.[1]
}

function silentBetween(earlier: string, later: string): boolean {
  return Date.parse(later) - Date.parse(earlier) > SILENT_AFTER_SECONDS * 1000
}

/**
 * The newest value and the start of the unbroken run of that value. Samples are oldest first and
 * were read from `windowStart` on. A run goes back as far as the value stayed the same without a
 * pause; only a run that reaches the start of the window began before it.
 */
export function currentRun(topic: string, samples: ReadonlyArray<Sample>, windowStart: string): Reading {
  const newest = samples.at(-1)
  if (!newest) return { value: null, at: null, since: null, sinceIsLowerBound: false, topic }
  let since = newest.at
  let reachesFirstSample = true
  for (let index = samples.length - 2; index >= 0; index--) {
    const before = samples[index]
    if (!before || before.value !== newest.value || silentBetween(before.at, since)) {
      reachesFirstSample = false
      break
    }
    since = before.at
  }
  return {
    value: newest.value,
    at: newest.at,
    since,
    sinceIsLowerBound: reachesFirstSample && !silentBetween(windowStart, since),
    topic,
  }
}

function samplesOf(series: ReadonlyArray<Series>, topic: string): ReadonlyArray<Sample> {
  return series.find((one) => one.topic === topic)?.samples ?? []
}

function newest(instants: ReadonlyArray<string | null>): string | null {
  return instants.reduce<string | null>(
    (latest, instant) => (instant !== null && (latest === null || instant > latest) ? instant : latest),
    null,
  )
}

export async function listMachines(apis: Apis, now = new Date()): Promise<MachineList> {
  const windowStart = secondsBefore(now, WINDOW_SECONDS)
  const horizon = secondsBefore(now, HORIZON_SECONDS)
  const names = Object.keys(paths) as Array<ReadingName>

  const [topics, errors, warnings, ...series] = await Promise.all([
    listTopics(apis, horizon, now),
    readOpenNotifications(apis, "Error", horizon, now),
    readOpenNotifications(apis, "Warning", horizon, now),
    ...names.map((name) => readStrings(apis, `machines/*/${paths[name]}`, windowStart, now)),
  ])
  const inWindow = Object.fromEntries(names.map((name, index) => [name, series[index] ?? []])) as Record<
    ReadingName,
    Array<Series>
  >
  const open: Array<OpenNotification> = [...errors, ...warnings]
  const serialNumbers = [...new Set(topics.flatMap((topic) => machineOf(topic) ?? []))].sort()

  const machines = await Promise.all(
    serialNumbers.map(async (serialNumber): Promise<Machine> => {
      const read = async (name: ReadingName): Promise<Reading> => {
        const topic = `machines/${serialNumber}/${paths[name]}`
        const samples = samplesOf(inWindow[name], topic)
        if (samples.length > 0) return currentRun(topic, samples, windowStart.toISOString())
        // Silent for longer than the window: the last known value, without a "since".
        const [last] = await readStrings(apis, topic, horizon, now, 1)
        return {
          ...currentRun(topic, last?.samples ?? [], horizon.toISOString()),
          since: null,
          sinceIsLowerBound: false,
        }
      }
      const [connection, itemState, operationMode, program] = await Promise.all([
        read("connection"),
        read("itemState"),
        read("operationMode"),
        read("program"),
      ])
      const topic = `machines/${serialNumber}/events/notifications`
      return {
        machine: serialNumber,
        connection,
        itemState,
        operationMode,
        program,
        lastValueAt: newest([connection.at, itemState.at, operationMode.at, program.at]),
        notifications: open
          .filter((one) => one.machine === serialNumber)
          .sort((a, b) => b.raisedAt.localeCompare(a.raisedAt))
          .map(({ correlationId, notificationId, level, title, raisedAt }) => ({
            correlationId,
            notificationId,
            level,
            title,
            raisedAt,
            topic,
          })),
      }
    }),
  )

  return { asOf: now.toISOString(), windowSeconds: WINDOW_SECONDS, machines }
}

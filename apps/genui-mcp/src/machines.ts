import { SILENT_AFTER_SECONDS, instant, machine } from "@pleiades/cards/machine/contract.ts"
import type { Machine, MachineShow, Reading } from "@pleiades/cards/machine/contract.ts"
import { z } from "zod"

import { listTopics, readNumbers, readOpenNotifications, readRaised, readStrings } from "./apis.ts"
import type { Apis, OpenNotification, Sample, Series } from "./apis.ts"
import { spansBetween } from "./history.ts"
import { silences, silentBetween } from "./liveness.ts"
import type { Stretch } from "./liveness.ts"
import { secondsBefore } from "./time.ts"

// What every machine does now. Each value names the topic or the notification it comes from.
// The shape of one machine is a contract of the card catalogue, because cards show it.

/** How far back the values are read to find since when a state has lasted. */
export const WINDOW_SECONDS = 30 * 60
/** How far back a machine and its open notifications are still looked for. */
export const HORIZON_SECONDS = 24 * 60 * 60
/** How many hours back the history of one machine goes, if nobody asks for more or less. */
export const HISTORY_HOURS = 8

export const machineList = z.object({
  asOf: instant,
  windowSeconds: z.number().describe("How far back the values were read to find `since`."),
  machines: z.array(machine),
})
export type MachineList = z.infer<typeof machineList>

const paths = {
  connection: "umati/Connection/State",
  heartbeat: "umati/Connection/Heartbeat",
  itemState: "umati/State/MachineryItemState",
  operationMode: "umati/State/MachineryOperationMode",
  program: "umati/Production/ActiveProgram",
} as const
type ReadingName = keyof typeof paths
const names = Object.keys(paths) as Array<ReadingName>

/** The heartbeat counts, the other readings are text. */
const readValues = (name: ReadingName) => (name === "heartbeat" ? readNumbers : readStrings)

/** `machines/P-04/umati/State/MachineryItemState` belongs to the machine `P-04`. */
export function machineOf(topic: string): string | undefined {
  return /^machines\/([^/]+)\//.exec(topic)?.[1]
}

/**
 * The newest value and the start of its unbroken run. Samples are oldest first. A value holds
 * until the next one of its topic, so a run goes back as far as the value stayed the same, but
 * not across a stretch in which the machine was silent: what the value was then is not known.
 *
 * `mayBeOlder` says whether there may be values older than these samples. If so, a run that
 * reaches the oldest sample began at some time before it, and `since` is only a lower bound.
 */
export function currentRun(
  topic: string,
  samples: ReadonlyArray<Sample>,
  silent: ReadonlyArray<Stretch>,
  mayBeOlder: boolean,
): Reading {
  const newest = samples.at(-1)
  if (!newest) return { value: null, at: null, since: null, sinceIsLowerBound: false, topic }
  let since = newest.at
  let reachesOldest = true
  for (let index = samples.length - 2; index >= 0; index--) {
    const before = samples[index]
    if (!before || before.value !== newest.value || silentBetween(silent, before.at, since)) {
      reachesOldest = false
      break
    }
    since = before.at
  }
  return { value: newest.value, at: newest.at, since, sinceIsLowerBound: reachesOldest && mayBeOlder, topic }
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
  // The values just before the window say what held and whether the machine was there where it begins.
  const readFrom = secondsBefore(windowStart, SILENT_AFTER_SECONDS)
  const horizon = secondsBefore(now, HORIZON_SECONDS)

  const [topics, errors, warnings, ...series] = await Promise.all([
    listTopics(apis, horizon, now),
    readOpenNotifications(apis, "Error", horizon, now),
    readOpenNotifications(apis, "Warning", horizon, now),
    ...names.map((name) => readValues(name)(apis, `machines/*/${paths[name]}`, readFrom, now)),
  ])
  const inWindow = Object.fromEntries(names.map((name, index) => [name, series[index] ?? []])) as Record<
    ReadingName,
    Array<Series>
  >
  const open: Array<OpenNotification> = [...errors, ...warnings]
  const serialNumbers = [...new Set(topics.flatMap((topic) => machineOf(topic) ?? []))].sort()

  const machines = await Promise.all(
    serialNumbers.map(async (serialNumber): Promise<Machine> => {
      const topicOf = (name: ReadingName) => `machines/${serialNumber}/${paths[name]}`
      const recent = (name: ReadingName) => samplesOf(inWindow[name], topicOf(name))
      // Every value is a sign of life, whatever it says.
      const signs = names.flatMap((name) => recent(name).map((sample) => sample.at))
      const silent = silences(signs, windowStart.toISOString(), now.toISOString())

      const read = async (name: ReadingName): Promise<Reading> => {
        const samples = recent(name)
        // A value from before the window says what held where it begins.
        if (samples[0] && samples[0].at <= windowStart.toISOString()) {
          return currentRun(topicOf(name), samples, silent, true)
        }
        // Without one the topic is quiet, as one is that is published only on a change. The two
        // values before the window say what held, and whether it began with a change.
        const [earlier] = await readValues(name)(apis, topicOf(name), horizon, readFrom, 2)
        const before = earlier?.samples ?? []
        return currentRun(topicOf(name), [...before, ...samples], silent, before.length === 2)
      }
      const [connection, heartbeat, itemState, operationMode, program] = await Promise.all([
        read("connection"),
        read("heartbeat"),
        read("itemState"),
        read("operationMode"),
        read("program"),
      ])
      const topic = `machines/${serialNumber}/events/notifications`
      return {
        machine: serialNumber,
        connection,
        heartbeat,
        itemState,
        operationMode,
        program,
        lastValueAt: newest([connection.at, heartbeat.at, itemState.at, operationMode.at, program.at]),
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

/** One machine: what it does now, as in the list, and the states of the hours before. */
export async function showMachine(
  apis: Apis,
  serialNumber: string,
  hours = HISTORY_HOURS,
  now = new Date(),
): Promise<MachineShow> {
  const from = secondsBefore(now, hours * 60 * 60)
  // The signs of life just before say whether the machine was there where the history begins.
  const readFrom = secondsBefore(from, SILENT_AFTER_SECONDS)
  const topic = (name: ReadingName) => `machines/${serialNumber}/${paths[name]}`
  const read = async (name: ReadingName) =>
    samplesOf(await readValues(name)(apis, topic(name), readFrom, now), topic(name))
  /** The values of a reading, and before them the one that held where the history begins. */
  const readWithHeld = async (name: ReadingName) => {
    const [held, samples] = await Promise.all([
      readValues(name)(apis, topic(name), secondsBefore(readFrom, HORIZON_SECONDS), readFrom, 1),
      read(name),
    ])
    return [...samplesOf(held, topic(name)), ...samples]
  }

  const [list, connection, itemState, operationMode, heartbeat, errors] = await Promise.all([
    listMachines(apis, now),
    readWithHeld("connection"),
    readWithHeld("itemState"),
    readWithHeld("operationMode"),
    read("heartbeat"),
    // An error that still stands may have been raised long before the history begins.
    readRaised(apis, "Error", serialNumber, secondsBefore(from, HORIZON_SECONDS), now),
  ])
  const found = list.machines.find((one) => one.machine === serialNumber)
  if (!found) {
    const known = list.machines.map((one) => one.machine).join(", ") || "none"
    throw new Error(`No machine "${serialNumber}" published a value in the last 24 hours. Machines that did: ${known}.`)
  }
  return {
    asOf: list.asOf,
    windowSeconds: list.windowSeconds,
    machine: found,
    history: {
      from: from.toISOString(),
      to: list.asOf,
      spans: spansBetween(from.toISOString(), list.asOf, { connection, itemState, operationMode, heartbeat, errors }),
    },
  }
}

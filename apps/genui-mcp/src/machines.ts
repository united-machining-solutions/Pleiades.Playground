import { BAND_SLOTS, SILENT_AFTER_SECONDS, serialNumber } from "@pleiades/cards/machine/contract.ts"
import type { Machine, MachineList, MachineShow, Reading, Span, SpanList } from "@pleiades/cards/machine/contract.ts"

import { EVER, listTopics, readNumbers, readOpenNotifications, readRaised, readStrings } from "./apis.ts"
import type { Apis, OpenNotification, Sample, Series } from "./apis.ts"
import { spansBetween, thinned, totalsOf } from "./history.ts"
import { silences, silentBetween } from "./liveness.ts"
import type { Stretch } from "./liveness.ts"
import { secondsBefore } from "./time.ts"

// What every machine does now. Each value names the topic or the notification it comes from.
// The shapes of a machine and of the list are contracts of the card catalogue, because an
// application draws them and checks what it gets against them.

/** How far back the values are read to find since when a state has lasted. */
export const WINDOW_SECONDS = 30 * 60
/**
 * How far back a machine and its open notifications are still looked for. A value has no such
 * limit: the last one of a topic holds, however long ago the machine reported it.
 */
export const HORIZON_SECONDS = 24 * 60 * 60
/** How many hours back the history of one machine goes, if nobody asks for more or less. */
export const HISTORY_HOURS = 8
/** How many hours a history covers at most. */
export const MOST_HOURS = 24

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

/**
 * `machines/P-04/umati/State/MachineryItemState` belongs to the machine `P-04`. A level that is
 * no serial number by the rule of the contract names no machine.
 */
export function machineOf(topic: string): string | undefined {
  const level = /^machines\/([^/]+)\//.exec(topic)?.[1]
  return serialNumber.safeParse(level).success ? level : undefined
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
        // values before the window say what held, and whether it began with a change. They may
        // be of any age: a machine that runs for days reports its connection once.
        const [earlier] = await readValues(name)(apis, topicOf(name), EVER, readFrom, 2)
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

/** The states of one machine between two instants, as spans without a gap. */
async function readSpans(apis: Apis, serialNumber: string, from: Date, to: Date): Promise<Array<Span>> {
  // The signs of life just before say whether the machine was there where the history begins.
  const readFrom = secondsBefore(from, SILENT_AFTER_SECONDS)
  const topic = (name: ReadingName) => `machines/${serialNumber}/${paths[name]}`
  const read = async (name: ReadingName) =>
    samplesOf(await readValues(name)(apis, topic(name), readFrom, to), topic(name))
  /** The values of a reading, and before them the one that held where the history begins, however old. */
  const readWithHeld = async (name: ReadingName) => {
    const [held, samples] = await Promise.all([readValues(name)(apis, topic(name), EVER, readFrom, 1), read(name)])
    return [...samplesOf(held, topic(name)), ...samples]
  }

  const [connection, itemState, operationMode, heartbeat, errors] = await Promise.all([
    readWithHeld("connection"),
    readWithHeld("itemState"),
    readWithHeld("operationMode"),
    read("heartbeat"),
    // An error that still stands may have been raised long before the history begins.
    readRaised(apis, "Error", serialNumber, secondsBefore(from, HORIZON_SECONDS), to),
  ])
  return spansBetween(from.toISOString(), to.toISOString(), { connection, itemState, operationMode, heartbeat, errors })
}

/**
 * One machine: what it does now, as in the list, and how long each state lasted in the hours
 * before. The states themselves are not in this result: they grow with time (`listSpans`).
 */
export async function showMachine(
  apis: Apis,
  serialNumber: string,
  hours = HISTORY_HOURS,
  now = new Date(),
): Promise<MachineShow> {
  const from = secondsBefore(now, hours * 60 * 60)
  const [list, spans] = await Promise.all([listMachines(apis, now), readSpans(apis, serialNumber, from, now)])
  const found = list.machines.find((one) => one.machine === serialNumber)
  if (!found) {
    const known = list.machines.map((one) => one.machine).join(", ") || "none"
    throw new Error(`No machine "${serialNumber}" published a value in the last 24 hours. Machines that did: ${known}.`)
  }
  return {
    asOf: list.asOf,
    windowSeconds: list.windowSeconds,
    machine: found,
    history: { from: from.toISOString(), to: list.asOf, totals: totalsOf(spans) },
  }
}

/**
 * The states of one machine between two instants: what the band of the machine card draws. A
 * card asks with the `from` and `to` of its values, so the band is about the same hours as the
 * sums. A band has room for `slots` spans; a longer history is thinned to that many.
 */
export async function listSpans(
  apis: Apis,
  serialNumber: string,
  from: string,
  to: string,
  slots = BAND_SLOTS,
): Promise<SpanList> {
  const [begin, end] = [new Date(from), new Date(to)]
  const hours = (end.getTime() - begin.getTime()) / 3_600_000
  if (!(hours > 0)) throw new Error("The spans end before they begin: `to` must be later than `from`.")
  if (hours > MOST_HOURS) throw new Error(`The spans reach back ${MOST_HOURS} hours at most, as the history of a machine does.`)
  const spans = thinned(await readSpans(apis, serialNumber, begin, end), slots)
  return { machine: serialNumber, from: begin.toISOString(), to: end.toISOString(), spans }
}

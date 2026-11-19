import {
  BAND_SLOTS,
  HORIZON_SECONDS,
  IDENTITY_PATHS,
  NOTIFICATIONS_PATH,
  READING_PATHS,
  SILENT_AFTER_SECONDS,
  machineId,
} from "@pleiades/cards/machine/contract.ts"
import type { Identity, Machine, MachineList, MachineShow, Reading, ReadingName, Span, SpanList } from "@pleiades/cards/machine/contract.ts"

import { EVER, listTopics, readNumbers, readOpenNotifications, readRaised, readRunningJobOrders, readStrings } from "./apis.ts"
import type { Apis, Sample, Series } from "./apis.ts"
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
 * How far back a machine and its open notifications are still looked for: the horizon of the contract. A
 * value has no such limit: the last one of a topic holds, however long ago the machine reported it.
 */
export { HORIZON_SECONDS }
/** How many hours back the history of one machine goes, if nobody asks for more or less. */
export const HISTORY_HOURS = 8
/** How many hours a history covers at most. */
export const MOST_HOURS = 24

// The topics of the umati data model below `machines/{machineId}/`, as the contract of the machine
// names them: the backend reads their stored values, a page that is live hears them at the broker.
const paths = READING_PATHS
const names = Object.keys(paths) as Array<ReadingName>

/** The heartbeat counts, the other readings are text. */
const readValues = (name: ReadingName) => (name === "heartbeat" ? readNumbers : readStrings)

/**
 * `machines/alcyone-machines_AX-400_P-04/umati/Connection/State` belongs to the machine
 * `alcyone-machines_AX-400_P-04`. A level that is no machine id by the rule of the contract names no
 * machine.
 */
export function machineOf(topic: string): string | undefined {
  const level = /^machines\/([^/]+)\//.exec(topic)?.[1]
  return machineId.safeParse(level).success ? level : undefined
}

/** The words of a machine id or of a name: `AX-400 P-04` and `alcyone-machines_AX-400_P-04` share `ax-400` and `p-04`. */
const wordsOf = (name: string) => name.toLowerCase().split(/[\s_]+/).filter((word) => word !== "")

/** Whether `part` stands in `whole` as it is, word after word. */
function standsIn(whole: ReadonlyArray<string>, part: ReadonlyArray<string>): boolean {
  return whole.some((_, start) => part.every((word, offset) => whole[start + offset] === word))
}

/**
 * The machine that a caller names, among the machines `known`. A machine is named by its id, or by
 * what people call it: words of its id in their order, such as its serial number (`P-04`), or its
 * model and serial number (`AX-400 P-04`); case and the gap between the words do not matter. An id
 * of a known machine is that machine, even where it is also a word of another id. A name that fits
 * several machines is refused with their ids. A name that fits none is given back as it is, so the
 * caller refuses it in its own words, with the machines it knows.
 *
 * So a question about one machine takes one call: nobody has to list the machines first to find
 * its id.
 */
export function machineNamed(known: ReadonlyArray<string>, name: string): string {
  if (known.includes(name)) return name
  const words = wordsOf(name)
  if (words.length === 0) return name
  const fitting = known.filter((machine) => standsIn(wordsOf(machine), words))
  if (fitting.length > 1) {
    throw new Error(`"${name}" fits more than one machine: ${fitting.join(", ")}. Name one of them by its id.`)
  }
  return fitting[0] ?? name
}

/** The ids of the machines that published a value in the last 24 hours. */
export async function knownMachines(apis: Apis, now = new Date()): Promise<Array<string>> {
  const topics = await listTopics(apis, secondsBefore(now, HORIZON_SECONDS), now)
  return [...new Set(topics.flatMap((topic) => machineOf(topic) ?? []))].sort()
}

/** The identification of a machine: the newest value of each, however old. */
async function readIdentity(apis: Apis, machine: string, now: Date): Promise<Identity> {
  const [manufacturer, model, serialNumber, deviceClass] = await Promise.all(
    Object.values(IDENTITY_PATHS).map(async (path) => {
      const [series] = await readStrings(apis, `machines/${machine}/${path}`, EVER, now, 1)
      return series?.samples.at(-1)?.value ?? null
    }),
  )
  return {
    manufacturer: manufacturer ?? null,
    model: model ?? null,
    serialNumber: serialNumber ?? null,
    deviceClass: deviceClass ?? null,
  }
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

/**
 * What every machine does now; with `only`, what that one machine does, read without the others: a
 * page that shows each machine asks for each, and reading the whole fleet for each would grow with
 * the square of the machines.
 */
export async function listMachines(apis: Apis, now = new Date(), only?: string): Promise<MachineList> {
  const windowStart = secondsBefore(now, WINDOW_SECONDS)
  // The values just before the window say what held and whether the machine was there where it begins.
  const readFrom = secondsBefore(windowStart, SILENT_AFTER_SECONDS)
  const horizon = secondsBefore(now, HORIZON_SECONDS)

  const [topics, open, jobOrders, ...series] = await Promise.all([
    listTopics(apis, horizon, now),
    readOpenNotifications(apis, horizon, now, only),
    readRunningJobOrders(apis, only),
    ...names.map((name) => readValues(name)(apis, `machines/${only ?? "*"}/${paths[name]}`, readFrom, now)),
  ])
  const inWindow = Object.fromEntries(names.map((name, index) => [name, series[index] ?? []])) as Record<
    ReadingName,
    Array<Series>
  >
  const machineIds = [...new Set(topics.flatMap((topic) => machineOf(topic) ?? []))]
    .filter((id) => only === undefined || id === only)
    .sort()

  const machines = await Promise.all(
    machineIds.map(async (id): Promise<Machine> => {
      const topicOf = (name: ReadingName) => `machines/${id}/${paths[name]}`
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
      const [connection, heartbeat, itemState, operationMode, program, identity] = await Promise.all([
        read("connection"),
        read("heartbeat"),
        read("itemState"),
        read("operationMode"),
        read("program"),
        readIdentity(apis, id, now),
      ])
      const topic = `machines/${id}/${NOTIFICATIONS_PATH}`
      const job = jobOrders.find((one) => one.machine === id)
      return {
        machine: id,
        identity,
        jobOrder: job
          ? { jobOrderId: job.jobOrderId, state: job.state, producedQuantity: job.producedQuantity, runsPlanned: job.runsPlanned }
          : null,
        connection,
        heartbeat,
        itemState,
        operationMode,
        program,
        lastValueAt: newest([connection.at, heartbeat.at, itemState.at, operationMode.at, program.at]),
        notifications: open
          .filter((one) => one.machine === id)
          .sort((a, b) => b.raisedAt.localeCompare(a.raisedAt))
          .map(({ correlationId, notificationId, severity, level, title, raisedAt }) => ({
            correlationId,
            notificationId,
            severity,
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

/**
 * The signs of life of every machine between two instants: when it published its connection, its
 * heartbeat, its state, its operation mode or its program. Other values are signs of life too; a
 * caller that reads them adds them.
 *
 * With `machine`, the signs of that machine only, so a page of one machine reads no others.
 */
export async function readSignsOfLife(apis: Apis, from: Date, to: Date, machine = "*"): Promise<Map<string, Array<string>>> {
  const series = await Promise.all(names.map((name) => readValues(name)(apis, `machines/${machine}/${paths[name]}`, from, to)))
  const signs = new Map<string, Array<string>>()
  names.forEach((name, index) => {
    for (const one of series[index] ?? []) {
      const machine = machineOf(one.topic)
      if (machine === undefined || one.topic !== `machines/${machine}/${paths[name]}`) continue
      signs.set(machine, [...(signs.get(machine) ?? []), ...one.samples.map((sample) => sample.at)])
    }
  })
  return signs
}

/** The states of one machine between two instants, as spans without a gap. */
async function readSpans(apis: Apis, machine: string, from: Date, to: Date): Promise<Array<Span>> {
  // The signs of life just before say whether the machine was there where the history begins.
  const readFrom = secondsBefore(from, SILENT_AFTER_SECONDS)
  const topic = (name: ReadingName) => `machines/${machine}/${paths[name]}`
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
    // An error (an alert Failure) that still stands may have been raised before the history
    // begins. It is looked for as far back from the end as the list looks for one that has not
    // gone, so the state of a machine and the end of its history say the same.
    readRaised(apis, "Failure", machine, secondsBefore(to, HORIZON_SECONDS), to),
  ])
  return spansBetween(from.toISOString(), to.toISOString(), { connection, itemState, operationMode, heartbeat, errors })
}

/**
 * One machine: what it does now, as in the list, and how long each state lasted in the hours
 * before. The states themselves are not in this result: they grow with time (`listSpans`). The
 * machine is named by its id or as people call it (`machineNamed`).
 */
export async function showMachine(
  apis: Apis,
  name: string,
  hours = HISTORY_HOURS,
  now = new Date(),
): Promise<MachineShow> {
  const machine = machineNamed(await knownMachines(apis, now), name)
  const from = secondsBefore(now, hours * 60 * 60)
  const [list, spans] = await Promise.all([listMachines(apis, now, machine), readSpans(apis, machine, from, now)])
  const found = list.machines.find((one) => one.machine === machine)
  if (!found) {
    // The list was read for this machine only; the machines there are come from the topics.
    const topics = await listTopics(apis, secondsBefore(now, HORIZON_SECONDS), now)
    const known = [...new Set(topics.flatMap((topic) => machineOf(topic) ?? []))].sort().join(", ") || "none"
    throw new Error(`No machine "${machine}" published a value in the last 24 hours. Machines that did: ${known}.`)
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
  machine: string,
  from: string,
  to: string,
  slots = BAND_SLOTS,
): Promise<SpanList> {
  const [begin, end] = [new Date(from), new Date(to)]
  const hours = (end.getTime() - begin.getTime()) / 3_600_000
  if (!(hours > 0)) throw new Error("The spans end before they begin: `to` must be later than `from`.")
  if (hours > MOST_HOURS) throw new Error(`The spans reach back ${MOST_HOURS} hours at most, as the history of a machine does.`)
  const spans = thinned(await readSpans(apis, machine, begin, end), slots)
  return { machine, from: begin.toISOString(), to: end.toISOString(), spans }
}

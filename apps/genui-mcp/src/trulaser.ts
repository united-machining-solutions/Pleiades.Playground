import {
  CONDITION_GUIDE,
  CONDITION_GUIDE_PATH,
  DEVICES_PATH,
  LANES,
  LANE_SLOTS,
  SIGNAL_PATHS,
  UNITS_LANE,
  deviceLaneKey,
  laneValueOf,
  sequenceOf,
  statusOf,
  unitsOf,
} from "@pleiades/cards/trulaser/contract.ts"
import type {
  ConditionKey,
  ConditionTile,
  Device,
  Lane,
  LaneRead,
  LaneSpan,
  Signal,
  SignalKind,
  SignalName,
  TrulaserSeries,
  TrulaserShow,
  TrulaserTimeline,
} from "@pleiades/cards/trulaser/contract.ts"

import { EVER, listTopics, readNewest, readStrings, readTimelines } from "./apis.ts"
import type { Apis, Sample } from "./apis.ts"
import { HORIZON_SECONDS, machineOf } from "./machines.ts"
import { secondsBefore } from "./time.ts"

// What a TRUMPF laser cutting machine reports through its edge component: the values of now, the
// timelines of its states and automation devices, and the values of one tile of the condition guide
// over time. Nothing is converted: a display writes the units.

/** The topic every machine with an edge component publishes: by it a TruLaser is found. */
const MARK = SIGNAL_PATHS.itemState.path

/** The machines that published the signals of an edge component in the last 24 hours, sorted. */
export async function listTrulasers(apis: Apis, now = new Date()): Promise<Array<string>> {
  const topics = await listTopics(apis, secondsBefore(now, HORIZON_SECONDS), now)
  return [...new Set(topics.filter((topic) => topic.endsWith(`/${MARK}`)).flatMap((topic) => machineOf(topic) ?? []))].sort()
}

/** The machine that was asked for, or the first TruLaser if none was. Refused with a sentence if there is none. */
export async function trulaserOf(apis: Apis, machine: string | undefined, now: Date): Promise<string> {
  const known = await listTrulasers(apis, now)
  const found = machine ?? known[0]
  if (found === undefined || !known.includes(found)) {
    throw new Error(
      machine === undefined
        ? "No machine published the signals of a TruLaser in the last 24 hours."
        : `The machine "${machine}" published no signals of a TruLaser in the last 24 hours. Machines that did: ${known.join(", ") || "none"}.`,
    )
  }
  return found
}

/** The newest value of one topic before `to`, however old. */
export async function readSignal(apis: Apis, topic: string, kind: SignalKind, to: Date): Promise<Signal> {
  if (kind === "text") {
    const [series] = (await readStrings(apis, topic, EVER, to, 1)).filter((one) => one.topic === topic)
    const newest = series?.samples.at(-1)
    return { value: newest?.value ?? null, unit: null, at: newest?.at ?? null, topic }
  }
  const newest = await readNewest(apis, kind === "flag" ? "booleanValues" : "baseUnitValues", topic, to)
  return { value: newest?.value ?? null, unit: kind === "flag" ? null : (newest?.unit ?? null), at: newest?.at ?? null, topic }
}

/** The automation devices of a machine, by the topics of their type, in the order of their index. */
async function readDevices(apis: Apis, machine: string, now: Date): Promise<Array<Device>> {
  const base = `machines/${machine}/${DEVICES_PATH}`
  const types = await readStrings(apis, `${base}/*/Type`, EVER, now)
  const indices = types
    .flatMap((one) => {
      const index = Number(one.topic.slice(base.length + 1).split("/")[0])
      return Number.isInteger(index) ? [index] : []
    })
    .sort((a, b) => a - b)
  return Promise.all(
    indices.map(async (index) => {
      const [type, state, errorCode] = await Promise.all(
        ["Type", "State", "ErrorCode"].map((field) => readSignal(apis, `${base}/${index}/${field}`, "text", now)),
      )
      return { index, type: type!, state: state!, errorCode: errorCode! }
    }),
  )
}

/** One tile of the condition guide: its value, the name next to it, its flags, and what they say together. */
async function readTile(apis: Apis, machine: string, tile: (typeof CONDITION_GUIDE)[number], now: Date): Promise<ConditionTile> {
  const at = (path: string) => `machines/${machine}/${CONDITION_GUIDE_PATH}/${path}`
  const [value, detail, errors, warnings] = await Promise.all([
    readSignal(apis, at(tile.value), "number", now),
    "detail" in tile ? readSignal(apis, at(tile.detail), "text", now) : null,
    Promise.all(tile.errors.map((path) => readSignal(apis, at(path), "flag", now))),
    Promise.all(tile.warnings.map((path) => readSignal(apis, at(path), "flag", now))),
  ])
  const flags = [
    ...errors.map((signal) => ({ level: "error" as const, signal })),
    ...warnings.map((signal) => ({ level: "warning" as const, signal })),
  ]
  return { key: tile.key, label: tile.label, shown: tile.shown, value, detail, flags, status: statusOf(flags) }
}

/** What a TruLaser does now: every value of the card, each the newest of its topic. */
export async function showTrulaser(apis: Apis, asked?: string, now = new Date()): Promise<TrulaserShow> {
  const machine = await trulaserOf(apis, asked, now)
  const names = Object.keys(SIGNAL_PATHS) as Array<SignalName>
  const [read, serialNumber, devices, conditionGuide] = await Promise.all([
    Promise.all(
      names.map((name) => readSignal(apis, `machines/${machine}/${SIGNAL_PATHS[name].path}`, SIGNAL_PATHS[name].kind, now)),
    ),
    readSignal(apis, `machines/${machine}/umati/Identification/SerialNumber`, "text", now),
    readDevices(apis, machine, now),
    Promise.all(CONDITION_GUIDE.map((tile) => readTile(apis, machine, tile, now))),
  ])
  const signals = Object.fromEntries(names.map((name, index) => [name, read[index]!])) as Record<SignalName, Signal>
  const cause = signals.changeCauseValue.value
  return {
    asOf: now.toISOString(),
    machine,
    serialNumber: typeof serialNumber.value === "string" ? serialNumber.value : null,
    signals,
    sequence: sequenceOf(typeof cause === "string" ? cause : null),
    unitsInMalfunction: unitsOf(signals.unitsInMalfunction.value),
    devices,
    conditionGuide,
  }
}

/**
 * The values of a topic as spans without a gap between `from` and `to`. A value holds until the next
 * one; the value that held at `from` is the newest one before it, if there is one. Where two values
 * in a row show the same, they are one span.
 */
export function laneSpans(samples: ReadonlyArray<Sample>, read: LaneRead, from: string, to: string): Array<LaneSpan> {
  const start = Date.parse(from)
  const end = Date.parse(to)
  const spans: Array<LaneSpan> = []
  let value: string | null = null
  let at = start
  const close = (until: number) => {
    if (until <= at) return
    const last = spans.at(-1)
    if (last && last.value === value) last.to = new Date(until).toISOString()
    else spans.push({ from: new Date(at).toISOString(), to: new Date(until).toISOString(), value })
  }
  for (const sample of [...samples].sort((a, b) => a.at.localeCompare(b.at))) {
    const time = Date.parse(sample.at)
    if (time >= end) break
    if (time > at) {
      close(time)
      at = time
    }
    value = laneValueOf(read, sample.value)
  }
  close(end)
  return spans
}

/**
 * The same spans in at most `slots`, for a lane that has no room for more: the time is cut into that
 * many equal slots, and each shows the value that lasted longest in it. Spans that fit stay as they are.
 */
export function thinnedLane(spans: ReadonlyArray<LaneSpan>, slots: number): Array<LaneSpan> {
  const [first, last] = [spans[0], spans.at(-1)]
  if (spans.length <= slots || !first || !last) return [...spans]
  const start = Date.parse(first.from)
  const end = Date.parse(last.to)
  const width = (end - start) / slots
  const edge = (slot: number) => (slot >= slots ? end : start + slot * width)
  const lasted = Array.from({ length: slots }, () => new Map<string | null, number>())
  for (const span of spans) {
    const [from, to] = [Date.parse(span.from), Date.parse(span.to)]
    const firstSlot = Math.min(slots - 1, Math.floor((from - start) / width))
    const lastSlot = Math.min(slots - 1, Math.max(firstSlot, Math.ceil((to - start) / width) - 1))
    for (let slot = firstSlot; slot <= lastSlot; slot++) {
      const share = Math.max(0, Math.min(to, edge(slot + 1)) - Math.max(from, edge(slot)))
      lasted[slot]!.set(span.value, (lasted[slot]!.get(span.value) ?? 0) + share)
    }
  }
  const thin: Array<LaneSpan> = []
  lasted.forEach((slot, index) => {
    let value: string | null = null
    let longest = -1
    for (const [one, lasting] of slot) {
      if (lasting > longest) [value, longest] = [one, lasting]
    }
    const until = new Date(edge(index + 1)).toISOString()
    const before = thin.at(-1)
    if (before && before.value === value) before.to = until
    else thin.push({ from: new Date(edge(index)).toISOString(), to: until, value })
  })
  return thin
}

/** The spans of the units lane in which a unit was in malfunction. */
export function malfunctionsOf(spans: ReadonlyArray<LaneSpan>): TrulaserTimeline["malfunctions"] {
  return spans.flatMap((span) => (span.value === null ? [] : [{ from: span.from, to: span.to, units: span.value }]))
}

/** How many hours the timelines and the charts look back, if nobody asks, and at most. */
export const TIMELINE_DEFAULT_HOURS = 1
export const MOST_TIMELINE_HOURS = 24

/** The text values of one topic between two instants, with the newest one before `from` first. */
async function readLane(apis: Apis, topic: string, from: Date, to: Date): Promise<Array<Sample>> {
  const [before, during] = await Promise.all([readStrings(apis, topic, EVER, from, 1), readStrings(apis, topic, from, to)])
  const of = (series: Awaited<ReturnType<typeof readStrings>>) => series.find((one) => one.topic === topic)?.samples ?? []
  return [...of(before), ...of(during)]
}

/** The timelines of a TruLaser over the last hours: a lane for each state, run and automation device. */
export async function listTimeline(
  apis: Apis,
  asked: string,
  hours = TIMELINE_DEFAULT_HOURS,
  slots = LANE_SLOTS,
  now = new Date(),
): Promise<TrulaserTimeline> {
  const machine = await trulaserOf(apis, asked, now)
  const from = secondsBefore(now, hours * 3600)
  const [fromText, toText] = [from.toISOString(), now.toISOString()]
  const devices = await readDevices(apis, machine, now)
  const wanted: Array<{ key: string; label: string; topic: string; read: LaneRead }> = [
    ...LANES.map((one) => ({ ...one, topic: `machines/${machine}/${SIGNAL_PATHS[one.signal].path}` })),
    ...devices.map((one) => ({
      key: deviceLaneKey(one.index),
      label: typeof one.type.value === "string" ? one.type.value : `Device ${one.index + 1}`,
      topic: one.state.topic,
      read: "as-is" as const,
    })),
    { ...UNITS_LANE, topic: `machines/${machine}/${SIGNAL_PATHS.unitsInMalfunction.path}` },
  ]
  const full = await Promise.all(
    wanted.map(async (one) => ({ ...one, spans: laneSpans(await readLane(apis, one.topic, from, now), one.read, fromText, toText) })),
  )
  const units = full.find((one) => one.key === UNITS_LANE.key)?.spans ?? []
  const lanes: Array<Lane> = full.map(({ key, label, topic, spans }) => ({ key, label, topic, spans: thinnedLane(spans, slots) }))
  return { machine, from: fromText, to: toText, lanes, malfunctions: malfunctionsOf(units) }
}

/** The values of one tile of the condition guide over the last hours, for its chart. */
export async function listSeries(
  apis: Apis,
  asked: string,
  key: ConditionKey,
  hours = TIMELINE_DEFAULT_HOURS,
  now = new Date(),
): Promise<TrulaserSeries> {
  const machine = await trulaserOf(apis, asked, now)
  const tile = CONDITION_GUIDE.find((one) => one.key === key)!
  const topic = `machines/${machine}/${CONDITION_GUIDE_PATH}/${tile.value}`
  const from = secondsBefore(now, hours * 3600)
  const [before, [during]] = await Promise.all([
    readNewest(apis, "baseUnitValues", topic, from),
    readTimelines(apis, "baseUnitValues", topic, from, now),
  ])
  const points = [
    ...(before && typeof before.value === "number" ? [{ at: from.toISOString(), value: before.value }] : []),
    ...(during?.samples ?? []).flatMap((one) => (typeof one.value === "number" ? [{ at: one.at, value: one.value }] : [])),
  ]
  return {
    machine,
    key,
    label: tile.label,
    shown: tile.shown,
    topic,
    unit: during?.unit ?? before?.unit ?? null,
    from: from.toISOString(),
    to: now.toISOString(),
    points,
  }
}

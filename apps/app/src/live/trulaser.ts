import {
  LANES,
  SIGNAL_PATHS,
  TRULASER_PREFIX,
  UNITS_LANE,
  laneValueOf,
  sequenceOf,
  statusOf,
  unitsOf,
} from "@pleiades/cards/trulaser/contract.ts"
import type { LaneRead, Signal, TrulaserShow, TrulaserTimeline } from "@pleiades/cards/trulaser/contract.ts"

import { valuesOf } from "./messages.ts"
import type { Value } from "./messages.ts"

// The TruLaser page, live: its values and timelines as they were read, and from then on every value
// its edge component publishes, the moment the broker carries it. The values are read as the backend
// reads them from the store (packages/cards/src/trulaser/contract.ts says how).

/** What the page shows: the values of the card, and its timelines if they could be read. */
export type TrulaserLive = { values: TrulaserShow; timeline: TrulaserTimeline | null }

/** The topic filters of everything the card shows of one machine. */
export function trulaserFilters(machine: string): Array<string> {
  return [`machines/${machine}/${TRULASER_PREFIX}/#`, `machines/${machine}/${SIGNAL_PATHS.laserOn.path}`]
}

/** A signal with a newer value, if the value is about its topic; else the signal as it was. */
function withValue(signal: Signal, topic: string, value: Value): Signal {
  if (signal.topic !== topic) return signal
  if (signal.at !== null && value.at < signal.at) return signal
  return { ...signal, value: value.value, at: value.at, unit: typeof value.value === "number" ? value.unit : signal.unit }
}

/** The values of the card with one value of the broker in its place. */
export function valuesWith(values: TrulaserShow, topic: string, value: Value): TrulaserShow {
  const signals = Object.fromEntries(
    Object.entries(values.signals).map(([name, signal]) => [name, withValue(signal, topic, value)]),
  ) as TrulaserShow["signals"]
  const cause = signals.changeCauseValue.value
  return {
    ...values,
    signals,
    sequence: sequenceOf(typeof cause === "string" ? cause : null),
    unitsInMalfunction: unitsOf(signals.unitsInMalfunction.value),
    devices: values.devices.map((one) => ({
      ...one,
      type: withValue(one.type, topic, value),
      state: withValue(one.state, topic, value),
      errorCode: withValue(one.errorCode, topic, value),
    })),
    conditionGuide: values.conditionGuide.map((tile) => {
      const flags = tile.flags.map((one) => ({ ...one, signal: withValue(one.signal, topic, value) }))
      return {
        ...tile,
        value: withValue(tile.value, topic, value),
        detail: tile.detail && withValue(tile.detail, topic, value),
        flags,
        status: statusOf(flags),
      }
    }),
  }
}

/** How the values of a lane are read: as the backend reads them, by the key of the lane. */
function readOf(key: string): LaneRead {
  if (key === UNITS_LANE.key) return UNITS_LANE.read
  return LANES.find((one) => one.key === key)?.read ?? "as-is"
}

/**
 * The timelines with one value of the broker added. A value holds until the next one: the lane of
 * its topic gets a new span from its instant on, unless it shows what the last one shows. A unit
 * that falls into malfunction starts a new stripe; one that is back closes it.
 */
export function timelineWith(timeline: TrulaserTimeline, topic: string, value: Value): TrulaserTimeline {
  const index = timeline.lanes.findIndex((one) => one.topic === topic)
  const lane = timeline.lanes[index]
  if (lane === undefined || typeof value.value !== "string") return timeline
  const last = lane.spans.at(-1)
  if (last && value.at < last.from) return timeline
  const shown = laneValueOf(readOf(lane.key), value.value)
  if (last?.value === shown) return timeline
  const to = value.at > timeline.to ? value.at : timeline.to
  const spans = [...lane.spans.slice(0, -1), ...(last ? [{ ...last, to: value.at }] : []), { from: value.at, to, value: shown }]
  const lanes = timeline.lanes.map((one, at) => (at === index ? { ...lane, spans } : one))
  if (lane.key !== UNITS_LANE.key) return { ...timeline, lanes }
  const open = timeline.malfunctions.at(-1)
  const closed = last?.value != null && open ? [...timeline.malfunctions.slice(0, -1), { ...open, to: value.at }] : timeline.malfunctions
  const malfunctions = shown === null ? closed : [...closed, { from: value.at, to, units: shown }]
  return { ...timeline, lanes, malfunctions }
}

/** What a message of the broker does to the page. */
export function trulaserWith(live: TrulaserLive, topic: string, payload: string, now: number): TrulaserLive {
  return valuesOf(topic, payload, now).reduce(
    (state, one) => ({
      values: valuesWith(state.values, one.topic, one.value),
      timeline: state.timeline && timelineWith(state.timeline, one.topic, one.value),
    }),
    live,
  )
}

/** What the passing of time does: the values are as of now, and the last span of every lane reaches now. */
export function trulaserAt(live: TrulaserLive, now: string): TrulaserLive {
  const { timeline } = live
  const values = { ...live.values, asOf: now }
  if (timeline === null || now <= timeline.to) return { values, timeline }
  const lanes = timeline.lanes.map((lane) => {
    const last = lane.spans.at(-1)
    return last ? { ...lane, spans: [...lane.spans.slice(0, -1), { ...last, to: now }] } : lane
  })
  const units = lanes.find((one) => one.key === UNITS_LANE.key)?.spans.at(-1)
  const open = timeline.malfunctions.at(-1)
  const malfunctions =
    units?.value != null && open && open.to === timeline.to
      ? [...timeline.malfunctions.slice(0, -1), { ...open, to: now }]
      : timeline.malfunctions
  return { values, timeline: { ...timeline, to: now, lanes, malfunctions } }
}

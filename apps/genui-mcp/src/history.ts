import type { Span, State, Total } from "@pleiades/cards/machine/contract.ts"
import { stateFrom, stateOrder, stateSeverity } from "@pleiades/cards/machine/state.ts"

import type { Raised, Sample } from "./apis.ts"
import { silences, silentAt } from "./liveness.ts"

// What a machine did over a stretch of time. Which values are which state is not decided here:
// the card catalogue does that, for the past as for the present.

/** The values of four topics and the errors of one machine, each oldest first. */
export type Past = {
  connection: ReadonlyArray<Sample>
  itemState: ReadonlyArray<Sample>
  operationMode: ReadonlyArray<Sample>
  /** Signs of life and nothing else. */
  heartbeat: ReadonlyArray<Sample>
  errors: ReadonlyArray<Raised>
}

const names = ["connection", "itemState", "operationMode"] as const

/**
 * The states between two instants as spans without a gap, oldest first. A value holds until the
 * next one of its topic, so the state can change with every value, and where an error is raised
 * or goes. Where the machine was silent, nothing is known. Values from before `from` say what
 * held where the first span begins, and whether the machine was there.
 */
export function spansBetween(from: string, to: string, past: Past): Array<Span> {
  const start = Date.parse(from)
  const end = Date.parse(to)

  const values = names
    .flatMap((name) => past[name].map((sample) => ({ name, at: Date.parse(sample.at), value: sample.value })))
    .filter((one) => one.at < end)
    .sort((a, b) => a.at - b.at)
  const errors = past.errors.map((one) => ({
    from: Date.parse(one.raisedAt),
    to: one.goneAt === null ? Infinity : Date.parse(one.goneAt),
  }))
  // Every value is a sign of life, whatever it says.
  const signs = [...names, "heartbeat" as const].flatMap((name) => past[name].map((sample) => sample.at))
  const silent = silences(signs, from, to)

  // Where the state can change: with a value, where the machine falls silent or is back, and
  // where an error is raised or goes.
  const instants = new Set([start])
  for (const one of values) instants.add(one.at)
  for (const one of silent) instants.add(one.from).add(one.to)
  for (const one of errors) instants.add(one.from).add(one.to)
  const changes = [...instants].filter((at) => at >= start && at < end).sort((a, b) => a - b)

  const known: Record<(typeof names)[number], string | null> = {
    connection: null,
    itemState: null,
    operationMode: null,
  }
  let next = 0
  const spans: Array<Span> = []
  changes.forEach((at, index) => {
    for (let one = values[next]; one !== undefined && one.at <= at; one = values[++next]) {
      known[one.name] = one.value
    }
    const state = stateFrom({
      ...known,
      error: errors.some((one) => one.from <= at && at < one.to),
      live: !silentAt(silent, at),
    })
    const until = new Date(changes[index + 1] ?? end).toISOString()
    const last = spans.at(-1)
    if (last?.state === state) last.to = until
    else spans.push({ state, from: new Date(at).toISOString(), to: until })
  })
  return spans
}

/**
 * The same history in at most `slots` spans, for a band that has no room for more. The time is
 * cut into that many equal slots, and each slot shows one state: the one that lasted longest in
 * it, so the band keeps its proportions. Only an alarm is never thinned away: one that lasted
 * longest in no slot still keeps the slot most of it lies in. A history that fits stays as it
 * is. The sums of a history are added up from all of its spans, not from these.
 */
export function thinned(spans: ReadonlyArray<Span>, slots: number): Array<Span> {
  const [first, last] = [spans[0], spans.at(-1)]
  if (spans.length <= slots || !first || !last) return [...spans]
  const start = Date.parse(first.from)
  const end = Date.parse(last.to)
  const width = (end - start) / slots
  /** Where a slot begins; the slot after the last one begins where the history ends. */
  const edge = (slot: number) => (slot >= slots ? end : start + slot * width)
  /** A span with the slots it touches, and how much of it lies in one of them. */
  const laid = spans.map((span) => {
    const [from, to] = [Date.parse(span.from), Date.parse(span.to)]
    const firstSlot = Math.min(slots - 1, Math.floor((from - start) / width))
    const lastSlot = Math.min(slots - 1, Math.max(firstSlot, Math.ceil((to - start) / width) - 1))
    const share = (slot: number) => Math.max(0, Math.min(to, edge(slot + 1)) - Math.max(from, edge(slot)))
    return { state: span.state, firstSlot, lastSlot, share }
  })

  const lasted = Array.from({ length: slots }, () => new Map<State, number>())
  for (const one of laid) {
    for (let slot = one.firstSlot; slot <= one.lastSlot; slot++) {
      lasted[slot]?.set(one.state, (lasted[slot]?.get(one.state) ?? 0) + one.share(slot))
    }
  }
  // Of two states that lasted equally long in a slot, it shows the one that needs a person more.
  const shown = lasted.map((slot) =>
    stateSeverity.reduce((longest, state) => ((slot.get(state) ?? 0) > (slot.get(longest) ?? 0) ? state : longest)),
  )
  for (const one of laid) {
    if (one.state !== "alarm") continue
    let most = one.firstSlot
    let seen = false
    for (let slot = one.firstSlot; slot <= one.lastSlot; slot++) {
      if (shown[slot] === "alarm") seen = true
      if (one.share(slot) > one.share(most)) most = slot
    }
    if (!seen) shown[most] = "alarm"
  }

  const thin: Array<Span> = []
  shown.forEach((state, slot) => {
    const until = new Date(edge(slot + 1)).toISOString()
    const before = thin.at(-1)
    if (before?.state === state) before.to = until
    else thin.push({ state, from: new Date(edge(slot)).toISOString(), to: until })
  })
  return thin
}

/**
 * How long each state lasted in total, in the order a display reads the states. A state that did
 * not occur is left out. A display and a language model take the sums from here: neither adds
 * up spans.
 */
export function totalsOf(spans: ReadonlyArray<Span>): Array<Total> {
  const milliseconds = new Map<State, number>()
  for (const span of spans) {
    milliseconds.set(span.state, (milliseconds.get(span.state) ?? 0) + Date.parse(span.to) - Date.parse(span.from))
  }
  return stateOrder.flatMap((state) => {
    const sum = milliseconds.get(state)
    return sum === undefined ? [] : [{ state, seconds: sum / 1000 }]
  })
}

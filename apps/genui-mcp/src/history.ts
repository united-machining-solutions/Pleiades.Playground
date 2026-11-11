import type { Span } from "@pleiades/cards/machine/contract.ts"
import { stateFrom } from "@pleiades/cards/machine/state.ts"

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

import { NOTIFICATIONS_PATH, READING_PATHS, SILENT_AFTER_SECONDS } from "@pleiades/cards/machine/contract.ts"
import type { Machine, MachineList, MachineShow, Notification, Reading, ReadingName, Span, State } from "@pleiades/cards/machine/contract.ts"
import { stateOf, stateOrder } from "@pleiades/cards/machine/state.ts"

import { filterOf, machineOf, notificationOf, valueOf } from "./messages.ts"
import type { NotificationEvent, Value } from "./messages.ts"

// What a machine does now, kept up to date from the broker. The backend gives what held when a
// page was read; every value the broker sends after that is laid onto it here, by the rules the
// backend reads the stored values with (apps/genui-mcp/src/machines.ts).

const names = Object.keys(READING_PATHS) as Array<ReadingName>

/** The topics a page subscribes to for what a machine does now: of one machine, or of every one. */
export function machineFilters(machine = "+"): Array<string> {
  return [...names.map((name) => filterOf(READING_PATHS[name], machine)), filterOf(NOTIFICATIONS_PATH, machine)]
}

/** A machine the page has not heard of yet: nothing is known about it but its topics. */
export function unknownMachine(machine: string): Machine {
  const reading = (name: ReadingName): Reading => ({
    value: null,
    at: null,
    since: null,
    sinceIsLowerBound: false,
    topic: filterOf(READING_PATHS[name], machine),
  })
  return {
    machine,
    connection: reading("connection"),
    heartbeat: reading("heartbeat"),
    itemState: reading("itemState"),
    operationMode: reading("operationMode"),
    program: reading("program"),
    lastValueAt: null,
    notifications: [],
  }
}

/**
 * A new value of a reading. A value holds until the next one of its topic, so its run goes on while
 * the value stays the same: `since` stays. A run does not go on across a silence of the machine,
 * more than SILENT_AFTER_SECONDS without a sign of life: what the value was then is not known.
 */
export function withValue(machine: Machine, name: ReadingName, value: Value): Machine {
  const reading = machine[name]
  // The page knows this value already, or a newer one.
  if (reading.at !== null && value.at <= reading.at) return machine
  const text = String(value.value)
  const silentBefore =
    machine.lastValueAt === null || Date.parse(value.at) - Date.parse(machine.lastValueAt) > SILENT_AFTER_SECONDS * 1000
  const goesOn = text === reading.value && !silentBefore
  // The first value of a reading the page knew nothing of may have held before: since then at least.
  const first = reading.at === null
  return {
    ...machine,
    [name]: {
      ...reading,
      value: text,
      at: value.at,
      since: goesOn ? reading.since : value.at,
      sinceIsLowerBound: goesOn ? reading.sinceIsLowerBound : first,
    },
    lastValueAt: machine.lastValueAt === null || value.at > machine.lastValueAt ? value.at : machine.lastValueAt,
  }
}

/** A warning or an error that is raised, or one that goes. Other levels are not shown. */
export function withNotification(machine: Machine, event: NotificationEvent): Machine {
  const known = machine.notifications.some((one) => one.correlationId === event.correlationId)
  if (event.action === "Reset") {
    return known
      ? { ...machine, notifications: machine.notifications.filter((one) => one.correlationId !== event.correlationId) }
      : machine
  }
  const level = event.level === "Error" ? "Error" : event.level === "Warning" ? "Warning" : null
  if (known || level === null) return machine
  const raised: Notification = {
    correlationId: event.correlationId,
    notificationId: event.notificationId,
    level,
    title: event.title,
    raisedAt: event.at,
    topic: filterOf(NOTIFICATIONS_PATH, machine.machine),
  }
  // The newest first, as the backend lists them.
  const notifications = [...machine.notifications, raised].sort((a, b) => b.raisedAt.localeCompare(a.raisedAt))
  return { ...machine, notifications }
}

/**
 * What a message of the broker does to a machine. A topic the page does not show leaves it as it is.
 * `now`, in milliseconds since 1970, is the clock of the server: a value stamped far ahead of it is left out.
 */
export function machineWith(machine: Machine, topic: string, payload: string, now = Date.now()): Machine {
  if (topic === filterOf(NOTIFICATIONS_PATH, machine.machine)) {
    const event = notificationOf(payload, now)
    return event ? withNotification(machine, event) : machine
  }
  const name = names.find((one) => machine[one].topic === topic)
  const value = name && valueOf(payload, now)
  return name && value ? withValue(machine, name, value) : machine
}

/** What a message does to the list of machines. A machine the list does not know yet joins it with its first value. */
export function listWith(list: MachineList, topic: string, payload: string, now = Date.now()): MachineList {
  const serial = machineOf(topic)
  if (serial === undefined) return list
  const known = list.machines.find((one) => one.machine === serial)
  const machine = known ?? unknownMachine(serial)
  const updated = machineWith(machine, topic, payload, now)
  // A message that is not a value of the binding changes nothing, and names no machine either.
  if (updated === machine) return list
  const machines = known
    ? list.machines.map((one) => (one === known ? updated : one))
    : [...list.machines, updated].sort((a, b) => a.machine.localeCompare(b.machine))
  return { ...list, machines }
}

/** The list at a later instant: whether a machine is silent is read against the clock. */
export function listAt(list: MachineList, now: string): MachineList {
  return now > list.asOf ? { ...list, asOf: now } : list
}

/** The page of one machine: the values of its card and the spans of its band. */
export type MachinePage = { show: MachineShow; spans: ReadonlyArray<Span> | null }

/**
 * The page Charts: every machine with the values of its card and the spans of its last minutes,
 * `from` being where the spans were read from.
 */
export type ChartsPage = {
  asOf: string
  machines: ReadonlyArray<{ show: MachineShow; from: string; spans: ReadonlyArray<Span> | null }>
}

/**
 * What a message does to the page Charts. A machine the page does not know stays out: its history
 * is not known, and the page shows it after the next read.
 */
export function chartsWith(page: ChartsPage, topic: string, payload: string, now = Date.now()): ChartsPage {
  const serial = machineOf(topic)
  let changed = false
  const machines = page.machines.map((entry) => {
    if (entry.show.machine.machine !== serial) return entry
    const next = pageWith({ show: entry.show, spans: entry.spans }, topic, payload, now)
    if (next.show === entry.show) return entry
    changed = true
    return { ...entry, show: next.show }
  })
  return changed ? { ...page, machines } : page
}

/** The page Charts at a later instant: each machine as the page of a machine goes on (`pageAt`). */
export function chartsAt(page: ChartsPage, now: string): ChartsPage {
  if (now <= page.asOf) return page
  return {
    asOf: now,
    machines: page.machines.map((entry) => {
      const next = pageAt({ show: entry.show, spans: entry.spans }, now)
      return next.show === entry.show ? entry : { ...entry, show: next.show, spans: next.spans }
    }),
  }
}

export function pageWith(page: MachinePage, topic: string, payload: string, now = Date.now()): MachinePage {
  const machine = machineWith(page.show.machine, topic, payload, now)
  return machine === page.show.machine ? page : { ...page, show: { ...page.show, machine } }
}

/**
 * The page at a later instant. The history keeps the length it was read with and rolls on to `now`:
 * the time since its end is added to the state the machine is in now, in the sums and at the end of
 * the band, and as much is cut from its beginning, by the band. A card without its band, or with a
 * band of the last minutes only, does not know what it loses at the beginning: its history grows instead.
 */
export function pageAt(page: MachinePage, now: string): MachinePage {
  const { show, spans } = page
  const { history } = show
  if (now <= history.to) return page
  const state = stateOf(show.machine, now)
  const seconds = (Date.parse(now) - Date.parse(history.to)) / 1000
  const first = spans?.[0]
  const knowsBeginning = first !== undefined && first.from <= history.from
  const from = knowsBeginning ? new Date(Date.parse(history.from) + seconds * 1000).toISOString() : history.from
  const begins = Date.parse(from)

  // What falls off at the beginning, by the band.
  const lost = new Map<State, number>()
  for (const span of spans ?? []) {
    const end = Math.min(Date.parse(span.to), begins)
    if (Date.parse(span.from) < end) lost.set(span.state, (lost.get(span.state) ?? 0) + (end - Date.parse(span.from)) / 1000)
  }
  const totals = stateOrder.flatMap((one) => {
    const before = history.totals.find((entry) => entry.state === one)?.seconds ?? 0
    // The band is thinner than the sums: what it cuts may be a little more than a sum still holds.
    const total = Math.max(0, before + (one === state ? seconds : 0) - (lost.get(one) ?? 0))
    return total > 0 ? [{ state: one, seconds: total }] : []
  })

  const last = spans?.at(-1)
  const grown =
    spans === null
      ? null
      : last !== undefined && last.state === state && last.to === history.to
        ? [...spans.slice(0, -1), { ...last, to: now }]
        : [...spans, { state, from: history.to, to: now }]
  const nextSpans =
    grown &&
    grown.flatMap((span) =>
      Date.parse(span.to) <= begins ? [] : [Date.parse(span.from) < begins ? { ...span, from } : span],
    )
  return {
    show: { ...show, asOf: now > show.asOf ? now : show.asOf, history: { ...history, from, to: now, totals } },
    spans: nextSpans,
  }
}

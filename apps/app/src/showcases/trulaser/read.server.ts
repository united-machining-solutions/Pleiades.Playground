import { severity } from "@pleiades/cards/machine/contract.ts"
import {
  CARD_SIGNALS,
  DETAIL_SLACK_MS,
  alertSpanOf,
  byUrgency,
  CONDITION_GUIDE,
  CONDITION_GUIDE_PATH,
  CONNECTION_PATH,
  DEVICES_PATH,
  EXECUTION_LANE,
  LANE_SLOTS,
  REQUEST_ACTIVE_LANE,
  SIGNAL_PATHS,
  STATUS_LANES,
  alertLaneKey,
  deviceLane,
  statusOf,
} from "./contract.ts"
import type {
  Alert,
  ConditionKey,
  ConditionTile,
  Device,
  JobOrder,
  Lane,
  LaneSource,
  LaneSpan,
  Signal,
  SignalKind,
  SignalName,
  TimelineView,
  TrulaserCollision,
  TrulaserConditions,
  TrulaserDevices,
  TrulaserJobOrder,
  TrulaserSeries,
  TrulaserStatus,
  TrulaserTechnology,
  TrulaserTimeline,
} from "./contract.ts"

import {
  EVER,
  HORIZON_SECONDS,
  listTopics,
  machineOf,
  readAlertSpans,
  readJobOrderEntries,
  readJobOrderStateSince,
  readNewest,
  readStrings,
  readTimelines,
  secondsBefore,
} from "./apis.server.ts"
import type { AlertSpan, Apis, JobOrderEntry, Sample } from "./apis.server.ts"

// What a TRUMPF laser cutting machine reports, one answer for each card, by the names of the umati data
// model: State.Status, Notification.ActiveAlerts, JobMonitoring.JobOrders and
// WorkMasterMonitoring.ProgramExecution, read from their topics and from the Events API. What the model
// does not know comes from the extension of TRUMPF below oem/Dalle/. Nothing is converted: a display
// writes the units.

/** The topic every machine with the extension of the edge component has published once: by it a TruLaser is found. */
const MARK = "oem/Dalle/MachineState/ItemState"

/** The sign of life of a machine: its adapter publishes it every few seconds, whatever the machine does. */
const HEARTBEAT = "umati/Connection/Heartbeat"

/**
 * The machines in the order a page takes them: the one with the newest sign of life first, so that a
 * machine that runs comes before one that stopped or was renamed. Equal ones by their id.
 */
export function byNewestLife(machines: ReadonlyArray<{ machine: string; lastLife: string }>): Array<string> {
  return [...machines]
    .sort((a, b) => b.lastLife.localeCompare(a.lastLife) || a.machine.localeCompare(b.machine))
    .map((one) => one.machine)
}

/**
 * The machines that gave a sign of life in the last 24 hours and ever published the signals of an edge
 * component, the one alive most recently first. The mark is published only when the state changes: a
 * machine that stood in one state all weekend has no value of it in the last 24 hours, but its heartbeat.
 */
export async function listTrulasers(apis: Apis, now = new Date()): Promise<Array<string>> {
  const topics = await listTopics(apis, secondsBefore(now, HORIZON_SECONDS), now)
  const alive = [
    ...new Set(
      topics
        .filter((topic) => topic.endsWith(`/${HEARTBEAT}`) || topic.endsWith(`/${MARK}`))
        .flatMap((topic) => machineOf(topic) ?? []),
    ),
  ]
  const marked = await Promise.all(
    alive.map(async (machine) => {
      const topic = `machines/${machine}/${MARK}`
      const [[series], heartbeat] = await Promise.all([
        readStrings(apis, topic, EVER, now, 1).then((all) => all.filter((one) => one.topic === topic)),
        readNewest(apis, "baseUnitValues", `machines/${machine}/${HEARTBEAT}`, now),
      ])
      const mark = series?.samples.at(-1)?.at
      if (mark === undefined) return null
      // A machine without a heartbeat is alive as of its mark.
      return { machine, lastLife: heartbeat && heartbeat.at > mark ? heartbeat.at : mark }
    }),
  )
  return byNewestLife(marked.flatMap((one) => one ?? []))
}

/** The machine that was asked for, or the TruLaser alive most recently if none was. Refused with a sentence if there is none. */
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

/** What every card says about its machine: which one, its serial number, and as of when. */
async function aboutOf(apis: Apis, asked: string | undefined, now: Date) {
  const machine = await trulaserOf(apis, asked, now)
  const serial = await readSignal(apis, `machines/${machine}/umati/Identification/SerialNumber`, "text", now)
  return { asOf: now.toISOString(), machine, serialNumber: typeof serial.value === "string" ? serial.value : null }
}

/** The newest values of the signals a card shows, by their names. */
async function readSignals<const TNames extends ReadonlyArray<SignalName>>(
  apis: Apis,
  machine: string,
  names: TNames,
  now: Date,
): Promise<{ [K in TNames[number]]: Signal }> {
  const read = await Promise.all(
    names.map((name) => readSignal(apis, `machines/${machine}/${SIGNAL_PATHS[name].path}`, SIGNAL_PATHS[name].kind, now)),
  )
  return Object.fromEntries(names.map((name, index) => [name, read[index]!])) as { [K in TNames[number]]: Signal }
}

/**
 * When the adapter started, each time, between two instants: `umati/Connection/State` became
 * `Initializing`. A new start begins a new list of alerts, so an alert of a start before that was never
 * cleared no longer stands.
 */
async function adapterStarts(apis: Apis, machine: string, from: Date, to: Date): Promise<Array<number>> {
  const topic = `machines/${machine}/${CONNECTION_PATH}`
  const [series] = (await readStrings(apis, topic, from, to)).filter((one) => one.topic === topic)
  return (series?.samples ?? []).filter((one) => one.value === "Initializing").map((one) => Date.parse(one.at))
}

/** The oldest raise of the alerts, or `from` if none is older: from there on the starts of the adapter count. */
export function oldestRaise(alerts: ReadonlyArray<Pick<AlertSpan, "raisedAt">>, from: Date): Date {
  return new Date(Math.min(from.getTime(), ...alerts.map((one) => Date.parse(one.raisedAt))))
}

/** Until when an alert stood: its clear, else the next start of the adapter after its raise, else `to`. */
export function alertEnd(alert: Pick<AlertSpan, "raisedAt" | "clearedAt">, starts: ReadonlyArray<number>, to: number): number {
  if (alert.clearedAt !== null) return Date.parse(alert.clearedAt)
  const raised = Date.parse(alert.raisedAt)
  return starts.find((start) => start > raised) ?? to
}

/** An alert of the Events API as Notification.ActiveAlerts names its fields. */
function alertOfSpan(one: AlertSpan): Alert {
  return {
    Id: one.alertId,
    ErrorCode: one.errorCode,
    Message: one.message,
    Severity: one.severity,
    SeverityValue: one.severityValue,
    SourceName: one.sourceName,
    Time: one.raisedAt,
  }
}

/** The alerts that stand now, the most urgent first and the newest first within a category. */
export function activeAlertsOf(alerts: ReadonlyArray<AlertSpan>, starts: ReadonlyArray<number>, now: number): Array<Alert> {
  return alerts
    .filter((one) => alertEnd(one, starts, Infinity) === Infinity && Date.parse(one.raisedAt) <= now)
    .map((one) => alertOfSpan(one))
    .sort(byUrgency)
}

/** State.Status and Notification.ActiveAlerts now. */
export async function showStatus(apis: Apis, asked?: string, now = new Date()): Promise<TrulaserStatus> {
  const about = await aboutOf(apis, asked, now)
  const dayBefore = secondsBefore(now, HORIZON_SECONDS)
  const [signals, { spans: alerts, hasMore }] = await Promise.all([
    readSignals(apis, about.machine, CARD_SIGNALS.status, now),
    readAlertSpans(apis, about.machine, dayBefore, now),
  ])
  // An alert that still stands may have been raised days ago: the starts after it decide whether it does.
  const starts = await adapterStarts(apis, about.machine, oldestRaise(alerts, dayBefore), now)
  return {
    ...about,
    signals,
    activeAlerts: activeAlertsOf(alerts, starts, now.getTime()),
    alertsComplete: !hasMore,
  }
}

/** A job order of the Events API as the contract names its fields, with since when it is in its state. */
function jobOrderOf(entry: JobOrderEntry, stateSince: string | null): JobOrder {
  return {
    JobOrderID: entry.jobOrderId,
    State: entry.state,
    StateSince: stateSince,
    JobName: entry.jobName,
    WorkMasterID: entry.workMasterId,
    StartTime: entry.startTime,
    EndTime: entry.endTime,
    RunsCompleted: entry.runsCompleted,
    JobResult: entry.jobResult,
  }
}

/** Whether a job order is still open: running or interrupted. */
const open = (entry: JobOrderEntry) => entry.state === "Running" || entry.state === "Interrupted"

/**
 * Until when a job order ran: its end, else the next start of the adapter after its last change, else `to`.
 * An adapter that starts again begins with an empty list of job orders: one it left open never ends.
 */
export function jobOrderEnd(entry: JobOrderEntry, starts: ReadonlyArray<number>, to: number): number {
  if (entry.endTime !== null) return Date.parse(entry.endTime)
  const since = Date.parse(entry.lastChange)
  return starts.find((start) => start > since) ?? to
}

/** The job order that runs or is interrupted since the adapter started, else the newest one that ended. */
export function currentJobOrder(entries: ReadonlyArray<JobOrderEntry>, starts: ReadonlyArray<number>): JobOrderEntry | null {
  const listed = entries.filter((one) => !one.removed)
  return (
    listed.find((one) => open(one) && jobOrderEnd(one, starts, Infinity) === Infinity) ?? listed.find((one) => !open(one)) ?? null
  )
}

/** JobMonitoring.JobOrders and WorkMasterMonitoring.ProgramExecution now. */
export async function showJobOrder(apis: Apis, asked?: string, now = new Date()): Promise<TrulaserJobOrder> {
  const about = await aboutOf(apis, asked, now)
  const [signals, jobs] = await Promise.all([
    readSignals(apis, about.machine, CARD_SIGNALS.jobOrder, now),
    readJobOrderEntries(apis, about.machine, now),
  ])
  // A job order left open by an earlier run of the adapter: the starts after its last change say so.
  const oldest = new Date(Math.min(now.getTime(), ...jobs.filter(open).map((one) => Date.parse(one.lastChange))))
  const starts = await adapterStarts(apis, about.machine, oldest, now)
  const current = currentJobOrder(jobs, starts)
  const stateSince = current && (await readJobOrderStateSince(apis, about.machine, current.jobOrderId))
  return { ...about, jobOrder: current && jobOrderOf(current, stateSince), signals }
}

/** How many automation devices the edge component lists, always: HandlingLoad, HandlingUnload, Sorting, Separating, Palletizing. */
const DEVICES = 5

/** The automation devices of a machine in the order of their index, those it published a type for. */
async function readDevices(apis: Apis, machine: string, now: Date): Promise<Array<Device>> {
  const base = `machines/${machine}/${DEVICES_PATH}`
  const devices = await Promise.all(
    Array.from({ length: DEVICES }, async (_, index) => {
      const [type, state, errorCode] = await Promise.all(
        ["Type", "State", "ErrorCode"].map((field) => readSignal(apis, `${base}/${index}/${field}`, "text", now)),
      )
      return type!.value === null ? null : { index, type: type!, state: state!, errorCode: errorCode! }
    }),
  )
  return devices.flatMap((one) => one ?? [])
}

/** AutomationDeviceRequestStates of the extension now. */
export async function showDevices(apis: Apis, asked?: string, now = new Date()): Promise<TrulaserDevices> {
  const about = await aboutOf(apis, asked, now)
  const [signals, devices] = await Promise.all([
    readSignals(apis, about.machine, CARD_SIGNALS.devices, now),
    readDevices(apis, about.machine, now),
  ])
  return { ...about, signals, devices }
}

/** LaserTechnology of the extension now. */
export async function showTechnology(apis: Apis, asked?: string, now = new Date()): Promise<TrulaserTechnology> {
  const about = await aboutOf(apis, asked, now)
  return { ...about, signals: await readSignals(apis, about.machine, CARD_SIGNALS.technology, now) }
}

/** CollisionData of the extension now. */
export async function showCollision(apis: Apis, asked?: string, now = new Date()): Promise<TrulaserCollision> {
  const about = await aboutOf(apis, asked, now)
  return { ...about, signals: await readSignals(apis, about.machine, CARD_SIGNALS.collision, now) }
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

/** ConditionGuide of the extension now. */
export async function showConditions(apis: Apis, asked?: string, now = new Date()): Promise<TrulaserConditions> {
  const about = await aboutOf(apis, asked, now)
  return { ...about, tiles: await Promise.all(CONDITION_GUIDE.map((tile) => readTile(apis, about.machine, tile, now))) }
}

/**
 * The values of a topic as spans without a gap between `from` and `to`. A value holds until the next
 * one; the value that held at `from` is the newest one before it, if there is one. Where two values
 * in a row are the same, they are one span. Each span carries the details that held when it began.
 */
export function laneSpans(
  samples: ReadonlyArray<Sample>,
  from: string,
  to: string,
  details: ReadonlyArray<{ name: string; samples: ReadonlyArray<Sample> }> = [],
  labelFrom: string | null = null,
): Array<LaneSpan> {
  const start = Date.parse(from)
  const end = Date.parse(to)
  const sorted = details.map((one) => ({ name: one.name, samples: [...one.samples].sort((a, b) => a.at.localeCompare(b.at)) }))
  const detailsAt = (at: number) =>
    sorted.map(({ name, samples: list }) => {
      let value: string | null = null
      for (const sample of list) {
        if (Date.parse(sample.at) > at + DETAIL_SLACK_MS) break
        value = sample.value
      }
      return { name, value }
    })
  const spans: Array<LaneSpan> = []
  let value: string | null = null
  let at = start
  const close = (until: number) => {
    if (until <= at) return
    const last = spans.at(-1)
    if (last && last.value === value) {
      last.to = new Date(until).toISOString()
      return
    }
    const shown = detailsAt(at)
    const label = labelFrom === null ? null : (shown.find((one) => one.name === labelFrom)?.value ?? null)
    spans.push({ from: new Date(at).toISOString(), to: new Date(until).toISOString(), value, label, details: shown })
  }
  for (const sample of [...samples].sort((a, b) => a.at.localeCompare(b.at))) {
    const time = Date.parse(sample.at)
    if (time >= end) break
    if (time > at) {
      close(time)
      at = time
    }
    value = sample.value === "" ? null : sample.value
  }
  close(end)
  return spans
}

/**
 * The same spans in at most `slots`, for a lane that has no room for more: the time is cut into that
 * many equal slots, and each shows the value that lasted longest in it, with the details and label of
 * its longest span. Spans that fit stay as they are.
 */
export function thinnedLane(spans: ReadonlyArray<LaneSpan>, slots: number): Array<LaneSpan> {
  const [first, last] = [spans[0], spans.at(-1)]
  if (spans.length <= slots || !first || !last) return [...spans]
  const start = Date.parse(first.from)
  const end = Date.parse(last.to)
  const width = (end - start) / slots
  const edge = (slot: number) => (slot >= slots ? end : start + slot * width)
  type Lasted = { lasting: number; longest: number; span: LaneSpan }
  const lasted = Array.from({ length: slots }, () => new Map<string | null, Lasted>())
  for (const span of spans) {
    const [from, to] = [Date.parse(span.from), Date.parse(span.to)]
    const firstSlot = Math.min(slots - 1, Math.floor((from - start) / width))
    const lastSlot = Math.min(slots - 1, Math.max(firstSlot, Math.ceil((to - start) / width) - 1))
    for (let slot = firstSlot; slot <= lastSlot; slot++) {
      const share = Math.max(0, Math.min(to, edge(slot + 1)) - Math.max(from, edge(slot)))
      const before = lasted[slot]!.get(span.value)
      if (before === undefined) lasted[slot]!.set(span.value, { lasting: share, longest: share, span })
      else {
        before.lasting += share
        if (share > before.longest) [before.longest, before.span] = [share, span]
      }
    }
  }
  const thin: Array<LaneSpan> = []
  lasted.forEach((slot, index) => {
    let chosen: Lasted | undefined
    for (const one of slot.values()) if (chosen === undefined || one.lasting > chosen.lasting) chosen = one
    const until = new Date(edge(index + 1)).toISOString()
    const before = thin.at(-1)
    if (before && chosen && before.value === chosen.span.value && before.label === chosen.span.label) before.to = until
    else if (chosen) thin.push({ ...chosen.span, from: new Date(edge(index)).toISOString(), to: until })
  })
  return thin
}

/** The alerts of the window as spans, one lane for each category that occurred, clipped to the window. */
export function alertLanes(
  alerts: ReadonlyArray<AlertSpan>,
  starts: ReadonlyArray<number>,
  from: number,
  to: number,
  topic: string,
): Array<Lane> {
  const lanes: Array<Lane> = []
  for (const category of severity.options) {
    const spans = alerts
      .filter((one) => one.severity === category)
      .flatMap((one) => {
        const begin = Math.max(from, Date.parse(one.raisedAt))
        const end = Math.min(to, alertEnd(one, starts, to))
        if (end <= begin) return []
        return [alertSpanOf(alertOfSpan(one), new Date(begin).toISOString(), new Date(end).toISOString())]
      })
      .sort((a, b) => a.from.localeCompare(b.from))
    if (spans.length === 0) continue
    lanes.push({
      key: alertLaneKey(category),
      group: lanes.length === 0 ? "Notification.ActiveAlerts" : null,
      label: category,
      topic,
      details: [],
      labelFrom: null,
      overlaps: true,
      spans,
    })
  }
  return lanes
}

/** The job orders of the window as spans from their start to their end, each called by its id. */
export function jobOrderLane(
  entries: ReadonlyArray<JobOrderEntry>,
  starts: ReadonlyArray<number>,
  from: number,
  to: number,
  topic: string,
): Lane {
  const spans = entries
    .flatMap((one) => {
      if (one.startTime === null) return []
      const begin = Math.max(from, Date.parse(one.startTime))
      const end = Math.min(to, jobOrderEnd(one, starts, to))
      if (end <= begin) return []
      return [
        {
          from: new Date(begin).toISOString(),
          to: new Date(end).toISOString(),
          value: one.endTime === null && jobOrderEnd(one, starts, Infinity) === Infinity ? one.state : "Running",
          label: one.jobOrderId,
          details: [
            { name: "JobOrderID", value: one.jobOrderId },
            { name: "JobName", value: one.jobName },
            { name: "WorkMasterID", value: one.workMasterId },
            { name: "State", value: one.state },
            { name: "RunsCompleted", value: one.runsCompleted === null ? null : String(one.runsCompleted) },
            { name: "JobResult", value: one.jobResult },
          ],
        },
      ]
    })
    .sort((a, b) => a.from.localeCompare(b.from))
  return {
    key: "jobOrders",
    group: "JobMonitoring.JobOrders",
    label: "JobOrder",
    topic,
    details: [],
    labelFrom: null,
    overlaps: true,
    spans,
  }
}

/** How many hours the timelines and the charts look back, if nobody asks, and at most. */
export const TIMELINE_DEFAULT_HOURS = 1
export const MOST_TIMELINE_HOURS = 24

/** The values of one topic between two instants as text, with the newest one before `from` first. */
async function readLane(apis: Apis, topic: string, kind: "text" | "flag", from: Date, to: Date): Promise<Array<Sample>> {
  if (kind === "flag") {
    const [before, [during]] = await Promise.all([
      readNewest(apis, "booleanValues", topic, from),
      readTimelines(apis, "booleanValues", topic, from, to),
    ])
    return [...(before ? [before] : []), ...(during?.samples ?? [])].map((one) => ({ at: one.at, value: String(one.value) }))
  }
  const [before, during] = await Promise.all([readStrings(apis, topic, EVER, from, 1), readStrings(apis, topic, from, to)])
  const of = (series: Awaited<ReturnType<typeof readStrings>>) => series.find((one) => one.topic === topic)?.samples ?? []
  return [...of(before), ...of(during)]
}

/** The lanes of a view that the Timeseries store holds. */
async function sourcesOf(apis: Apis, machine: string, view: TimelineView, now: Date): Promise<Array<LaneSource>> {
  if (view === "jobOrder") return [EXECUTION_LANE]
  const devices = await readDevices(apis, machine, now)
  const type = (one: Device) => (typeof one.type.value === "string" ? one.type.value : null)
  if (view === "devices") return [REQUEST_ACTIVE_LANE, ...devices.map((one) => deviceLane(one.index, type(one), null))]
  return [
    ...STATUS_LANES,
    ...devices.map((one, index) => deviceLane(one.index, type(one), index === 0 ? "AutomationDeviceRequestStates" : null)),
  ]
}

/** The timelines of a view of a TruLaser over the last hours. */
export async function listTimeline(
  apis: Apis,
  asked: string,
  view: TimelineView = "status",
  hours = TIMELINE_DEFAULT_HOURS,
  slots = LANE_SLOTS,
  now = new Date(),
): Promise<TrulaserTimeline> {
  const machine = await trulaserOf(apis, asked, now)
  const from = secondsBefore(now, hours * 3600)
  const [fromText, toText] = [from.toISOString(), now.toISOString()]
  const [start, end] = [from.getTime(), now.getTime()]
  const topic = (path: string) => `machines/${machine}/${path}`
  const [sources, { spans: alerts, hasMore }, jobs] = await Promise.all([
    sourcesOf(apis, machine, view, now),
    readAlertSpans(apis, machine, from, now),
    view === "jobOrder" ? readJobOrderEntries(apis, machine, now) : Promise.resolve([]),
  ])
  // The starts of the adapter back to the oldest alert or job order that may still stand.
  const oldestJob = Math.min(from.getTime(), ...jobs.flatMap((one) => (one.startTime ? [Date.parse(one.startTime)] : [])))
  const starts = await adapterStarts(apis, machine, new Date(Math.min(oldestRaise(alerts, from).getTime(), oldestJob)), now)
  const stored = await Promise.all(
    sources.map(async (source): Promise<Lane> => {
      const [samples, details] = await Promise.all([
        readLane(apis, topic(source.path), source.kind, from, now),
        Promise.all(
          source.details.map(async (one) => ({ name: one.name, samples: await readLane(apis, topic(one.path), "text", from, now) })),
        ),
      ])
      return {
        key: source.key,
        group: source.group,
        label: source.label,
        topic: topic(source.path),
        details: source.details.map((one) => ({ name: one.name, topic: topic(one.path) })),
        labelFrom: source.labelFrom,
        overlaps: false,
        spans: thinnedLane(laneSpans(samples, fromText, toText, details, source.labelFrom), slots),
      }
    }),
  )
  const lanes =
    view === "status"
      ? [...stored, ...alertLanes(alerts, starts, start, end, topic("events/notifications"))]
      : view === "jobOrder"
        ? [jobOrderLane(jobs, starts, start, end, topic("events/jobs")), ...stored]
        : stored
  const failures = alerts
    .filter((one) => one.severity === "Failure")
    .flatMap((one) => {
      const begin = Math.max(start, Date.parse(one.raisedAt))
      const stop = Math.min(end, alertEnd(one, starts, end))
      return stop > begin ? [{ from: new Date(begin).toISOString(), to: new Date(stop).toISOString(), source: one.sourceName }] : []
    })
  return { machine, view, from: fromText, to: toText, lanes, failures, alertsComplete: !hasMore }
}

/** How many points the chart of a tile has room for: the Timeseries API thins a longer series to that many. */
const SERIES_POINTS = 600

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
    readTimelines(apis, "baseUnitValues", topic, from, now, SERIES_POINTS),
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

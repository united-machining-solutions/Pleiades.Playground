import { ALERT_SEVERITIES, TRULASER_PREFIX, alertLaneKey, alertSeverity, sequenceOf, statusOf } from "@pleiades/cards/trulaser/contract.ts"
import type { Alert, Cockpit, JobOrder, Lane, LaneSpan, Signal, TrulaserTimeline } from "@pleiades/cards/trulaser/contract.ts"

import { AHEAD_MS, valuesOf } from "./messages.ts"
import type { Value } from "./messages.ts"

// The TruLaser cockpit, live: its cards and the history of the status as they were read, and from then
// on every value and event the machine publishes, the moment the broker carries it: State.Status and the
// ProgramExecution of the data model, its alerts and job orders as CloudEvents, and the signals of the
// extension below oem/Dalle/. The values are read as the backend reads them.

/** What the page shows: every card, and the history of the status if it could be read. */
export type TrulaserLive = { cockpit: Cockpit; timeline: TrulaserTimeline | null }

/** The topic filters of everything the cards show of one machine. */
export function trulaserFilters(machine: string): Array<string> {
  return [
    `machines/${machine}/${TRULASER_PREFIX}/#`,
    `machines/${machine}/umati/State/Status`,
    `machines/${machine}/umati/WorkMasterMonitoring/ProgramExecution`,
    `machines/${machine}/events/notifications`,
    `machines/${machine}/events/jobs`,
  ]
}

/** A signal with a newer value, if the value is about its topic; else the signal as it was. */
function withValue(signal: Signal, topic: string, value: Value): Signal {
  if (signal.topic !== topic) return signal
  if (signal.at !== null && value.at < signal.at) return signal
  return { ...signal, value: value.value, at: value.at, unit: typeof value.value === "number" ? value.unit : signal.unit }
}

/** Every signal of a record with one value of the broker in its place. */
function signalsWith<TSignals extends Record<string, Signal>>(signals: TSignals, topic: string, value: Value): TSignals {
  return Object.fromEntries(Object.entries(signals).map(([name, one]) => [name, withValue(one, topic, value)])) as TSignals
}

/** The cards with one value of the broker in its place. */
export function cockpitWith(cockpit: Cockpit, topic: string, value: Value): Cockpit {
  const statusSignals = signalsWith(cockpit.status.signals, topic, value)
  const cause = statusSignals.changeCauseValue.value
  return {
    status: { ...cockpit.status, signals: statusSignals, sequence: sequenceOf(typeof cause === "string" ? cause : null) },
    jobOrder: { ...cockpit.jobOrder, signals: signalsWith(cockpit.jobOrder.signals, topic, value) },
    devices: {
      ...cockpit.devices,
      signals: signalsWith(cockpit.devices.signals, topic, value),
      devices: cockpit.devices.devices.map((one) => ({
        ...one,
        type: withValue(one.type, topic, value),
        state: withValue(one.state, topic, value),
        errorCode: withValue(one.errorCode, topic, value),
      })),
    },
    technology: { ...cockpit.technology, signals: signalsWith(cockpit.technology.signals, topic, value) },
    collision: { ...cockpit.collision, signals: signalsWith(cockpit.collision.signals, topic, value) },
    conditions: {
      ...cockpit.conditions,
      tiles: cockpit.conditions.tiles.map((tile) => {
        const flags = tile.flags.map((one) => ({ ...one, signal: withValue(one.signal, topic, value) }))
        return {
          ...tile,
          value: withValue(tile.value, topic, value),
          detail: tile.detail && withValue(tile.detail, topic, value),
          flags,
          status: statusOf(flags),
        }
      }),
    },
  }
}

/** A CloudEvent of the data model: its type, when, and its data. Null for anything else or one stamped far ahead. */
export function eventOf(payload: string, now: number): { type: string; at: string; data: Record<string, unknown> } | null {
  try {
    const json = JSON.parse(payload) as { type?: unknown; time?: unknown; data?: unknown }
    if (typeof json.type !== "string" || typeof json.time !== "string") return null
    const at = Date.parse(json.time)
    if (Number.isNaN(at) || at > now + AHEAD_MS) return null
    if (typeof json.data !== "object" || json.data === null || Array.isArray(json.data)) return null
    return { type: json.type, at: new Date(at).toISOString(), data: json.data as Record<string, unknown> }
  } catch {
    return null
  }
}

const text = (value: unknown) => (typeof value === "string" ? value : null)

/** The entry of an alert in an alert event, as Notification.ActiveAlerts lists it. */
function alertOfData(data: Record<string, unknown>, at: string): Alert | null {
  const id = text(data.Id)
  if (id === null || id === "") return null
  const severity = alertSeverity.safeParse(data.Severity)
  const time = text(data.Time)
  return {
    Id: id,
    ErrorCode: text(data.ErrorCode) ?? "",
    Message: text(data.Message) ?? "",
    Severity: severity.success ? severity.data : null,
    SeverityValue: typeof data.SeverityValue === "number" ? data.SeverityValue : null,
    SourceName: text(data.SourceName) ?? "",
    Time: time && !Number.isNaN(Date.parse(time)) ? new Date(time).toISOString() : at,
  }
}

const rank = (severity: string | null) => {
  const index = ALERT_SEVERITIES.indexOf((severity ?? "") as (typeof ALERT_SEVERITIES)[number])
  return index < 0 ? ALERT_SEVERITIES.length : index
}

/** The alerts that stand after an alert event: raised or changed in, cleared out, the most urgent first. */
export function alertsWith(alerts: ReadonlyArray<Alert>, type: string, alert: Alert): Array<Alert> {
  const others = alerts.filter((one) => one.Id !== alert.Id)
  const standing = type === "Notification.AlertCleared" ? others : [...others, alert]
  return standing.sort((a, b) => rank(a.Severity) - rank(b.Severity) || b.Time.localeCompare(a.Time))
}

/** The job order of the card after an event of a job order: the one it shows, or a new one that starts. */
export function jobOrderWith(current: JobOrder | null, type: string, data: Record<string, unknown>, at: string): JobOrder | null {
  const id = text(data.JobOrderID)
  const state = text(data.State)
  if (id === null || state === null || type === "JobMonitoring.JobOrderResultChanged") {
    if (current && id === current.JobOrderID && typeof data.RunsCompleted === "number") {
      return { ...current, RunsCompleted: data.RunsCompleted, JobResult: text(data.JobResult) ?? current.JobResult, EndTime: text(data.EndTime) }
    }
    return current
  }
  if (current && id !== current.JobOrderID && type !== "JobMonitoring.JobOrderStarted") return current
  if (type === "JobMonitoring.JobOrderRemoved") return current
  const same = current?.JobOrderID === id
  return {
    JobOrderID: id,
    State: state,
    StateSince: text(data.StateSince) ?? at,
    JobName: text(data.JobName),
    WorkMasterID: text(data.WorkMasterID),
    StartTime: same ? current.StartTime : type === "JobMonitoring.JobOrderStarted" ? at : null,
    EndTime: same ? current.EndTime : null,
    RunsCompleted: same ? current.RunsCompleted : 0,
    JobResult: same ? current.JobResult : "Unknown",
  }
}

/** How long after the start of a span a detail may come and still count as the one it began with. */
const DETAIL_SLACK_MS = 1000

/** A lane of stored values with one value of the broker added, if it is about the lane or one of its details. */
function laneWith(lane: Lane, topic: string, value: Value, to: string): Lane {
  if (lane.overlaps) return lane
  const last = lane.spans.at(-1)
  const detail = lane.details.find((one) => one.topic === topic)
  if (detail && last && Date.parse(value.at) >= Date.parse(last.from) - DETAIL_SLACK_MS) {
    // A detail that comes with the span, or later while the span lasts: the span says the newest.
    const details = last.details.map((one) => (one.name === detail.name ? { ...one, value: String(value.value) } : one))
    const label = lane.labelFrom === null ? last.label : (details.find((one) => one.name === lane.labelFrom)?.value ?? null)
    return { ...lane, spans: [...lane.spans.slice(0, -1), { ...last, details, label }] }
  }
  if (lane.topic !== topic) return lane
  if (last && value.at < last.from) return lane
  const shown = value.value === "" ? null : String(value.value)
  if (last?.value === shown) return lane
  const span = { from: value.at, to: value.at > to ? value.at : to, value: shown, label: last?.label ?? null, details: last?.details ?? [] }
  return { ...lane, spans: [...lane.spans.slice(0, -1), ...(last ? [{ ...last, to: value.at }] : []), span] }
}

/** The timelines with one value of the broker added to the lane of its topic. */
export function timelineWith(timeline: TrulaserTimeline, topic: string, value: Value): TrulaserTimeline {
  return { ...timeline, lanes: timeline.lanes.map((lane) => laneWith(lane, topic, value, timeline.to)) }
}

/** The span of an alert in its lane. It lasts until it is cleared; while it stands, it reaches now. */
function alertSpan(alert: Alert, from: string, to: string): LaneSpan {
  return {
    from,
    to,
    value: alert.Severity,
    label: alert.SourceName || null,
    details: [
      { name: "ErrorCode", value: alert.ErrorCode || null },
      { name: "Message", value: alert.Message || null },
      { name: "SourceName", value: alert.SourceName || null },
      { name: "AlertId", value: alert.Id },
    ],
  }
}

/** The timelines after an alert event: a raised alert opens a span in the lane of its category, a cleared one closes it. */
export function timelineWithAlert(timeline: TrulaserTimeline, type: string, alert: Alert, at: string, topic: string): TrulaserTimeline {
  if (timeline.view !== "status" || alert.Severity === null) return timeline
  const key = alertLaneKey(alert.Severity)
  const open = (span: LaneSpan) => span.details.some((one) => one.name === "AlertId" && one.value === alert.Id) && span.to === timeline.to
  let lanes = timeline.lanes
  if (type === "Notification.AlertRaised" && !lanes.some((lane) => lane.key === key)) {
    lanes = [...lanes, { key, group: null, label: alert.Severity, topic, details: [], labelFrom: null, overlaps: true, spans: [] }]
  }
  lanes = lanes.map((lane) => {
    if (lane.key !== key) return lane
    if (type === "Notification.AlertCleared") return { ...lane, spans: lane.spans.map((span) => (open(span) ? { ...span, to: at } : span)) }
    if (type === "Notification.AlertRaised") return { ...lane, spans: [...lane.spans, alertSpan(alert, at, at > timeline.to ? at : timeline.to)] }
    return lane
  })
  let { failures } = timeline
  if (alert.Severity === "Failure" && type === "Notification.AlertRaised") failures = [...failures, { from: at, to: at > timeline.to ? at : timeline.to, source: alert.SourceName }]
  if (alert.Severity === "Failure" && type === "Notification.AlertCleared") {
    failures = failures.map((one) => (one.source === alert.SourceName && one.to === timeline.to ? { ...one, to: at } : one))
  }
  return { ...timeline, lanes, failures }
}

/** What a message of the broker does to the page. */
export function trulaserWith(live: TrulaserLive, topic: string, payload: string, now: number): TrulaserLive {
  if (topic.endsWith("/events/notifications")) {
    const event = eventOf(payload, now)
    const alert = event && alertOfData(event.data, event.at)
    if (!event || !alert) return live
    return {
      cockpit: { ...live.cockpit, status: { ...live.cockpit.status, activeAlerts: alertsWith(live.cockpit.status.activeAlerts, event.type, alert) } },
      timeline: live.timeline && timelineWithAlert(live.timeline, event.type, alert, event.at, topic),
    }
  }
  if (topic.endsWith("/events/jobs")) {
    const event = eventOf(payload, now)
    if (!event) return live
    const jobOrder = jobOrderWith(live.cockpit.jobOrder.jobOrder, event.type, event.data, event.at)
    return { ...live, cockpit: { ...live.cockpit, jobOrder: { ...live.cockpit.jobOrder, jobOrder } } }
  }
  return valuesOf(topic, payload, now).reduce(
    (state, one) => ({
      cockpit: cockpitWith(state.cockpit, one.topic, one.value),
      timeline: state.timeline && timelineWith(state.timeline, one.topic, one.value),
    }),
    live,
  )
}

/** What the passing of time does: the cards are as of now, and what still lasts reaches now. */
export function trulaserAt(live: TrulaserLive, now: string): TrulaserLive {
  const cockpit = Object.fromEntries(
    Object.entries(live.cockpit).map(([name, card]) => [name, { ...card, asOf: now }]),
  ) as Cockpit
  const { timeline } = live
  if (timeline === null || now <= timeline.to) return { cockpit, timeline }
  const reach = <TSpan extends { to: string }>(span: TSpan) => (span.to === timeline.to ? { ...span, to: now } : span)
  const lanes = timeline.lanes.map((lane) => {
    if (lane.overlaps) return { ...lane, spans: lane.spans.map(reach) }
    const last = lane.spans.at(-1)
    return last ? { ...lane, spans: [...lane.spans.slice(0, -1), { ...last, to: now }] } : lane
  })
  return { cockpit, timeline: { ...timeline, to: now, lanes, failures: timeline.failures.map(reach) } }
}

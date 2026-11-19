import { severity } from "@pleiades/cards/machine/contract.ts"
import {
  CONNECTION_PATH,
  DETAIL_SLACK_MS,
  TRULASER_PREFIX,
  alertLaneKey,
  alertSpanOf,
  byUrgency,
  statusOf,
} from "./contract.ts"
import type { Alert, Cockpit, JobOrder, Lane, LaneSpan, Signal, TrulaserTimeline } from "./contract.ts"

import { AHEAD_MS, valuesOf } from "../../live/messages.ts"
import type { Value } from "../../live/messages.ts"

// The TruLaser cockpit, live: its cards and the history of the status as they were read, and from then
// on every value and event the machine publishes, the moment the broker carries it: State.Status and the
// ProgramExecution of the data model, its alerts and job orders as CloudEvents, the state of its adapter,
// and the signals of the extension below oem/Dalle/. The values are read as the backend reads them. The
// cards and the timelines are kept apart, so a page reads the timelines again for other hours alone.

/** The history of the status, and the newest value of every topic a span takes its details from. */
export type TimelineLive = { timeline: TrulaserTimeline; recent: Readonly<Record<string, string>> }

/** The topic filters of everything the cards and the timelines show of one machine. */
export function trulaserFilters(machine: string): Array<string> {
  return [
    `machines/${machine}/${TRULASER_PREFIX}/#`,
    `machines/${machine}/umati/State/Status`,
    `machines/${machine}/umati/WorkMasterMonitoring/ProgramExecution`,
    `machines/${machine}/${CONNECTION_PATH}`,
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
  return {
    status: { ...cockpit.status, signals: signalsWith(cockpit.status.signals, topic, value) },
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

/**
 * The events that change Notification.ActiveAlerts: an alert is raised, changes or is cleared. A
 * Notification.NotificationEvent is a message that does not stay and is never cleared: it is no alert.
 */
const ALERT_EVENTS = new Set(["Notification.AlertRaised", "Notification.AlertChanged", "Notification.AlertCleared"])

/** The entry of an alert in an alert event, as Notification.ActiveAlerts lists it. Null for any other event. */
export function alertOfEvent(type: string, data: Record<string, unknown>, at: string): Alert | null {
  if (!ALERT_EVENTS.has(type)) return null
  const id = text(data.Id)
  if (id === null || id === "") return null
  const category = severity.safeParse(data.Severity)
  const time = text(data.Time)
  return {
    Id: id,
    ErrorCode: text(data.ErrorCode) ?? "",
    Message: text(data.Message) ?? "",
    Severity: category.success ? category.data : null,
    SeverityValue: typeof data.SeverityValue === "number" ? data.SeverityValue : null,
    SourceName: text(data.SourceName) ?? "",
    Time: time && !Number.isNaN(Date.parse(time)) ? new Date(time).toISOString() : at,
  }
}

/** The alerts that stand after an alert event: raised or changed in, cleared out, the most urgent first. */
export function alertsWith(alerts: ReadonlyArray<Alert>, type: string, alert: Alert): Array<Alert> {
  const others = alerts.filter((one) => one.Id !== alert.Id)
  const standing = type === "Notification.AlertCleared" ? others : [...others, alert]
  return standing.sort(byUrgency)
}

/** A time of an event as the backend writes it, or null where the event has none that is a time. */
function instantOrNull(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null
}

/** The job order of the card after an event of a job order: the one it shows, or a new one that starts. */
export function jobOrderWith(current: JobOrder | null, type: string, data: Record<string, unknown>, at: string): JobOrder | null {
  const id = text(data.JobOrderID)
  const state = text(data.State)
  if (id === null || state === null || type === "JobMonitoring.JobOrderResultChanged") {
    if (current && id === current.JobOrderID && typeof data.RunsCompleted === "number") {
      return { ...current, RunsCompleted: data.RunsCompleted, JobResult: text(data.JobResult) ?? current.JobResult, EndTime: instantOrNull(data.EndTime) }
    }
    return current
  }
  if (current && id !== current.JobOrderID && type !== "JobMonitoring.JobOrderStarted") return current
  if (type === "JobMonitoring.JobOrderRemoved") return current
  const same = current?.JobOrderID === id
  return {
    JobOrderID: id,
    State: state,
    StateSince: instantOrNull(data.StateSince) ?? at,
    JobName: text(data.JobName),
    WorkMasterID: text(data.WorkMasterID),
    StartTime: same ? current.StartTime : type === "JobMonitoring.JobOrderStarted" ? at : null,
    EndTime: same ? current.EndTime : null,
    RunsCompleted: same ? current.RunsCompleted : 0,
    JobResult: same ? current.JobResult : "Unknown",
  }
}

/** Whether a value says that the adapter starts again: it begins a new list of alerts and of job orders. */
function startsAgain(topic: string, value: Value): boolean {
  return topic.endsWith(`/${CONNECTION_PATH}`) && value.value === "Initializing"
}

/**
 * The cards after a start of the adapter, as the backend reads them after it: no alert of the run before
 * stands, and a job order it left open is over.
 */
function cockpitRestarted(cockpit: Cockpit): Cockpit {
  const job = cockpit.jobOrder.jobOrder
  const open = job !== null && (job.State === "Running" || job.State === "Interrupted")
  return {
    ...cockpit,
    status: { ...cockpit.status, activeAlerts: [] },
    jobOrder: { ...cockpit.jobOrder, jobOrder: open ? null : job },
  }
}

/** What a message of the broker does to the cards. */
export function cockpitMessage(cockpit: Cockpit, topic: string, payload: string, now: number): Cockpit {
  if (topic.endsWith("/events/notifications")) {
    const event = eventOf(payload, now)
    const alert = event && alertOfEvent(event.type, event.data, event.at)
    if (!event || !alert) return cockpit
    return { ...cockpit, status: { ...cockpit.status, activeAlerts: alertsWith(cockpit.status.activeAlerts, event.type, alert) } }
  }
  if (topic.endsWith("/events/jobs")) {
    const event = eventOf(payload, now)
    if (!event) return cockpit
    return { ...cockpit, jobOrder: { ...cockpit.jobOrder, jobOrder: jobOrderWith(cockpit.jobOrder.jobOrder, event.type, event.data, event.at) } }
  }
  return valuesOf(topic, payload, now).reduce(
    (cards, one) => (startsAgain(one.topic, one.value) ? cockpitRestarted(cards) : cockpitWith(cards, one.topic, one.value)),
    cockpit,
  )
}

/** What the passing of time does to the cards: they are as of now. */
export function cockpitAt(cockpit: Cockpit, now: string): Cockpit {
  return Object.fromEntries(Object.entries(cockpit).map(([name, card]) => [name, { ...card, asOf: now }])) as Cockpit
}

/**
 * A lane of stored values with one value of the broker added. A detail belongs to the span it came with:
 * one that comes within a moment of the start of the last span is that span's; a later one changes no span,
 * as the backend reads the details that held when a span began. A new value of the lane starts a span with
 * the details that hold then.
 */
function laneWith(lane: Lane, topic: string, value: Value, to: string, recent: Readonly<Record<string, string>>): Lane {
  if (lane.overlaps) return lane
  const last = lane.spans.at(-1)
  const detail = lane.details.find((one) => one.topic === topic)
  if (detail) {
    if (!last || Math.abs(Date.parse(value.at) - Date.parse(last.from)) > DETAIL_SLACK_MS) return lane
    const details = last.details.map((one) => (one.name === detail.name ? { ...one, value: String(value.value) } : one))
    const label = lane.labelFrom === null ? last.label : (details.find((one) => one.name === lane.labelFrom)?.value ?? null)
    return { ...lane, spans: [...lane.spans.slice(0, -1), { ...last, details, label }] }
  }
  if (lane.topic !== topic) return lane
  if (last && value.at < last.from) return lane
  const shown = value.value === "" ? null : String(value.value)
  if (last?.value === shown) return lane
  const details = lane.details.map((one) => ({
    name: one.name,
    value: recent[one.topic] ?? last?.details.find((each) => each.name === one.name)?.value ?? null,
  }))
  const label = lane.labelFrom === null ? null : (details.find((one) => one.name === lane.labelFrom)?.value ?? null)
  const span = { from: value.at, to: value.at > to ? value.at : to, value: shown, label, details }
  return { ...lane, spans: [...lane.spans.slice(0, -1), ...(last ? [{ ...last, to: value.at }] : []), span] }
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
    if (type === "Notification.AlertRaised") return { ...lane, spans: [...lane.spans, alertSpanOf(alert, at, at > timeline.to ? at : timeline.to)] }
    return lane
  })
  let { failures } = timeline
  if (alert.Severity === "Failure" && type === "Notification.AlertRaised") failures = [...failures, { from: at, to: at > timeline.to ? at : timeline.to, source: alert.SourceName }]
  if (alert.Severity === "Failure" && type === "Notification.AlertCleared") {
    failures = failures.map((one) => (one.source === alert.SourceName && one.to === timeline.to ? { ...one, to: at } : one))
  }
  return { ...timeline, lanes, failures }
}

/** The timelines after a start of the adapter: every alert that stands ends there, as the backend ends it. */
function timelineRestarted(timeline: TrulaserTimeline, at: string): TrulaserTimeline {
  const end = <TSpan extends { to: string }>(span: TSpan) => (span.to === timeline.to ? { ...span, to: at } : span)
  return {
    ...timeline,
    lanes: timeline.lanes.map((lane) => (lane.key.startsWith("alerts") ? { ...lane, spans: lane.spans.map(end) } : lane)),
    failures: timeline.failures.map(end),
  }
}

/** What a message of the broker does to the timelines. */
export function timelineMessage(state: TimelineLive, topic: string, payload: string, now: number): TimelineLive {
  if (topic.endsWith("/events/notifications")) {
    const event = eventOf(payload, now)
    const alert = event && alertOfEvent(event.type, event.data, event.at)
    if (!event || !alert) return state
    return { ...state, timeline: timelineWithAlert(state.timeline, event.type, alert, event.at, topic) }
  }
  if (topic.endsWith("/events/jobs")) return state
  return valuesOf(topic, payload, now).reduce((current, one) => {
    if (startsAgain(one.topic, one.value)) return { ...current, timeline: timelineRestarted(current.timeline, one.value.at) }
    const { timeline } = current
    const lanes = timeline.lanes.map((lane) => laneWith(lane, one.topic, one.value, timeline.to, current.recent))
    return { timeline: { ...timeline, lanes }, recent: { ...current.recent, [one.topic]: String(one.value.value) } }
  }, state)
}

/** What the passing of time does to the timelines: what still lasts reaches now. */
export function timelineAt(state: TimelineLive, now: string): TimelineLive {
  const { timeline } = state
  if (now <= timeline.to) return state
  const reach = <TSpan extends { to: string }>(span: TSpan) => (span.to === timeline.to ? { ...span, to: now } : span)
  const lanes = timeline.lanes.map((lane) => {
    if (lane.overlaps) return { ...lane, spans: lane.spans.map(reach) }
    const last = lane.spans.at(-1)
    return last ? { ...lane, spans: [...lane.spans.slice(0, -1), { ...last, to: now }] } : lane
  })
  return { ...state, timeline: { ...timeline, to: now, lanes, failures: timeline.failures.map(reach) } }
}

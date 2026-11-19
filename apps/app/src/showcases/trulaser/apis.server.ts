import { HORIZON_SECONDS, machineId } from "@pleiades/cards/machine/contract.ts"
import { z } from "zod"

// What the TruLaser showcase reads from the data services, over REST, on the server of the app: the
// Timeseries API and the Events API, as the generative UI backend reads them. A copy of the readers of
// apps/genui-mcp/src/apis.ts it needs, because a showcase adds no tool to the base (ADR-0018). Every
// answer is checked against the shape it relies on.

export type Apis = { timeseriesUrl: string; eventsUrl: string }

/** Where the data services are: the same settings as those of the generative UI backend. */
export function apisOf(): Apis {
  return {
    timeseriesUrl: process.env.TIMESERIES_API_URL ?? "http://localhost:5500",
    eventsUrl: process.env.EVENTS_API_URL ?? "http://localhost:5510",
  }
}

export type Sample = { at: string; value: string }
export type Series = { topic: string; samples: Array<Sample> }
export type Severity = "Failure" | "CheckFunction" | "OffSpec" | "MaintenanceRequired"

export { HORIZON_SECONDS }

function fromMicroseconds(microseconds: number): string {
  return new Date(microseconds / 1000).toISOString()
}

export function secondsBefore(instant: Date, seconds: number): Date {
  return new Date(instant.getTime() - seconds * 1000)
}

/** The machine a topic below machines/ belongs to, if its level is a machine id. */
export function machineOf(topic: string): string | undefined {
  const level = /^machines\/([^/]+)\//.exec(topic)?.[1]
  return machineId.safeParse(level).success ? level : undefined
}

const topicsAnswer = z.object({
  baseUnitTopics: z.array(z.string()).default([]),
  stringTopics: z.array(z.string()).default([]),
  booleanTopics: z.array(z.string()).default([]),
})

type SeriesAnswer = {
  series: Array<{ topic: string; timestamps: Array<number>; values: Array<string | number | null> }>
}
const seriesAnswer = (value: z.ZodType<string | number>): z.ZodType<SeriesAnswer> =>
  z.object({
    series: z.array(
      z.object({
        topic: z.string(),
        timestamps: z.array(z.number()),
        values: z.array(value.nullable()),
      }),
    ),
  })
const stringSeriesAnswer = seriesAnswer(z.string())

const severityAnswer = z.enum(["Failure", "CheckFunction", "OffSpec", "MaintenanceRequired"])

const alertPairsAnswer = z.object({
  items: z.array(
    z.object({
      mId: z.string(),
      alertId: z.string(),
      errorCode: z.string().nullish(),
      message: z.string().nullish(),
      severity: severityAnswer.nullish(),
      severityValue: z.number().nullish(),
      sourceName: z.string().nullish(),
      raisedAt: z.string(),
      clearedAt: z.string().nullable(),
    }),
  ),
  hasMore: z.boolean(),
})

type Api = "Timeseries API" | "Events API"
const TIMEOUT_SECONDS = 10

/**
 * Why a request got no answer. `fetch` only says "fetch failed" and keeps the reason, for example
 * ECONNREFUSED, in the cause.
 */
function reasonOf(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  if (error.name === "TimeoutError") return `no answer within ${TIMEOUT_SECONDS} seconds`
  const cause = error.cause as { code?: unknown; message?: unknown } | undefined
  return String(cause?.code ?? cause?.message ?? error.message)
}

/**
 * A request that failed, as an error that names the API and says what happened. It is logged
 * here, once, because a tool call only carries it to whoever asked.
 */
function failure(api: Api, url: URL, what: string, cause?: unknown): Error {
  const message = `The ${api} ${what} (${url.origin}${url.pathname}).`
  console.error(message)
  return new Error(message, { cause })
}

/**
 * Asks an API and checks its answer against the shape this server knows. A GET unless `init` says
 * otherwise, as the statistics do with a POST: every request fails the same way, with the same words.
 */
async function getJson<TAnswer>(api: Api, url: URL, answer: z.ZodType<TAnswer>, init?: RequestInit): Promise<TAnswer> {
  const unanswered = (error: unknown): never => {
    throw failure(api, url, `did not answer: ${reasonOf(error)}`, error)
  }
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_SECONDS * 1000) }).catch(unanswered)
  if (!response.ok) throw failure(api, url, `answered ${response.status}`)
  const checked = answer.safeParse(await response.json().catch(unanswered))
  if (!checked.success) {
    throw failure(api, url, `answered in a shape this server does not know: ${z.prettifyError(checked.error)}`)
  }
  return checked.data
}

function between(url: URL, names: [from: string, to: string], from: Date, to: Date): URL {
  url.searchParams.set(names[0], from.toISOString())
  url.searchParams.set(names[1], to.toISOString())
  return url
}

type TopicKinds = { numbers: Array<string>; texts: Array<string>; yesNo: Array<string> }

/** Every topic that had a value between the two instants, the numbers, texts and yes or no apart. */
async function listTopicKinds(apis: Apis, from: Date, to: Date): Promise<TopicKinds> {
  const url = between(new URL("/topics", apis.timeseriesUrl), ["startTime", "stopTime"], from, to)
  const answer = await getJson("Timeseries API", url, topicsAnswer)
  return { numbers: answer.baseUnitTopics, texts: answer.stringTopics, yesNo: answer.booleanTopics }
}

/** Every topic that had a value between the two instants, whatever its values are. */
export async function listTopics(apis: Apis, from: Date, to: Date): Promise<Array<string>> {
  const { numbers, texts, yesNo } = await listTopicKinds(apis, from, to)
  return [...numbers, ...texts, ...yesNo]
}

/**
 * A topic as part of the path of a URL. Its levels stay levels and `*` stays the wildcard; what
 * else a machine id may contain, a space or a question mark, must not end the path.
 */
export function inPath(topic: string): string {
  return topic.split("/").map(encodeURIComponent).join("/")
}

/**
 * Where a read begins that has no beginning: before every value there is. The Timeseries API
 * wants a start for every query; the newest value before an instant may be of any age.
 */
export const EVER = new Date(0)

/** How the values of a topic are read: the topic, from when to when, and how many of the newest. */
export type ReadValues = (apis: Apis, topic: string, from: Date, to: Date, newest?: number) => Promise<Array<Series>>

async function readSeries(
  kind: "stringValues" | "baseUnitValues",
  answer: z.ZodType<SeriesAnswer>,
  apis: Apis,
  topic: string,
  from: Date,
  to: Date,
  newest?: number,
): Promise<Array<Series>> {
  const url = between(
    new URL(`/timeseries/${kind}/topics/${inPath(topic)}`, apis.timeseriesUrl),
    ["startTime", "stopTime"],
    from,
    to,
  )
  if (newest !== undefined) {
    url.searchParams.set("limit", String(newest))
    url.searchParams.set("sorting", "Descending")
  }
  const { series } = await getJson("Timeseries API", url, answer)
  return series.map((one) => ({
    topic: one.topic,
    samples: one.timestamps
      .flatMap((timestamp, index) => {
        const value = one.values[index]
        return value == null ? [] : [{ at: fromMicroseconds(timestamp), value: String(value) }]
      })
      .sort((a, b) => a.at.localeCompare(b.at)),
  }))
}

/**
 * The text values of a topic between the two instants, oldest first. The topic may contain `*`
 * as a wildcard and then yields one series per topic. `newest` keeps only that many of the
 * newest values, counted over all series together.
 */
export const readStrings: ReadValues = (...read) => readSeries("stringValues", stringSeriesAnswer, ...read)

/**
 * The alerts that stood at some time between the two instants (raised before the end and not
 * cleared before the start), each with when it was cleared, or null while it stands. The API
 * answers newest first and with 1000 at most: `hasMore` says it had more, the oldest ones.
 */
export async function readAlertPairs(apis: Apis, from: Date, to: Date, machine?: string, severity?: Severity) {
  const url = between(new URL("/alerts/pairs", apis.eventsUrl), ["from", "to"], from, to)
  url.searchParams.set("Take", "1000")
  if (machine !== undefined) url.searchParams.set("mId", machine)
  if (severity !== undefined) url.searchParams.set("severity", severity)
  const { items, hasMore } = await getJson("Events API", url, alertPairsAnswer)
  return { pairs: items, hasMore }
}

const allJobOrdersAnswer = z.object({
  items: z.array(
    z.object({
      mId: z.string(),
      jobOrderId: z.string(),
      state: z.string(),
      lastChange: z.string(),
      removed: z.boolean().default(false),
      jobName: z.string().nullish(),
      workMasterId: z.string().nullish(),
      orderNumbers: z.array(z.string()).nullish(),
      runsPlanned: z.number().nullish(),
      plannedStartTime: z.string().nullish(),
      plannedEndTime: z.string().nullish(),
      startTime: z.string().nullish(),
      endTime: z.string().nullish(),
      producedQuantity: z.number().nullish(),
      goodQuantity: z.number().nullish(),
      runsCompleted: z.number().nullish(),
      jobResult: z.string().nullish(),
    }),
  ),
})

/** A job order with what is ordered and what came of it, as the Events API puts it together from its events. */
export type StoredJobOrder = z.infer<typeof allJobOrdersAnswer>["items"][number]

/**
 * Every job order whose last event lies between the two instants, those that left the list of
 * their machine included, of one machine or of all.
 */
export async function readJobOrders(apis: Apis, from: Date, to: Date, machine?: string): Promise<Array<StoredJobOrder>> {
  const url = between(new URL("/jobOrders", apis.eventsUrl), ["from", "to"], from, to)
  url.searchParams.set("Take", "1000")
  if (machine !== undefined) url.searchParams.set("mId", machine)
  return (await getJson("Events API", url, allJobOrdersAnswer)).items
}

/** The newest value of one topic: when, what, and in which unit. A yes or no has no unit. */
export type Newest = { at: string; value: number | boolean; unit: string | null }

const newestAnswer = z.object({
  series: z.array(
    z.object({
      topic: z.string(),
      unit: z.string().nullish(),
      timestamps: z.array(z.number()),
      values: z.array(z.union([z.number(), z.boolean()]).nullable()),
    }),
  ),
})

/**
 * The newest value of one topic before `to`, however old, or null if it never had one. With
 * `sorting: "Ascending"` and a `from`, the first value between the two instants instead. A number
 * keeps the unit the Timeseries API stored with it.
 */
export async function readNewest(
  apis: Apis,
  kind: "baseUnitValues" | "booleanValues",
  topic: string,
  to: Date,
  { from = EVER, sorting = "Descending" }: { from?: Date; sorting?: "Ascending" | "Descending" } = {},
): Promise<Newest | null> {
  const url = between(
    new URL(`/timeseries/${kind}/topics/${inPath(topic)}`, apis.timeseriesUrl),
    ["startTime", "stopTime"],
    from,
    to,
  )
  url.searchParams.set("limit", "1")
  url.searchParams.set("sorting", sorting)
  const { series } = await getJson("Timeseries API", url, newestAnswer)
  const found = series.find((one) => one.topic === topic)
  const value = found?.values[0]
  const timestamp = found?.timestamps[0]
  if (value == null || timestamp === undefined) return null
  return { at: fromMicroseconds(timestamp), value, unit: found?.unit ?? null }
}

/** The values of a topic between two instants, oldest first, with the unit they were stored in. */
export type Timeline = { topic: string; unit: string | null; samples: Array<{ at: string; value: number | boolean }> }

/**
 * The values of a topic between the two instants, oldest first. The topic may contain `*` as a
 * wildcard and then yields one timeline per topic. With `points`, the Timeseries API thins each
 * timeline to at most that many (LTTB for numbers), and keeps all where there are fewer. It thins a
 * yes or no by taking every n-th value, which loses changes: read those whole.
 */
export async function readTimelines(
  apis: Apis,
  kind: "baseUnitValues" | "booleanValues",
  topic: string,
  from: Date,
  to: Date,
  points?: number,
): Promise<Array<Timeline>> {
  const url = between(
    new URL(`/timeseries/${kind}/topics/${inPath(topic)}`, apis.timeseriesUrl),
    ["startTime", "stopTime"],
    from,
    to,
  )
  if (points !== undefined) {
    url.searchParams.set("downsample", "true")
    url.searchParams.set("limit", String(points))
  }
  const { series } = await getJson("Timeseries API", url, newestAnswer)
  return series.map((one) => ({
    topic: one.topic,
    unit: one.unit ?? null,
    samples: one.timestamps
      .flatMap((timestamp, index) => {
        const value = one.values[index]
        return value == null ? [] : [{ at: fromMicroseconds(timestamp), value }]
      })
      .sort((a, b) => a.at.localeCompare(b.at)),
  }))
}

/** An alert of one machine as the Events API pairs its raise and its clear, with its source. */
export type AlertSpan = {
  alertId: string
  errorCode: string
  message: string
  severity: Severity | null
  severityValue: number | null
  sourceName: string
  raisedAt: string
  /** Null as long as it stands. */
  clearedAt: string | null
}

/**
 * The alerts of one machine that stood at some time between the two instants, with their source, from
 * `readAlertPairs`. `hasMore` says the API had more than it returned.
 */
export async function readAlertSpans(
  apis: Apis,
  machine: string,
  from: Date,
  to: Date,
): Promise<{ spans: Array<AlertSpan>; hasMore: boolean }> {
  const { pairs, hasMore } = await readAlertPairs(apis, from, to, machine)
  const spans = pairs.map((one) => ({
    alertId: one.alertId,
    errorCode: one.errorCode ?? "",
    message: one.message ?? "",
    severity: one.severity ?? null,
    severityValue: one.severityValue ?? null,
    sourceName: one.sourceName ?? "",
    raisedAt: new Date(one.raisedAt).toISOString(),
    clearedAt: one.clearedAt === null ? null : new Date(one.clearedAt).toISOString(),
  }))
  return { spans, hasMore }
}

/** A job order of one machine as the Events API keeps it from its events: the entry and its result. */
export type JobOrderEntry = {
  jobOrderId: string
  state: string
  lastChange: string
  /** True once the machine took it out of its list: it ran, but is no longer the job order of the machine. */
  removed: boolean
  jobName: string | null
  workMasterId: string | null
  startTime: string | null
  endTime: string | null
  runsCompleted: number | null
  jobResult: string | null
}

/** The job orders of one machine the Events API knows, removed ones included, the newest change first; from `readJobOrders`. */
export async function readJobOrderEntries(apis: Apis, machine: string, now: Date): Promise<Array<JobOrderEntry>> {
  const at = (text: string | null | undefined) => (text ? new Date(text).toISOString() : null)
  return (await readJobOrders(apis, EVER, now, machine))
    .map((one) => ({
      jobOrderId: one.jobOrderId,
      state: one.state,
      lastChange: new Date(one.lastChange).toISOString(),
      removed: one.removed,
      jobName: one.jobName ?? null,
      workMasterId: one.workMasterId ?? null,
      startTime: at(one.startTime),
      endTime: at(one.endTime),
      runsCompleted: one.runsCompleted ?? null,
      jobResult: one.jobResult ?? null,
    }))
    .sort((a, b) => b.lastChange.localeCompare(a.lastChange))
}

const jobOrderEventsAnswer = z.object({
  items: z.array(z.object({ type: z.string(), time: z.string(), data: z.record(z.string(), z.unknown()).nullish() })),
})

/**
 * Since when a job order is in its state, as its newest event that carries its entry says (`StateSince`).
 * The Events API keeps only the time of the last event of any kind with a job order, a change of its result
 * among them; the entry of the job order says when its state changed. Null if no event says it.
 */
export async function readJobOrderStateSince(apis: Apis, machine: string, jobOrderId: string): Promise<string | null> {
  const url = new URL("/machineEvents", apis.eventsUrl)
  url.searchParams.set("mId", machine)
  url.searchParams.set("jobOrderId", jobOrderId)
  url.searchParams.set("group", "JobMonitoring")
  url.searchParams.set("Take", "20")
  url.searchParams.set("Sorting", "Descending")
  const { items } = await getJson("Events API", url, jobOrderEventsAnswer)
  for (const one of items) {
    const since = one.data?.StateSince
    if (typeof since === "string" && !Number.isNaN(Date.parse(since))) return new Date(since).toISOString()
  }
  return null
}

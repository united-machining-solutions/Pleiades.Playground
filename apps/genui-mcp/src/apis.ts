import { z } from "zod"

import { fromMicroseconds } from "./time.ts"

// The data services, read over REST. Every answer is checked against the shape this server
// relies on, so a change in an API fails here, loudly, and not somewhere in a card.

export type Apis = {
  timeseriesUrl: string
  eventsUrl: string
  /** Where the Sites API is. Only the site card reads it, so a server without it has every other card. */
  sitesUrl?: string
}

export type Sample = { at: string; value: string }
export type Series = { topic: string; samples: Array<Sample> }

export type NotificationLevel = "Warning" | "Error"
/** The categories of an alert after NAMUR NE 107. */
export type Severity = "Failure" | "CheckFunction" | "OffSpec" | "MaintenanceRequired"
export type OpenNotification = {
  correlationId: string
  machine: string
  notificationId: string
  severity: Severity | null
  level: NotificationLevel
  title: string
  raisedAt: string
}
/** The job order a machine works on. */
export type RunningJobOrder = {
  machine: string
  jobOrderId: string
  state: string
  producedQuantity: number | null
  runsPlanned: number | null
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
const numberSeriesAnswer = seriesAnswer(z.number())

const severityAnswer = z.enum(["Failure", "CheckFunction", "OffSpec", "MaintenanceRequired"])

const alertPairsAnswer = z.object({
  items: z.array(
    z.object({
      mId: z.string(),
      alertId: z.string(),
      errorCode: z.string().nullish(),
      message: z.string().nullish(),
      severity: severityAnswer.nullish(),
      raisedAt: z.string(),
      clearedAt: z.string().nullable(),
    }),
  ),
  hasMore: z.boolean(),
})

const jobOrdersAnswer = z.object({
  items: z.array(
    z.object({
      mId: z.string(),
      jobOrderId: z.string(),
      state: z.string(),
      lastChange: z.string(),
      producedQuantity: z.number().nullish(),
      runsPlanned: z.number().nullish(),
    }),
  ),
})

type Api = "Timeseries API" | "Events API" | "Sites API"
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

/** The topics that had a value between two instants, by what their values are. */
export type TopicKinds = { numbers: Array<string>; texts: Array<string>; yesNo: Array<string> }

/** Every topic that had a value between the two instants, the numbers, texts and yes or no apart. */
export async function listTopicKinds(apis: Apis, from: Date, to: Date): Promise<TopicKinds> {
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

/** The same for a topic whose values are numbers. A number comes back as its text. */
export const readNumbers: ReadValues = (...read) => readSeries("baseUnitValues", numberSeriesAnswer, ...read)

/** A display that knows errors and warnings: a `Failure` is an error, every other category a warning. */
export function levelOf(severity: Severity | null | undefined): NotificationLevel {
  return severity === "Failure" ? "Error" : "Warning"
}

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

type AlertPair = Awaited<ReturnType<typeof readAlertPairs>>["pairs"][number]

/** What an alert is, as every reader of the pairs names it. */
function alertOf(pair: AlertPair) {
  return {
    correlationId: pair.alertId,
    notificationId: pair.errorCode ?? "",
    severity: pair.severity ?? null,
    level: levelOf(pair.severity),
    title: pair.message ?? "",
    raisedAt: new Date(pair.raisedAt).toISOString(),
  }
}

/** The alerts of every machine that were raised between the two instants and have not been cleared. */
export async function readOpenNotifications(apis: Apis, from: Date, to: Date, machine?: string): Promise<Array<OpenNotification>> {
  const { pairs } = await readAlertPairs(apis, from, to, machine)
  return pairs
    .filter((pair) => pair.clearedAt === null && Date.parse(pair.raisedAt) >= from.getTime())
    .map((pair) => ({ ...alertOf(pair), machine: pair.mId }))
}

/** From when to when an alert stood. `goneAt` is null as long as it has not been cleared. */
export type Raised = { raisedAt: string; goneAt: string | null }

/** When the alerts of one category of one machine were raised in the range and when they were cleared. */
export async function readRaised(
  apis: Apis,
  severity: Severity,
  machine: string,
  from: Date,
  to: Date,
): Promise<Array<Raised>> {
  // Only what was raised in the range, as the list of machines takes it: an alert that came up
  // before and still stands is not counted again, so the state and the history agree.
  const { pairs } = await readAlertPairs(apis, from, to, machine, severity)
  return pairs.filter((pair) => Date.parse(pair.raisedAt) >= from.getTime()).map((pair) => ({
    raisedAt: new Date(pair.raisedAt).toISOString(),
    goneAt: pair.clearedAt === null ? null : new Date(pair.clearedAt).toISOString(),
  }))
}

/** The job orders that run or are interrupted now, the newest change of each machine first; of one machine, if named. */
export async function readRunningJobOrders(apis: Apis, machine?: string): Promise<Array<RunningJobOrder>> {
  const items = await Promise.all(
    ["Running", "Interrupted"].map(async (state) => {
      const url = new URL("/jobOrders", apis.eventsUrl)
      url.searchParams.set("state", state)
      if (machine !== undefined) url.searchParams.set("mId", machine)
      url.searchParams.set("Take", "1000")
      return (await getJson("Events API", url, jobOrdersAnswer)).items
    }),
  )
  return items
    .flat()
    .sort((a, b) => b.lastChange.localeCompare(a.lastChange))
    .map((one) => ({
      machine: one.mId,
      jobOrderId: one.jobOrderId,
      state: one.state,
      producedQuantity: one.producedQuantity ?? null,
      runsPlanned: one.runsPlanned ?? null,
    }))
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

/** A site as the Sites API keeps it: a place with a company, a plant and its halls. */
export type StoredSite = { siteId: string; company: string; name: string; halls: Array<string> }
/** A machine on a site, as the Sites API keeps it. */
export type Placement = {
  machineId: string
  siteId: string
  hall: string | null
  displayName: string | null
  placedAt: string
}

const sitesAnswer = z.array(
  z.object({ siteId: z.string(), company: z.string(), name: z.string(), halls: z.array(z.string()) }),
)
const placementsAnswer = z.array(
  z.object({
    machineId: z.string(),
    siteId: z.string(),
    hall: z.string().nullable(),
    displayName: z.string().nullable(),
    placedAt: z.string(),
  }),
)

function sitesUrlOf(apis: Apis, path: string): URL {
  if (apis.sitesUrl === undefined) throw new Error("The Sites API is not set: SITES_API_URL names where it is.")
  return new URL(path, apis.sitesUrl)
}

/** Every site with its halls, by site id. */
export async function readSites(apis: Apis): Promise<Array<StoredSite>> {
  return getJson("Sites API", sitesUrlOf(apis, "/sites"), sitesAnswer)
}

/** Every machine that stands on a site, by machine id. */
export async function readPlacements(apis: Apis): Promise<Array<Placement>> {
  const placements = await getJson("Sites API", sitesUrlOf(apis, "/placements"), placementsAnswer)
  return placements.map((one) => ({ ...one, placedAt: new Date(one.placedAt).toISOString() }))
}

/** What the Timeseries API sums up of the numbers of a topic: their unit, mean, largest and how many. */
export type Statistics = { unit: string; mean: number; max: number; min: number; count: number }

// A median or deviation it cannot compute comes as the text "NaN": only what is read here is checked.
const statisticsAnswer = z.record(
  z.string(),
  z.object({ unit: z.string(), mean: z.number(), max: z.number(), min: z.number(), count: z.number().int() }),
)

/**
 * The statistics of the numbers of a topic between the two instants, one entry for each topic it
 * matches. The topic may contain `*` as a wildcard. The API takes the topic as one level of the
 * path, so its slashes are encoded too.
 */
export async function readStatistics(apis: Apis, topic: string, from: Date, to: Date): Promise<Map<string, Statistics>> {
  const url = new URL(`/statistics/baseUnitValues/topics/${encodeURIComponent(topic)}`, apis.timeseriesUrl)
  const statistics = await getJson("Timeseries API", url, statisticsAnswer, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([{ start: from.toISOString(), stop: to.toISOString() }]),
  })
  return new Map(Object.entries(statistics))
}

/** An alert as the Events API pairs it: when it was raised and when it was cleared, null while it stands. */
export type AlertStanding = ReturnType<typeof alertOf> & { goneAt: string | null }

/**
 * The alerts of one machine that stood at some time between the two instants, each with the time
 * it really came: one that came up before the range and still stands is among them. `hasMore` says
 * the API had more than it returned.
 */
export async function readAlertsOf(
  apis: Apis,
  machine: string,
  from: Date,
  to: Date,
): Promise<{ alerts: Array<AlertStanding>; hasMore: boolean }> {
  const { pairs, hasMore } = await readAlertPairs(apis, from, to, machine)
  return {
    hasMore,
    alerts: pairs.map((pair) => ({ ...alertOf(pair), goneAt: pair.clearedAt === null ? null : new Date(pair.clearedAt).toISOString() })),
  }
}

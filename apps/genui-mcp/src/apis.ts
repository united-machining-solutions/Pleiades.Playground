import { z } from "zod"

import { fromMicroseconds } from "./time.ts"

// The two data services, read over REST. Every answer is checked against the shape this server
// relies on, so a change in an API fails here, loudly, and not somewhere in a card.

export type Apis = {
  timeseriesUrl: string
  eventsUrl: string
}

export type Sample = { at: string; value: string }
export type Series = { topic: string; samples: Array<Sample> }

export type NotificationLevel = "Warning" | "Error"
export type OpenNotification = {
  correlationId: string
  machine: string
  notificationId: string
  level: NotificationLevel
  title: string
  raisedAt: string
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

const pairsAnswer = z.object({
  items: z.array(
    z.object({
      correlationId: z.string(),
      mId: z.string(),
      notificationId: z.string(),
      title: z.string().nullish(),
      timestampRaised: z.string(),
      timestampGone: z.string().nullable(),
    }),
  ),
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

async function getJson<TAnswer>(api: Api, url: URL, answer: z.ZodType<TAnswer>): Promise<TAnswer> {
  const unanswered = (error: unknown): never => {
    throw failure(api, url, `did not answer: ${reasonOf(error)}`, error)
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_SECONDS * 1000) }).catch(unanswered)
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

/** Every topic that had a value between the two instants. */
export async function listTopics(apis: Apis, from: Date, to: Date): Promise<Array<string>> {
  const url = between(new URL("/topics", apis.timeseriesUrl), ["startTime", "stopTime"], from, to)
  const answer = await getJson("Timeseries API", url, topicsAnswer)
  return [...answer.baseUnitTopics, ...answer.stringTopics, ...answer.booleanTopics]
}

/**
 * A topic as part of the path of a URL. Its levels stay levels and `*` stays the wildcard; what
 * else a serial number may contain, a space or a question mark, must not end the path.
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

/** The notifications of one level that were raised between the two instants, each with when it went. */
async function readPairs(apis: Apis, level: NotificationLevel, from: Date, to: Date, machine?: string) {
  const url = between(
    new URL("/notificationEvents/correlationPairs", apis.eventsUrl),
    ["from", "to"],
    from,
    to,
  )
  url.searchParams.set("level", level)
  url.searchParams.set("Take", "1000")
  if (machine !== undefined) url.searchParams.set("mId", machine)
  return (await getJson("Events API", url, pairsAnswer)).items
}

/** The notifications of one level that were raised between the two instants and have not gone. */
export async function readOpenNotifications(
  apis: Apis,
  level: NotificationLevel,
  from: Date,
  to: Date,
): Promise<Array<OpenNotification>> {
  const pairs = await readPairs(apis, level, from, to)
  return pairs
    .filter((pair) => pair.timestampGone === null)
    .map((pair) => ({
      correlationId: pair.correlationId,
      machine: pair.mId,
      notificationId: pair.notificationId,
      level,
      title: pair.title ?? "",
      raisedAt: new Date(pair.timestampRaised).toISOString(),
    }))
}

/** From when to when a notification stood. `goneAt` is null as long as it has not gone. */
export type Raised = { raisedAt: string; goneAt: string | null }

/** When the notifications of one level of one machine were raised and when they went. */
export async function readRaised(
  apis: Apis,
  level: NotificationLevel,
  machine: string,
  from: Date,
  to: Date,
): Promise<Array<Raised>> {
  const pairs = await readPairs(apis, level, from, to, machine)
  return pairs.map((pair) => ({
    raisedAt: new Date(pair.timestampRaised).toISOString(),
    goneAt: pair.timestampGone === null ? null : new Date(pair.timestampGone).toISOString(),
  }))
}

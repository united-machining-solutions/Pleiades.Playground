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

const stringSeriesAnswer = z.object({
  series: z.array(
    z.object({
      topic: z.string(),
      timestamps: z.array(z.number()),
      values: z.array(z.string().nullable()),
    }),
  ),
})

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

async function getJson<TAnswer>(url: URL, answer: z.ZodType<TAnswer>): Promise<TAnswer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) {
    throw new Error(`${url.origin}${url.pathname} answered ${response.status}`)
  }
  return answer.parse(await response.json())
}

function between(url: URL, names: [from: string, to: string], from: Date, to: Date): URL {
  url.searchParams.set(names[0], from.toISOString())
  url.searchParams.set(names[1], to.toISOString())
  return url
}

/** Every topic that had a value between the two instants. */
export async function listTopics(apis: Apis, from: Date, to: Date): Promise<Array<string>> {
  const url = between(new URL("/topics", apis.timeseriesUrl), ["startTime", "stopTime"], from, to)
  const answer = await getJson(url, topicsAnswer)
  return [...answer.baseUnitTopics, ...answer.stringTopics, ...answer.booleanTopics]
}

/**
 * The text values of a topic between the two instants, oldest first. The topic may contain `*`
 * as a wildcard and then yields one series per topic. `newest` keeps only that many of the
 * newest values, counted over all series together.
 */
export async function readStrings(
  apis: Apis,
  topic: string,
  from: Date,
  to: Date,
  newest?: number,
): Promise<Array<Series>> {
  const url = between(
    new URL(`/timeseries/stringValues/topics/${topic}`, apis.timeseriesUrl),
    ["startTime", "stopTime"],
    from,
    to,
  )
  if (newest !== undefined) {
    url.searchParams.set("limit", String(newest))
    url.searchParams.set("sorting", "Descending")
  }
  const answer = await getJson(url, stringSeriesAnswer)
  return answer.series.map((series) => ({
    topic: series.topic,
    samples: series.timestamps
      .flatMap((timestamp, index) => {
        const value = series.values[index]
        return value == null ? [] : [{ at: fromMicroseconds(timestamp), value }]
      })
      .sort((a, b) => a.at.localeCompare(b.at)),
  }))
}

/** The notifications of one level that were raised between the two instants and have not gone. */
export async function readOpenNotifications(
  apis: Apis,
  level: NotificationLevel,
  from: Date,
  to: Date,
): Promise<Array<OpenNotification>> {
  const url = between(
    new URL("/notificationEvents/correlationPairs", apis.eventsUrl),
    ["from", "to"],
    from,
    to,
  )
  url.searchParams.set("level", level)
  url.searchParams.set("Take", "1000")
  const answer = await getJson(url, pairsAnswer)
  return answer.items
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

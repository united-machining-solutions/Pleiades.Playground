import { createServerFn } from "@tanstack/react-start"

import { reasonOf } from "@/reason.ts"

import type { Cockpit, ConditionKey, TimelineView, TrulaserSeries, TrulaserTimeline } from "./contract.ts"

// What the page of the TruLaser reads, on the server of the app. A showcase adds no tool to the generative
// UI backend (ADR-0018): it reads the Timeseries API and the Events API itself, by apis.server.ts.

/** The values, or why there are none: a page shows the sentence, for example that no TruLaser published. */
export type Answer<TValues> = { values: TValues; error: null } | { values: null; error: string }

/** The readers, loaded on the server only, so that nothing of them reaches the browser. */
async function readers() {
  const [read, { apisOf }] = await Promise.all([import("./read.server.ts"), import("./apis.server.ts")])
  return { read, apis: apisOf() }
}

/** Every card of a TruLaser. Without `machine`, the first TruLaser. */
export const getTrulaserCockpit = createServerFn({ method: "GET" })
  .validator((request: { machine?: string }) => request)
  .handler(async ({ data: { machine } }): Promise<Answer<Cockpit>> => {
    try {
      const { read, apis } = await readers()
      const now = new Date()
      // The status first: it finds the machine, and says so if there is none.
      const status = await read.showStatus(apis, machine, now)
      const [jobOrder, devices, technology, collision, conditions] = await Promise.all([
        read.showJobOrder(apis, status.machine, now),
        read.showDevices(apis, status.machine, now),
        read.showTechnology(apis, status.machine, now),
        read.showCollision(apis, status.machine, now),
        read.showConditions(apis, status.machine, now),
      ])
      return { values: { status, jobOrder, devices, technology, collision, conditions }, error: null }
    } catch (error) {
      return { values: null, error: reasonOf(error) }
    }
  })

/** How many hours the timelines and charts may look back: at least one, at most a day. */
const hoursOf = (hours: number) => Math.min(24, Math.max(1, Math.round(hours)))

/** The timelines of a view of a TruLaser over the last hours. Null if they are not to be had: the card stands without them. */
export const getTrulaserTimeline = createServerFn({ method: "GET" })
  .validator((request: { machine: string; view: TimelineView; hours: number }) => request)
  .handler(async ({ data }): Promise<TrulaserTimeline | null> => {
    try {
      const { read, apis } = await readers()
      return await read.listTimeline(apis, data.machine, data.view, hoursOf(data.hours))
    } catch (error) {
      console.error(`The timelines of the TruLaser could not be read: ${reasonOf(error)}`)
      return null
    }
  })

/** The values of one tile of the condition guide over the last hours, for its chart. Null if they are not to be had. */
export const getTrulaserSeries = createServerFn({ method: "GET" })
  .validator((request: { machine: string; key: ConditionKey; hours: number }) => request)
  .handler(async ({ data }): Promise<TrulaserSeries | null> => {
    try {
      const { read, apis } = await readers()
      return await read.listSeries(apis, data.machine, data.key, hoursOf(data.hours))
    } catch (error) {
      console.error(`The values of the tile could not be read: ${reasonOf(error)}`)
      return null
    }
  })

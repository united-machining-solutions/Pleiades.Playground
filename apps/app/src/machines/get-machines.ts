import type { EnergySeries, EnergyShow } from "@pleiades/cards/energy/contract.ts"
import type { MachineList, MachineShow, Span } from "@pleiades/cards/machine/contract.ts"
import type { MeasurementList, MeasurementSeries } from "@pleiades/cards/measurement/contract.ts"
import type { NotificationList } from "@pleiades/cards/notification/contract.ts"
import type { SiteList } from "@pleiades/cards/site/contract.ts"
import type { TimeseriesRange, TimeseriesSeries, TimeseriesShow, TimeseriesSignals } from "@pleiades/cards/timeseries/contract.ts"
import type { server } from "@pleiades/genui-mcp"
import { createMCPClient } from "@tanstack/ai-mcp"
import { createServerFn } from "@tanstack/react-start"

import { reasonOf } from "@/reason.ts"

import { ENERGY_SERIES_TOOL, MEASUREMENT_SERIES_TOOL, SPAN_LIST_TOOL, TIMESERIES_SERIES_TOOL, TIMESERIES_SIGNALS_TOOL } from "./card-tools.ts"
import { Refused, keptClient } from "./kept-client.ts"

// The values come from the generative UI backend. These functions run on the server of the app:
// the browser never talks to the backend itself.

/** Either the values or why there are none: a page says so and keeps trying. */
export type Answer<TValues> = { values: TValues; error: null } | { values: null; error: string }

/** The backend as a typed MCP client: the names of its tools and the shapes of their results are known. */
function connect() {
  const url = process.env.GENUI_MCP_URL ?? "http://localhost:5520/mcp"
  return createMCPClient<typeof server>({ transport: { type: "http", url } })
}

export { Refused }

/** The one connection of the server of the app to the backend, kept between questions. */
const backend = keptClient(connect)

/**
 * Asks the backend on the kept connection. If there are no values, the error is a sentence that
 * names who did not answer: the backend names its APIs, this function the backend.
 */
export async function ask<TValues>(
  read: (backend: Awaited<ReturnType<typeof connect>>) => Promise<TValues>,
): Promise<Answer<TValues>> {
  try {
    return { values: await backend(read), error: null }
  } catch (error) {
    if (error instanceof Refused) return { values: null, error: error.message }
    return { values: null, error: `The generative UI backend did not answer: ${reasonOf(error)}.` }
  }
}

/** What a tool wrote as text, which is where it says why it failed. */
export function textOf(result: unknown): string | undefined {
  const { content } = result as { content?: unknown }
  if (!Array.isArray(content)) return undefined
  const texts = content.flatMap((part: { type?: unknown; text?: unknown }) =>
    part.type === "text" && typeof part.text === "string" ? [part.text] : [],
  )
  return texts[0]
}

/** What every machine does now, for code on the server. The browser asks with `getMachines`. */
export function listMachines(): Promise<Answer<MachineList>> {
  return ask(async (backend) => {
    const result = await backend.callTool("genui_machine_list", {})
    if (result.isError || !result.structuredContent) {
      throw new Refused(textOf(result) ?? "genui_machine_list returned no values.")
    }
    return result.structuredContent
  })
}

/** What every machine does now. */
export const getMachines = createServerFn({ method: "GET" }).handler(() => listMachines())

/**
 * One machine, and how long each state lasted over the last hours: the values of the machine card.
 * Without `hours` the backend says how far back the history goes.
 */
export const getMachine = createServerFn({ method: "GET" })
  .validator((request: { machine: string; hours?: number }) => request)
  .handler(
    ({ data: { machine, hours } }): Promise<Answer<MachineShow>> =>
      ask(async (backend) => {
        const input = hours === undefined ? { machine } : { machine, hours }
        const result = await backend.callTool("genui_machine_show", input)
        if (result.isError || !result.structuredContent) {
          throw new Refused(textOf(result) ?? "genui_machine_show returned no values.")
        }
        return result.structuredContent
      }),
  )

/** Where the machines stand: every site with its machines, hall by hall, and the machines on no site. */
export const getSites = createServerFn({ method: "GET" }).handler(
  (): Promise<Answer<SiteList>> =>
    ask(async (backend) => {
      const result = await backend.callTool("genui_site_list", {})
      if (result.isError || !result.structuredContent) {
        throw new Refused(textOf(result) ?? "genui_site_list returned no values.")
      }
      return result.structuredContent
    }),
)

/** The newest physical values of every machine: the values of the measurement cards. */
export const getMeasurements = createServerFn({ method: "GET" })
  // With a machine, the values of that machine only: the page of one machine reads no others.
  .validator((request?: { machine?: string }) => request ?? {})
  .handler(
    ({ data }): Promise<Answer<MeasurementList>> =>
      ask(async (backend) => {
        const result = await backend.callTool("genui_measurement_list", data.machine === undefined ? {} : { machine: data.machine })
        if (result.isError || !result.structuredContent) {
          throw new Refused(textOf(result) ?? "genui_measurement_list returned no values.")
        }
        return result.structuredContent
      }),
  )

/**
 * The values of every quantity over the last minutes, a line for each machine: what the graphs of
 * the measurements draw. They are not among the values of the list, because a language model reads
 * those.
 */
export const getMeasurementSeries = createServerFn({ method: "GET" })
  // With a machine, the lines of that machine only.
  .validator((request?: { machine?: string }) => request ?? {})
  .handler(
    ({ data }): Promise<Answer<MeasurementSeries>> =>
      ask(async (backend) => {
        // The name is checked against the tools of the backend: if it changes there, this fails to compile.
        const result = await backend.callTool(MEASUREMENT_SERIES_TOOL, data.machine === undefined ? {} : { machine: data.machine })
        if (result.isError || !result.structuredContent) {
          throw new Refused(textOf(result) ?? `${MEASUREMENT_SERIES_TOOL} returned no values.`)
        }
        return result.structuredContent
      }),
  )

/** The values of the page Charts: each machine with the sums of its last hours, and its recent spans. */
export type Charts = {
  asOf: string
  machines: Array<{ show: MachineShow; from: string; spans: Array<Span> | null }>
}

/**
 * Everything the page Charts draws, over one connection: the list, then for each machine its values
 * and its spans of the last `recent` milliseconds only, not of all its hours. A machine without
 * values is left out; one without spans keeps its sums.
 */
export const getCharts = createServerFn({ method: "GET" })
  .validator((recent: number) => recent)
  .handler(
    ({ data: recent }): Promise<Answer<Charts>> =>
      ask(async (backend) => {
        const list = await backend.callTool("genui_machine_list", {})
        if (list.isError || !list.structuredContent) {
          throw new Refused(textOf(list) ?? "genui_machine_list returned no values.")
        }
        const machines = await Promise.all(
          list.structuredContent.machines.map(async ({ machine }) => {
            const show = await backend.callTool("genui_machine_show", { machine })
            if (show.isError || !show.structuredContent) return null
            const { history } = show.structuredContent
            const from = new Date(Math.max(Date.parse(history.from), Date.parse(history.to) - recent)).toISOString()
            const spans = await backend.callTool(SPAN_LIST_TOOL, { machine, from, to: history.to })
            return {
              show: show.structuredContent,
              from,
              spans: spans.isError || !spans.structuredContent ? null : spans.structuredContent.spans,
            }
          }),
        )
        return { asOf: list.structuredContent.asOf, machines: machines.filter((one) => one !== null) }
      }),
  )

/**
 * The spans of a card's band, for the hours its values are about. They are not among the values,
 * because a language model reads those. Null if they are not to be had: the card stands without
 * its band.
 */
export const getSpans = createServerFn({ method: "GET" })
  .validator((hours: { machine: string; from: string; to: string }) => hours)
  .handler(async ({ data }): Promise<Array<Span> | null> => {
    const answer = await ask(async (backend) => {
      // The name is checked against the tools of the backend: if it changes there, this fails to compile.
      const result = await backend.callTool(SPAN_LIST_TOOL, data)
      if (result.isError || !result.structuredContent) {
        throw new Refused(textOf(result) ?? `${SPAN_LIST_TOOL} returned no values.`)
      }
      return result.structuredContent.spans
    })
    return answer.values
  })

/**
 * The lines of the graph of an energy card, for the hours and machines its values are about. They
 * are not among the values, because a language model reads those. Null if they are not to be had:
 * the card stands without its graph.
 */
export const getEnergySeries = createServerFn({ method: "GET" })
  .validator((asked: { from: string; to: string; machines: Array<string> }) => asked)
  .handler(async ({ data }): Promise<EnergySeries | null> => {
    const answer = await ask(async (backend) => {
      // The name is checked against the tools of the backend: if it changes there, this fails to compile.
      const result = await backend.callTool(ENERGY_SERIES_TOOL, data)
      if (result.isError || !result.structuredContent) {
        throw new Refused(textOf(result) ?? `${ENERGY_SERIES_TOOL} returned no values.`)
      }
      return result.structuredContent
    })
    return answer.values
  })

/**
 * The lines of a time series card, for the lines and range a person chose on it. They are not among the
 * values, because a language model reads those. Null if they are not to be had: the card says so.
 */
export const getTimeseriesSeries = createServerFn({ method: "GET" })
  .validator((asked: { lines: Array<{ machine: string; signal: string }>; range: TimeseriesRange; to?: string }) => asked)
  .handler(async ({ data }): Promise<TimeseriesSeries | null> => {
    const answer = await ask(async (backend) => {
      // The name is checked against the tools of the backend: if it changes there, this fails to compile.
      const result = await backend.callTool(TIMESERIES_SERIES_TOOL, data)
      if (result.isError || !result.structuredContent) {
        throw new Refused(textOf(result) ?? `${TIMESERIES_SERIES_TOOL} returned no values.`)
      }
      return result.structuredContent
    })
    return answer.values
  })

/** What a person can add to a time series card: the signals of each machine. Null if they are not to be had. */
export const getTimeseriesSignals = createServerFn({ method: "GET" }).handler(async (): Promise<TimeseriesSignals | null> => {
  const answer = await ask(async (backend) => {
    const result = await backend.callTool(TIMESERIES_SIGNALS_TOOL, {})
    if (result.isError || !result.structuredContent) {
      throw new Refused(textOf(result) ?? `${TIMESERIES_SIGNALS_TOOL} returned no values.`)
    }
    return result.structuredContent
  })
  return answer.values
})

/** The warnings and errors of one machine over the last hours: the values of the notification card. */
export const getNotifications = createServerFn({ method: "GET" })
  .validator((request: { machine: string; hours: number }) => request)
  .handler(
    ({ data }): Promise<Answer<NotificationList>> =>
      ask(async (backend) => {
        const result = await backend.callTool("genui_notification_list", data)
        if (result.isError || !result.structuredContent) {
          throw new Refused(textOf(result) ?? "genui_notification_list returned no values.")
        }
        return result.structuredContent
      }),
  )

/** The energy machines imported over the last hours, and their mean and peak power: the values of the energy card. */
export const getEnergy = createServerFn({ method: "GET" })
  .validator((request: { machines: Array<string>; hours: number }) => request)
  .handler(
    ({ data }): Promise<Answer<EnergyShow>> =>
      ask(async (backend) => {
        const result = await backend.callTool("genui_energy_show", data)
        if (result.isError || !result.structuredContent) {
          throw new Refused(textOf(result) ?? "genui_energy_show returned no values.")
        }
        return result.structuredContent
      }),
  )

/** Signals of machines over a range: the values of the time series card, which asks for its lines itself. */
export const getTimeseries = createServerFn({ method: "GET" })
  .validator((request: { lines: Array<{ machine: string; signal: string }>; range: TimeseriesRange }) => request)
  .handler(
    ({ data }): Promise<Answer<TimeseriesShow>> =>
      ask(async (backend) => {
        const result = await backend.callTool("genui_timeseries_show", data)
        if (result.isError || !result.structuredContent) {
          throw new Refused(textOf(result) ?? "genui_timeseries_show returned no values.")
        }
        return result.structuredContent
      }),
  )

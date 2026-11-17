import type { MachineList, MachineShow, Span } from "@pleiades/cards/machine/contract.ts"
import type { MeasurementList, MeasurementSeries } from "@pleiades/cards/measurement/contract.ts"
import type { server } from "@pleiades/genui-mcp"
import { createMCPClient } from "@tanstack/ai-mcp"
import { createServerFn } from "@tanstack/react-start"

import { MEASUREMENT_SERIES_TOOL, SPAN_LIST_TOOL } from "./card-tools.ts"

// The values come from the generative UI backend. These functions run on the server of the app:
// the browser never talks to the backend itself.

/** Either the values or why there are none: a page says so and keeps trying. */
export type Answer<TValues> = { values: TValues; error: null } | { values: null; error: string }

/** The backend as a typed MCP client: the names of its tools and the shapes of their results are known. */
function connect() {
  const url = process.env.GENUI_MCP_URL ?? "http://localhost:5520/mcp"
  return createMCPClient<typeof server>({ transport: { type: "http", url } })
}

/** A tool that answered, but without values. Its message is the sentence the backend gave as the reason. */
class Refused extends Error {}

/**
 * Asks the backend and closes the connection again. If there are no values, the error is a
 * sentence that names who did not answer: the backend names its APIs, this function the backend.
 */
async function ask<TValues>(
  read: (backend: Awaited<ReturnType<typeof connect>>) => Promise<TValues>,
): Promise<Answer<TValues>> {
  try {
    const backend = await connect()
    try {
      return { values: await read(backend), error: null }
    } finally {
      await backend.close()
    }
  } catch (error) {
    if (error instanceof Refused) return { values: null, error: error.message }
    return { values: null, error: `The generative UI backend did not answer: ${reasonOf(error)}.` }
  }
}

/**
 * Why a request got no answer. The client and `fetch` each wrap what the network said, for example
 * ECONNREFUSED, in an error of their own: the innermost cause is the reason.
 */
function reasonOf(error: unknown): string {
  let innermost = error
  while (innermost instanceof Error && innermost.cause !== undefined) innermost = innermost.cause
  const { code, message } = (innermost ?? {}) as { code?: unknown; message?: unknown }
  return String(code ?? message ?? innermost)
}

/** What a tool wrote as text, which is where it says why it failed. */
function textOf(result: unknown): string | undefined {
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

/** One machine, and how long each state lasted over the last hours: the values of the machine card. */
export const getMachine = createServerFn({ method: "GET" })
  .validator((machine: string) => machine)
  .handler(
    ({ data: machine }): Promise<Answer<MachineShow>> =>
      ask(async (backend) => {
        const result = await backend.callTool("genui_machine_show", { machine })
        if (result.isError || !result.structuredContent) {
          throw new Refused(textOf(result) ?? "genui_machine_show returned no values.")
        }
        return result.structuredContent
      }),
  )

/** The newest physical values of every machine: the values of the measurement cards. */
export const getMeasurements = createServerFn({ method: "GET" }).handler(
  (): Promise<Answer<MeasurementList>> =>
    ask(async (backend) => {
      const result = await backend.callTool("genui_measurement_list", {})
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
export const getMeasurementSeries = createServerFn({ method: "GET" }).handler(
  (): Promise<Answer<MeasurementSeries>> =>
    ask(async (backend) => {
      // The name is checked against the tools of the backend: if it changes there, this fails to compile.
      const result = await backend.callTool(MEASUREMENT_SERIES_TOOL, {})
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

import { createMCPClient } from "@tanstack/ai-mcp"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { chatTools } from "@/chat/cards.tsx"
import { withTimeZone } from "@/chat/local-times.ts"
import { backend, serverOfTool } from "@/chat/mcp-servers.ts"
import type { Answer } from "@/machines/get-machines.ts"
import { textOf } from "@/machines/get-machines.ts"
import { keptClient } from "@/machines/kept-client.ts"
import { reasonOf } from "@/reason.ts"

import { drawingTool, noCardFor, notReading, readsOnly } from "./parts.ts"
import { recipePartSchema } from "./recipe.ts"

// A part of a page asks the server that has its tool, on the server of the app, as the pages of the
// machines do (machines/get-machines.ts): the generative UI backend, or another server of the chat,
// found by the name of the tool as the chat finds it (chat/mcp-servers.ts, ADR-0025). The tool and its
// arguments come from a recipe, and a recipe can come from a link: both are input from outside. So the
// name is held to the tools the chat draws before anything is called, the arguments to the schema of a
// part, and the tool to one its server says only reads: a page calls it each time it is opened.

/** A part to call: its tool and arguments, and the time zone of the browser that opens the page. */
export type PartCall = { tool: string; args: Record<string, unknown>; timeZone?: string }

const partCallSchema = recipePartSchema.extend({ timeZone: z.string().max(64).optional() })

/**
 * What a part got. `refused`: asking again does not change it. The tool answered and said no, its server
 * does not say that it only reads, or this app has no server for it. `from`: who did not answer, in words,
 * where it is not the generative UI backend.
 */
export type PartAnswer = Answer<string> & { refused?: true; from?: string }

type Client = Awaited<ReturnType<typeof createMCPClient>>

/** The connections of the server of the app to the servers of the parts, one for each address, kept between parts and pages. */
const connections = new Map<string, ReturnType<typeof keptClient<Client>>>()

function connectionTo(url: string) {
  let connection = connections.get(url)
  if (!connection) {
    connection = keptClient(() => createMCPClient({ transport: { type: "http", url } }))
    connections.set(url, connection)
  }
  return connection
}

const sentence = (words: string) => words.charAt(0).toUpperCase() + words.slice(1)

/**
 * Calls the tool of one part and returns what the chat hands to `draw` of that tool for the same
 * call: the values a tool with an output schema gives as `structuredContent`, written as JSON, or
 * else its text. Without values the answer is a sentence that says why: the app has no card for the
 * tool or no server for it, the tool does not only read or refused, or its server did not answer.
 */
export const callPart = createServerFn({ method: "GET" })
  .validator((input: PartCall) => {
    const call = partCallSchema.safeParse(input)
    if (!call.success) throw new Error("A part is the name of a tool and its arguments, a plain JSON object without a time zone.")
    return call.data
  })
  .handler(async ({ data: { tool, args, timeZone } }): Promise<PartAnswer> => {
    if (!drawingTool(tool, chatTools)) return { values: null, error: noCardFor(tool) }
    const server = serverOfTool(tool)
    if (server.url === undefined) return { values: null, error: server.missing, refused: true }
    try {
      return await connectionTo(server.url)(async (client): Promise<PartAnswer> => {
        const listed = (await client.tools()).find((one) => one.name === tool)
        if (listed === undefined) return { values: null, error: `${sentence(server.who)} has no tool ${tool}.`, refused: true }
        if (!readsOnly(listed)) return { values: null, error: notReading(tool, server.who), refused: true }
        // The time zone goes to a tool that takes one, as in the chat (chat/local-times.ts).
        const result = await client.callTool(tool, withTimeZone(args, listed.inputSchema, { timeZone }) ?? args)
        const text = textOf(result)
        if (result.isError) return { values: null, error: text ?? `${tool} returned no values.`, refused: true }
        if (result.structuredContent !== undefined) return { values: JSON.stringify(result.structuredContent), error: null }
        return text === undefined ? { values: null, error: `${tool} returned no values.` } : { values: text, error: null }
      })
    } catch (error) {
      return {
        values: null,
        error: `${sentence(server.who)} did not answer: ${reasonOf(error)}.`,
        ...(server.name !== backend && { from: server.who }),
      }
    }
  })

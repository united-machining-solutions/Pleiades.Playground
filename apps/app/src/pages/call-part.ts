import { createMCPClient } from "@tanstack/ai-mcp"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { chatTools } from "@/chat/cards.tsx"
import { withTimeZone } from "@/chat/local-times.ts"
import type { Answer } from "@/machines/get-machines.ts"
import { textOf } from "@/machines/get-machines.ts"
import { reasonOf } from "@/reason.ts"

import { drawingTool, noCardFor } from "./parts.ts"
import { recipePartSchema } from "./recipe.ts"

// A part of a page asks the generative UI backend, on the server of the app, as the pages of the
// machines do (machines/get-machines.ts). The tool and its arguments come from a recipe, and a
// recipe can come from a link: both are input from outside. So the name is held to the tools the
// chat draws before anything is called, and the arguments to the schema of a part.

/** A part to call: its tool and arguments, and the time zone of the browser that opens the page. */
export type PartCall = { tool: string; args: Record<string, unknown>; timeZone?: string }

const partCallSchema = recipePartSchema.extend({ timeZone: z.string().max(64).optional() })

/** What a part got. `refused`: the tool answered and said no, which asking again does not change. */
export type PartAnswer = Answer<string> & { refused?: true }

/**
 * Calls the tool of one part and returns what the chat hands to `draw` of that tool for the same
 * call: the values a tool with an output schema gives as `structuredContent`, written as JSON, or
 * else its text. Without values the answer is a sentence that says why: the app has no card for the
 * tool, the tool refused, or the backend did not answer.
 */
export const callPart = createServerFn({ method: "GET" })
  .validator((input: PartCall) => {
    const call = partCallSchema.safeParse(input)
    if (!call.success) throw new Error("A part is the name of a tool and its arguments, a plain JSON object without a time zone.")
    return call.data
  })
  .handler(async ({ data: { tool, args, timeZone } }): Promise<PartAnswer> => {
    if (!drawingTool(tool, chatTools)) return { values: null, error: noCardFor(tool) }
    try {
      const backend = await createMCPClient({
        transport: { type: "http", url: process.env.GENUI_MCP_URL ?? "http://localhost:5520/mcp" },
      })
      try {
        // The time zone goes to a tool that takes one, as in the chat (chat/local-times.ts).
        const listed = (await backend.tools()).find((one) => one.name === tool)
        const result = await backend.callTool(tool, withTimeZone(args, listed?.inputSchema, { timeZone }) ?? args)
        const text = textOf(result)
        if (result.isError) return { values: null, error: text ?? `${tool} returned no values.`, refused: true }
        if (result.structuredContent !== undefined) return { values: JSON.stringify(result.structuredContent), error: null }
        return text === undefined ? { values: null, error: `${tool} returned no values.` } : { values: text, error: null }
      } finally {
        await backend.close()
      }
    } catch (error) {
      return { values: null, error: `The generative UI backend did not answer: ${reasonOf(error)}.` }
    }
  })

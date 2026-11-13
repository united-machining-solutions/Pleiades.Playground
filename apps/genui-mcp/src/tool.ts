import type { MCPToolContext } from "@tanstack/ai-mcp/server"
import { z } from "zod"

import type { Apis } from "./apis.ts"

// What the tools of this server share. Where the two APIs are comes with each request (see
// main.ts), so an application can import the type of the server.

export type Context = MCPToolContext<{ apis: Apis }>

/** Every tool here reads and changes nothing. */
export const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

export const text = (value: string) => ({ content: [{ type: "text" as const, text: value }] })

/**
 * A result that says in words what its values are. A language model reads the words and a display
 * reads the values, so nobody has to read the values as text: a result is an answer, not raw
 * data. The library sends a result of this shape as it is. Its types know only the values, hence
 * the cast.
 */
export function inWords<TValues>(values: TValues, words: string): TValues {
  return { content: [{ type: "text", text: words }], structuredContent: values } as unknown as TValues
}

/**
 * A caller that shows the result to a person names that person's time zone. Whether the name is
 * one is checked where the tool runs (`knownTimeZone`), before anything is read.
 */
export const timeZone = z
  .string()
  .optional()
  .describe(
    "The IANA time zone to write every instant of the result in, for example Europe/Zurich. The instants are then local times with their offset to UTC. UTC if omitted.",
  )

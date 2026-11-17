import { z } from "zod"

// A page made from the chat is a recipe: a title, and the parts of the page in their order, each
// part one tool of the generative UI backend with its arguments. The app keeps the recipe, never
// the values: opening the page calls the tools again and draws each result with the card the chat
// draws for that tool. A recipe is also what a link carries, so it is checked like any input from
// outside: its shape and its size, and nothing else. A tool the app does not know does not make a
// recipe invalid: that part stays on the page and says that it has no answer.

/** The most parts a page holds. */
export const MAX_PARTS = 12
/** The longest title of a page, in characters. */
export const MAX_TITLE_LENGTH = 120
/** The longest name of a tool, in characters. */
export const MAX_TOOL_LENGTH = 100
/** The most characters the arguments of one part take, written as JSON. */
export const MAX_ARGS_LENGTH = 1_000

/** The length of a value written as JSON; endless for what JSON cannot write. */
function jsonLength(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? Number.POSITIVE_INFINITY
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

/**
 * The arguments of a part: a plain JSON object. The size is checked first, so that nothing large
 * or deeply nested is walked. No `timeZone`: the app adds the one of the person who opens the page
 * when it calls the tool, as the chat does.
 */
const argsSchema = z
  .unknown()
  .refine((args) => jsonLength(args) <= MAX_ARGS_LENGTH, {
    message: `The arguments of a part take at most ${MAX_ARGS_LENGTH} characters.`,
  })
  .pipe(z.record(z.string(), z.json()))
  .refine((args) => !Object.hasOwn(args, "timeZone"), {
    message: "A part keeps no time zone: the app adds the one of the person who opens the page.",
  })

/** One part of a page: a tool of the generative UI backend and its arguments. */
export const recipePartSchema = z.object({
  tool: z.string().min(1).max(MAX_TOOL_LENGTH),
  args: argsSchema,
})

/** Characters that turn the direction of the text after them: a title from a link could show other words than it holds. */
const DIRECTION_MARKS = /[\u202A-\u202E\u2066-\u2069]/g

/** The title of a page: what the sidebar, the breadcrumb and the list of pages call it. */
export const titleSchema = z
  .string()
  .transform((title) => title.replace(DIRECTION_MARKS, ""))
  .pipe(z.string().trim().min(1).max(MAX_TITLE_LENGTH))

/** A recipe: the title of a page and its parts, in the order the page draws them. */
export const recipeSchema = z.object({
  title: titleSchema,
  parts: z.array(recipePartSchema).min(1).max(MAX_PARTS),
})

/** A page as this browser keeps it: the recipe, and what the app says about it. */
export const storedPageSchema = z.object({
  /** Unique among the pages of this browser, and safe in an address: `/pages/<id>`. */
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  /** 1 for now. Versions of a page come later; the field is here so that nothing has to migrate. */
  version: z.number().int().min(1),
  recipe: recipeSchema,
  /** A pinned page stands in the sidebar, on the top level like Home. */
  pinned: z.boolean(),
  /** When the page was saved, an instant in UTC. */
  savedAt: z.iso.datetime(),
})

/** One part of a page: a tool and its arguments. */
export type RecipePart = { tool: string; args: Record<string, unknown> }
/** A title and the parts of a page, in their order: what the app keeps, and what a link carries. */
export type Recipe = { title: string; parts: Array<RecipePart> }
/** A page as this browser keeps it. */
export type StoredPage = z.output<typeof storedPageSchema>

/** The recipe in a value from outside, a link for example, or null if it does not keep the schema. */
export function recipeOf(value: unknown): Recipe | null {
  const parsed = recipeSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * A text as a title: on one line, and cut with an ellipsis where it is longer than a title may be.
 * For a question of the chat, which can be long. Empty if the text has no word.
 */
export function titleOf(text: string): string {
  const line = text.replace(/\s+/g, " ").trim()
  return line.length <= MAX_TITLE_LENGTH ? line : `${line.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`
}

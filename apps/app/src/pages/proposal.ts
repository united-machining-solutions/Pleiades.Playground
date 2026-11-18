import { jsonOf } from "../chat/tool-results.ts"
import type { ChatTool } from "../chat/tool-results.ts"
import { keyOfPart } from "./from-answer.ts"
import { drawingTool } from "./parts.ts"
import { MAX_PARTS, recipeOf, recipePartSchema, titleOf } from "./recipe.ts"
import type { Recipe, RecipePart } from "./recipe.ts"

// A page the chat proposes (ADR-0020). The language model composes a recipe and nothing else: a title,
// and the parts in their order, each a tool a page can call with its arguments. It writes no value and
// keeps nothing. The app checks what it sent, the chat shows the page that is left, and only the
// person keeps it. Everything else holds as ADR-0014 says: the page is a recipe in the browser.

/** The tool of the app itself with which the language model proposes a page. */
export const PROPOSE_PAGE_TOOL = "app_page_propose"

/** The tools a page can call, by name, in the order of the chat's list: those `drawingTool` finds. */
export function pageToolNames(tools: ReadonlyArray<ChatTool>): Array<string> {
  return tools.filter((tool) => drawingTool(tool.name, tools) === tool).map((tool) => tool.name)
}

/** What the language model sends. Loose on purpose: each part is checked on its own, here. */
export type ProposalInput = { title: string; parts: ReadonlyArray<{ tool: string; args?: unknown }> }

/** A part the app left out, by its place in what the model sent (from 1), and why. */
export type LeftOut = { part: number; tool: string; reason: string }

/** What the tool gives back: the recipe the app checked, and the parts it left out. */
export type Proposal = { recipe: Recipe; leftOut: Array<LeftOut> }

/**
 * Checks a page the language model proposes and returns what is left of it. A part stays if a page can
 * call its tool and its arguments keep the schema of a part; a time zone among them is dropped, as
 * "Save as page" drops it, because the app adds the one of the person who opens the page. A part the
 * same as one before it, and every part beyond `MAX_PARTS`, is left out. Each part left out comes back
 * with a reason the model can act on.
 *
 * Throws, with the reasons, where nothing is left to propose: the title has no word, or no part stays.
 * The model then reads why, and the chat draws no page.
 */
export function proposePage(input: ProposalInput, tools: ReadonlyArray<ChatTool>): Proposal {
  const names = pageToolNames(tools)
  const parts: Array<RecipePart> = []
  const leftOut: Array<LeftOut> = []
  const places = new Map<string, number>()
  input.parts.forEach(({ tool, args = {} }, index) => {
    const part = index + 1
    const leave = (reason: string) => void leftOut.push({ part, tool, reason })
    if (!names.includes(tool)) {
      return leave(`A page cannot call ${tool}. The tools a page can call are ${names.join(", ")}.`)
    }
    if (typeof args !== "object" || args === null || Array.isArray(args)) {
      return leave("The arguments of a part are an object of names and values, as the tool takes them.")
    }
    const { timeZone: _timeZone, ...kept } = args as Record<string, unknown>
    const checked = recipePartSchema.safeParse({ tool, args: kept })
    if (!checked.success) return leave(checked.error.issues.map((issue) => issue.message).join(" "))
    const key = keyOfPart(checked.data)
    const before = places.get(key)
    if (before !== undefined) return leave(`It is the same as part ${before}, and a page shows it once.`)
    if (parts.length === MAX_PARTS) return leave(`A page holds at most ${MAX_PARTS} parts.`)
    places.set(key, part)
    parts.push(checked.data)
  })
  const title = titleOf(input.title)
  if (title === "") throw new Error("A page needs a title: a few words that say what it shows.")
  const recipe = recipeOf({ title, parts })
  if (recipe === null) {
    const reasons = leftOut.map(({ part, reason }) => `Part ${part}: ${reason}`).join(" ")
    throw new Error(`No part is left, so there is no page to propose. ${reasons}`.trim())
  }
  return { recipe, leftOut }
}

/**
 * The recipe in a result of the tool, as the chat gets it: JSON as text. Null for anything that is not
 * exactly a recipe: the chat holds it to `recipeOf`, as it holds a link.
 */
export function proposedRecipe(content: unknown): Recipe | null {
  const value = jsonOf(content)
  return typeof value === "object" && value !== null && "recipe" in value ? recipeOf(value.recipe) : null
}

/**
 * A part of a page in words: what it shows, as the chat's list says (`part`), or else the name of its
 * tool; and its arguments as names and values, empty without any.
 */
export function partInWords({ tool, args }: RecipePart, tools: ReadonlyArray<ChatTool>): { shows: string; given: string } {
  const shows = drawingTool(tool, tools)?.part ?? tool
  const given = Object.entries(args)
    .map(([name, value]) => `${name}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(", ")
  return { shows, given }
}

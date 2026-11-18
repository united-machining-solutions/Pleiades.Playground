import type { UIMessage } from "@tanstack/ai-react"

import { blocksOf, questionOf } from "../chat/blocks.ts"
import type { ChatTool } from "../chat/tool-results.ts"
import { drawingTool } from "./parts.ts"
import { MAX_PARTS, recipeOf, recipePartSchema, titleOf } from "./recipe.ts"
import type { Recipe, RecipePart } from "./recipe.ts"

// The recipe of an answer in the chat: what "Save as page" keeps. The app reads it from the answer it
// already has, so no language model is asked: the parts are the tool calls of the answer for which the
// chat drew something, in their order, and the title is the question. No sentence of the answer goes
// into it, and no value: opening the page calls the tools again.

type Parts = UIMessage["parts"]

/** The arguments a call carries as a plain object, or undefined where they cannot be read. */
function argsOf(call: Extract<Parts[number], { type: "tool-call" }>): Record<string, unknown> | undefined {
  // The client parses the arguments once they are complete and hands them on as `input`; the raw
  // JSON stays in `arguments`, and a call without arguments may carry an empty string.
  const value: unknown = call.input !== undefined ? call.input : call.arguments.trim() === "" ? {} : parse(call.arguments)
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined
  // The app adds the time zone of the person who opens the page, as the chat does: a part keeps none.
  const { timeZone: _timeZone, ...args } = value as Record<string, unknown>
  return args
}

function parse(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch {
    return undefined
  }
}

/** A value written as JSON with its keys in order, so that arguments equal in meaning are equal as text. */
function keyOf(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === "object" && item !== null && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : item,
  )
}

/** A part as text, its tool and its arguments with their keys in order: two parts equal in meaning are equal as text. */
export function keyOfPart(part: RecipePart): string {
  return `${part.tool} ${keyOf(part.args)}`
}

/**
 * The tool calls of an answer for which the chat drew something, in their order: the tool is one the
 * chat draws, the call's result is there and is no error, and `draw` of the tool gave something for
 * it (the same pairing as `blocksOf` in chat/blocks.ts). A call whose arguments cannot be read is left
 * out. The same tool with the same arguments counts once, where it first stands. Not capped:
 * `recipeOfAnswer` does that.
 */
export function callsOfAnswer(parts: Parts, tools: ReadonlyArray<ChatTool>): Array<RecipePart> {
  const calls: Array<RecipePart> = []
  const seen = new Set<string>()
  for (const part of parts) {
    if (part.type !== "tool-call") continue
    const result = parts.find((other) => other.type === "tool-result" && other.toolCallId === part.id)
    if (result?.type !== "tool-result" || result.state === "error") continue
    const tool = drawingTool(part.name, tools)
    const drawn = tool?.draw?.(result.content)
    if (drawn === null || drawn === undefined) continue
    const args = argsOf(part)
    if (args === undefined) continue
    // A part the schema of a recipe refuses, arguments too large for example, is left out alone and
    // does not take the other parts with it.
    const kept = recipePartSchema.safeParse({ tool: part.name, args })
    if (!kept.success) continue
    const key = keyOfPart(kept.data)
    if (seen.has(key)) continue
    seen.add(key)
    calls.push(kept.data)
  }
  return calls
}

/**
 * The recipe of an answer: the question as its title and the calls of the answer as its parts, or
 * null if nothing is left to keep or the question has no word. An answer with more calls than a page
 * holds (`MAX_PARTS`) keeps the first ones: a page of the first cards is better than no page, and
 * `callsOfAnswer` says how many there were, so that the chat can say how many are left out. The result
 * passes `recipeOf`, so nothing that does not keep the schema leaves here.
 */
export function recipeOfAnswer(question: string, parts: Parts, tools: ReadonlyArray<ChatTool>): Recipe | null {
  return recipeOf({ title: titleOf(question), parts: callsOfAnswer(parts, tools).slice(0, MAX_PARTS) })
}

/**
 * What "Save as page" keeps of an answer, asked for the message at `at` of a chat: its recipe, and how
 * many cards of the answer did not fit on a page (0 unless it had more than `MAX_PARTS`). Null where
 * the button does not stand under that message.
 *
 * An answer is everything the model said after one question of the person, and it is more than one
 * message: the calls and their results come in one, the words after them in the next. The button
 * stands under the last of them that shows anything, and keeps the calls of all of them. The question,
 * and so the title, is the nearest message of the person before the answer. `answering` says whether
 * the last answer of the chat is still coming: it keeps nothing until it has ended.
 */
export function keepOfAnswer(
  messages: ReadonlyArray<UIMessage>,
  at: number,
  tools: ReadonlyArray<ChatTool>,
  answering: boolean,
): { recipe: Recipe; left: number } | null {
  if (messages[at]?.role !== "assistant") return null
  let question = at - 1
  while (question >= 0 && messages[question]?.role !== "user") question--
  const asked = messages[question]
  if (asked === undefined) return null
  let end = question + 1
  while (end < messages.length && messages[end]?.role !== "user") end++
  if (answering && end === messages.length) return null
  const answer = messages.slice(question + 1, end).filter((message) => message.role === "assistant")
  // The same test the chat uses to draw a message at all (chat/blocks.ts).
  const shown = answer.filter((message) => blocksOf(message.parts, false, tools).length > 0)
  if (shown.at(-1) !== messages[at]) return null
  const parts = answer.flatMap((message) => message.parts)
  const recipe = recipeOfAnswer(questionOf(asked.parts), parts, tools)
  if (recipe === null) return null
  // Only an answer that fills a page can have left cards out: count them then.
  const left = recipe.parts.length < MAX_PARTS ? 0 : callsOfAnswer(parts, tools).length - recipe.parts.length
  return { recipe, left }
}

import type { ChatTool } from "../chat/tool-results.ts"
import { keyOfPart } from "./from-answer.ts"
import { drawingTool } from "./parts.ts"
import { pageToolNames } from "./proposal.ts"
import { MAX_PARTS } from "./recipe.ts"
import type { RecipePart } from "./recipe.ts"

// A card a person adds to a kept page by hand, with no language model. What a card takes stands in
// the input schema of its tool, which the generative UI backend lists: the form reads its fields
// from there, so a new card that takes the same kind of arguments needs no line in the app. It is no
// general form builder. It knows a machine and a whole number, and leaves an optional argument it does
// not know to the tool, which then takes its default: the list of machines of the energy card, which
// then shows every machine. A card with a required argument it does not know cannot be added here.

/** An argument of a card that the form asks for. */
export type CardArgument =
  /** A machine of the stack, by its id. A person chooses it by its name from the machines the backend lists. */
  | { name: string; kind: "machine"; required: boolean }
  /** A whole number, from `min` to `max` where the schema gives them. */
  | { name: string; kind: "whole"; required: boolean; min?: number; max?: number }

/**
 * A card a person can add: the tool of a page, what it shows in words (`part` of its entry in the
 * chat's list), the arguments the form asks for in the order of the schema, and the required ones it
 * cannot ask for. A card with any of those is not to be added here.
 */
export type CardChoice = { tool: string; shows: string; asks: Array<CardArgument>; cannotAsk: Array<string> }

/** What a person filled in for each argument: a machine id, a whole number, or nothing. */
export type Filled = Record<string, string | number | null | undefined>

/**
 * The argument that names one machine. Every tool of the backend that is about one machine calls it
 * so, and takes the id that `genui_machine_list` gives for it.
 */
const MACHINE = "machine"

/** The argument the app adds itself, with the time zone of the person who opens the page (call-part.ts). */
const TIME_ZONE = "timeZone"

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

/** One property of an input schema as an argument the form asks for, or undefined if it does not know it. */
function argumentOf(name: string, property: unknown, required: boolean): CardArgument | undefined {
  if (typeof property !== "object" || property === null) return undefined
  const { type, minimum, maximum } = property as Record<string, unknown>
  if (name === MACHINE && type === "string") return { name, kind: "machine", required }
  if (type !== "integer") return undefined
  const min = finite(minimum)
  const max = finite(maximum)
  return {
    name,
    kind: "whole",
    required,
    ...(min !== undefined && { min }),
    ...(max !== undefined && { max }),
  }
}

/**
 * What the form asks for a tool, read from its input schema, a JSON schema as the backend lists it.
 * The time zone is never asked: the app adds it. An optional argument the form does not know stays
 * out; a required one it does not know, or one the schema names without describing it, is in
 * `cannotAsk`.
 */
export function argumentsOf(inputSchema: unknown): Pick<CardChoice, "asks" | "cannotAsk"> {
  const { properties, required } = (typeof inputSchema === "object" && inputSchema !== null ? inputSchema : {}) as {
    properties?: unknown
    required?: unknown
  }
  const needed = Array.isArray(required)
    ? required.filter((name): name is string => typeof name === "string" && name !== TIME_ZONE)
    : []
  const described = typeof properties === "object" && properties !== null ? (properties as Record<string, unknown>) : {}
  const asks: Array<CardArgument> = []
  for (const [name, property] of Object.entries(described)) {
    if (name === TIME_ZONE) continue
    const argument = argumentOf(name, property, needed.includes(name))
    if (argument) asks.push(argument)
  }
  const cannotAsk = needed.filter((name) => !asks.some((argument) => argument.name === name))
  return { asks, cannotAsk }
}

/**
 * The cards a person can add to a page: the tools a page can call (`pageToolNames`), in the order of
 * the chat's list, each with what it shows and what the form asks for it. A tool the backend does not
 * list is left out: it has no schema, and calling it would give no answer. So is a tool without words
 * for what it shows: a person chooses a card by what it shows, never by the name of its tool.
 */
export function cardChoicesOf(
  listed: ReadonlyArray<{ name: string; inputSchema?: unknown }>,
  tools: ReadonlyArray<ChatTool>,
): Array<CardChoice> {
  return pageToolNames(tools).flatMap((tool) => {
    const one = listed.find((each) => each.name === tool)
    const shows = drawingTool(tool, tools)?.part
    return one && shows ? [{ tool, shows, ...argumentsOf(one.inputSchema) }] : []
  })
}

/**
 * Why a card cannot be added here, or null if it can: it takes an argument the form cannot ask for,
 * or it needs a machine and the machines cannot be read now (`noMachines`, the sentence that says why).
 */
export function whyOff(card: CardChoice, noMachines: string | null): string | null {
  if (card.cannotAsk.length > 0) return `It takes ${card.cannotAsk.join(", ")}, which this form cannot ask for.`
  const needsMachine = card.asks.some((argument) => argument.kind === "machine" && argument.required)
  if (needsMachine && noMachines !== null) return `It needs a machine, and the machines cannot be read now. ${noMachines}`
  return null
}

/** What a field of the form is called: "Machine", "Hours". */
export function labelOf({ name, kind }: CardArgument): string {
  if (kind === "machine") return "Machine"
  const words = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** A whole number in words: "a whole number from 1 to 24". */
function wholeInWords({ min, max }: { min?: number; max?: number }): string {
  if (min !== undefined && max !== undefined) return `a whole number from ${min} to ${max}`
  if (min !== undefined) return `a whole number, ${min} or more`
  if (max !== undefined) return `a whole number, ${max} or less`
  return "a whole number"
}

/**
 * What the form says under the field of a whole number: its range, and for an optional one that the
 * card takes its own value when it is left empty. Written here and not taken from the schema, whose
 * descriptions are written for a language model.
 */
export function hintOf(argument: Extract<CardArgument, { kind: "whole" }>): string {
  const range = wholeInWords(argument)
  const sentence = `${range.charAt(0).toUpperCase()}${range.slice(1)}.`
  return argument.required ? sentence : `${sentence} Left empty, the card takes its own.`
}

/** Why a whole number does not fit an argument, or null if it does. */
function wholeProblem(argument: Extract<CardArgument, { kind: "whole" }>, value: number): string | null {
  const { min, max } = argument
  const fits = Number.isInteger(value) && (min === undefined || value >= min) && (max === undefined || value <= max)
  if (fits) return null
  const range = wholeInWords(argument)
  return `${range.charAt(0).toUpperCase()}${range.slice(1)}.`
}

/**
 * The part a card makes with what a person filled in: its tool, and its arguments in the order of the
 * schema, without those left empty. Or, for each argument that is missing or does not fit, why.
 */
export function partOf(
  choice: CardChoice,
  filled: Filled,
): { part: RecipePart; problems: null } | { part: null; problems: Record<string, string> } {
  const args: Record<string, unknown> = {}
  const problems: Record<string, string> = {}
  for (const name of choice.cannotAsk) problems[name] = `This card needs ${name}, which this form cannot ask for.`
  for (const argument of choice.asks) {
    const value = filled[argument.name]
    if (value === undefined || value === null || value === "") {
      if (argument.required) problems[argument.name] = argument.kind === "machine" ? "Choose a machine." : "Give a whole number."
      continue
    }
    if (argument.kind === "machine") {
      if (typeof value === "string") args[argument.name] = value
      else problems[argument.name] = "Choose a machine."
      continue
    }
    const problem = typeof value === "number" ? wholeProblem(argument, value) : "A whole number."
    if (problem === null) args[argument.name] = value
    else problems[argument.name] = problem
  }
  return Object.keys(problems).length > 0 ? { part: null, problems } : { part: { tool: choice.tool, args }, problems: null }
}

/**
 * Why a part cannot go onto a page that holds `parts`, or null if it can: the page is full, or it
 * shows the same card with the same arguments already (`keyOfPart`), which a page shows once.
 */
export function cannotAdd(parts: ReadonlyArray<RecipePart>, part: RecipePart): string | null {
  if (parts.length >= MAX_PARTS) return `A page holds at most ${MAX_PARTS} parts. Remove one to add another.`
  const key = keyOfPart(part)
  const same = parts.findIndex((one) => keyOfPart(one) === key)
  if (same >= 0) return `Part ${same + 1} of this page is the same card with the same choices, and a page shows it once.`
  return null
}

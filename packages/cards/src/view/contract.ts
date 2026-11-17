import { z } from "zod"

import { instant, serialNumber } from "../machine/contract.ts"
import { shopfloorShow } from "../shopfloor/contract.ts"

// The contract of a view: an answer that a language model lays out itself, from a set of blocks.
//
// The model chooses the blocks, their order and their titles: what to show. It never writes a number.
// A block that shows a number asks for a measure, and the backend computes it from the stored values
// and says where it comes from. So the view is the model's, and every value in it is the data's.

/** What a block can measure, for one machine or for the whole hall. */
export const measure = z.enum(["errors", "warnings", "running-share", "energy"])
export type Measure = z.infer<typeof measure>

const hours = z
  .number()
  .int()
  .min(1)
  .max(24)
  .optional()
  .describe("How many hours back the block looks, 24 if omitted.")

const machine = serialNumber.optional().describe("One machine, for example P-04. The whole hall if omitted.")

// ---- What a language model asks for ----

/** The blocks a language model can lay out. Each says what to show, never a value. */
export const blockRequest = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("kpi"),
    measure,
    machine,
    hours,
    label: z.string().optional().describe("A short label, for example Errors today."),
  }).describe("One figure, large: a measure of one machine or of the hall."),
  z.object({
    type: z.literal("ranking"),
    measure,
    hours,
    title: z.string().optional(),
  }).describe("Every machine with the measure as a bar, the largest first: to compare machines."),
  z.object({
    type: z.literal("causes"),
    machine,
    hours,
    title: z.string().optional(),
  }).describe("The warnings and errors that occurred most often, with how often and how long in total."),
  z.object({
    type: z.literal("hall"),
    highlight: z.array(serialNumber).optional().describe("Machines to mark on the plan, for example the one a question is about."),
    title: z.string().optional(),
  }).describe("The plan of the hall with every machine and its state."),
  z.object({
    type: z.literal("note"),
    text: z.string().describe("One or two sentences in words. Give no number here: numbers belong in the other blocks."),
    tone: z.enum(["info", "warning"]).optional(),
  }).describe("A short remark: a conclusion, a suggestion, a next step."),
  z.object({
    type: z.literal("gaps"),
    title: z.string().optional(),
    have: z.array(z.string()).describe("What the stored values can tell about the question, in words."),
    missing: z
      .array(z.object({ what: z.string(), source: z.string().describe("Where it could come from, for example the ERP system.") }))
      .describe("What is needed to answer the question and is not in the stack."),
  }).describe("For a question the data cannot answer yet: what there is, what is missing, and where it could come from."),
])
export type BlockRequest = z.infer<typeof blockRequest>

// ---- What the view shows ----

/** How a value is counted: a number of events, a fraction (`one`), or energy in joule. */
export const unit = z.enum(["count", "one", "joule"])
export type Unit = z.infer<typeof unit>

const span = { from: instant, to: instant }
const source = z.string().describe("Where the values come from: the API, and the topic or the notifications.")

export const block = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("kpi"),
    label: z.string(),
    measure,
    machine: serialNumber.nullable(),
    value: z.number().nullable().describe("Null if no value is known for that time."),
    unit,
    ...span,
    source,
  }),
  z.object({
    type: z.literal("ranking"),
    title: z.string(),
    measure,
    unit,
    items: z.array(z.object({ machine: serialNumber, value: z.number().nullable() })).describe("The largest first; a machine without a value last."),
    ...span,
    source,
  }),
  z.object({
    type: z.literal("causes"),
    title: z.string(),
    machine: serialNumber.nullable(),
    items: z
      .array(
        z.object({
          title: z.string(),
          level: z.enum(["Warning", "Error"]),
          count: z.number().int().describe("How often it was raised."),
          seconds: z.number().describe("How long it stood in total, in second."),
        }),
      )
      .describe("The most frequent first, at most five."),
    ...span,
    source,
  }),
  z.object({ type: z.literal("hall"), title: z.string(), highlight: z.array(serialNumber), shopfloor: shopfloorShow }),
  z.object({ type: z.literal("note"), text: z.string(), tone: z.enum(["info", "warning"]) }),
  z.object({
    type: z.literal("gaps"),
    title: z.string(),
    have: z.array(z.string()),
    missing: z.array(z.object({ what: z.string(), source: z.string() })),
  }),
])
export type Block = z.infer<typeof block>

/** A view: its title and its blocks, in the order the language model laid them out. */
export const viewShow = z.object({
  title: z.string(),
  asOf: instant,
  blocks: z.array(block),
})
export type ViewShow = z.infer<typeof viewShow>

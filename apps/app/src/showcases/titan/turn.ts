import { titanInstructions } from "./persona.ts"

// What a turn of the conversation with Titan is made of, without the server: the events the browser
// gets, the tools Titan has, its instructions and the conversation a browser may send. turn.server.ts
// asks the model and the tools with them.

export type TurnMessage = { role: "user" | "assistant"; content: string }

/** What the browser gets, line by line. */
export type TurnEvent =
  | { type: "text"; delta: string }
  /** The model reads: a tool call begins. */
  | { type: "call"; id: string; name: string }
  /** What the tool gave: its values as JSON for the card, or why it failed. */
  | { type: "result"; id: string; name: string; content: string; failed: boolean }
  | { type: "done" }
  | { type: "error"; message: string }

type ToolDefinition = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }

const machine = { type: "string", description: "The machine id as the list of machines names it, for example alcyone-machines_AX-400_P-04." }
const hours = { type: "integer", minimum: 1, maximum: 24, description: "How many hours back." }

/** The tools Titan has: four of the generative UI backend, by their names there, with the arguments Titan needs. */
export const TITAN_TOOLS: ReadonlyArray<ToolDefinition> = [
  {
    type: "function",
    function: {
      name: "genui_machine_list",
      description: "Every machine with what it does now. The instructions already hold this as it was when the question came; call it only to read it again.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "genui_machine_show",
      description: "One machine: what it does now and how long each state lasted over the last hours. The screen draws it as a card with the states as a band.",
      parameters: { type: "object", properties: { machine, hours }, required: ["machine"] },
    },
  },
  {
    type: "function",
    function: {
      name: "genui_notification_list",
      description: "The warnings and errors of one machine over the last hours, each with when it was raised and how long it stood.",
      parameters: { type: "object", properties: { machine, hours }, required: ["machine"] },
    },
  },
  {
    type: "function",
    function: {
      name: "genui_energy_show",
      description: "How much energy the machines imported over the last hours, with mean and peak power.",
      parameters: { type: "object", properties: { hours } },
    },
  },
]

/** The day and the time as the person's clock shows them; a time zone the browser made up is left out. */
function clockOf(now: Date, timeZone: string | undefined): string {
  const format = { weekday: "long", hour: "2-digit", minute: "2-digit" } as const
  try {
    return now.toLocaleString("de-DE", { ...format, timeZone })
  } catch {
    return now.toLocaleString("de-DE", format)
  }
}

/** The instructions of a turn: Titan's, the time, and the hall as it is now. */
export function instructionsOf(hall: string | undefined, timeZone: string | undefined, now = new Date()): string {
  const clock = clockOf(now, timeZone)
  return [
    titanInstructions,
    `It is ${clock}.`,
    hall
      ? `The hall as it is now, read with genui_machine_list when the question came:\n${hall}`
      : "The hall could not be read when the question came: call genui_machine_list before you say anything about a machine.",
  ].join("\n\n")
}

/** The largest body of a turn the server reads: the conversation below fits many times over. */
export const MOST_BODY_BYTES = 256 * 1024
/** The last messages of a conversation that go to the model, */
const MOST_MESSAGES = 20
/** each cut to this many characters: a spoken question or answer is far shorter, */
const MOST_CHARACTERS_EACH = 2_000
/** and all of them together to this many, about 3 000 tokens: the oldest are left out first. */
const MOST_CHARACTERS = 12_000

/**
 * The conversation a browser sent, as far as it is one: the roles and texts of its last messages, bounded
 * each and as a whole, since the route has no sign-in and every turn is paid for. Undefined unless it ends
 * with a question.
 */
export function conversationOf(body: unknown): Array<TurnMessage> | undefined {
  const sent = (body as { messages?: unknown } | null)?.messages
  if (!Array.isArray(sent)) return undefined
  const messages = sent.slice(-MOST_MESSAGES).flatMap((one: { role?: unknown; content?: unknown } | null) =>
    (one?.role === "user" || one?.role === "assistant") && typeof one.content === "string" && one.content.trim() !== ""
      ? [{ role: one.role, content: one.content.slice(0, MOST_CHARACTERS_EACH) } as TurnMessage]
      : [],
  )
  if (messages.at(-1)?.role !== "user") return undefined
  let size = messages.reduce((sum, one) => sum + one.content.length, 0)
  while (messages.length > 1 && size > MOST_CHARACTERS) size -= (messages.shift() as TurnMessage).content.length
  return messages
}

import { ask, textOf } from "@/machines/get-machines.ts"

import { atOnce } from "./gateway.server.ts"
import type { TitanModels } from "./gateway.server.ts"
import { TITAN_TOOLS, instructionsOf, withoutPreamble } from "./turn.ts"
import type { TurnEvent, TurnMessage } from "./turn.ts"

// One turn of a conversation with Titan, made for speaking: the first words have to come soon.
//
// The chat of the app answers with every tool and every instruction it has, about 17 000 tokens a
// turn; on the hackathon gateway its first word came after 1.6 to 1.9 s, and after 5 to 7 s when it
// read first. Titan asks the same gateway with less:
//
// - its own short instructions (persona.ts),
// - what every machine does now, read before the model is asked and written into the instructions: most
//   spoken questions ("which machine stands?") are answered from that, without a tool call,
// - four tools of the generative UI backend for what goes deeper, under their own names, called over
//   the connection the pages use (machines/get-machines.ts). Their results are the same values the
//   chat gets, so the screen draws them with the same cards.
//
// The answer goes to the browser as it arrives, a line of JSON for each event, so a sentence is spoken
// while the next is written.

const TOOL_NAMES = new Set(TITAN_TOOLS.map((tool) => tool.function.name))

/** At most this many times the model is asked in one turn: a question, and what it read, three times over. */
const MOST_ROUNDS = 4
/**
 * A spoken answer is short, about 150 tokens with its list. The limit is well above that: a model that
 * thinks before it answers, against what Titan asks of it, spends its thought from the same budget, and
 * with too small a one it ends before its first word.
 */
const MOST_TOKENS = 1_500
/** The hall is read before the model is asked; a backend slower than this does not hold up the answer. */
const HALL_WITHIN_MS = 1_500

/**
 * What every machine does now, in the words the tool gives a model, with the times as the person's clock
 * shows them, or nothing if the backend is slow or away. The last line of the tool says when it was read,
 * which is now: it is left out, or the model tells the person the time.
 */
async function hallNow(timeZone: string | undefined): Promise<string | undefined> {
  const late = new Promise<undefined>((resolve) => setTimeout(resolve, HALL_WITHIN_MS))
  const read = ask(async (backend) => {
    let result = await backend.callTool("genui_machine_list", timeZone ? { timeZone } : {})
    // A time zone the backend does not know is no reason to do without the hall: then in its own times.
    if (result.isError && timeZone) result = await backend.callTool("genui_machine_list", {})
    return result.isError ? undefined : textOf(result)
  })
  const words = (await Promise.race([read, late]))?.values
  if (!words) return undefined
  return words
    .split("\n")
    .filter((line) => !line.startsWith("Read at"))
    .join("\n")
    .trim()
}

type Call = { id: string; name: string; arguments: string }

/** Calls a tool of the backend. The words are for the model, the values for the card. */
async function callTool(call: Call, timeZone: string | undefined): Promise<{ words: string; content: string; failed: boolean }> {
  if (!TOOL_NAMES.has(call.name)) return { words: `There is no tool ${call.name}.`, content: "", failed: true }
  let input: Record<string, unknown>
  try {
    input = call.arguments.trim() === "" ? {} : (JSON.parse(call.arguments) as Record<string, unknown>)
  } catch {
    return { words: "The arguments were not JSON.", content: "", failed: true }
  }
  const answer = await ask(async (backend) => {
    // The names are checked above; the backend checks the arguments against its own schema.
    const result = await (backend.callTool as (name: string, input: unknown) => Promise<{ isError?: boolean; structuredContent?: unknown }>)(call.name, {
      ...input,
      ...(timeZone ? { timeZone } : {}),
    })
    return { failed: result.isError === true, words: textOf(result), values: result.structuredContent }
  })
  if (answer.values === null) return { words: answer.error, content: "", failed: true }
  const { failed, words, values } = answer.values
  const content = values === undefined ? "" : JSON.stringify(values)
  return { words: words ?? content, content, failed: failed || values === undefined }
}

type Delta = { content?: string | null; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> }

/**
 * Asks the model once and passes its text on as it arrives. Resolves with the text and the tool calls
 * of this round.
 */
async function round(
  models: TitanModels & { chat: string },
  messages: ReadonlyArray<unknown>,
  emit: (event: TurnEvent) => void,
  signal: AbortSignal,
  last: boolean,
): Promise<{ text: string; calls: Array<Call> }> {
  const answer = await fetch(`${models.baseURL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${models.apiKey}` },
    body: JSON.stringify({ model: models.chat, stream: true, max_tokens: MOST_TOKENS, messages, tools: TITAN_TOOLS, ...(last ? { tool_choice: "none" } : {}), ...atOnce(models.chat) }),
    signal,
  })
  if (!answer.ok || !answer.body) throw new Error(`The gateway answered ${answer.status}`)
  // What is passed on is what Titan says and what the model reads of itself in the next round.
  let text = ""
  const said = withoutPreamble((delta) => {
    text += delta
    emit({ type: "text", delta })
  })
  const calls: Array<Call> = []
  const decoder = new TextDecoder()
  let buffer = ""
  for await (const chunk of answer.body) {
    buffer += decoder.decode(chunk, { stream: true })
    let end: number
    while ((end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end).trim()
      buffer = buffer.slice(end + 1)
      if (!line.startsWith("data:")) continue
      const data = line.slice(5).trim()
      if (data === "" || data === "[DONE]") continue
      let delta: Delta | undefined
      try {
        delta = (JSON.parse(data) as { choices?: Array<{ delta?: Delta }> }).choices?.[0]?.delta
      } catch {
        continue
      }
      if (typeof delta?.content === "string" && delta.content !== "") said.push(delta.content)
      for (const part of delta?.tool_calls ?? []) {
        const call = (calls[part.index] ??= { id: "", name: "", arguments: "" })
        if (part.id) call.id = part.id
        if (part.function?.name) call.name += part.function.name
        if (part.function?.arguments) call.arguments += part.function.arguments
      }
    }
  }
  said.end()
  return { text, calls: calls.filter(Boolean).map((call, index) => ({ ...call, id: call.id || `call-${index}` })) }
}

/**
 * Answers the last question of a conversation. Every event goes to `emit` as it happens; the last one
 * is "done" or "error".
 */
export async function answer(
  models: TitanModels & { chat: string },
  conversation: ReadonlyArray<TurnMessage>,
  timeZone: string | undefined,
  emit: (event: TurnEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  try {
    const messages: Array<unknown> = [{ role: "system", content: instructionsOf(await hallNow(timeZone), timeZone) }, ...conversation]
    let said = false
    for (let asked = 0; asked < MOST_ROUNDS; asked++) {
      // In the last round the model has no tool left: it answers with what it read.
      const { text, calls } = await round(models, messages, emit, signal, asked === MOST_ROUNDS - 1)
      if (text.trim() !== "") said = true
      if (calls.length === 0) break
      messages.push({
        role: "assistant",
        content: text || null,
        tool_calls: calls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: call.arguments || "{}" } })),
      })
      for (const call of calls) emit({ type: "call", id: call.id, name: call.name })
      // Calls of one round do not depend on each other: they run together.
      const results = await Promise.all(calls.map((call) => callTool(call, timeZone)))
      // What a tool gave is drawn as a card: that is an answer too, also when the model adds no word.
      if (results.some((result) => !result.failed)) said = true
      for (const [index, result] of results.entries()) {
        const call = calls[index] as Call
        emit({ type: "result", id: call.id, name: call.name, content: result.content, failed: result.failed })
        messages.push({ role: "tool", tool_call_id: call.id, content: result.words })
      }
      // The text of one round and the next are two paragraphs, for the voice and for the screen.
      if (text) emit({ type: "text", delta: "\n\n" })
    }
    // A turn without a word is no answer: the page says so, instead of falling silent after "Moment.".
    if (!said) throw new Error("the model answered without a word")
    emit({ type: "done" })
  } catch (error) {
    if (signal.aborted) return
    emit({ type: "error", message: error instanceof Error ? error.message : String(error) })
  }
}

import type { TurnEvent } from "./turn.ts"

// The conversation with Titan, kept in the page: the questions and the answers so far. A question goes
// to the server route /titan/api/turn with the conversation, and its answer arrives event by event
// (turn.ts). Those who listen, the voice (voice/voice.ts) and the screen (voice/shown.ts), are
// told at every change, so a sentence is said and a card is drawn as soon as it is there.
//
// A new question hangs up on an answer that is still arriving. The conversation is gone when the page
// is left; the chat of the app knows nothing of it.

/** A part of a message, in the shape the chat of the app draws (chat/blocks.ts), so the same cards draw it. */
export type Part =
  | { type: "text"; content: string }
  | { type: "tool-call"; id: string; name: string; arguments: string; state: "input-complete" }
  | { type: "tool-result"; toolCallId: string; content: string; state: "complete" | "error"; error?: string }

export type Message = { id: string; role: "user" | "assistant"; parts: ReadonlyArray<Part> }

/** One who follows the conversation. */
export type Listener = {
  /** Every change of the messages, and whether an answer is arriving. */
  update: (messages: ReadonlyArray<Message>, isLoading: boolean) => void
  /** The page is left. */
  detach: () => void
}

export type Conversation = {
  /** Asks a question. An answer that is still arriving is given up. */
  ask: (question: string) => void
  /** Gives up the answer that is arriving, if one is: the person interrupts. The conversation goes on. */
  stop: () => void
  /** Ends the conversation: hangs up and tells the listeners. */
  close: () => void
}

type Options = {
  listeners: ReadonlyArray<Listener>
  /** The model reads before it has said a word: the page fills the silence. */
  onReading?: () => void
  /** The answer could not be given, in words for the person. */
  onProblem?: (problem: string) => void
  /** For tests: how a turn is asked for. */
  fetch?: typeof fetch
}

/** The text of a message: what was asked, or what was answered. */
export function textOf(message: Message): string {
  return message.parts.flatMap((part) => (part.type === "text" ? [part.content] : [])).join("")
}

/** A message with an event of the answer added. */
export function withEvent(message: Message, event: TurnEvent): Message {
  const parts = [...message.parts]
  const last = parts.at(-1)
  if (event.type === "text") {
    // The text goes on in the last part, unless a tool call came in between: then a new paragraph begins.
    if (last?.type === "text") parts[parts.length - 1] = { type: "text", content: last.content + event.delta }
    else if (event.delta.trim() !== "") parts.push({ type: "text", content: event.delta })
  } else if (event.type === "call") {
    parts.push({ type: "tool-call", id: event.id, name: event.name, arguments: "", state: "input-complete" })
  } else if (event.type === "result") {
    parts.push(
      event.failed
        ? { type: "tool-result", toolCallId: event.id, content: event.content, state: "error", error: event.content }
        : { type: "tool-result", toolCallId: event.id, content: event.content, state: "complete" },
    )
  }
  return { ...message, parts }
}

let count = 0
const nextId = () => `titan-${Date.now()}-${count++}`

export function openConversation({ listeners, onReading, onProblem, fetch: ask = fetch }: Options): Conversation {
  let messages: ReadonlyArray<Message> = []
  let running: AbortController | undefined

  const tell = (isLoading: boolean) => {
    for (const listener of listeners) listener.update(messages, isLoading)
  }

  const run = async (stop: AbortController) => {
    const answerId = nextId()
    let answer: Message = { id: answerId, role: "assistant", parts: [] }
    const sent = messages.map((message) => ({ role: message.role, content: textOf(message) })).filter((one) => one.content.trim() !== "")
    const response = await ask("/titan/api/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: sent, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      signal: stop.signal,
    })
    if (!response.ok || !response.body) {
      const { error } = (await response.json().catch(() => ({}))) as { error?: string }
      throw new Error(error ?? `HTTP ${response.status}`)
    }
    messages = [...messages, answer]
    const decoder = new TextDecoder()
    const reader = response.body.getReader()
    let buffer = ""
    let spoke = false
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let end: number
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end)
        buffer = buffer.slice(end + 1)
        if (line.trim() === "") continue
        const event = JSON.parse(line) as TurnEvent
        if (stop.signal.aborted) return
        if (event.type === "error") throw new Error(event.message)
        if (event.type === "text" && event.delta.trim() !== "") spoke = true
        if (event.type === "call" && !spoke) {
          spoke = true
          onReading?.()
        }
        answer = withEvent(answer, event)
        messages = [...messages.filter((one) => one.id !== answerId), answer]
        tell(event.type !== "done")
      }
    }
  }

  return {
    ask(question) {
      running?.abort()
      const stop = new AbortController()
      running = stop
      // An answer that was given up keeps what it said so far: the model knows what the person heard.
      messages = [...messages, { id: nextId(), role: "user", parts: [{ type: "text", content: question }] }]
      tell(true)
      run(stop)
        .catch((error: unknown) => {
          if (stop.signal.aborted) return
          onProblem?.(`Titan kann gerade nicht antworten: ${error instanceof Error ? error.message : String(error)}`)
        })
        .finally(() => {
          if (running !== stop) return
          running = undefined
          tell(false)
        })
    },
    stop() {
      if (!running) return
      running.abort()
      running = undefined
      tell(false)
    },
    close() {
      running?.abort()
      running = undefined
      for (const listener of listeners) listener.detach()
    },
  }
}

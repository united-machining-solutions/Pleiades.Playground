import type { UIMessage } from "@tanstack/ai-react"
import type { ReactNode } from "react"

import type { ChatTool } from "./tool-results.ts"

/** Where a tool call stands: running, done, or failed. */
export type CallState = "running" | "done" | "failed"

/**
 * A tool call of an answer. `output` is what the tool gave back, or why it failed, once its result
 * is there: the line of the call opens to show it, after the shadcn pattern Tool. `card` is what the
 * card of the tool draws for a result the chat does not draw on its own, a lookup on the way to the
 * answer: the line opens to the card then, not to the values.
 */
export type Call = { id: string; name: string; state: CallState; output?: string; card?: ReactNode }

/**
 * An answer as the chat draws it, block by block. The tool calls of one stretch are one `Trace`,
 * after the shadcn pattern Chat: a text or something drawn between them starts a new one. A result
 * the app does not draw, such as the guide of the backend, does not break a stretch.
 */
export type Block =
  | { kind: "steps"; calls: Array<Call> }
  | { kind: "text"; text: string }
  | { kind: "drawn"; node: ReactNode }

type ResultPart = Extract<UIMessage["parts"][number], { type: "tool-result" }>

/** The result of a tool as text to read: JSON indented, the error where it failed. */
export function outputOf(result: ResultPart): string {
  const text =
    typeof result.content === "string"
      ? result.content
      : result.content.map((part) => (part.type === "text" ? part.content : `[${part.type}]`)).join("\n")
  if (result.state === "error") return result.error ?? text
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

/**
 * Whether a tool is called after the part at `index`: then a result there was a step on the way.
 * Calls made side by side come before their results, so they are not after one another.
 */
export function calledAfter(parts: UIMessage["parts"], index: number): boolean {
  return parts.slice(index + 1).some((part) => part.type === "tool-call")
}

/**
 * What the answer does after one of its messages: it calls a tool, it calls none, or that is not
 * known yet.
 */
export type After = "call" | "no call" | "not known"

/**
 * What the answer to which the message at `at` belongs does after that message. It is not known yet
 * while the answer is still coming (`answering`) and nothing after the message shows whether it
 * calls a tool or speaks. An answer is more than one message: each step of the model is one, and the
 * words come in the last. It ends at the next question.
 */
export function callsAfter(messages: ReadonlyArray<UIMessage>, at: number, answering: boolean): After {
  for (const message of messages.slice(at + 1)) {
    if (message.role === "user") return "no call"
    if (message.parts.some((part) => part.type === "tool-call")) return "call"
    if (message.parts.some((part) => part.type === "text" && part.content.trim() !== "")) return "no call"
  }
  return answering ? "not known" : "no call"
}

/**
 * The blocks of an assistant's message. `live` says whether the message is still being answered:
 * a call without a result is running then, and failed once the answer is over. `tools` is what the
 * chat knows about the tools (cards.tsx): what it draws for which result. `after` says what the
 * answer does after this message (`callsAfter`): the result of a tool a model also looks things up
 * with (`lookup`) is drawn only where the answer calls no tool after it, and not while that is not
 * known yet.
 */
export function blocksOf(
  parts: UIMessage["parts"],
  live: boolean,
  tools: ReadonlyArray<ChatTool>,
  after: After = "no call",
  exclusiveId?: string,
  relatedParts: UIMessage["parts"] = parts,
): Array<Block> {
  const blocks: Array<Block> = []
  const answerResults = parts.flatMap(part => {
    if (part.type !== "tool-result" || part.state === "error" || (exclusiveId && part.toolCallId !== exclusiveId)) return []
    const call = relatedParts.find(other => other.type === "tool-call" && other.id === part.toolCallId)
    const tool = call?.type === "tool-call" ? tools.find(one => one.name === call.name && one.replacesAnswer) : undefined
    const node = tool?.draw?.(part.content, { id: part.toolCallId })
    return node === null || node === undefined ? [] : [{ part, node }]
  })
  const answer = answerResults.at(-1)
  for (const [index, part] of parts.entries()) {
    if (part.type === "tool-call") {
      const result = relatedParts.find((other) => other.type === "tool-result" && other.toolCallId === part.id)
      const state: CallState =
        result?.type === "tool-result"
          ? result.state === "error"
            ? "failed"
            : "done"
          : live && part.state !== "error"
            ? "running"
            : "failed"
      const last = blocks.at(-1)
      const call: Call = { id: part.id, name: part.name, state }
      if (result?.type === "tool-result") call.output = outputOf(result)
      if (last?.kind === "steps") last.calls.push(call)
      else blocks.push({ kind: "steps", calls: [call] })
    } else if (part.type === "tool-result") {
      if (answer || exclusiveId) {
        if (part === answer?.part) blocks.push({ kind: "drawn", node: answer.node })
        continue
      }
      // The app draws the values of a tool itself, the way the card of that tool says: a card from
      // the catalogue, or a list. The tool is the one that was called, found by the call of this
      // result. The content does not choose the card: two contracts can be alike, one can extend
      // the other, and a result is still the answer of the tool that gave it.
      const call = relatedParts.find((other) => other.type === "tool-call" && other.id === part.toolCallId)
      const tool = call?.type === "tool-call" ? tools.find((one) => one.name === call.name) : undefined
      const node = part.state === "error" ? null : tool?.draw?.(part.content, { id: part.toolCallId })
      if (node === null || node === undefined) continue
      if (tool?.lookup && (after !== "no call" || calledAfter(parts, index))) {
        const step = blocks.flatMap(block => block.kind === "steps" ? block.calls : []).find(one => one.id === part.toolCallId)
        if (step) step.card = node
        continue
      }
      blocks.push({ kind: "drawn", node })
    } else if (part.type === "text" && !answer && !exclusiveId && part.content.trim() !== "") {
      blocks.push({ kind: "text", text: part.content })
    }
  }
  return blocks
}

/**
 * Where the chat shows a running line "Thinking", so that one sees something happen, or `undefined`
 * where it shows none. The line stands while an answer is coming and nothing in it moves: before the
 * answer shows anything ("apart": on its own under the question, after the shadcn chatbot template),
 * and once its steps have ended or its last card is drawn, while the model reads that and the next
 * step or text has not come ("in-answer": under that step or card). A running step and a text that
 * grows show by themselves that something happens; the step can stand above the last block, when the
 * card of one call is drawn while another call of the same stretch still runs. `live` says whether
 * an answer is coming.
 */
export function thinkingLine(
  messages: ReadonlyArray<UIMessage>,
  live: boolean,
  tools: ReadonlyArray<ChatTool>,
): "apart" | "in-answer" | undefined {
  const last = messages.at(-1)
  if (!live || last === undefined) return undefined
  if (last.role === "user") return "apart"
  // Whether the answer calls another tool after the last message is not known yet.
  const blocks = blocksOf(last.parts, true, tools, "not known")
  const shown = blocks.at(-1)
  if (shown === undefined) return "apart"
  if (shown.kind === "text") return undefined
  const running = (block: Block) => block.kind === "steps" && block.calls.some((call) => call.state === "running")
  if (blocks.some(running)) return undefined
  return "in-answer"
}

/** The text of a person's message. */
export function questionOf(parts: UIMessage["parts"]): string {
  return parts
    .flatMap((part) => (part.type === "text" ? [part.content] : []))
    .join("\n")
}


/** The final verified card of this user turn, including separate assistant tool messages. */
export function exclusiveAnswerId(messages: ReadonlyArray<UIMessage>, position: number, tools: ReadonlyArray<ChatTool>): string | undefined {
  let start = position, end = position + 1
  while (start > 0 && messages[start - 1].role !== "user") start--
  while (end < messages.length && messages[end].role !== "user") end++
  const parts = messages.slice(start, end).flatMap(message => message.parts)
  let id: string | undefined
  for (const part of parts) {
    if (part.type !== "tool-result" || part.state === "error") continue
    const call = parts.find(other => other.type === "tool-call" && other.id === part.toolCallId)
    const tool = call?.type === "tool-call" ? tools.find(one => one.name === call.name && one.replacesAnswer) : undefined
    if (tool?.draw?.(part.content, { id: part.toolCallId }) != null) id = part.toolCallId
  }
  return id
}

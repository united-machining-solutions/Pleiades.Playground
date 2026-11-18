import type { UIMessage } from "@tanstack/ai-react"
import type { ReactNode } from "react"

import type { ChatTool } from "./tool-results.ts"

/** Where a tool call stands: running, done, or failed. */
export type CallState = "running" | "done" | "failed"

/**
 * A tool call of an answer. `output` is what the tool gave back, or why it failed, once its result
 * is there: the line of the call opens to show it, after the shadcn pattern Tool.
 */
export type Call = { id: string; name: string; state: CallState; output?: string }

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
 * The blocks of an assistant's message. `live` says whether the message is still being answered:
 * a call without a result is running then, and failed once the answer is over. `tools` is what the
 * chat knows about the tools (cards.tsx): what it draws for which result.
 */
export function blocksOf(
  parts: UIMessage["parts"],
  live: boolean,
  tools: ReadonlyArray<ChatTool>,
): Array<Block> {
  const blocks: Array<Block> = []
  for (const part of parts) {
    if (part.type === "tool-call") {
      const result = parts.find((other) => other.type === "tool-result" && other.toolCallId === part.id)
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
      // The app draws the values of a tool itself, the way the card of that tool says: a card from
      // the catalogue, or a list. The tool is the one that was called, found by the call of this
      // result. The content does not choose the card: two contracts can be alike, one can extend
      // the other, and a result is still the answer of the tool that gave it.
      const call = parts.find((other) => other.type === "tool-call" && other.id === part.toolCallId)
      const tool = call?.type === "tool-call" ? tools.find((one) => one.name === call.name) : undefined
      const node = tool?.draw?.(part.content, { id: part.toolCallId })
      if (node !== null && node !== undefined) blocks.push({ kind: "drawn", node })
    } else if (part.type === "text" && part.content.trim() !== "") {
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
  const blocks = blocksOf(last.parts, true, tools)
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

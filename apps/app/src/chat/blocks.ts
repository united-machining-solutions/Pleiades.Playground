import type { UIMessage } from "@tanstack/ai-react"
import type { ReactNode } from "react"

import type { ChatTool } from "./tool-results.ts"

/** Where a tool call stands: running, done, or failed. */
export type CallState = "running" | "done" | "failed"

/**
 * An answer as the chat draws it, block by block. The tool calls of one stretch are one `Trace`,
 * after the shadcn pattern Chat: a text or something drawn between them starts a new one. A result
 * the app does not draw, such as the guide of the backend, does not break a stretch.
 */
export type Block =
  | { kind: "steps"; calls: Array<{ id: string; name: string; state: CallState }> }
  | { kind: "text"; text: string }
  | { kind: "drawn"; node: ReactNode }

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
      const call = { id: part.id, name: part.name, state }
      if (last?.kind === "steps") last.calls.push(call)
      else blocks.push({ kind: "steps", calls: [call] })
    } else if (part.type === "tool-result") {
      // The app draws the values of a tool itself, the way the card of that tool says: a card from
      // the catalogue, or a list. The first tool whose contract the result keeps draws it.
      for (const tool of tools) {
        const node = tool.draw?.(part.content)
        if (node !== null && node !== undefined) {
          blocks.push({ kind: "drawn", node })
          break
        }
      }
    } else if (part.type === "text" && part.content.trim() !== "") {
      blocks.push({ kind: "text", text: part.content })
    }
  }
  return blocks
}

/** The text of a person's message. */
export function questionOf(parts: UIMessage["parts"]): string {
  return parts
    .flatMap((part) => (part.type === "text" ? [part.content] : []))
    .join("\n")
}

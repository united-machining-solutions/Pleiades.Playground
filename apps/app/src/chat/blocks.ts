import type { MachineList, MachineShow } from "@pleiades/cards/machine/contract.ts"
import type { UIMessage } from "@tanstack/ai-react"

import { machineListOf, machineShowOf } from "./tool-results.ts"

/** Where a tool call stands: running, done, or failed. */
export type CallState = "running" | "done" | "failed"

/**
 * An answer as the chat draws it, block by block. The tool calls of one stretch are one `Trace`,
 * after the shadcn pattern Chat: a text, a card or a list between them starts a new one. A result
 * the app does not draw, such as the guide of the backend, does not break a stretch.
 */
export type Block =
  | { kind: "steps"; calls: Array<{ id: string; name: string; state: CallState }> }
  | { kind: "text"; text: string }
  | { kind: "machine"; values: MachineShow }
  | { kind: "list"; values: MachineList }

/**
 * The blocks of an assistant's message. `live` says whether the message is still being answered:
 * a call without a result is running then, and failed once the answer is over.
 */
export function blocksOf(parts: UIMessage["parts"], live: boolean): Array<Block> {
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
      // The app draws the values of a tool itself: a card from the catalogue, or a list with the
      // same rows as Home.
      const shown = machineShowOf(part.content)
      if (shown) {
        blocks.push({ kind: "machine", values: shown })
        continue
      }
      const list = machineListOf(part.content)
      if (list) blocks.push({ kind: "list", values: list })
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

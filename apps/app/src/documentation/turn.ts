import type { UIMessage } from "@tanstack/ai-react"

/** Treat all assistant messages until the next user question as one documentation answer. */
export function documentationTurn(messages: ReadonlyArray<UIMessage>, position: number) {
  let start = position, end = position + 1
  while (start > 0 && messages[start - 1].role !== "user") start--
  while (end < messages.length && messages[end].role !== "user") end++
  const entries = messages.slice(start, end)
  return {
    last: end - 1,
    usesDocumentation: entries.some(message => message.parts.some(part => part.type === "tool-call" && part.name.startsWith("docs_"))),
  }
}

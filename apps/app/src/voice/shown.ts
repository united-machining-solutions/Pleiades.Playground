import type { UIMessage } from "@tanstack/ai-react"
import { useEffect, useSyncExternalStore } from "react"
import type { ReactNode } from "react"

import { blocksOf } from "@/chat/blocks.ts"
import { chatTools } from "@/chat/cards.tsx"

// What the cards of the newest answer draw, for the assistant page: the chat runs behind its black
// screen, and the page shows the cards of the answer there, the shop floor for example. They are the
// same nodes the chat draws, so nothing is drawn twice in two ways.

let shown: ReadonlyArray<ReactNode> = []
const listeners = new Set<() => void>()

function setShown(next: ReadonlyArray<ReactNode>) {
  if (next.length === 0 && shown.length === 0) return
  shown = next
  for (const listener of listeners) listener()
}

/** The cards of the newest answer, none while a new question waits for one. */
export function useShownCards(): ReadonlyArray<ReactNode> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => shown,
    () => shown,
  )
}

/** For the open chat: hands the cards of its newest answer to the assistant page. */
export function useShareCards(messages: ReadonlyArray<UIMessage>, isLoading: boolean) {
  useEffect(() => {
    const last = messages.at(-1)
    if (!last) return
    // A new question: the cards of the answer before are gone.
    if (last.role !== "assistant") return setShown([])
    const nodes = blocksOf(last.parts, isLoading, chatTools).flatMap((block) => (block.kind === "drawn" ? [block.node] : []))
    // While an answer arrives, a card appears as soon as it is there.
    if (nodes.length > 0 || !isLoading) setShown(nodes)
  }, [messages, isLoading])
  // A chat that closes takes its cards along.
  useEffect(() => () => setShown([]), [])
}

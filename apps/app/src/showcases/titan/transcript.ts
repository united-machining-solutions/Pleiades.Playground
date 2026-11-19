import { useSyncExternalStore } from "react"

import type { Listener, Message } from "./conversation.ts"

// The conversation with Titan as the page shows it: every question and every answer so far, and whether
// an answer is arriving. The page draws it as a transcript to scroll through (transcript-view.tsx), so
// what was asked and shown stays: a card does not go when the next question comes.

export type Transcript = { messages: ReadonlyArray<Message>; isLoading: boolean }

const empty: Transcript = { messages: [], isLoading: false }
let transcript: Transcript = empty
const listeners = new Set<() => void>()

function setTranscript(next: Transcript) {
  transcript = next
  for (const listener of listeners) listener()
}

/** The conversation so far, for the page. */
export function useTranscript(): Transcript {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => transcript,
    () => empty,
  )
}

/** Follows the conversation (conversation.ts) for the page. A conversation that ends takes its transcript along. */
export function keepingTranscript(): Listener {
  return {
    update: (messages, isLoading) => setTranscript({ messages, isLoading }),
    detach: () => setTranscript(empty),
  }
}

/** What Titan is told when a machine raises a fault begins with this: it is no question of the person. */
export const FROM_THE_HALL = "[Meldung der Anlage"

/** Whether a message is what the hall told Titan, not what a person asked. */
export function isFromTheHall(message: Message): boolean {
  return message.role === "user" && message.parts.some((part) => part.type === "text" && part.content.startsWith(FROM_THE_HALL))
}

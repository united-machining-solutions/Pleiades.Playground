import { useSyncExternalStore } from "react"
import type { ReactNode } from "react"

import { blocksOf } from "@/chat/blocks.ts"
import { chatTools } from "@/chat/cards.tsx"
import type { UIMessage } from "@tanstack/ai-react"

import type { Listener } from "../conversation.ts"

import { briefingOf } from "./facts.ts"
import type { Briefing } from "./facts.ts"

// What the newest answer shows, for the assistant page: the cards of the answer, a machine for example,
// and its text taken apart into summary, facts, hint and suggestion (facts.ts). The cards are the ones
// the chat of the app draws for the same tools (chat/cards.tsx), so nothing is drawn in two ways.
//
// What an answer showed stays until the next question: a card does not vanish while Titan still
// talks about it.

export type Shown = { cards: ReadonlyArray<ReactNode>; briefing?: Briefing; question?: string }

const nothing: Shown = { cards: [] }

/** The tool whose card the board of Titan replaces. */
const MACHINE_LIST = "genui_machine_list"
let shown: Shown = nothing
const listeners = new Set<() => void>()

function setShown(next: Shown) {
  const empty = next.cards.length === 0 && !next.briefing
  if (next === shown || (empty && shown === nothing)) return
  shown = empty ? nothing : next
  for (const listener of listeners) listener()
}

/** The cards and the briefing of the newest answer, none while a new question waits for one. */
export function useShown(): Shown {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => shown,
    () => shown,
  )
}

/** The cards of the newest answer. */
export function useShownCards(): ReadonlyArray<ReactNode> {
  return useShown().cards
}

/**
 * Follows the conversation (conversation.ts): hands the cards and the briefing of its newest answer to
 * the page. A conversation that ends takes what it showed along.
 */
export function sharingCards(): Listener {
  return {
    update(messages, isLoading) {
      const last = messages.at(-1)
      if (!last) return
      // A new question: what the answer before showed is gone.
      if (last.role !== "assistant") return setShown(nothing)
      // The list of machines is not shown again: the board of Titan shows the same, from the same values.
      const listCalls = new Set(last.parts.flatMap((part) => (part.type === "tool-call" && part.name === MACHINE_LIST ? [part.id] : [])))
      const parts = last.parts.filter((part) => !(part.type === "tool-result" && listCalls.has(part.toolCallId)))
      // The parts have the shape the chat draws (conversation.ts).
      const cards = blocksOf(parts as unknown as UIMessage["parts"], isLoading, chatTools).flatMap((block) => (block.kind === "drawn" ? [block.node] : []))
      // The text after the last tool call is the answer; a sentence before a call only says what comes.
      const texts = last.parts.flatMap((part) => (part.type === "text" && part.content.trim() !== "" ? [part.content] : []))
      const text = texts.at(-1)
      // The question the answer is for, as it was put to the chat.
      const asked = [...messages].reverse().find((message) => message.role === "user")
      const question = asked?.parts.flatMap((part) => (part.type === "text" ? [part.content] : [])).join(" ")
      // A card or the briefing appears as soon as it is there, and stays while the answer goes on.
      setShown({
        question,
        cards: cards.length > 0 ? cards : shown.cards,
        briefing: text ? briefingOf(text) : shown.briefing,
      })
    },
    detach: () => setShown(nothing),
  }
}

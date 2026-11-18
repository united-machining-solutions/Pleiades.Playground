import { useNavigate } from "@tanstack/react-router"

import { randomId } from "../random-id.ts"

// The chat is the panel on the right. Whether it is open, and with which chat, is in the URL:
// no `chat` is closed, `chat=all` is the list of the chats, `chat=new` a new chat that has no question
// yet, anything else is the thread of a chat.

export const CHAT_LIST = "all"
export const NEW_CHAT = "new"

/**
 * The search a link to another page takes along: the open chat and nothing else. What one page chose,
 * such as the hours of a machine or the page of a list, means nothing on another one.
 */
export function chatOf(search: { chat?: unknown }): { chat?: string } {
  return typeof search.chat === "string" ? { chat: search.chat } : {}
}

/** The first question of a chat waits here until the panel of that chat takes it. */
const firstQuestions = new Map<string, string>()
/** The chat that was open last, so that opening the panel returns to it. */
let lastThread: string | undefined

export function rememberThread(threadId: string) {
  lastThread = threadId
}

/** The first question that waits for the panel of this chat, without taking it. */
export function peekFirstQuestion(threadId: string): string | undefined {
  return firstQuestions.get(threadId)
}

export function takeFirstQuestion(threadId: string): string | undefined {
  const question = firstQuestions.get(threadId)
  firstQuestions.delete(threadId)
  return question
}

/** The model picked last, so that the next chat begins with it. */
let lastModel: string | undefined

export function pickModel(model: string) {
  lastModel = model
}

/** The model picked last if the settings still name it, else the first one they name. */
export function pickedModel(models: ReadonlyArray<string>): string | undefined {
  return lastModel !== undefined && models.includes(lastModel) ? lastModel : models[0]
}

/**
 * Where the focus goes in the view a press in the panel led to: its heading, or its field. "All chats"
 * and the link of a chat lead to a view to look at, "New chat" and a question asked in the panel to a
 * field to write in. On a page load nothing was pressed, and the focus stays where it was.
 */
export type Focus = "heading" | "field"

let pressed: Focus | undefined

export function markPress(focus: Focus = "heading") {
  pressed = focus
}

/** Whether a press asked for this focus, once: the view that takes it clears it, any other leaves it. */
export function takePress(focus: Focus): boolean {
  if (pressed !== focus) return false
  pressed = undefined
  return true
}

/** The further servers switched off last, so that the next chat begins without their tools. */
let lastOff: ReadonlyArray<string> = []

export function pickSwitchedOff(names: ReadonlyArray<string>) {
  lastOff = [...names]
}

/** The servers switched off last that the settings still name. */
export function pickedSwitchedOff(servers: ReadonlyArray<string>): Array<string> {
  return lastOff.filter((name) => servers.includes(name))
}

/** The servers that are off after one of them was switched. */
export function afterSwitch(off: ReadonlyArray<string>, name: string, on: boolean): Array<string> {
  const others = off.filter((other) => other !== name)
  return on ? others : [...others, name]
}

export function useChatPanel() {
  const navigate = useNavigate()
  // The page stays where it is: you chat about what you see.
  const show = (chat: string | undefined) => void navigate({ to: ".", search: chat ? { chat } : {} })
  return {
    /** Open the panel where it was left. */
    open: () => show(lastThread ?? CHAT_LIST),
    close: () => show(undefined),
    /** The list of the panel: the chats so far, and the field that begins a new one. */
    showList: () => {
      markPress()
      show(CHAT_LIST)
    },
    /** A new chat with no question yet, its field ready to write in. */
    newChat: () => {
      markPress("field")
      show(NEW_CHAT)
    },
    /** A new chat that begins with this question. */
    ask: (question: string) => {
      const threadId = randomId()
      firstQuestions.set(threadId, question)
      show(threadId)
    },
  }
}

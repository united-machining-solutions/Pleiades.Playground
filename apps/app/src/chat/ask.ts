import { useNavigate } from "@tanstack/react-router"

// The chat is the panel on the right. Whether it is open, and with which chat, is in the URL:
// no `chat` is closed, `chat=new` is the start of the panel, anything else is the thread of a chat.

export const NEW_CHAT = "new"

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

/** Whether a press in the panel changed its view: then the heading of the new view takes the focus. */
let pressed = false

export function markPress() {
  pressed = true
}

/** Whether a press in the panel changed its view, once: the next head to ask gets `false`. */
export function takePress(): boolean {
  const was = pressed
  pressed = false
  return was
}

export function useChatPanel() {
  const navigate = useNavigate()
  // The page stays where it is: you chat about what you see.
  const show = (chat: string | undefined) => void navigate({ to: ".", search: chat ? { chat } : {} })
  return {
    /** Open the panel where it was left. */
    open: () => show(lastThread ?? NEW_CHAT),
    close: () => show(undefined),
    /** The list of the panel: the chats so far, and the field that begins a new one. */
    showList: () => {
      markPress()
      show(NEW_CHAT)
    },
    /** A new chat that begins with this question. */
    ask: (question: string) => {
      const threadId = crypto.randomUUID()
      firstQuestions.set(threadId, question)
      show(threadId)
    },
  }
}

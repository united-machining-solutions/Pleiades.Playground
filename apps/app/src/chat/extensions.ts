import type { UIMessage } from "@tanstack/ai-react"
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react"

// A page may take part in the open chat while it is shown: see every change of its messages, ask in it,
// and send something along with every question, for example the name of a persona whose instructions
// the server adds (personas.server.ts). The chat in the sidebar knows no such page; a page adds itself
// with useChatExtension, and goes when it is left. A showcase uses this to talk through the chat without
// changing it (docs/adr/0018-a-showcase-is-built-in-on-request-and-only-adds.md).

/** What a page that takes part sees of the open chat. */
export type OpenChat = {
  /** Asks a question in this chat, as if it were typed. */
  send: (question: string) => void
}

/** What a page that takes part does with the chat that is open, from when it opens to when it closes. */
export type ChatTap = {
  /** Every change of the messages, and whether an answer is arriving. */
  update: (messages: ReadonlyArray<UIMessage>, isLoading: boolean) => void
  /** The chat closes, or the page is left. */
  detach: () => void
}

export type ChatExtension = {
  /** Sent along with every question while the page is shown. */
  forwardedProps?: Record<string, unknown>
  /** Called once for every chat that is open while the page is shown. */
  attach?: (chat: OpenChat) => ChatTap
}

let extensions: ReadonlyArray<ChatExtension> = []
const listeners = new Set<() => void>()

function setExtensions(next: ReadonlyArray<ChatExtension>) {
  extensions = next
  for (const listener of listeners) listener()
}

/** For a page: takes part in the open chat while the page is shown. Pass the same object on every render. */
export function useChatExtension(extension: ChatExtension) {
  useEffect(() => {
    setExtensions([...extensions, extension])
    return () => setExtensions(extensions.filter((one) => one !== extension))
  }, [extension])
}

/** The pages that take part now. */
function useActive(): ReadonlyArray<ChatExtension> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => extensions,
    () => extensions,
  )
}

/** For the chat in the sidebar: what goes along with every question, the time zone and what the pages add. */
export function useForwardedProps(timeZone: string): Record<string, unknown> {
  const active = useActive()
  return useMemo(() => Object.assign({ timeZone }, ...active.map((extension) => extension.forwardedProps ?? {})), [active, timeZone])
}

/** For the chat in the sidebar: hands its messages to the pages that take part, and lets them ask in it. */
export function useChatTaps(messages: ReadonlyArray<UIMessage>, isLoading: boolean, send: (question: string) => void) {
  const active = useActive()
  const latest = useRef({ messages, isLoading, send })
  latest.current = { messages, isLoading, send }
  const taps = useRef<Array<ChatTap>>([])
  // A page that comes or goes is attached to this chat or detached from it; it sees the messages at once.
  useEffect(() => {
    const chat: OpenChat = { send: (question) => latest.current.send(question) }
    taps.current = active.flatMap((extension) => (extension.attach ? [extension.attach(chat)] : []))
    for (const tap of taps.current) tap.update(latest.current.messages, latest.current.isLoading)
    return () => {
      for (const tap of taps.current) tap.detach()
      taps.current = []
    }
  }, [active])
  useEffect(() => {
    for (const tap of taps.current) tap.update(messages, isLoading)
  }, [messages, isLoading])
}

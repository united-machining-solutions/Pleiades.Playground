import { createServerFn } from "@tanstack/react-start"

export type ChatStatus = { configured: boolean; model: string | null }

/** Whether a language model is configured. The key itself never leaves the server. */
export const getChatStatus = createServerFn({ method: "GET" }).handler((): ChatStatus => {
  const { LLM_BASE_URL, LLM_MODEL } = process.env
  return { configured: Boolean(LLM_BASE_URL && LLM_MODEL), model: LLM_MODEL || null }
})

export type ChatEntry = { threadId: string; title: string; titled: boolean }

/** The chats the harness knows, newest first. Without a language model there are none. */
export async function fetchChats(): Promise<Array<ChatEntry>> {
  const response = await fetch("/api/harness/sessions")
  if (!response.ok) return []
  const page = (await response.json()) as { entries?: Array<{ threadId: string; title?: string }> }
  return (page.entries ?? []).map((entry) => ({
    threadId: entry.threadId,
    title: entry.title || "New chat",
    titled: Boolean(entry.title),
  }))
}

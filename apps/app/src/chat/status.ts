import { createServerFn } from "@tanstack/react-start"

import { modelNames, modelSettings } from "./models.ts"

export type ChatStatus = {
  configured: boolean
  /** The models a chat can pick, by name. The first one answers until a chat picks another. */
  models: Array<string>
}

/** Which language models are configured. Their keys never leave the server. */
export const getChatStatus = createServerFn({ method: "GET" }).handler((): ChatStatus => {
  const models = modelNames(modelSettings(process.env))
  return { configured: models.length > 0, models }
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

/** The model a chat has picked, or undefined while the first one answers. */
export async function fetchChatModel(threadId: string): Promise<string | undefined> {
  const response = await fetch(`/api/harness/describe?threadId=${encodeURIComponent(threadId)}`)
  if (!response.ok) return undefined
  const description = (await response.json()) as { settings?: { model?: string } }
  return description.settings?.model
}

/** From its next turn on, the chat answers with this model. The harness keeps the choice with the chat. */
export async function chooseChatModel(threadId: string, model: string): Promise<void> {
  const response = await fetch("/api/harness/control", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      threadId,
      input: { op: "configure", settings: { model }, inputId: crypto.randomUUID() },
    }),
  })
  // The harness answers a request it refuses with 200 too, and says so in the receipt.
  const receipt = response.ok ? ((await response.json()) as { status?: string; reason?: string }) : undefined
  if (receipt?.status === "rejected" || !response.ok) {
    throw new Error(`The chat could not switch to ${model} (${receipt?.reason ?? response.status}).`)
  }
}

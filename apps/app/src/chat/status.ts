import { createServerFn } from "@tanstack/react-start"

import { adapterIsUp } from "@/opcua/adapter.ts"

import { randomId } from "../random-id.ts"
import { UNNAMED_CHAT } from "./chat-name.ts"
import { chatSettings } from "./gateway.ts"
import { furtherServers, switchKey, switchedOffOf } from "./mcp-servers.ts"
import { modelNames } from "./models.ts"
import { serverList } from "./server-list.ts"
import type { ListedServer } from "./server-list.ts"

export type ChatStatus = {
  configured: boolean
  /** Whether the OPC UA adapter answers: the chat offers its commands only then. */
  opcua: boolean
  /** The models a chat can pick, by name. The first one answers until a chat picks another. */
  models: Array<string>
  /** What the settings lack, or why the gateway gave no models, by the names of the settings. */
  gaps: Array<string>
  /** Whether a model writes down what is said into the chat field. */
  dictation: boolean
  /** The further servers a chat can switch off and on, by name. */
  servers: Array<string>
}

/** Which language models are configured: the same snapshot the harness is built from. Keys never leave the server. */
export const getChatStatus = createServerFn({ method: "GET" }).handler(async (): Promise<ChatStatus> => {
  const [chat, opcua] = await Promise.all([chatSettings(), adapterIsUp()])
  const models = modelNames(chat.settings)
  return {
    configured: models.length > 0,
    opcua,
    models,
    gaps: chat.gaps,
    dictation: chat.dictation !== undefined,
    servers: Object.keys(furtherServers()),
  }
})

/**
 * The servers whose tools the chat has, whether each one answers, and its tools by name. Asked when the
 * panel "Tools" opens, not with every page. Addresses never leave the server.
 */
export const getChatServers = createServerFn({ method: "GET" }).handler((): Promise<Array<ListedServer>> => serverList())

/**
 * From its next turn on, the chat has the tools of this server, or has them no longer. The harness keeps
 * the choice with the chat, and the server of the app holds the chat to it.
 */
export async function switchChatServer(threadId: string, name: string, on: boolean): Promise<void> {
  const response = await fetch("/api/harness/control", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      threadId,
      input: { op: "config", key: switchKey(name), value: on, inputId: randomId() },
    }),
  })
  // The harness answers a request it refuses with 200 too, and says so in the receipt.
  const receipt = response.ok ? ((await response.json()) as { status?: string; reason?: string }) : undefined
  if (receipt?.status === "rejected" || !response.ok) {
    throw new Error(`The chat could not switch ${name} ${on ? "on" : "off"} (${receipt?.reason ?? response.status}).`)
  }
}

export type ChatEntry = { threadId: string; title: string; titled: boolean }

/** The chats the harness knows, newest first. Without a language model there are none. */
export async function fetchChats(): Promise<Array<ChatEntry>> {
  const response = await fetch("/api/harness/sessions")
  if (!response.ok) return []
  const page = (await response.json()) as { entries?: Array<{ threadId: string; title?: string }> }
  return (page.entries ?? []).map((entry) => ({
    threadId: entry.threadId,
    title: entry.title || UNNAMED_CHAT,
    titled: Boolean(entry.title),
  }))
}

/**
 * What a chat has picked: its model, undefined while the first one answers, and the servers it switched
 * off. Rejects when the harness does not say: a panel must not show switches it did not read.
 */
export async function fetchChatSettings(threadId: string): Promise<{ model: string | undefined; off: Array<string> }> {
  const response = await fetch(`/api/harness/describe?threadId=${encodeURIComponent(threadId)}`)
  if (!response.ok) throw new Error(`the harness answered ${response.status}`)
  const description = (await response.json()) as { settings?: { model?: string } }
  return { model: description.settings?.model, off: switchedOffOf(description) }
}

/** From its next turn on, the chat answers with this model. The harness keeps the choice with the chat. */
export async function chooseChatModel(threadId: string, model: string): Promise<void> {
  const response = await fetch("/api/harness/control", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      threadId,
      input: { op: "configure", settings: { model }, inputId: randomId() },
    }),
  })
  // The harness answers a request it refuses with 200 too, and says so in the receipt.
  const receipt = response.ok ? ((await response.json()) as { status?: string; reason?: string }) : undefined
  if (receipt?.status === "rejected" || !response.ok) {
    throw new Error(`The chat could not switch to ${model} (${receipt?.reason ?? response.status}).`)
  }
}

import { createServerFn } from "@tanstack/react-start"

// The steps of a person: adding a machine a scan proposed, removing one, and storing the user of a
// server that wants one. They go to the management API of the OPC UA adapter from the server of the
// app, never from the browser and never from the language model: no tool of the chat can do any of
// them, and a password never enters the chat.

/** Where the management API of the adapter answers, or undefined if the app has no adapter. */
export function adapterUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const url = env.OPCUA_ADAPTER_URL?.trim()
  return url ? url.replace(/\/+$/, "") : undefined
}

/** What became of a click: done, or why not in a sentence. */
export type Outcome = { ok: true } | { ok: false; reason: string }

async function send(path: string, method: "POST" | "PUT" | "DELETE", payload?: unknown): Promise<Outcome> {
  const base = adapterUrl()
  if (!base) return { ok: false, reason: "The app has no OPC UA adapter (OPCUA_ADAPTER_URL is empty)." }
  try {
    const response = await fetch(`${base}${path}`, {
      method,
      signal: AbortSignal.timeout(90_000),
      ...(payload !== undefined && { headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }),
    })
    if (response.ok) return { ok: true }
    // The adapter says why, one reason a line.
    const body = (await response.json().catch(() => ({}))) as { problems?: Array<string> }
    return { ok: false, reason: body.problems?.join(" ") || `The adapter answered ${response.status}.` }
  } catch (error) {
    return { ok: false, reason: `The OPC UA adapter did not answer: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/** Adds the machine of a proposal. The adapter tries the registration against its server once more. */
export const commitProposal = createServerFn({ method: "POST" })
  .validator((draftId: string) => {
    if (!/^[0-9a-f]{8,64}$/.test(draftId)) throw new Error("A proposal is named by its draft id.")
    return draftId
  })
  .handler(({ data: draftId }) => send(`/drafts/${draftId}/commit`, "POST"))

/** Removes a machine: the adapter closes its session, takes its retained messages back and deletes its registration. */
export const removeMachine = createServerFn({ method: "POST" })
  .validator((serialNumber: string) => {
    if (!/^[^/+#\s]+$/.test(serialNumber)) throw new Error("A serial number is one word without /, + or #.")
    return serialNumber
  })
  .handler(({ data: serialNumber }) => send(`/machines/${encodeURIComponent(serialNumber)}`, "DELETE"))

/** A user name and a password for an OPC UA server, as a person typed them into the card. */
export type UserOfServer = { url: string; user: string; password: string }

/** Checks what the card sends: an opc.tcp address, a user name, and a password that is not empty. */
export function userOfServer(value: unknown): UserOfServer {
  const given = (value ?? {}) as Partial<Record<keyof UserOfServer, unknown>>
  const url = typeof given.url === "string" ? given.url.trim() : ""
  const user = typeof given.user === "string" ? given.user.trim() : ""
  const password = typeof given.password === "string" ? given.password : ""
  if (!/^opc\.tcp:\/\/[^\s/]+/i.test(url)) throw new Error("The server is named by its opc.tcp:// address.")
  if (!user || !password) throw new Error("A user name and a password are both needed.")
  return { url, user, password }
}

/**
 * Stores the user of a server. The adapter tries it on the server first and keeps it only if the
 * server accepts it; the password is not sent back, and the language model never sees it.
 */
export const storeUser = createServerFn({ method: "POST" })
  .validator(userOfServer)
  .handler(({ data }) => send("/users", "PUT", data))

/**
 * Whether the adapter answers. The chat offers the OPC UA commands only then. Asked at most every
 * half minute, and never for longer than a second, because the root of the app waits for it.
 */
let known: { at: number; up: boolean } | undefined
export async function adapterIsUp(): Promise<boolean> {
  const base = adapterUrl()
  if (!base) return false
  if (known && Date.now() - known.at < 30_000) return known.up
  const up = await fetch(`${base}/healthcheck`, { signal: AbortSignal.timeout(1_000) }).then(
    (response) => response.ok,
    () => false,
  )
  known = { at: Date.now(), up }
  return up
}

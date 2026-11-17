// Deleting the stored data of a machine: its values in the Timeseries API and its notifications in
// the Events API. A step of a person, with a button behind a confirmation. It goes to the APIs from
// the server of the app, never from the browser, and no tool of the chat can do it: the generative UI
// backend only reads.

/** Where the two APIs answer. Unset, those of the stack on this computer. */
export function apiUrls(env: NodeJS.ProcessEnv = process.env): { timeseries: string; events: string } {
  const base = (value: string | undefined, fallback: string) => (value?.trim() || fallback).replace(/\/+$/, "")
  return {
    timeseries: base(env.TIMESERIES_API_URL, "http://localhost:5500"),
    events: base(env.EVENTS_API_URL, "http://localhost:5510"),
  }
}

/** Why a serial number cannot name a machine, or undefined. It is one level of a topic. */
export function invalidSerialNumber(serialNumber: string): string | undefined {
  return serialNumber.trim() === "" || /[/+#]/.test(serialNumber)
    ? "A serial number is one level of a topic: not empty, without /, + or #."
    : undefined
}

/** What became of the click: how much was deleted, or why not in a sentence. */
export type Deleted = { ok: true; values: number; events: number } | { ok: false; reason: string }

/** `fetch` wraps what the network said, for example ECONNREFUSED, in an error of its own: the innermost cause is the reason. */
function reasonOf(error: unknown): string {
  let innermost = error
  while (innermost instanceof Error && innermost.cause !== undefined) innermost = innermost.cause
  const { code, message } = (innermost ?? {}) as { code?: unknown; message?: unknown }
  return String(code ?? message ?? innermost)
}

async function remove(api: string, url: string, count: string): Promise<number> {
  let response: Response
  try {
    response = await fetch(url, { method: "DELETE", signal: AbortSignal.timeout(120_000) })
  } catch (error) {
    throw new Error(`The ${api} did not answer: ${reasonOf(error)}.`)
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(`The ${api} answered ${response.status}${text ? `: ${text}` : "."}`)
  }
  const body = (await response.json()) as Record<string, unknown>
  return typeof body[count] === "number" ? body[count] : 0
}

/** Deletes every stored value and notification of a machine. The values go first: they make the machine. */
export async function deleteMachineData(serialNumber: string, env: NodeJS.ProcessEnv = process.env): Promise<Deleted> {
  const urls = apiUrls(env)
  const path = encodeURIComponent(serialNumber)
  let values: number
  try {
    values = await remove("Timeseries API", `${urls.timeseries}/machines/${path}`, "valuesCount")
  } catch (error) {
    return { ok: false, reason: (error as Error).message }
  }
  try {
    const events = await remove("Events API", `${urls.events}/notificationEvents/machines/${path}`, "eventsCount")
    return { ok: true, values, events }
  } catch (error) {
    return { ok: false, reason: `The values are deleted, the notifications are not. ${(error as Error).message}` }
  }
}

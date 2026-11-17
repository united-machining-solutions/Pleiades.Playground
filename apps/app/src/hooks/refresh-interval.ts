/**
 * How often a live page reads its values again: Home and the page of a machine (use-live.ts). A person
 * chooses it in the header (components/auto-update.tsx); the choice holds for every live page and is
 * remembered for the next visit.
 */

/** The intervals a person can choose, in milliseconds. */
export const refreshChoices = [1_000, 5_000, 10_000, 30_000] as const

export type RefreshInterval = (typeof refreshChoices)[number]

/** The interval of a first visit. */
export const defaultRefreshInterval: RefreshInterval = 1_000

/** What a person reads for an interval: "1s", "30s". */
export function refreshLabel(interval: RefreshInterval): string {
  return `${interval / 1_000}s`
}

/** An interval from what was stored or chosen. Anything that is not one of the choices is the default. */
export function parseRefreshInterval(value: unknown): RefreshInterval {
  const number = typeof value === "string" ? Number(value) : value
  return refreshChoices.find((choice) => choice === number) ?? defaultRefreshInterval
}

const storageKey = "pleiades.refreshInterval"
const listeners = new Set<() => void>()

function remembered(): RefreshInterval {
  try {
    return parseRefreshInterval(localStorage.getItem(storageKey))
  } catch {
    // A browser that keeps nothing, or no browser at all.
    return defaultRefreshInterval
  }
}

let current: RefreshInterval | undefined

/** The interval that holds now. */
export function currentRefreshInterval(): RefreshInterval {
  current ??= remembered()
  return current
}

/** Chooses an interval for every live page and remembers it for the next visit. */
export function setRefreshInterval(interval: RefreshInterval): void {
  current = interval
  try {
    localStorage.setItem(storageKey, String(interval))
  } catch {
    // A browser that keeps nothing: the choice holds until the page is loaded again.
  }
  for (const listener of listeners) listener()
}

/** Calls the listener whenever the interval changes; returns what stops it. */
export function subscribeRefreshInterval(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

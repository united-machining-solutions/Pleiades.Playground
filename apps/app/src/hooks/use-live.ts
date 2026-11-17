import { clock } from "@pleiades/cards/machine/format.ts"
import { useRouter } from "@tanstack/react-router"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"

import { brokerStatus, onBrokerStatus, serverNow, subscribe } from "@/live/broker.ts"

/** How a page is kept live: which topics it hears, and what a message and the clock do to its values. */
export type Live<TValues> = {
  /** The topic filters of the values the page shows. */
  filters: ReadonlyArray<string>
  /**
   * What a message of the broker does to the values. `now` is the clock of the server, in
   * milliseconds since 1970: a value stamped far ahead of it is left out.
   */
  message: (values: TValues, topic: string, payload: string, now: number) => TValues
  /** What the passing of time does to them, by the clock of the server: a machine falls silent, a history goes on. */
  at: (values: TValues, now: string) => TValues
}

/** How often the clock of a page moves on. */
const TICK_MS = 1_000

/**
 * Keeps a page live. Its loader reads what held when the page was opened, from the backend; from
 * then on every value comes from the broker the moment it is published, and nothing is read again.
 * Only after the connection to the broker was lost is the page read once more, for what it missed.
 * While the browser does not hear the broker the values stand as they were, and their clock stops.
 */
export function useLive<TValues>(loaded: TValues, live: Live<TValues>): { values: TValues; connected: boolean } {
  const router = useRouter()
  const [values, setValues] = useState(loaded)
  // When the loader has read again, what it read replaces what the page had.
  const [from, setFrom] = useState(loaded)
  if (from !== loaded) {
    setFrom(loaded)
    setValues(loaded)
  }

  const current = useRef(live)
  useEffect(() => {
    current.current = live
  })

  const filters = live.filters.join("\n")
  useEffect(
    () =>
      subscribe(filters.split("\n"), (topic, payload) => {
        const now = Date.parse(serverNow())
        setValues((before) => current.current.message(before, topic, payload, now))
      }),
    [filters],
  )

  const status = useSyncExternalStore(onBrokerStatus, brokerStatus, brokerStatus)
  useEffect(() => {
    // The clock runs only while the page hears the broker: by then the clock of the server is known.
    if (!status.connected) return
    const tick = () => setValues((before) => current.current.at(before, serverNow()))
    tick()
    const timer = setInterval(tick, TICK_MS)
    return () => clearInterval(timer)
  }, [status.connected])

  // The first connection follows the read of the loader. Every later one follows a time in which
  // values were missed: the page reads what it missed, once.
  const connections = useRef(status.connections)
  useEffect(() => {
    if (status.connections > connections.current && connections.current > 0) void router.invalidate()
    connections.current = status.connections
  }, [status.connections, router])

  return { values, connected: status.connected }
}

/** What the line under the title of a page says about its values: live, or as of when, while the broker is not heard. */
export function liveness(connected: boolean, asOf: string): string {
  return connected ? `live · now ${clock(asOf)}` : `not live, no connection to the broker · as of ${clock(asOf)}`
}

/** How long a page that got no answer waits before it asks the backend again. */
const RETRY_MS = 10_000

/**
 * A page that got no answer from the backend keeps asking, until it has one. This is the only time
 * a page reads again on a clock: what it has, the broker keeps up to date.
 */
export function useRetry(failed: boolean) {
  const router = useRouter()
  useEffect(() => {
    if (!failed) return
    const timer = setInterval(() => void router.invalidate(), RETRY_MS)
    return () => clearInterval(timer)
  }, [failed, router])
}

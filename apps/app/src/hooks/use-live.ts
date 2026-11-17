import { useRouter } from "@tanstack/react-router"
import { useEffect, useSyncExternalStore } from "react"

import {
  currentRefreshInterval,
  defaultRefreshInterval,
  subscribeRefreshInterval,
} from "@/hooks/refresh-interval.ts"
import type { RefreshInterval } from "@/hooks/refresh-interval.ts"

/** The interval a person chose in the header, for a component that shows or uses it. */
export function useRefreshInterval(): RefreshInterval {
  return useSyncExternalStore(subscribeRefreshInterval, currentRefreshInterval, () => defaultRefreshInterval)
}

/** Keeps a page live: its values are read again as often as the auto update in the header says. */
export function useLive() {
  const router = useRouter()
  const interval = useRefreshInterval()
  useEffect(() => {
    const timer = setInterval(() => void router.invalidate(), interval)
    return () => clearInterval(timer)
  }, [router, interval])
}

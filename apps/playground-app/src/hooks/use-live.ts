import { useRouter } from "@tanstack/react-router"
import { useEffect } from "react"

const REFRESH_EVERY_MS = 10_000

/** Keeps a page live: its values are read again every ten seconds. */
export function useLive() {
  const router = useRouter()
  useEffect(() => {
    const timer = setInterval(() => void router.invalidate(), REFRESH_EVERY_MS)
    return () => clearInterval(timer)
  }, [router])
}

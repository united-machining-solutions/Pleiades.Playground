import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"

/**
 * Eases to the height of what it holds when that changes, instead of jumping: a card that grows or
 * shrinks does so in a fifth of a second, and a host that sizes its frame to the card follows
 * without a scrollbar. Without motion it jumps.
 */
export function SmoothHeight({ children }: { children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number>()
  useEffect(() => {
    const held = inner.current
    if (!held) return
    const observer = new ResizeObserver(() => setHeight(held.offsetHeight))
    observer.observe(held)
    return () => observer.disconnect()
  }, [])
  return (
    <div className="overflow-hidden transition-[height] duration-200 ease-out motion-reduce:transition-none" style={{ height }}>
      <div ref={inner}>{children}</div>
    </div>
  )
}

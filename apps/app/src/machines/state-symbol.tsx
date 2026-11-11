import type { ReactNode } from "react"

import type { State } from "./state.ts"

/**
 * The sign of a state. A state is never told by colour alone: every sign has its own shape, and
 * the word stands next to it. Without a word next to it, pass `label` for screen readers.
 */
export function StateSymbol({ state, label }: { state: State | "warning"; label?: string }) {
  return (
    <svg
      viewBox="0 0 14 14"
      className="size-3.5 shrink-0"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {shapes[state]}
    </svg>
  )
}

const shapes: Record<State | "warning", ReactNode> = {
  running: <circle cx="7" cy="7" r="6" className="fill-state-running" />,
  alarm: (
    <>
      <circle cx="7" cy="7" r="7" className="fill-state-alarm" />
      <path d="M7 3.5v4" className="stroke-white" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="7" cy="10.2" r="1" className="fill-white" />
    </>
  ),
  stopped: (
    <>
      <rect x="0.5" y="0.5" width="13" height="13" rx="3" className="fill-state-stopped stroke-state-stopped-edge" />
      <rect x="4.4" y="4" width="1.8" height="6" className="fill-state-ink" />
      <rect x="7.8" y="4" width="1.8" height="6" className="fill-state-ink" />
    </>
  ),
  warning: (
    <>
      <path d="M7 0.8 13.4 12.6H0.6Z" className="fill-state-warning stroke-state-warning-edge" strokeLinejoin="round" />
      <path d="M7 5v3.6" className="stroke-state-ink" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="7" cy="10.6" r="0.9" className="fill-state-ink" />
    </>
  ),
  setup: <path d="M7 0.8 13.2 7 7 13.2 0.8 7Z" className="fill-state-setup stroke-state-setup-edge" />,
  "no-data": (
    <circle
      cx="7"
      cy="7"
      r="5.6"
      className="fill-none stroke-state-no-data-edge"
      strokeWidth="1.6"
      strokeDasharray="2.4 2"
    />
  ),
}

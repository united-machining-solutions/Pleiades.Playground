import { Button } from "@pleiades/ui/components/button"
import { PauseIcon, PlayIcon } from "lucide-react"

import { hintFor } from "./orb-hint.ts"
import type { HintFor } from "./orb-hint.ts"
import { Cloud } from "./voice/cloud.tsx"

// Titan's cloud as the thing to touch: on a screen without a keyboard it is how Titan is started, asked
// and paused. Press and hold it and speak, let go and Titan answers, as with the space bar. Under it
// stands, large enough to read from a step away, what a press does now. A button beside it pauses Titan
// and lets it go on.

export type OrbProps = HintFor & {
  /** A machine has an open error: the cloud is red. */
  alarm: boolean
  /** The cloud large, before the conversation, or small, beside it. */
  size: "large" | "small"
  /** The cloud is pressed: the finger or the mouse button is down. */
  onPress: () => void
  /** It is let go, or the press was lost. */
  onRelease: () => void
  /** The button beside the cloud: pauses Titan, or lets it go on. */
  onPauseOrGoOn: () => void
}

export function Orb(props: OrbProps) {
  const { state, alarm, started, paused, size, onPress, onRelease, onPauseOrGoOn } = props
  const hint = hintFor(props)
  const large = size === "large"
  return (
    <div className={`flex flex-col items-center text-center ${large ? "gap-6" : "gap-3"}`}>
      {/* The cloud is a button. A press is taken at once and held, also when the finger slides off it;
          the browser's own long press, a menu or a selection, stays away. */}
      <Button
        type="button"
        variant="ghost"
        data-orb
        aria-label={paused ? (hint.also ?? hint.now) : hint.now}
        className="h-auto touch-none rounded-full p-0 select-none hover:bg-transparent active:bg-transparent dark:hover:bg-transparent"
        onPointerDown={(event) => {
          if (event.button !== 0) return
          try {
            event.currentTarget.setPointerCapture(event.pointerId)
          } catch {
            // A press that is no pointer of the browser, from a test for example, is still a press.
          }
          // The release is also heard at the window: the cloud moves to the side when the conversation
          // begins, and a finger that was down on it then lets go of a button that is no longer there.
          const up = () => {
            window.removeEventListener("pointerup", up)
            window.removeEventListener("pointercancel", up)
            onRelease()
          }
          window.addEventListener("pointerup", up)
          window.addEventListener("pointercancel", up)
          onPress()
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <Cloud state={state} alarm={alarm} className={`${large ? "size-[min(18rem,36svh)]" : "size-44"} ${paused ? "opacity-30" : ""}`} />
      </Button>
      <p className={`flex flex-col gap-1 text-balance ${large ? "text-xl" : "text-base"}`} aria-hidden>
        <span>{hint.now}</span>
        {hint.also && <span className={`text-muted-foreground ${large ? "text-base" : "text-sm"}`}>{hint.also}</span>}
      </p>
      {started && (
        <Button type="button" variant="outline" size={large ? "lg" : "default"} onClick={onPauseOrGoOn}>
          {paused ? <PlayIcon data-icon="inline-start" /> : <PauseIcon data-icon="inline-start" />}
          {paused ? "Weiter" : "Pause"}
        </Button>
      )}
    </div>
  )
}

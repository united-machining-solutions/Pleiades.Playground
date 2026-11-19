// The microphone of the chat field takes a tap and a hold. A tap starts the recording, and the next tap
// ends it, as with a mouse at a desk. Held, it records while the finger or the mouse button is down, and
// letting go ends it, as on a tablet at a fair, where a finger rests on the microphone while one speaks.

/** A press at least this long is a hold, a shorter one a tap. A tap lasts about a tenth of a second. */
export const HOLD_MS = 400

/** A press of the microphone, from the moment it goes down. */
export type Press = {
  /** When it went down, in milliseconds (`performance.now()`). */
  at: number
  /** It found a recording running: letting go ends that recording, after a tap or a hold. */
  ending: boolean
  /**
   * The recording it started runs. Not yet while the browser asks the person for the microphone, and
   * never when the browser does not give it.
   */
  running: boolean
}

/** What letting go of the microphone does: end the recording and write it down, or let it go on. */
export function onLetGo(press: Press, now: number): "end" | "go-on" {
  if (press.ending) return "end"
  // The browser asked for the microphone while the finger was down, and the finger left the microphone
  // to answer: that was no hold. The recording goes on until the next tap.
  if (!press.running) return "go-on"
  return now - press.at >= HOLD_MS ? "end" : "go-on"
}

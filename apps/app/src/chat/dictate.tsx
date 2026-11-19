import { fetchServerSentEvents, useTranscription } from "@tanstack/ai-react"
import { cn } from "cn"
import { MicIcon, SquareIcon } from "lucide-react"
import { useEffect, useEffectEvent, useRef, useState } from "react"
import type { MouseEvent, PointerEvent } from "react"

import { InputGroupButton, InputGroupText } from "@pleiades/ui/components/input-group"
import { Spinner } from "@pleiades/ui/components/spinner"
import { toast } from "@pleiades/ui/components/toast"

import { elapsed, loudness } from "./dictation-level.ts"
import { HOLD_MS, onLetGo } from "./dictation-press.ts"
import type { Press } from "./dictation-press.ts"
import { canRecord, record } from "./recorder.ts"
import type { Recorder } from "./recorder.ts"

// Dictation in the chat field. Tap the microphone, speak, tap it again; or hold it while you speak and
// let go (dictation-press.ts): what was said goes into the field, to read, change and send like a typed
// question. Nothing is sent by itself. After two minutes the recording stops by itself.
//
// While it records, the second line of the field says so, where a finger on the microphone does not
// cover it: bars that move with the voice, the time, and what ends it. The browser records
// (recorder.ts); the model of the settings writes down what was said, on the server
// (routes/api/transcribe.ts). It hears the language itself.
//
// shadcn has no component for it and names the parts: a Button, a Spinner while the words are written
// down, and the text of the input group. The bars are our own: shadcn has nothing that shows a level
// as it moves.

function fail(problem: unknown) {
  toast.add({
    type: "error",
    title: "Dictation did not work",
    description: problem instanceof Error ? problem.message : String(problem),
  })
}

/** Lets a sound context run where the browser allows it; where not yet, a later call does. */
function wake(sound: AudioContext) {
  if (sound.state === "suspended") sound.resume().catch(() => undefined)
}

function nothingHeard() {
  toast.add({ title: "Nothing was heard", description: "Speak after you press the microphone." })
}

/** Two minutes: enough for a question, and a few megabytes, far below what the route reads. */
const MAX_SECONDS = 120

/** What dictation does now: nothing, record, or have the model write down what was recorded. */
export type DictationPhase = "idle" | "listening" | "writing"

/** The state of dictation in a chat field, and the presses of its microphone. */
export type Dictation = {
  phase: DictationPhase
  /** A finger or a mouse button holds the microphone longer than a tap: letting go ends the recording. */
  holding: boolean
  /** When the recording began (`performance.now()`), while it runs. */
  since: number | undefined
  /** Where the level of the microphone is read, while it records. */
  level: AnalyserNode | undefined
  press: {
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void
    onPointerUp: () => void
    onPointerCancel: () => void
    onClick: (event: MouseEvent<HTMLButtonElement>) => void
  }
}

/** A recording that runs: the recorder, and the sound context its level is read in. */
type Running = { recorder: Recorder; sound: AudioContext }

/** Dictation for one chat field: `onText` gets what was said. */
export function useDictation(onText: (text: string) => void): Dictation {
  const transcription = useTranscription({
    connection: fetchServerSentEvents("/api/transcribe"),
    // One slot for every dictation; nothing of it is kept.
    threadId: "dictation",
    onResult: (result) => {
      const text = result.text.trim()
      if (text === "") nothingHeard()
      else onText(text)
    },
    onError: fail,
  })
  const [phase, setPhase] = useState<DictationPhase>("idle")
  const [holding, setHolding] = useState(false)
  const [recording, setRecording] = useState<{ since: number; level: AnalyserNode }>()
  /** The recording that runs, if one does. */
  const running = useRef<Running | null>(null)
  /** The microphone is being opened: the browser may still ask the person. */
  const opening = useRef(false)
  /** The field is gone, with another chat: a microphone that opens now is closed at once. */
  const gone = useRef(false)
  /** The press that is down on the microphone, if one is. */
  const press = useRef<Press | null>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const start = async (): Promise<boolean> => {
    if (running.current || opening.current) return false
    opening.current = true
    // The sound context is made here, in the press: a mouse button that goes down lets it run.
    const sound = new AudioContext()
    wake(sound)
    try {
      if (!canRecord()) {
        // The browser lets a page use the microphone only over https, or on this computer.
        throw new Error("This browser lets the app use the microphone only over https or on localhost.")
      }
      const recorder = await record()
      if (gone.current) {
        // The field went while the browser opened the microphone: nothing else would close it.
        recorder.cancel()
        void sound.close()
        return false
      }
      // A finger that goes down is no user activation, only one that lets go, so the context may still be
      // suspended; a page that records may start it. Else the bars stay flat while the recording works.
      wake(sound)
      const level = sound.createAnalyser()
      level.fftSize = 1024
      sound.createMediaStreamSource(recorder.stream).connect(level)
      running.current = { recorder, sound }
      setRecording({ since: performance.now(), level })
      setPhase("listening")
      return true
    } catch (problem) {
      void sound.close()
      fail(problem)
      return false
    } finally {
      opening.current = false
    }
  }

  const end = async () => {
    const now = running.current
    if (!now) return
    running.current = null
    setRecording(undefined)
    setHolding(false)
    setPhase("writing")
    try {
      const recorded = await now.recorder.stop()
      if (recorded.base64 === "") {
        nothingHeard()
        return
      }
      // The type without its codecs, so that the model gets the format the browser recorded in.
      const type = recorded.mimeType.split(";")[0]
      await transcription.generate({ audio: `data:${type};base64,${recorded.base64}` })
    } catch (problem) {
      fail(problem)
    } finally {
      void now.sound.close()
      setPhase("idle")
    }
  }

  // After two minutes the recording stops by itself and is written down, as if it was let go.
  const stopAtLimit = useEffectEvent(() => {
    toast.add({ title: "Dictation stopped after two minutes", description: "Press the microphone again to go on." })
    void end()
  })
  useEffect(() => {
    if (phase !== "listening") return
    const timer = setTimeout(() => stopAtLimit(), MAX_SECONDS * 1000)
    return () => clearTimeout(timer)
  }, [phase])

  // A field that goes, with another chat, lets go of the microphone; nothing it recorded is kept. One that
  // is being opened is closed when it comes (start). React may mount a field twice: it is there again.
  useEffect(() => {
    gone.current = false
    return () => {
      gone.current = true
      clearTimeout(holdTimer.current)
      const now = running.current
      running.current = null
      now?.recorder.cancel()
      void now?.sound.close()
    }
  }, [])

  // A finger or a mouse button: the recording starts as it goes down, so that the first word is heard,
  // and letting go decides whether it was a tap or a hold.
  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || phase === "writing") return
    try {
      // The release comes here also when the finger slides off the microphone.
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // A press that is no pointer of the browser, from a test for example, is still a press.
    }
    const now: Press = { at: performance.now(), ending: running.current !== null, running: false }
    press.current = now
    // Held longer than a tap while a recording runs, the line says that letting go ends it.
    clearTimeout(holdTimer.current)
    holdTimer.current = setTimeout(() => {
      if (press.current === now && running.current) setHolding(true)
    }, HOLD_MS)
    if (!now.ending) {
      void start().then((started) => {
        now.running = started
        // The microphone came late, and the press still holds it: letting go ends the recording.
        if (started && press.current === now && performance.now() - now.at >= HOLD_MS) setHolding(true)
      })
    }
  }
  const letGo = () => {
    clearTimeout(holdTimer.current)
    setHolding(false)
    // A finger that lets go is a user activation: after a tap, the bars move from here on in any case.
    if (running.current) wake(running.current.sound)
    const now = press.current
    press.current = null
    if (now && onLetGo(now, performance.now()) === "end") void end()
  }

  return {
    phase,
    holding,
    since: recording?.since,
    level: recording?.level,
    press: {
      onPointerDown,
      onPointerUp: letGo,
      onPointerCancel: letGo,
      // A click from a pointer was its press; one from the keyboard, Enter or the space bar, is a tap.
      onClick: (event) => {
        if (event.detail !== 0) return
        void (running.current ? end() : start())
      },
    },
  }
}

/**
 * The microphone of the chat field. One button with one name; aria-pressed says whether it records.
 * While the model writes, it is disabled but keeps the focus (Base UI's focusableWhenDisabled), also when
 * the request fails. The browser's own long press, a menu or a selection, and scrolling stay away from it.
 */
export function DictateButton({ dictation, className }: { dictation: Dictation; className?: string }) {
  const { phase, press } = dictation
  return (
    <InputGroupButton
      variant={phase === "listening" ? "secondary" : "ghost"}
      size="icon-sm"
      className={cn("touch-none select-none", className)}
      aria-label="Dictate"
      aria-pressed={phase === "listening"}
      disabled={phase === "writing"}
      focusableWhenDisabled
      onPointerDown={press.onPointerDown}
      onPointerUp={press.onPointerUp}
      onPointerCancel={press.onPointerCancel}
      onContextMenu={(event) => event.preventDefault()}
      onClick={press.onClick}
    >
      {phase === "writing" ? <Spinner /> : phase === "listening" ? <SquareIcon /> : <MicIcon />}
    </InputGroupButton>
  )
}

/**
 * The line that stands in the second line of the field while dictation records or writes: the bars, the
 * time and what ends the recording. A screen reader hears what it does, not the time.
 */
export function DictationLine({ dictation }: { dictation: Dictation }) {
  const { phase, holding, since, level } = dictation
  if (phase === "writing") {
    return (
      <InputGroupText role="status" className="min-w-0 flex-1 px-1">
        <span className="truncate">Writing down what you said</span>
      </InputGroupText>
    )
  }
  // Short enough for the narrowest panel, 20rem: the bars say that it listens, the words what ends it,
  // with the square the microphone shows.
  return (
    <InputGroupText role="status" className="min-w-0 flex-1 overflow-hidden px-1">
      {level && <LevelBars level={level} />}
      {since !== undefined && <Clock since={since} />}
      <span className="sr-only">Listening.</span>
      {holding ? (
        <span className="truncate">Let go to finish</span>
      ) : (
        <span className="flex items-center gap-1 whitespace-nowrap">
          Tap <SquareIcon aria-hidden className="size-3.5 shrink-0" /> to finish
        </span>
      )}
    </InputGroupText>
  )
}

/** How many bars: the last second and a quarter, a bar every 90 ms. */
const BARS = 14
const BAR_EVERY_MS = 90

/** The loudness of the last moments, a bar each, the newest on the right. */
function LevelBars({ level }: { level: AnalyserNode }) {
  const [heights, setHeights] = useState<ReadonlyArray<number>>(() => Array.from({ length: BARS }, () => 0))
  useEffect(() => {
    const samples = new Float32Array(level.fftSize)
    const timer = setInterval(() => {
      level.getFloatTimeDomainData(samples)
      const now = loudness(samples)
      setHeights((before) => [...before.slice(1), now])
    }, BAR_EVERY_MS)
    return () => clearInterval(timer)
  }, [level])
  return (
    <span aria-hidden className="flex h-4 shrink-0 items-center gap-0.5">
      {heights.map((height, index) => (
        // A bar is never shorter than a dot, so the line is seen when it is quiet too.
        <span key={index} className="w-0.5 rounded-full bg-primary" style={{ height: `${Math.max(12.5, height * 100)}%` }} />
      ))}
    </span>
  )
}

function Clock({ since }: { since: number }) {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), 250)
    return () => clearInterval(timer)
  }, [])
  return (
    <span aria-hidden className="shrink-0 text-foreground tabular-nums">
      {elapsed(now - since)}
    </span>
  )
}

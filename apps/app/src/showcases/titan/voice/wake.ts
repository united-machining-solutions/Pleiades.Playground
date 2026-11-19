import { useEffect, useRef } from "react"

import { piecesOf } from "./pieces.ts"
import { transcribe } from "./transcribe.ts"
import { MICROPHONE } from "./voice.ts"
import { RECORDING_RATE, wavOf } from "./wav.ts"

// "Hey Titan": the assistant page listens all the time, without a key.
//
// The microphone is watched in the browser: only when someone speaks is a short piece of sound kept,
// with a little of what came just before, so the "Hey" is not cut off (pieces.ts). That piece is recognised like
// a question (transcribe.ts, the hub). If it begins with the name of Titan, what follows is the
// question. "Hey Titan" alone wakes Titan up: the next thing said within a few seconds is the question.
//
// While Titan speaks, or while the space bar records, nothing is heard here, so Titan does not hear
// itself. One piece is recognised at a time: the hub takes two requests of a key at once at most.

/** Titan as the recognition may write it. */
const NAME = /\b(?:hey|hei)?(t[iy]t[ae][nm]+s?|tieten|t[ae]itan|tytan|tighten|titän)\b/i
/** What people say before the name. */
const CALL = /^(hey|hei|hej|hi|he|hallo|ok|okay|na|ja|also)?$/i

/** Whether a sentence calls Titan, and what is asked after the name. */
export function wakeQuestion(text: string): { woke: boolean; question: string } {
  const words = text.trim()
  const match = NAME.exec(words)
  if (!match) return { woke: false, question: "" }
  // The name has to come first, after at most a word like "Hey": "Was macht Titan?" is no call. In a
  // loud room a piece may begin with what others said: then "Hey Titan" counts wherever it stands.
  const before = words.slice(0, match.index).replace(/[^\p{L}\s]/gu, " ").trim()
  const spoken = before.split(/\s+/).filter(Boolean)
  const first = spoken.length === 0 || (spoken.length === 1 && CALL.test(before))
  const called = /^(hey|hei|hej|hallo|okay|ok)$/i.test(spoken.at(-1) ?? "") || /^(hey|hei)/i.test(match[0])
  if (!first && !called) return { woke: false, question: "" }
  const question = words
    .slice(match.index + match[0].length)
    .replace(/^[\s,.!?:;-]+/, "")
    .trim()
  return { woke: true, question }
}

/** Words that send Titan into a pause: it stays quiet until "Hey Titan" or the space bar. */
const PAUSE = /^(bitte\s+)?(mach\s+(mal\s+)?)?(eine\s+)?(pause|pausier\w*|schlaf\w*|ruhe|sei\s+(mal\s+)?(still|ruhig)|still|stopp?|halt)(\s+bitte)?$/i

/** Whether what was said after the name asks Titan to pause, as in "Hey Titan, Pause". */
export function isPause(question: string): boolean {
  return PAUSE.test(question.replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ").trim())
}

/** After "Hey Titan" alone, the next piece is the question if it comes within this. */
export const AWAKE_MS = 8_000

const RATE = RECORDING_RATE
const BLOCK = 2_048

export type WakeOptions = {
  /**
   * Open the microphone. Only after a click or a key on the page: a browser keeps the sound of a page
   * that was not touched yet suspended, and the microphone would hear nothing.
   */
  armed: boolean
  /** Listen now. False while Titan speaks or the space bar records. */
  enabled: boolean
  /** "Hey Titan" alone: Titan is awake and waits for the question. */
  onWake(): void
  /** A question that came with the call, or right after it. */
  onQuestion(question: string): void
  /** The microphone cannot be used, in words for the person. */
  onProblem?(problem: string): void
  /** Ready to hear "Hey Titan", or not any more. */
  onReady?(ready: boolean): void
  /** What a piece of speech was recognised as, a call or not, so the person sees what Titan heard. */
  onHeard?(text: string): void
  /**
   * Someone speaks, or what they said is being recognised: until this is false again, the page says
   * nothing of its own, so it does not talk over a call or a question.
   */
  onBusy?(busy: boolean): void
}

/** Listens for "Hey Titan" once `armed`, while the page is open and `enabled` is true. */
export function useWakeWord(options: WakeOptions) {
  const latest = useRef(options)
  latest.current = options
  const { armed } = options

  useEffect(() => {
    if (!armed || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return
    let closed = false
    let context: AudioContext | undefined
    let stream: MediaStream | undefined
    // A piece is heard while another is being recognised, so a call is not lost in the noise of a room.
    let pieces = piecesOf(RATE)
    let awakeUntil = 0
    let rate = RATE

    /** The pieces being recognised now, and whether one is being said: together, whether someone is asking. */
    let recognising = 0
    let busy = false
    const tellBusy = () => {
      const now = pieces.speaking() || recognising > 0
      if (now === busy) return
      busy = now
      latest.current.onBusy?.(now)
    }

    const recognise = async (samples: Float32Array) => {
      recognising++
      tellBusy()
      try {
        const text = await transcribe(wavOf(samples, rate))
        if (closed || !text) return
        latest.current.onHeard?.(text)
        if (Date.now() < awakeUntil) {
          awakeUntil = 0
          const { woke, question } = wakeQuestion(text)
          latest.current.onQuestion(woke ? question || text : text)
          return
        }
        const { woke, question } = wakeQuestion(text)
        if (!woke) return
        if (question.split(/\s+/).length >= 2) return latest.current.onQuestion(question)
        awakeUntil = Date.now() + AWAKE_MS
        latest.current.onWake()
      } catch {
        // A piece that could not be recognised is let go; the next one is tried again.
      } finally {
        recognising--
        tellBusy()
      }
    }

    const onBlock = (block: Float32Array) => {
      if (!latest.current.enabled) {
        pieces.drop()
        tellBusy()
        return
      }
      const samples = pieces.take(block)
      tellBusy()
      if (samples) void recognise(samples)
    }

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia(MICROPHONE)
        if (closed) return stream.getTracks().forEach((track) => track.stop())
        context = new AudioContext({ sampleRate: RATE })
        // What the browser really records at, where it does not give what was asked for.
        rate = context.sampleRate
        pieces = piecesOf(rate)
        const source = context.createMediaStreamSource(stream)
        // A ScriptProcessor is old but needs no module file, and a block of 128 ms is fine here.
        const processor = context.createScriptProcessor(BLOCK, 1, 1)
        processor.onaudioprocess = (event) => onBlock(new Float32Array(event.inputBuffer.getChannelData(0)))
        source.connect(processor)
        // It runs only when it is connected to an output; it writes silence there.
        processor.connect(context.destination)
        if (context.state === "suspended") await context.resume()
        latest.current.onReady?.(context.state === "running")
      } catch {
        latest.current.onProblem?.("Für „Hey Titan“ braucht der Browser das Mikrofon. Erlaube es oben links in der Adresszeile.")
      }
    })()

    return () => {
      closed = true
      void context?.close()
      stream?.getTracks().forEach((track) => track.stop())
      latest.current.onReady?.(false)
      latest.current.onBusy?.(false)
    }
  }, [armed])
}

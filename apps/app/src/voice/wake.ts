import { useEffect, useRef } from "react"

import { transcribe } from "./transcribe.ts"

// "Hey Titan": the assistant page listens all the time, without a key.
//
// The microphone is watched in the browser: only when someone speaks is a short piece of sound kept,
// with a little of what came just before, so the "Hey" is not cut off. That piece is recognised like
// a question (transcribe.ts, the hub). If it begins with the name of Titan, what follows is the
// question. "Hey Titan" alone wakes Titan up: the next thing said within a few seconds is the question.
//
// While Titan speaks, or while the space bar records, nothing is heard here, so Titan does not hear
// itself. One piece is recognised at a time: the hub takes two requests of a key at once at most.

/** Titan as the recognition may write it. */
const NAME = /\b(t[iy]t[ae]n+s?|tieten|teitan|titän)\b/i
/** What people say before the name. */
const CALL = /^(hey|hei|hej|hi|he|hallo|ok|okay|na|ja|also)?$/i

/** Whether a sentence calls Titan, and what is asked after the name. */
export function wakeQuestion(text: string): { woke: boolean; question: string } {
  const words = text.trim()
  const match = NAME.exec(words)
  if (!match) return { woke: false, question: "" }
  // The name has to come first, after at most a word like "Hey": "Was macht Titan?" is no call.
  const before = words.slice(0, match.index).replace(/[^\p{L}\s]/gu, " ").trim()
  if (before.split(/\s+/).filter(Boolean).length > 1 || !CALL.test(before)) return { woke: false, question: "" }
  const question = words
    .slice(match.index + match[0].length)
    .replace(/^[\s,.!?:;-]+/, "")
    .trim()
  return { woke: true, question }
}

/** Sound louder than this is speech: a root mean square of the samples, between 0 and 1. */
export const SPEECH_LEVEL = 0.02
/** This long quiet ends what is said. */
const QUIET_MS = 900
/** A piece shorter than this is a noise, not a word. */
const SHORTEST_MS = 400
/** The longest piece: a question, not a speech. */
const LONGEST_MS = 15_000
/** Kept from before the voice began. */
const BEFORE_MS = 400
/** After "Hey Titan" alone, the next piece is the question if it comes within this. */
const AWAKE_MS = 8_000

const RATE = 16_000
const BLOCK = 2_048

/** The root mean square of a block of samples. */
export function levelOf(samples: Float32Array): number {
  let sum = 0
  for (const sample of samples) sum += sample * sample
  return Math.sqrt(sum / Math.max(samples.length, 1))
}

/** One channel at 16 kHz as a WAV file of 16 bits, which every endpoint of transcription reads. */
export function wavOf(samples: Float32Array, rate = RATE): Blob {
  const data = new DataView(new ArrayBuffer(44 + samples.length * 2))
  const text = (at: number, value: string) => [...value].forEach((sign, index) => data.setUint8(at + index, sign.charCodeAt(0)))
  text(0, "RIFF")
  data.setUint32(4, 36 + samples.length * 2, true)
  text(8, "WAVE")
  text(12, "fmt ")
  data.setUint32(16, 16, true)
  data.setUint16(20, 1, true)
  data.setUint16(22, 1, true)
  data.setUint32(24, rate, true)
  data.setUint32(28, rate * 2, true)
  data.setUint16(32, 2, true)
  data.setUint16(34, 16, true)
  text(36, "data")
  data.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, index) => data.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true))
  return new Blob([data.buffer], { type: "audio/wav" })
}

export type WakeOptions = {
  /** Listen now. False while Titan speaks or the space bar records. */
  enabled: boolean
  /** "Hey Titan" alone: Titan is awake and waits for the question. */
  onWake(): void
  /** A question that came with the call, or right after it. */
  onQuestion(question: string): void
  /** The microphone cannot be used, in words for the person. */
  onProblem?(problem: string): void
}

/** Listens for "Hey Titan" while the page is open and `enabled` is true. */
export function useWakeWord(options: WakeOptions) {
  const latest = useRef(options)
  latest.current = options

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return
    let closed = false
    let context: AudioContext | undefined
    let stream: MediaStream | undefined
    /** The blocks of the piece that is being said, and those just before it. */
    let before: Array<Float32Array> = []
    let piece: Array<Float32Array> | undefined
    let quietSince = 0
    let busy = false
    let awakeUntil = 0

    const recognise = async (samples: Float32Array) => {
      busy = true
      try {
        const text = await transcribe(wavOf(samples))
        if (closed || !text) return
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
        busy = false
      }
    }

    const onBlock = (block: Float32Array) => {
      if (!latest.current.enabled || busy) {
        piece = undefined
        before = []
        return
      }
      const speech = levelOf(block) > SPEECH_LEVEL
      const blockMs = (block.length / RATE) * 1000
      if (!piece) {
        before.push(block)
        while (before.length * blockMs > BEFORE_MS) before.shift()
        if (speech) {
          piece = [...before]
          before = []
          quietSince = 0
        }
        return
      }
      piece.push(block)
      quietSince = speech ? 0 : quietSince + blockMs
      const length = piece.length * blockMs
      if (quietSince < QUIET_MS && length < LONGEST_MS) return
      const done = piece
      piece = undefined
      if (length - quietSince < SHORTEST_MS) return
      const samples = new Float32Array(done.reduce((sum, one) => sum + one.length, 0))
      let at = 0
      for (const one of done) {
        samples.set(one, at)
        at += one.length
      }
      void recognise(samples)
    }

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
        if (closed) return stream.getTracks().forEach((track) => track.stop())
        context = new AudioContext({ sampleRate: RATE })
        const source = context.createMediaStreamSource(stream)
        // A ScriptProcessor is old but needs no module file, and a block of 128 ms is fine here.
        const processor = context.createScriptProcessor(BLOCK, 1, 1)
        processor.onaudioprocess = (event) => onBlock(new Float32Array(event.inputBuffer.getChannelData(0)))
        source.connect(processor)
        // It runs only when it is connected to an output; it writes silence there.
        processor.connect(context.destination)
      } catch {
        latest.current.onProblem?.("Für „Hey Titan“ braucht der Browser das Mikrofon. Erlaube es oben links in der Adresszeile.")
      }
    })()

    return () => {
      closed = true
      void context?.close()
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])
}

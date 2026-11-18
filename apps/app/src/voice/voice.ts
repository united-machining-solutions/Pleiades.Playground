import { useEffect, useRef, useSyncExternalStore } from "react"

import { withoutList, withoutSaidAdvice } from "./facts.ts"
import { piperIfReady, sentencesOf } from "./piper.ts"
import { transcribe } from "./transcribe.ts"

// Speech for the assistant page: the browser listens to a question and reads an answer aloud.
//
// - Speaking goes sentence by sentence through a queue, so that an answer is read while it still
//   arrives. A sentence sounds with the voice the page set (setSentenceVoice: Tom's, tom.ts), else
//   with Piper (piper.ts) once it has loaded, else with the voices of the system (speechSynthesis).
//   The next sentence is made while one sounds; a sentence a voice cannot make, the system says.
// - Listening records the microphone while the key is held and recognises the speech (transcribe.ts):
//   with the transcription model of the language model's endpoint, such as the hub, or else with
//   Whisper in the browser, which needs no network once its model is loaded.
//
// Answers are read aloud only while voice is on: the assistant page turns it on while it is open.

export type VoiceState = "idle" | "listening" | "thinking" | "speaking"

/** The language the browser listens in and speaks. */
export const VOICE_LANGUAGE = "de-DE"

/** How fast the voice of the system speaks: a little faster, it sounded slow. Tom's voice keeps its own pace. */
export const SPEECH_RATE = 1.2

let state: VoiceState = "idle"
let thinking = false
let enabled = false
const listeners = new Set<() => void>()

function setState(next: VoiceState) {
  if (next === state) return
  state = next
  for (const listener of listeners) listener()
}

/** What the voice does now: the orb of the assistant page shows it. */
export function useVoiceState(): VoiceState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
    () => "idle" as const,
  )
}

/** Turns reading aloud on or off. Turning it off stops what is being read. */
export function setVoiceEnabled(on: boolean) {
  enabled = on
  if (!on) stopSound()
}

export function voiceEnabled(): boolean {
  return enabled
}

// ---- Speaking ----

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window
}

/** A voice that makes the sound of a sentence: Tom's (tom.ts) or Piper's (piper.ts). */
export type SentenceVoice = { predict: (sentence: string) => Promise<Blob> }

let sentenceVoice: SentenceVoice | undefined

/** The voice the page has, Tom's for example; none for Piper once it is loaded, else the system. */
export function setSentenceVoice(voice: SentenceVoice | undefined) {
  sentenceVoice = voice
}

/**
 * A voice that keeps the sounds it made, the last `keep` sentences: what Titan says often, a greeting
 * or "Ja?", then sounds at once even with a slow voice.
 */
export function remembering(voice: SentenceVoice, keep = 50): SentenceVoice {
  const sounds = new Map<string, Promise<Blob>>()
  return {
    predict(sentence) {
      let sound = sounds.get(sentence)
      if (!sound) {
        sound = voice.predict(sentence)
        sound.catch(() => sounds.delete(sentence))
        sounds.set(sentence, sound)
        if (sounds.size > keep) sounds.delete(sounds.keys().next().value as string)
      }
      return sound
    },
  }
}

function currentVoice(): SentenceVoice | undefined {
  return sentenceVoice ?? piperIfReady()
}

/** A voice of the system in the language, if it has one. Local voices first: they need no network. */
function voiceFor(language: string): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices().filter((one) => one.lang.replace("_", "-").startsWith(language.slice(0, 2)))
  return voices.find((one) => one.lang === language && one.localService) ?? voices.find((one) => one.localService) ?? voices[0]
}

/** Counts what was said, so that a sentence of an earlier answer that comes late stays silent. */
let turn = 0
/** Ends the sentence that sounds now. */
let hush: (() => void) | undefined

/** A sentence that waits to be said, with its sound once that is being made. */
type Queued = { sentence: string; sound?: Promise<Blob | undefined> }
let queue: Array<Queued> = []
/** The queue being said, until it is empty or stopped. */
let saying: Promise<void> | undefined

/** Stops every sound and forgets what waits. */
function stopSound() {
  turn++
  queue = []
  saying = undefined
  hush?.()
  if (canSpeak()) speechSynthesis.cancel()
}

/**
 * Says a text after what is being said now. Resolves when everything said so far has been said,
 * or at once if the browser cannot speak or refuses to before a first click on the page.
 */
export function sayNext(text: string): Promise<void> {
  for (const sentence of sentencesOf(text)) queue.push({ sentence })
  saying ??= sayQueue(turn)
  return saying
}

/** Reads a text aloud, after stopping what is being said. */
export function speak(text: string): Promise<void> {
  stopSound()
  if (text.trim() === "") return Promise.resolve()
  return sayNext(text)
}

export function stopSpeaking() {
  stopSound()
  setState(thinking ? "thinking" : "idle")
}

// The voice of the system lives outside the page: without this it could go on reading after the tab
// or the browser was closed. Leaving or closing the page silences it, and so does reloading it.
if (typeof window !== "undefined") {
  for (const event of ["pagehide", "beforeunload"] as const) window.addEventListener(event, stopSound)
}

function make(voice: SentenceVoice, sentence: string): Promise<Blob | undefined> {
  return voice.predict(sentence).catch(() => undefined)
}

async function sayQueue(mine: number): Promise<void> {
  try {
    while (queue.length > 0) {
      const one = queue.shift() as Queued
      const voice = currentVoice()
      if (voice) {
        one.sound ??= make(voice, one.sentence)
        // The next sentence is made while this one sounds.
        if (queue[0]) queue[0].sound ??= make(voice, queue[0].sentence)
      }
      const sound = await one.sound
      if (mine !== turn) return
      if (sound) {
        setState("speaking")
        await play(sound)
      } else {
        await speakWithSystem(one.sentence)
      }
      if (mine !== turn) return
    }
  } finally {
    if (mine === turn) {
      saying = undefined
      setState(thinking ? "thinking" : "idle")
    }
  }
}

/** Says one sentence with a voice of the system. */
function speakWithSystem(sentence: string): Promise<void> {
  if (!canSpeak()) return Promise.resolve()
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(sentence)
    utterance.lang = VOICE_LANGUAGE
    utterance.rate = SPEECH_RATE
    const voice = voiceFor(VOICE_LANGUAGE)
    if (voice) utterance.voice = voice
    const done = () => {
      hush = undefined
      resolve()
    }
    hush = done
    utterance.onstart = () => setState("speaking")
    utterance.onend = done
    utterance.onerror = done
    speechSynthesis.speak(utterance)
  })
}

/** Plays a sound, and resolves when it has ended or was stopped. */
function play(sound: Blob): Promise<void> {
  const address = URL.createObjectURL(sound)
  const audio = new Audio(address)
  return new Promise((resolve) => {
    const done = () => {
      hush = undefined
      audio.pause()
      URL.revokeObjectURL(address)
      resolve()
    }
    hush = done
    audio.onended = done
    audio.onerror = done
    audio.play().catch(done)
  })
}

/**
 * Where the complete sentences of a text that still grows end, after `from`: the end of the last
 * mark of a sentence that has a space or a line after it. `from` if there is none yet.
 */
export function sentencesEnd(text: string, from: number): number {
  let end = from
  for (const match of text.slice(from).matchAll(/[.!?…:]["“”«»)]*\s+|\n\s*\n/g)) end = from + match.index + match[0].length
  return end
}

/**
 * What a language model wrote, as a sentence to say: without the signs of markdown, tables and
 * code. What a card shows is not read; the words around it are.
 */
export function forSpeech(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*\|.*\|\s*$/gm, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
}

// ---- Listening ----

export function canListen(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined"
}

/** The microphone stays open once it was allowed, so a question starts without a delay. */
let microphone: MediaStream | undefined
let recorder: MediaRecorder | undefined
/** The key was let go: also before the microphone was ready, for example while the browser asked for it. */
let stopWanted = false

async function openMicrophone(): Promise<MediaStream> {
  if (microphone?.active) return microphone
  microphone = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
  return microphone
}

/**
 * Records until `stopListening` is called and resolves with what was said, or with an empty text if
 * nothing was. Rejects with a sentence to show, for example without a microphone.
 */
export async function listen(): Promise<string> {
  if (!canListen()) throw new Error("Dieser Browser kann nicht aufnehmen. Nimm Chrome oder Edge.")
  stopWanted = false
  stopSpeaking()
  let stream: MediaStream
  try {
    stream = await openMicrophone()
  } catch (error) {
    throw new Error(microphoneError(error))
  }
  const chunks: Array<Blob> = []
  const recording = new MediaRecorder(stream)
  recorder = recording
  recording.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }
  const stopped = new Promise<void>((resolve) => {
    recording.onstop = () => resolve()
  })
  setState("listening")
  recording.start()
  if (stopWanted) recording.stop()
  await stopped
  if (recorder === recording) recorder = undefined
  // Recognising takes a second or two: the orb thinks meanwhile.
  setState("thinking")
  try {
    return await transcribe(new Blob(chunks, { type: recording.mimeType }))
  } catch (error) {
    throw new Error(`Die Spracherkennung ist ausgefallen: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    setState(thinking ? "thinking" : "idle")
  }
}

/** Ends the recording, as when the key is let go: what was said is recognised then. */
export function stopListening() {
  stopWanted = true
  if (recorder?.state === "recording") recorder.stop()
}

function microphoneError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ""
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Der Browser darf das Mikrofon nicht nutzen. Erlaube es oben links in der Adresszeile."
  if (name === "NotFoundError") return "Kein Mikrofon gefunden."
  return `Das Mikrofon geht nicht: ${error instanceof Error ? error.message : String(error)}`
}

// ---- The chat ----

type Part = { type: string; content?: unknown }
type ChatMessage = { id: string; role: string; parts: ReadonlyArray<Part> }

/** The text of an answer, without what its cards show. */
export function textOf(message: ChatMessage): string {
  return message.parts
    .filter((part) => part.type === "text" && typeof part.content === "string")
    .map((part) => part.content as string)
    .join("\n")
}

/** What of an answer is said: everything but its list of facts, which the screen shows (facts.ts). */
function wordsOf(message: ChatMessage): string {
  return withoutSaidAdvice(withoutList(textOf(message)), message.id)
}

/**
 * For the open chat: the orb thinks while an answer arrives, and the answer is read aloud once it
 * is complete, while voice is on.
 */
export function useSpokenAnswers(messages: ReadonlyArray<ChatMessage>, isLoading: boolean) {
  // How far the newest answer has been handed to the voice. An answer that was there when the chat
  // opened has been said already.
  const said = useRef<{ id?: string; at: number } | undefined>(undefined)
  useEffect(() => {
    thinking = isLoading
    if (state !== "speaking" && state !== "listening") setState(isLoading ? "thinking" : "idle")
    const last = messages.at(-1)
    if (said.current === undefined) {
      said.current = last?.role === "assistant" && !isLoading ? { id: last.id, at: wordsOf(last).length } : { at: 0 }
      if (said.current.id) return
    }
    if (!enabled || !last || last.role !== "assistant") return
    if (said.current.id !== last.id) said.current = { id: last.id, at: 0 }
    // While the answer arrives, each complete sentence is said at once; the rest when it is complete.
    const words = wordsOf(last)
    const end = isLoading ? sentencesEnd(words, said.current.at) : words.length
    if (end <= said.current.at) return
    const piece = forSpeech(words.slice(said.current.at, end))
    said.current.at = end
    if (piece) void sayNext(piece)
  }, [messages, isLoading])
  useEffect(
    () => () => {
      thinking = false
      setState("idle")
    },
    [],
  )
}

let followUp: ((question: string) => void) | undefined

/** For the open chat: a question asked by voice on the page goes on in this chat. */
export function useFollowUps(send: (question: string) => void) {
  const latest = useRef(send)
  latest.current = send
  useEffect(() => {
    const handler = (question: string) => latest.current(question)
    followUp = handler
    return () => {
      if (followUp === handler) followUp = undefined
    }
  }, [])
}

/** Asks in the open chat, if one is open. False if none is: then a new chat begins. */
export function askFollowUp(question: string): boolean {
  if (!followUp) return false
  followUp(question)
  return true
}

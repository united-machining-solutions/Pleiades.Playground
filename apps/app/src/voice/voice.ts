import { useEffect, useRef, useSyncExternalStore } from "react"

import { transcribe } from "./whisper.ts"

// Speech for the assistant page: the browser listens to a question and reads an answer aloud.
//
// - Speaking uses the voices of the system (speechSynthesis). It needs no network.
// - Listening records the microphone while the key is held and recognises the speech with Whisper in
//   the browser (whisper.ts). After its model is loaded once, it needs no network either.
//
// Answers are read aloud only while voice is on: the assistant page turns it on while it is open.

export type VoiceState = "idle" | "listening" | "thinking" | "speaking"

/** The language the browser listens in and speaks. */
export const VOICE_LANGUAGE = "de-DE"

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
  if (!on && typeof speechSynthesis !== "undefined") speechSynthesis.cancel()
}

export function voiceEnabled(): boolean {
  return enabled
}

// ---- Speaking ----

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window
}

/** A voice of the system in the language, if it has one. Local voices first: they need no network. */
function voiceFor(language: string): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices().filter((one) => one.lang.replace("_", "-").startsWith(language.slice(0, 2)))
  return voices.find((one) => one.lang === language && one.localService) ?? voices.find((one) => one.localService) ?? voices[0]
}

/**
 * Reads a text aloud. Resolves when it has been read, or at once if the browser cannot speak or
 * refuses to before a first click on the page.
 */
export function speak(text: string): Promise<void> {
  if (!canSpeak() || text.trim() === "") return Promise.resolve()
  speechSynthesis.cancel()
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = VOICE_LANGUAGE
    const voice = voiceFor(VOICE_LANGUAGE)
    if (voice) utterance.voice = voice
    const done = () => {
      setState(thinking ? "thinking" : "idle")
      resolve()
    }
    utterance.onstart = () => setState("speaking")
    utterance.onend = done
    utterance.onerror = done
    speechSynthesis.speak(utterance)
  })
}

export function stopSpeaking() {
  if (canSpeak()) speechSynthesis.cancel()
  setState(thinking ? "thinking" : "idle")
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

/** The words of an answer, without what its cards show. */
function wordsOf(message: ChatMessage): string {
  return message.parts
    .filter((part) => part.type === "text" && typeof part.content === "string")
    .map((part) => part.content as string)
    .join("\n")
}

/**
 * For the open chat: the orb thinks while an answer arrives, and the answer is read aloud once it
 * is complete, while voice is on.
 */
export function useSpokenAnswers(messages: ReadonlyArray<ChatMessage>, isLoading: boolean) {
  const spoken = useRef<string | undefined>(undefined)
  const wasLoading = useRef(isLoading)
  useEffect(() => {
    thinking = isLoading
    if (state !== "speaking" && state !== "listening") setState(isLoading ? "thinking" : "idle")
    const finished = wasLoading.current && !isLoading
    wasLoading.current = isLoading
    if (!finished || !enabled) return
    const last = messages.at(-1)
    if (!last || last.role !== "assistant" || spoken.current === last.id) return
    spoken.current = last.id
    void speak(forSpeech(wordsOf(last)))
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

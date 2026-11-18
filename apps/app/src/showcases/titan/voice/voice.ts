import { useSyncExternalStore } from "react"

import type { Listener, Message } from "../conversation.ts"

import { withoutList, withoutSaidAdvice } from "./facts.ts"
import { transcribe } from "./transcribe.ts"

// Speech for the assistant page: the browser listens to a question and reads an answer aloud.
//
// - Speaking goes sentence by sentence through a queue, so that an answer is read while it still
//   arrives. A sentence sounds with the voice the page set (setSentenceVoice: the speech model of the
//   gateway, speech.ts), else with a voice of the system that speaks on this computer (speechSynthesis).
//   The next sentence is made while one sounds; a sentence the voice cannot make, the system says.
// - Listening records the microphone while the key is held and recognises the speech with the
//   transcription model of the gateway (transcribe.ts).
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

/**
 * Turns reading answers aloud on or off. What sounds now goes on: Titan still says that it pauses. To
 * fall silent at once, call `stopSpeaking`.
 */
export function setVoiceEnabled(on: boolean) {
  enabled = on
}

export function voiceEnabled(): boolean {
  return enabled
}

// ---- Speaking ----

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window
}

/** A voice that makes the sound of a sentence: the speech model of the gateway (speech.ts). */
export type SentenceVoice = { predict: (sentence: string) => Promise<Blob> }

let sentenceVoice: SentenceVoice | undefined

/** The voice the page has; none for the voice of the system. */
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
  return sentenceVoice
}

/** A text in sentences, so that the first one sounds while the next is made. */
export function sentencesOf(text: string): string[] {
  return (text.match(/[^.!?…]+[.!?…]*["“”«»)]*\s*/g) ?? [text]).map((one) => one.trim()).filter((one) => one !== "")
}

/**
 * A voice of the system in the language that speaks on this computer. A voice the browser computes
 * elsewhere is not taken: what Titan says would leave the room unasked. Without a local one, the system
 * says nothing and the answer stands on the screen.
 */
function voiceFor(language: string): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices().filter((one) => one.localService && one.lang.replace("_", "-").startsWith(language.slice(0, 2)))
  return voices.find((one) => one.lang === language) ?? voices[0]
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
  // The sentence that is next is made as soon as it is known, also when it arrives while another sounds:
  // otherwise each sentence of an answer that still arrives would wait for its sound after the one before.
  const voice = currentVoice()
  const next = queue[0]
  if (voice && next) next.sound ??= make(voice, next.sentence)
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
    const voice = voiceFor(VOICE_LANGUAGE)
    if (!voice) return resolve()
    const utterance = new SpeechSynthesisUtterance(sentence)
    utterance.lang = VOICE_LANGUAGE
    utterance.rate = SPEECH_RATE
    utterance.voice = voice
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

/**
 * Lets go of the microphone: the page is left. A recording that runs is ended, and the browser no longer
 * shows the microphone as in use.
 */
export function closeMicrophone() {
  stopWanted = true
  if (recorder?.state === "recording") recorder.stop()
  recorder = undefined
  microphone?.getTracks().forEach((track) => track.stop())
  microphone = undefined
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

/** The text of an answer, without what its cards show. */
export function textOf(message: Message): string {
  return message.parts.flatMap((part) => (part.type === "text" ? [part.content] : [])).join("\n")
}

/** What of an answer is said: everything but its list of facts, which the screen shows (facts.ts). */
function wordsOf(message: Message): string {
  return withoutSaidAdvice(withoutList(textOf(message)), message.id)
}

/**
 * Follows the conversation (conversation.ts): the orb thinks while an answer arrives, and the answer is
 * read aloud as it arrives while voice is on.
 */
export function speakingAnswers(): Listener {
  // How far the newest answer has been handed to the voice. An answer that was there when the page
  // came has been said already.
  let said: { id?: string; at: number } | undefined
  return {
    update(messages, isLoading) {
      thinking = isLoading
      if (state !== "speaking" && state !== "listening") setState(isLoading ? "thinking" : "idle")
      const last = messages.at(-1)
      if (said === undefined) {
        said = last?.role === "assistant" && !isLoading ? { id: last.id, at: wordsOf(last).length } : { at: 0 }
        if (said.id) return
      }
      if (!enabled || !last || last.role !== "assistant") return
      if (said.id !== last.id) said = { id: last.id, at: 0 }
      // While the answer arrives, each complete sentence is said at once; the rest when it is complete.
      const words = wordsOf(last)
      const end = isLoading ? sentencesEnd(words, said.at) : words.length
      if (end <= said.at) return
      const piece = forSpeech(words.slice(said.at, end))
      said.at = end
      if (piece) void sayNext(piece)
    },
    detach() {
      thinking = false
      setState("idle")
    },
  }
}

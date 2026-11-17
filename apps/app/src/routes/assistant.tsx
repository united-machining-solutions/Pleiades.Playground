import { createFileRoute, getRouteApi, useNavigate } from "@tanstack/react-router"
import { SparklesIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { pickModel, useChatPanel } from "@/chat/ask.ts"
import {
  askFollowUp,
  canListen,
  listen,
  setVoiceEnabled,
  speak,
  stopListening,
  stopSpeaking,
  useVoiceState,
} from "@/voice/voice.ts"
import type { VoiceState } from "@/voice/voice.ts"
import { faultBriefing, faultInWords, useNewFaults } from "@/voice/faults.ts"
import type { Fault } from "@/voice/faults.ts"
import { useShownCards } from "@/voice/shown.ts"
import { loadRecognition } from "@/voice/transcribe.ts"
import { useWakeWord } from "@/voice/wake.ts"
import { greetingFor } from "@/voice/greeting.ts"
import { usePresence } from "@/titan/faces/presence.ts"
import { Cloud } from "@/voice/cloud.tsx"

// Titan: a black screen with a cloud of points that greets, listens and speaks, and nothing else.
//
// - The first press of the space bar or a click starts Titan and greets: a browser speaks only after
//   a key or a click.
// - Then say "Hey Titan" and the question, or hold the space bar, speak, and let go: the question
//   goes to the chat, which runs behind this screen, and its answer is read aloud. A follow-up goes
//   on in the same chat.
// - Escape leaves the screen.
//
// The demo speaks German, so do the words of this page.

/** What Titan says when it is called by its name alone. */
const AWAKE = "Ja?"
/** What Titan says when it is started. */
const READY = "Titan ist bereit."

const root = getRouteApi("__root__")

export const Route = createFileRoute("/assistant")({
  staticData: { nav: { title: "Titan", icon: SparklesIcon, order: 1 } },
  component: Assistant,
})

/** For a screen reader: what the cloud shows by moving. */
const said: Record<VoiceState, string> = {
  idle: "„Hey Titan“ sagen, oder die Leertaste halten und sprechen.",
  listening: "Ich höre zu.",
  thinking: "Ich denke nach.",
  speaking: "Ich spreche.",
}

function Assistant() {
  const panel = useChatPanel()
  const navigate = useNavigate()
  const state = useVoiceState()
  const cards = useShownCards()
  const [problem, setProblem] = useState<string>()
  /** What the speech recognition heard last, so the person sees what was asked. */
  const [heard, setHeard] = useState<string>()
  const greeted = useRef(false)
  /** Titan was started by a key or a click: from then on it may speak, and it listens for its name. */
  const [started, setStarted] = useState(false)
  const holding = useRef(false)
  // The handlers of the keys read the newest values without being bound again.
  const latest = useRef<{ state: VoiceState; panel: typeof panel; alarmed: ReadonlyArray<string>; person?: string }>({ state, panel, alarmed: [] })
  latest.current.state = state
  latest.current.panel = panel

  // The speech recognition gets ready as the screen opens. With the endpoint of the language model,
  // the hub, there is nothing to load. Without it, Whisper loads: from the cache of the browser, or
  // the first time from the internet, and a quiet line at the bottom says how far it is.
  const [recognition, setRecognition] = useState<string | undefined>("Spracherkennung wird geladen …")
  useEffect(() => {
    let open = true
    loadRecognition((share) => open && setRecognition(`Spracherkennung wird geladen … ${Math.round(share * 100)} %`)).then(
      () => open && setRecognition(undefined),
      (error: unknown) =>
        open &&
        setRecognition(
          `Spracherkennung nicht geladen. Einmal mit Internet öffnen, danach geht es offline. (${error instanceof Error ? error.message : String(error)})`,
        ),
    )
    return () => {
      open = false
    }
  }, [])

  // Answers are read aloud while this screen is open.
  useEffect(() => {
    setVoiceEnabled(true)
    return () => setVoiceEnabled(false)
  }, [])

  // Titan speaks with the voice of the system, which sounds at once. The voice of Tom (tom.ts,
  // apps/titan-voice) is ready in the code, but on a computer without a graphics card it takes as long
  // to make a sentence as to say it, which is too slow to talk with.

  // The cloud keeps an eye on the hall. A new fault turns it red at once, and the assistant speaks
  // first: it is told what happened and says it in its own words, with the shop floor. Without a
  // language model, the page says the fault itself.
  const { chatStatus } = root.useLoaderData()
  // Titan talks: the model that answers fastest begins its chats. Haiku took about a second for a
  // sentence at the hub, the others two to five. Without it, the first model of the settings answers.
  useEffect(() => {
    const fastest = chatStatus.models.find((model) => /haiku/i.test(model))
    if (fastest) pickModel(fastest)
  }, [chatStatus.models])
  const [alert, setAlert] = useState<Fault>()
  /** Who stands in front of the camera, by name if the face is known. */
  const [person, setPerson] = useState<string>()
  const alarmed = useNewFaults((fault) => {
    setAlert(fault)
    setHeard(undefined)
    setProblem(undefined)
    if (!chatStatus.configured) return void speak(faultInWords(fault, latest.current.person))
    const briefing = faultBriefing(fault, latest.current.person)
    if (!askFollowUp(briefing)) latest.current.panel.ask(briefing)
  })
  latest.current.alarmed = alarmed
  latest.current.person = person

  // Someone steps in front of the camera: Titan greets them, by name if it knows the face, and says
  // straight away when machines stand still with an error. It does not talk over itself or a question.
  const presence = usePresence({
    enabled: started,
    onArrive: ({ name }) => {
      setPerson(name)
      if (latest.current.state !== "idle") return
      setHeard(undefined)
      void speak(greetingFor(name, latest.current.alarmed))
    },
    // The name is checked again every few seconds. Someone else who is known stepped in without a
    // pause: Titan greets them too. Someone who is no longer recognised just loses the name.
    onRename: ({ name }) => {
      setPerson(name)
      if (!name || latest.current.state !== "idle") return
      void speak(greetingFor(name, latest.current.alarmed))
    },
  })
  // Without a camera, Titan greets once when it is started, without a name.
  useEffect(() => {
    if (started && presence.status === "error") void speak(greetingFor(undefined, latest.current.alarmed))
  }, [started, presence.status])
  // The fault is over once its machine has no open error any more.
  useEffect(() => {
    if (alert && !alarmed.includes(alert.machine)) setAlert(undefined)
  }, [alert, alarmed])

  // "Hey Titan": listens while Titan is started and does nothing else, so it never hears itself.
  useWakeWord({
    enabled: started && state === "idle",
    onWake: () => {
      setProblem(undefined)
      setHeard(undefined)
      void speak(AWAKE)
    },
    onQuestion: (question) => {
      setProblem(undefined)
      setHeard(question)
      if (!askFollowUp(question)) latest.current.panel.ask(question)
    },
    onProblem: setProblem,
  })

  useEffect(() => {
    const ask = (question: string) => {
      setProblem(undefined)
      if (!askFollowUp(question)) latest.current.panel.ask(question)
    }

    const start = () => {
      if (greeted.current) return false
      greeted.current = true
      // The camera greets whoever stands in front of it; until then a short sound says Titan is there.
      setStarted(true)
      void speak(READY)
      return true
    }

    const onClick = () => void start()

    const onDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        stopSpeaking()
        // The open chat stays open, with the question and the answer.
        void navigate({ to: "/", search: (previous) => previous })
        return
      }
      if (event.code !== "Space") return
      event.preventDefault()
      if (event.repeat || holding.current) return
      holding.current = true
      setProblem(undefined)
      if (start()) return
      if (!canListen()) {
        setProblem("Dieser Browser kann nicht aufnehmen. Nimm Chrome oder Edge.")
        return
      }
      setHeard(undefined)
      listen().then(
        (question) => {
          if (!question) {
            setProblem("Ich habe nichts verstanden. Halte die Leertaste gedrückt, solange du sprichst.")
            return
          }
          setHeard(question)
          ask(question)
        },
        (error: unknown) => setProblem(error instanceof Error ? error.message : String(error)),
      )
    }

    const onUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return
      event.preventDefault()
      holding.current = false
      // Also before the microphone is ready: the recording then ends as soon as it begins.
      stopListening()
    }

    window.addEventListener("keydown", onDown)
    window.addEventListener("keyup", onUp)
    window.addEventListener("click", onClick)
    return () => {
      window.removeEventListener("keydown", onDown)
      window.removeEventListener("keyup", onUp)
      window.removeEventListener("click", onClick)
    }
  }, [navigate])

  return (
    // The whole screen, over the app: black, with the cloud and the greeting and nothing else.
    // With the cards of an answer, the cloud gets smaller and moves up, and the cards stand below it.
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center gap-8 overflow-y-auto bg-black px-4 py-10 text-center ${cards.length > 0 ? "justify-start" : "justify-center"}`}
    >
      <div className={`flex shrink-0 items-center justify-center transition-all duration-500 ${cards.length > 0 ? "h-36 scale-50" : "h-72"}`}>
        <Cloud state={state} alarm={alarmed.length > 0} />
      </div>
      <div className="flex flex-col gap-4">
        {cards.length === 0 && !alert && (
          <h1 className="text-3xl font-light tracking-wide text-balance text-white/90">{greetingFor(person, alarmed)}</h1>
        )}
        {alert && (
          <p className="text-2xl font-light text-balance text-state-alarm" role="alert">
            {alert.machine} · {alert.title}
          </p>
        )}
        {heard && <p className="text-lg font-light text-white/60">„{heard}“</p>}
        {!started && <p className="text-base font-light text-white/50">Leertaste drücken oder klicken, um Titan zu starten.</p>}
      </div>
      {cards.length > 0 && (
        <div className="flex w-full max-w-3xl flex-col gap-4 text-left motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4">
          {cards.map((card, index) => (
            <div key={index}>{card}</div>
          ))}
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {said[state]}
      </p>
      {(problem ?? recognition) && (
        <p className="absolute bottom-6 px-4 text-sm text-white/50">{problem ?? recognition}</p>
      )}
    </div>
  )
}

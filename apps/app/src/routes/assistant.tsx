import { createFileRoute, getRouteApi, useNavigate } from "@tanstack/react-router"
import { SparklesIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { useChatPanel } from "@/chat/ask.ts"
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
import { Cloud } from "@/voice/cloud.tsx"

// The assistant: a black screen with a cloud of points that greets, listens and speaks, and nothing else.
//
// - The first press of the space bar greets: a browser speaks only after a key or a click.
// - Then hold the space bar, speak, and let go: the question goes to the chat, which runs behind
//   this screen, and its answer is read aloud. A follow-up goes on in the same chat.
// - Escape leaves the screen.
//
// The demo speaks German, so do the words of this page.

/** Who the cloud greets. */
const GREETED = "Kathrin"
const GREETING = `Hallo ${GREETED}, was kann ich für dich tun?`

const root = getRouteApi("__root__")

export const Route = createFileRoute("/assistant")({
  staticData: { nav: { title: "Assistant", icon: SparklesIcon, order: 1 } },
  component: Assistant,
})

/** For a screen reader: what the cloud shows by moving. */
const said: Record<VoiceState, string> = {
  idle: "Leertaste halten und sprechen.",
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
  const holding = useRef(false)
  // The handlers of the keys read the newest values without being bound again.
  const latest = useRef({ state, panel })
  latest.current = { state, panel }

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

  // The cloud keeps an eye on the hall. A new fault turns it red at once, and the assistant speaks
  // first: it is told what happened and says it in its own words, with the shop floor. Without a
  // language model, the page says the fault itself.
  const { chatStatus } = root.useLoaderData()
  const [alert, setAlert] = useState<Fault>()
  const alarmed = useNewFaults((fault) => {
    setAlert(fault)
    setHeard(undefined)
    setProblem(undefined)
    if (!chatStatus.configured) return void speak(faultInWords(fault, GREETED))
    const briefing = faultBriefing(fault, GREETED)
    if (!askFollowUp(briefing)) latest.current.panel.ask(briefing)
  })
  // The fault is over once its machine has no open error any more.
  useEffect(() => {
    if (alert && !alarmed.includes(alert.machine)) setAlert(undefined)
  }, [alert, alarmed])

  useEffect(() => {
    const ask = (question: string) => {
      setProblem(undefined)
      if (!askFollowUp(question)) latest.current.panel.ask(question)
    }

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
      if (!greeted.current) {
        greeted.current = true
        void speak(GREETING)
        return
      }
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
    return () => {
      window.removeEventListener("keydown", onDown)
      window.removeEventListener("keyup", onUp)
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
          <h1 className="text-3xl font-light tracking-wide text-balance text-white/90">{GREETING}</h1>
        )}
        {alert && (
          <p className="text-2xl font-light text-balance text-state-alarm" role="alert">
            {alert.machine} · {alert.title}
          </p>
        )}
        {heard && <p className="text-lg font-light text-white/60">„{heard}“</p>}
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

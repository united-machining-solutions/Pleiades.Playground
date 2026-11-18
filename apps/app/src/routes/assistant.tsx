import { createFileRoute, getRouteApi, useNavigate } from "@tanstack/react-router"
import { Kbd } from "@pleiades/ui/components/kbd"
import { SparklesIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { pickModel, useChatPanel } from "@/chat/ask.ts"
import {
  askFollowUp,
  canListen,
  listen,
  remembering,
  sayNext,
  setSentenceVoice,
  setVoiceEnabled,
  speak,
  stopListening,
  stopSpeaking,
  useVoiceState,
} from "@/voice/voice.ts"
import type { VoiceState } from "@/voice/voice.ts"
import { tom, tomAvailable } from "@/voice/tom.ts"
import { faultBriefing, faultInWords, useNewFaults } from "@/voice/faults.ts"
import { useShown } from "@/voice/shown.ts"
import { loadRecognition } from "@/voice/transcribe.ts"
import { isPause, useWakeWord } from "@/voice/wake.ts"
import { greetingFor } from "@/voice/greeting.ts"
import { keyFactsOf, machinesNamed } from "@/titan/board.ts"
import type { MachineFacts } from "@/titan/board.ts"
import { escalationsOf } from "@/titan/escalation.ts"
import { EscalationView } from "@/titan/escalation-view.tsx"
import { FocusView } from "@/titan/focus-view.tsx"
import { asksToSee, unbroken } from "@/titan/words.ts"
import { usePresence } from "@/titan/faces/presence.ts"
import { Cloud } from "@/voice/cloud.tsx"

// Titan: a black screen with a cloud of points that greets, listens and speaks, and nothing else.
//
// - The first press of the space bar or a click starts Titan and greets: a browser speaks only after
//   a key or a click.
// - Then say "Hey Titan" and the question, or hold the space bar, speak, and let go: the question
//   goes to the chat, which runs behind this screen, and its answer is read aloud. A follow-up goes
//   on in the same chat.
// - "Hey Titan, Pause" or the key P: Titan falls silent, greets nobody and says no fault, until
//   "Hey Titan" or the space bar wakes it again. It still shows a new fault.
// - Titan speaks only once it is started and only while its tab is in front: a tab left open in
//   the background stays silent.
// - The screen is dark and has one focus: the question asked last and its answer (titan/focus-view.tsx).
//   A new question clears what the one before showed. Beside it, once Titan was started, stands the
//   escalation (titan/escalation-view.tsx): red what stands, amber what to do before a machine fails.
//   Everything that comes and goes, what Titan heard, a problem, the pause, is one quiet line at the
//   bottom, so no text appears anywhere else.
// - Escape leaves the screen.
//
// The demo speaks German, so do the words of this page.

/** What Titan says when it is called by its name alone. */
const AWAKE = "Ja?"
/**
 * What Titan says as soon as it has understood a question. The answer takes two to three seconds at
 * the hub, one turn to read the machines and one to say it; this fills the silence and is said first.
 */
const ON_IT = "Moment."
/** What Titan says when it pauses, and when it is back. */
const PAUSING = "Ich mache Pause."
const BACK = "Ich bin wieder da."

/** Whether the tab is in front, and so whether Titan may speak. */
function useTabInFront(): boolean {
  const [inFront, setInFront] = useState(() => typeof document === "undefined" || document.visibilityState === "visible")
  useEffect(() => {
    const update = () => setInFront(document.visibilityState === "visible")
    document.addEventListener("visibilitychange", update)
    return () => document.removeEventListener("visibilitychange", update)
  }, [])
  return inFront
}

const root = getRouteApi("__root__")

export const Route = createFileRoute("/assistant")({
  staticData: { nav: { title: "Titan", icon: SparklesIcon } },
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
  const { cards, briefing, question } = useShown()
  const inFront = useTabInFront()
  const [problem, setProblem] = useState<string>()
  /** What the speech recognition heard last, so the person sees what was asked. */
  const [heard, setHeard] = useState<string>()
  const greeted = useRef(false)
  /** Titan was started by a key or a click: from then on it may speak, and it listens for its name. */
  const [started, setStarted] = useState(false)
  const holding = useRef(false)
  /** Titan pauses: it listens for its name and the space bar, and says nothing. */
  const [paused, setPaused] = useState(false)
  // The handlers of the keys read the newest values without being bound again.
  const latest = useRef<{ state: VoiceState; panel: typeof panel; alarmed: ReadonlyArray<string>; person?: string; paused: boolean; mayTalk: boolean }>({
    state,
    panel,
    alarmed: [],
    paused: false,
    mayTalk: false,
  })
  latest.current.state = state
  latest.current.panel = panel
  latest.current.paused = paused

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

  // Answers are read aloud once Titan is started, while it does not pause and its tab is in front.
  const mayTalk = started && !paused && inFront
  latest.current.mayTalk = mayTalk
  useEffect(() => {
    setVoiceEnabled(mayTalk)
    return () => setVoiceEnabled(false)
  }, [mayTalk])

  const pause = () => {
    setPaused(true)
    setHeard(undefined)
    setProblem(undefined)
    void speak(PAUSING)
  }
  /** Ends a pause; false if Titan did not pause. */
  const resume = (saying = BACK) => {
    if (!latest.current.paused) return false
    setPaused(false)
    void speak(saying)
    return true
  }
  const actions = useRef({ pause, resume })
  actions.current = { pause, resume }

  // Titan speaks with the voice of Tom when its service runs (apps/titan-voice), else with the voice of
  // the system. What Titan says often is made at once and kept, so it sounds without waiting.
  useEffect(() => {
    let open = true
    void tomAvailable().then(async (available) => {
      if (!open || !available) return
      const voice = remembering(tom)
      setSentenceVoice(voice)
      for (const sentence of [AWAKE, greetingFor(undefined, [])]) {
        if (open) await voice.predict(sentence).catch(() => undefined)
      }
    })
    return () => {
      open = false
      setSentenceVoice(undefined)
    }
  }, [])

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
  /** Who stands in front of the camera, by name if the face is known. */
  const [person, setPerson] = useState<string>()
  const { alarmed, list } = useNewFaults((fault) => {
    setHeard(undefined)
    setProblem(undefined)
    // Before the start, in a pause or behind another tab, the fault is shown, not said.
    if (!latest.current.mayTalk) return
    if (!chatStatus.configured) return void speak(faultInWords(fault, latest.current.person))
    const briefing = faultBriefing(fault, latest.current.person)
    if (!askFollowUp(briefing)) latest.current.panel.ask(briefing)
  })
  latest.current.alarmed = alarmed
  latest.current.person = person

  // Someone steps in front of the camera: Titan greets them, by name if it knows the face, and says
  // straight away when machines stand still with an error. It does not talk over itself or a question.
  const presence = usePresence({
    enabled: started && !paused && inFront,
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

  // "Hey Titan": listens while Titan is started and does nothing else, so it never hears itself.
  const [wakeReady, setWakeReady] = useState(false)
  /** The last piece Titan recognised that was no call, shown a moment so the person sees what it heard. */
  const [overheard, setOverheard] = useState<string>()
  useEffect(() => {
    if (!overheard) return
    const timer = setTimeout(() => setOverheard(undefined), 4_000)
    return () => clearTimeout(timer)
  }, [overheard])
  useWakeWord({
    armed: started,
    enabled: started && inFront && state === "idle",
    onReady: setWakeReady,
    onHeard: (text) => setOverheard(text),
    onWake: () => {
      setProblem(undefined)
      setHeard(undefined)
      if (!resume(AWAKE)) void speak(AWAKE)
    },
    onQuestion: (question) => {
      setProblem(undefined)
      if (isPause(question)) return pause()
      setPaused(false)
      setHeard(question)
      void sayNext(ON_IT)
      if (!askFollowUp(question)) latest.current.panel.ask(question)
    },
    onProblem: setProblem,
  })

  useEffect(() => {
    const ask = (question: string) => {
      setProblem(undefined)
      void sayNext(ON_IT)
      if (!askFollowUp(question)) latest.current.panel.ask(question)
    }

    const start = () => {
      if (greeted.current) return false
      greeted.current = true
      // Titan says nothing of its own: the camera is open within a second, and its first words are the
      // greeting, by name. Without a camera it greets at once, without a name.
      setStarted(true)
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
      if (event.key.toLowerCase() === "p" && greeted.current && !latest.current.paused) {
        actions.current.pause()
        return
      }
      if (event.code !== "Space") return
      event.preventDefault()
      if (event.repeat || holding.current) return
      holding.current = true
      setProblem(undefined)
      if (start()) return
      if (actions.current.resume()) return
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

  const escalations = useMemo(() => list && escalationsOf(list), [list])

  // The key facts of the machines the answer names, two at most, in the order it names them.
  const named = useMemo(() => {
    if (!list || !briefing) return []
    const text = [briefing.summary, briefing.recommendation ?? "", ...briefing.facts.map((fact) => fact.title ?? "")].join(" ")
    return machinesNamed(text)
      .flatMap((name) => keyFactsOf(list, name) ?? [])
      .slice(0, 2) as Array<MachineFacts>
  }, [list, briefing])

  /** The one thing in focus: the question asked last and what its answer says and shows. */
  const focused = Boolean(heard) || cards.length > 0 || Boolean(briefing?.summary)

  // Everything that comes and goes stands in one line at the bottom, the most important first.
  const line =
    problem ??
    recognition ??
    (paused ? "Pause · „Hey Titan“ sagen oder die Leertaste drücken, um weiterzumachen." : undefined) ??
    (overheard && `Gehört: „${overheard}“`) ??
    (wakeReady ? "„Hey Titan“ sagen, oder die Leertaste halten und sprechen. P pausiert." : undefined)

  return (
    // The whole screen, over the app, dark. Before the start, and between questions, the cloud and the
    // greeting. Once started, the escalation in one slim line on top. With a question: the focus below
    // it, the cloud large and faint behind it, and at the bottom one line for what comes and goes.
    <div className="titan-night fixed inset-0 z-50 flex flex-col bg-black text-foreground">
      {started && escalations && <EscalationView escalations={escalations} />}
      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1">
        {/* With something in focus, the cloud steps back: large, faint and pulsing behind it, so
            Titan is still there and still shows whether it listens, thinks or speaks. */}
        {started && focused && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-50 motion-safe:duration-700">
            <Cloud
              state={state}
              alarm={alarmed.length > 0}
              className={`size-[min(95vh,95%)] motion-safe:animate-pulse ${paused ? "opacity-10" : "opacity-25"}`}
            />
          </div>
        )}
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden px-8 py-10 md:px-16">
          {started && focused ? (
            <FocusView briefing={briefing} cards={cards} machines={named} asked={asksToSee(question ?? heard)} thinking={state === "thinking"} />
          ) : (
            <div className="m-auto flex w-full max-w-3xl flex-col items-center gap-8 text-center">
              <Cloud state={state} alarm={alarmed.length > 0} className={`size-72 ${paused ? "opacity-30" : ""}`} />
              <h1 className="text-3xl font-light tracking-wide text-balance">{paused ? "Pause" : unbroken(greetingFor(person, alarmed))}</h1>
              {!started && (
                <p className="flex items-center gap-2 text-base text-muted-foreground">
                  <Kbd>Leertaste</Kbd> drücken oder klicken, um Titan zu starten.
                </p>
              )}
            </div>
          )}
        </main>
        </div>
      </div>
      {/* At the bottom, quiet: on the left what comes and goes, on the right what Titan understood,
          to check, until the answer stands. */}
      <footer className="flex h-12 shrink-0 items-center gap-6 px-8 text-sm text-muted-foreground">
        <p className="min-w-0 flex-1 truncate">{line}</p>
        {heard && !briefing?.summary && cards.length === 0 && <p className="max-w-[50%] truncate italic">„{heard}“</p>}
      </footer>
      <p className="sr-only" aria-live="polite">
        {paused ? "Pause." : said[state]}
      </p>
    </div>
  )
}

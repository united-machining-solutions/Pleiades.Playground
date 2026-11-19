import { createFileRoute } from "@tanstack/react-router"
import { Kbd } from "@pleiades/ui/components/kbd"
import { SparklesIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { openConversation } from "@/showcases/titan/conversation.ts"
import type { Conversation } from "@/showcases/titan/conversation.ts"
import "@/showcases/titan/titan.css"
import {
  canListen,
  closeMicrophone,
  closeSound,
  listen,
  onSoundProblem,
  openSound,
  remembering,
  sayNext,
  setSentenceVoice,
  setVoiceEnabled,
  speak,
  speakingAnswers,
  stopListening,
  stopSpeaking,
  useVoiceState,
} from "@/showcases/titan/voice/voice.ts"
import type { VoiceState } from "@/showcases/titan/voice/voice.ts"
import { gatewayVoice, speechAvailable } from "@/showcases/titan/voice/speech.ts"
import { faultBriefing, faultInWords, useNewFaults } from "@/showcases/titan/voice/faults.ts"
import { sharingCards, useShown } from "@/showcases/titan/voice/shown.ts"
import { loadRecognition } from "@/showcases/titan/voice/transcribe.ts"
import { AWAKE_MS, isPause, useWakeWord } from "@/showcases/titan/voice/wake.ts"
import { greetingFor } from "@/showcases/titan/voice/greeting.ts"
import { keyFactsOf, machinesNamed } from "@/showcases/titan/board.ts"
import type { MachineFacts } from "@/showcases/titan/board.ts"
import { escalationsOf } from "@/showcases/titan/escalation.ts"
import { EscalationView } from "@/showcases/titan/escalation-view.tsx"
import { FocusView } from "@/showcases/titan/focus-view.tsx"
import { asksToSee, unbroken } from "@/showcases/titan/words.ts"
import { Cloud } from "@/showcases/titan/voice/cloud.tsx"

// Titan: a dark panel with a cloud of points that greets, listens and speaks, and nothing else. It stands
// in the frame of the app like every other page, so the sidebar leads to it and away from it.
//
// - The first press of the space bar or a click starts Titan and greets: a browser speaks only after
//   a key or a click.
// - Then hold the space bar, speak, and let go, or say "Hey Titan" and the question: the question goes
//   to Titan's own conversation (showcases/titan/conversation.ts), and its answer is read aloud while
//   it arrives. A follow-up goes on in the same conversation.
// - Titan answers at once that it heard ("Moment."), and says that it looks something up when the
//   answer needs a tool: a spoken conversation bears a wait that is announced, not a silent one.
// - The space bar also interrupts: Titan falls silent and listens.
// - "Hey Titan, Pause" or the key P: Titan falls silent and says no fault, until "Hey Titan" or the
//   space bar wakes it again. It still shows a new fault.
// - Titan speaks only once it is started and only while its tab is in front: a tab left open in
//   the background stays silent.
// - The screen is dark and has one focus: the question asked last and its answer (titan/focus-view.tsx).
//   A new question clears what the one before showed. Beside it, once Titan was started, stands the
//   escalation (titan/escalation-view.tsx): red what stands, amber what to do before a machine fails.
//   Everything that comes and goes, what Titan heard, a problem, the pause, is one quiet line at the
//   bottom, so no text appears anywhere else.
// - The keys are Titan's while nothing is being typed: in the field of the chat or of the search, the
//   space bar and P are letters.
//
// Everything Titan hears and says goes through the gateway of the chat and nowhere else: the recording
// to its transcription model, the conversation to a chat model, the sentences to its speech model.
//
// The demo speaks German, so do the words of this page.

/** What Titan says when it is called by its name alone. */
const AWAKE = "Ja?"
/**
 * What Titan says as soon as a question was asked: before it is even recognised when the space bar was
 * held, so the person hears within a moment that Titan listens. The first sentence of the answer
 * follows a second or two later.
 */
const ON_IT = "Moment."
/** What Titan says when the answer needs a tool and the model said nothing before it called one. */
const LOOKING = "Ich schaue kurz nach."
/** Titan speaks of a new fault by itself at most this often. */
const FAULT_SAID_EVERY_MS = 60_000
/** The space bar held shorter than this was a tap, not a question: Titan does not answer it. */
const SHORTEST_QUESTION_MS = 600
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

export const Route = createFileRoute("/(showcases)/titan")({
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
  /** Titan's panel: a click on it starts Titan, a click elsewhere in the app does not. */
  const panel = useRef<HTMLDivElement>(null)
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
  /** When the space bar went down, to tell a question from a tap. */
  const heldSince = useRef(0)
  /** Titan pauses: it listens for its name and the space bar, and says nothing. */
  const [paused, setPaused] = useState(false)
  // The handlers of the keys read the newest values without being bound again.
  const latest = useRef<{ state: VoiceState; alarmed: ReadonlyArray<string>; paused: boolean; mayTalk: boolean }>({
    state,
    alarmed: [],
    paused: false,
    mayTalk: false,
  })
  latest.current.state = state
  latest.current.paused = paused

  // Titan's conversation, for as long as the screen is open: the voice reads its answers aloud, and the
  // screen shows what they say and draw.
  const conversation = useRef<Conversation | undefined>(undefined)
  useEffect(() => {
    const opened = openConversation({
      listeners: [speakingAnswers(), sharingCards()],
      onReading: () => void sayNext(LOOKING),
      onProblem: setProblem,
    })
    conversation.current = opened
    return () => {
      conversation.current = undefined
      opened.close()
    }
  }, [])
  /** Whether the gateway has a model to talk with; without one Titan says a fault itself. */
  const canAnswer = useRef(false)
  useEffect(() => {
    void fetch("/titan/api/turn")
      .then((answer) => (answer.ok ? (answer.json() as Promise<{ available?: boolean }>) : { available: false }))
      .then(({ available }) => {
        canAnswer.current = available === true
        if (!canAnswer.current) setProblem("Das Gateway hat kein Sprachmodell: Titan zeigt die Halle, antwortet aber nicht.")
      })
      .catch(() => undefined)
  }, [])

  // Titan listens with the transcription model of the gateway. Without one, a line at the bottom says so.
  const [recognition, setRecognition] = useState<string | undefined>()
  useEffect(() => {
    let open = true
    loadRecognition().catch((error: unknown) => open && setRecognition(error instanceof Error ? error.message : String(error)))
    return () => {
      open = false
    }
  }, [])

  // Answers are read aloud once Titan is started, while it does not pause and its tab is in front.
  const mayTalk = started && !paused && inFront
  latest.current.mayTalk = mayTalk
  useEffect(() => setVoiceEnabled(mayTalk), [mayTalk])
  // Behind another tab Titan falls silent at once; in a pause it still says that it pauses.
  useEffect(() => {
    if (!inFront) stopSpeaking()
  }, [inFront])
  // A browser that plays no sound says so in the line at the bottom, instead of Titan answering in silence.
  useEffect(() => {
    onSoundProblem((problem) => setProblem((shown) => (problem ?? (shown?.startsWith("Der Browser spielt keinen Ton") ? undefined : shown))))
    return () => onSoundProblem(undefined)
  }, [])
  // The page is left: nothing sounds on, and the microphone is let go.
  useEffect(
    () => () => {
      setVoiceEnabled(false)
      stopSpeaking()
      closeMicrophone()
      closeSound()
    },
    [],
  )

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

  // Titan speaks with the speech model of the gateway if it has one, else with a voice of this computer.
  // What Titan says often is made at once and kept, so it sounds without waiting.
  useEffect(() => {
    let open = true
    void speechAvailable().then(async (available) => {
      if (!open || !available) return
      const voice = remembering(gatewayVoice)
      setSentenceVoice(voice)
      for (const sentence of [ON_IT, AWAKE, LOOKING, greetingFor(undefined, [])]) {
        if (open) await voice.predict(sentence).catch(() => undefined)
      }
    })
    return () => {
      open = false
      setSentenceVoice(undefined)
    }
  }, [])

  // The cloud keeps an eye on the hall. A new fault turns it red at once, and Titan speaks first: it is
  // told what happened and says it in its own words. Without a language model, the page says the fault
  // itself.
  /** When Titan last spoke of a fault by itself. */
  const lastFaultSaid = useRef(0)
  /** What the space bar recorded is being recognised: the question is on its way. */
  const recognising = useRef(false)
  /** Someone speaks near the microphone, or that piece is being recognised: it may be a call or a question. */
  const overhearing = useRef(false)
  /** When "Hey Titan" was said alone: Titan waits for the question that follows. */
  const wokeAt = useRef(-Infinity)
  const { alarmed, list } = useNewFaults((fault) => {
    // Before the start, in a pause or behind another tab, the fault is shown, not said.
    if (!latest.current.mayTalk) return
    // A fault never talks over the person or over an answer. It is shown in the line on top and not said
    // while Titan listens, thinks or speaks, while the space bar is held or what it recorded is being
    // recognised, while someone speaks near the microphone, and while Titan waits for the question after
    // "Hey Titan". In a hall where faults come often Titan also says at most one a minute, or nobody
    // could ask it anything.
    if (latest.current.state !== "idle" || holding.current || recognising.current || overhearing.current) return
    if (performance.now() - wokeAt.current < AWAKE_MS) return
    if (performance.now() - lastFaultSaid.current < FAULT_SAID_EVERY_MS && lastFaultSaid.current > 0) return
    lastFaultSaid.current = performance.now()
    setHeard(undefined)
    setProblem(undefined)
    if (!canAnswer.current || !conversation.current) return void speak(faultInWords(fault, undefined))
    conversation.current.ask(faultBriefing(fault, undefined))
  })
  latest.current.alarmed = alarmed

  // Titan greets once when it is started, and says straight away when machines stand still with an error.
  useEffect(() => {
    if (started) void speak(greetingFor(undefined, latest.current.alarmed))
  }, [started])

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
    onBusy: (busy) => {
      overhearing.current = busy
    },
    onWake: () => {
      wokeAt.current = performance.now()
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
      conversation.current?.ask(question)
    },
    onProblem: setProblem,
  })

  useEffect(() => {
    const start = () => {
      // Every click and every press of the space bar opens the sound again: a browser allows it only then.
      openSound()
      if (greeted.current) return false
      greeted.current = true
      setStarted(true)
      return true
    }

    const onClick = () => void start()

    // The app around Titan has fields to type in: there a key is a letter, not Titan's.
    const typing = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : undefined
      return target !== undefined && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
    }

    // Nor is a key Titan's that the app already took, or that is pressed on one of the app's own
    // controls outside the panel: the space bar on a button presses that button, in a menu it chooses.
    // A link is not among them: the focus stays on the link in the sidebar that led here, and from
    // there the space bar starts Titan.
    const CONTROLS =
      "button,summary,[role=button],[role=menu],[role=menuitem],[role=listbox],[role=option],[role=dialog],[role=tab],[role=checkbox],[role=switch],[role=radio]"
    const elsewhere = (event: KeyboardEvent) =>
      event.defaultPrevented ||
      (event.target instanceof Element && !panel.current?.contains(event.target) && event.target.closest(CONTROLS) !== null)

    const onDown = (event: KeyboardEvent) => {
      if (typing(event) || elsewhere(event) || event.ctrlKey || event.metaKey || event.altKey) return
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
      // The space bar interrupts: an answer that is still arriving is given up, and Titan listens.
      conversation.current?.stop()
      heldSince.current = performance.now()
      recognising.current = true
      listen().then(
        (question) => {
          recognising.current = false
          if (!question) {
            setProblem("Ich habe nichts verstanden. Halte die Leertaste gedrückt, solange du sprichst.")
            return
          }
          setHeard(question)
          conversation.current?.ask(question)
        },
        (error: unknown) => {
          recognising.current = false
          setProblem(error instanceof Error ? error.message : String(error))
        },
      )
    }

    // The window lost the keyboard while the space bar was held: its release never arrives here, so the
    // recording ends now, as if the key were let go.
    const onBlur = () => {
      if (!holding.current) return
      holding.current = false
      stopListening()
    }

    const onUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return
      // A key that went down for Titan also comes up for it, wherever the focus is by then.
      if ((typing(event) || elsewhere(event)) && !holding.current) return
      event.preventDefault()
      const wasHolding = holding.current
      holding.current = false
      // Also before the microphone is ready: the recording then ends as soon as it begins.
      stopListening()
      // Titan says at once that it heard, while the question is still being recognised.
      if (wasHolding && latest.current.state === "listening" && performance.now() - heldSince.current >= SHORTEST_QUESTION_MS) void sayNext(ON_IT)
    }

    window.addEventListener("keydown", onDown)
    window.addEventListener("keyup", onUp)
    const element = panel.current
    element?.addEventListener("click", onClick)
    window.addEventListener("blur", onBlur)
    return () => {
      window.removeEventListener("blur", onBlur)
      window.removeEventListener("keydown", onDown)
      window.removeEventListener("keyup", onUp)
      element?.removeEventListener("click", onClick)
    }
  }, [])

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
    // A dark panel that fills the page, in the frame of the app: as high as the window below the bar of
    // the app, so nothing scrolls. Before the start, and between questions, the cloud and the
    // greeting. Once started, the escalation in one slim line on top. With a question: the focus below
    // it, the cloud large and faint behind it, and at the bottom one line for what comes and goes.
    <div ref={panel} className="titan-night relative flex h-[calc(100svh-6.5rem)] min-h-96 flex-col overflow-hidden rounded-xl bg-black text-foreground">
      {started && escalations && <EscalationView escalations={escalations} />}
      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1">
        {/* With something in focus, the cloud steps back: large, faint and pulsing behind it, so
            Titan is still there and still shows whether it listens, thinks or speaks. */}
        {started && focused && (
          <div className="pointer-events-none absolute inset-0 grid [container-type:size] place-items-center overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-50 motion-safe:duration-700">
            <Cloud
              state={state}
              alarm={alarmed.length > 0}
              className={`size-[95cqmin] motion-safe:animate-pulse ${paused ? "opacity-10" : "opacity-25"}`}
            />
          </div>
        )}
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden px-8 py-10 md:px-16">
          {started && focused ? (
            <FocusView briefing={briefing} cards={cards} machines={named} asked={asksToSee(question ?? heard)} thinking={state === "thinking"} />
          ) : (
            <div className="m-auto flex w-full max-w-3xl flex-col items-center gap-8 text-center">
              <Cloud state={state} alarm={alarmed.length > 0} className={`size-72 ${paused ? "opacity-30" : ""}`} />
              <h1 className="text-3xl font-light tracking-wide text-balance">{paused ? "Pause" : unbroken(greetingFor(undefined, alarmed))}</h1>
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

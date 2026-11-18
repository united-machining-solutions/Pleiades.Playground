import { createFileRoute, getRouteApi, useNavigate } from "@tanstack/react-router"
import type { State } from "@pleiades/cards/machine/contract.ts"
import { StateSymbol } from "@pleiades/cards/machine/state-symbol.tsx"
import { Alert, AlertDescription, AlertTitle } from "@pleiades/ui/components/alert"
import { Card, CardContent, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from "@pleiades/ui/components/item"
import { LightbulbIcon, SparklesIcon } from "lucide-react"
import { Fragment, useEffect, useRef, useState } from "react"

import { pickModel, useChatPanel } from "@/chat/ask.ts"
import {
  askFollowUp,
  canListen,
  listen,
  sayNext,
  setVoiceEnabled,
  speak,
  stopListening,
  stopSpeaking,
  useVoiceState,
} from "@/voice/voice.ts"
import type { VoiceState } from "@/voice/voice.ts"
import { faultBriefing, faultInWords, useNewFaults } from "@/voice/faults.ts"
import type { Fault } from "@/voice/faults.ts"
import type { Fact } from "@/voice/facts.ts"
import { useShown } from "@/voice/shown.ts"
import { loadRecognition } from "@/voice/transcribe.ts"
import { isPause, useWakeWord } from "@/voice/wake.ts"
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
// - "Hey Titan, Pause" or the key P: Titan falls silent, greets nobody and says no fault, until
//   "Hey Titan" or the space bar wakes it again. It still shows a new fault.
// - Titan speaks only once it is started and only while its tab is in front: a tab left open in
//   the background stays silent.
// - With an answer, the screen splits: Titan on the left with what it says, on the right what it
//   shows, black on white: its cards, and beside them the details of the answer, which are not
//   read aloud, and the hint.
// - Escape leaves the screen.
//
// The demo speaks German, so do the words of this page.

/** What Titan says when it is called by its name alone. */
const AWAKE = "Ja?"
/** What Titan says when it is started. */
const READY = "Titan ist bereit."
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
  const { cards, briefing } = useShown()
  /** With an answer to show, the screen splits. */
  const split = cards.length > 0 || (briefing?.facts.length ?? 0) > 0
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
  // The fault is over once its machine has no open error any more.
  useEffect(() => {
    if (alert && !alarmed.includes(alert.machine)) setAlert(undefined)
  }, [alert, alarmed])

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

  const line =
    problem ??
    recognition ??
    (paused ? "Pause · „Hey Titan“ sagen oder die Leertaste drücken, um weiterzumachen." : undefined) ??
    (overheard && `Gehört: „${overheard}“`) ??
    (wakeReady ? "Ich höre auf „Hey Titan“. „Hey Titan, Pause“ oder P pausiert." : undefined)

  return (
    // The whole screen, over the app: black, with the cloud and the greeting. With an answer to
    // show, it splits. On the left Titan, and under it what it says, like subtitles. On the right,
    // black on white, what it shows: the cards, and beside them, on a wide screen, the details and
    // the hint. What comes last is put beside or below, so it pushes nothing out of sight.
    <div className="fixed inset-0 z-50 flex flex-col bg-black md:flex-row">
      <div
        className={`relative flex min-h-0 shrink-0 flex-col items-center justify-center gap-8 px-6 py-10 text-center transition-all duration-500 ${split ? "md:w-2/5" : "flex-1"}`}
      >
        <div className={`flex items-center justify-center transition-all duration-500 ${paused ? "opacity-30" : ""} ${split ? "h-40 scale-[0.6]" : "h-72"}`}>
          <Cloud state={state} alarm={alarmed.length > 0} />
        </div>
        <div className="flex max-w-xl flex-col gap-5">
          {alert && (
            <p className="text-2xl font-light text-balance text-state-alarm" role="alert">
              {alert.machine} · {alert.title}
            </p>
          )}
          {split && briefing?.summary ? (
            <p className="text-2xl leading-snug font-light text-balance text-white/90 md:text-3xl">{briefing.summary}</p>
          ) : (
            !alert && (
              <h1 className="text-3xl font-light tracking-wide text-balance text-white/90">{paused ? "Pause" : greetingFor(person, alarmed)}</h1>
            )
          )}
          {split && briefing?.suggestion && (
            <p className="text-lg font-light text-balance text-white/60">
              <span className="mr-2 text-xs font-medium tracking-widest text-white/40 uppercase">Vorschlag</span>
              {briefing.suggestion}
            </p>
          )}
          {heard && !split && <p className="text-lg font-light text-balance text-white/60">„{heard}“</p>}
          {!started && <p className="text-base font-light text-white/50">Leertaste drücken oder klicken, um Titan zu starten.</p>}
        </div>
        {heard && split && <p className="absolute top-6 px-6 text-sm text-balance text-white/40">Frage: „{heard}“</p>}
        {line && <p className="absolute bottom-6 px-6 text-sm text-balance text-white/50">{line}</p>}
      </div>
      {split && (
        <aside className="min-h-0 flex-1 overflow-y-auto bg-background p-6 text-left text-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-8 md:p-8">
          {/* On a wide screen the details stand next to the cards, so everything is seen without scrolling. */}
          <div className={`grid items-start gap-5 ${cards.length > 0 ? "xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : "mx-auto max-w-3xl"}`}>
            {cards.length > 0 && (
              <div className="flex min-w-0 flex-col gap-5">
                {cards.map((card, index) => (
                  <div key={index} className="min-w-0 motion-safe:animate-in motion-safe:fade-in">
                    {card}
                  </div>
                ))}
              </div>
            )}
            {briefing && (briefing.facts.length > 0 || briefing.hint) && (
              <div className="flex min-w-0 flex-col gap-5 xl:sticky xl:top-0">
                {briefing.facts.length > 0 && <Details facts={briefing.facts} alarmed={alarmed} />}
                {briefing.hint && (
                  <Alert className="motion-safe:animate-in motion-safe:fade-in">
                    <LightbulbIcon />
                    <AlertTitle>Übrigens</AlertTitle>
                    <AlertDescription className="text-base">{briefing.hint}</AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </div>
        </aside>
      )}
      <p className="sr-only" aria-live="polite">
        {paused ? "Pause." : said[state]}
      </p>
    </div>
  )
}

/** The sign of a state the answer names in words, with the faults the page watches taking precedence. */
function stateOfFact(fact: Fact, alarmed: ReadonlyArray<string>): State | "warning" | undefined {
  if (fact.title && alarmed.includes(fact.title)) return "alarm"
  const word = fact.status?.toLowerCase() ?? ""
  if (/steht|alarm|störung|fehler/.test(word)) return "alarm"
  if (/warn/.test(word)) return "warning"
  if (/einricht|setup|rüst/.test(word)) return "setup"
  if (/pause|gestoppt|aus\b/.test(word)) return "stopped"
  if (/läuft|produziert|in betrieb/.test(word)) return "running"
  if (/keine daten|offline/.test(word)) return "no-data"
  return undefined
}

/**
 * The facts of an answer, so the eye finds what the ear could not keep: one row for each machine or
 * matter, with the sign of its state the app uses everywhere, the state in a word, since when, and
 * in one plain sentence what is going on. Built like the rows of the machines on Home.
 */
function Details({ facts, alarmed }: { facts: ReadonlyArray<Fact>; alarmed: ReadonlyArray<string> }) {
  return (
    <Card className="gap-0 py-0 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
      <CardHeader className="border-b py-4">
        <CardTitle>Im Detail</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <ItemGroup className="gap-0">
          {facts.map((fact, index) => {
            const sign = stateOfFact(fact, alarmed)
            return (
              <Fragment key={`${index}-${fact.title ?? ""}`}>
                {index > 0 && <ItemSeparator className="my-0" />}
                <Item className="items-start rounded-none px-6">
                  {sign && (
                    <ItemMedia className="pt-1">
                      <StateSymbol state={sign} label={fact.status} />
                    </ItemMedia>
                  )}
                  <ItemContent className="gap-1">
                    <ItemTitle className="text-base">
                      {fact.title}
                      {fact.title && fact.status && <span className="font-normal text-muted-foreground">·</span>}
                      {fact.status && <span className="font-normal">{fact.status}</span>}
                    </ItemTitle>
                    <ItemDescription className="line-clamp-none text-base text-foreground/80">{fact.text}</ItemDescription>
                    {fact.since && <p className="text-sm text-muted-foreground tabular-nums">{fact.since}</p>}
                  </ItemContent>
                </Item>
              </Fragment>
            )
          })}
        </ItemGroup>
      </CardContent>
    </Card>
  )
}

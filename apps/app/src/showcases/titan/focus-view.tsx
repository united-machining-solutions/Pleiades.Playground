import { StateSymbol } from "@pleiades/cards/machine/state-symbol.tsx"
import { Skeleton } from "@pleiades/ui/components/skeleton"
import { ArrowRightIcon } from "lucide-react"
import { useLayoutEffect, useRef, useState } from "react"
import type { ReactNode } from "react"

import type { Briefing } from "@/showcases/titan/voice/facts.ts"

import { splitHeadline } from "./board.ts"
import { unbroken } from "./words.ts"
import type { MachineFacts } from "./board.ts"

// The focus of Titan: one glance, one thing. The eye scans the whole screen, so the screen holds
// only what matters most, and the person asks for more:
//
// 1. The answer in one sentence, large.
// 2. What to do, in one line, once there is something to do.
// 3. Either the picture the person asked to see, a history or the hall, made to fit, or else the
//    hard facts of the machines the answer is about, from the values: since when, the cause, how far
//    the job got. Never both, and never a picture too small to read: the screen never scrolls.
// 5. Quiet, at the bottom: the question Titan offers next, so the person knows how to go deeper.
//
// Everything else Titan says aloud and does not write: the rest of the answer and the hint. The
// machines that need someone stand in the escalation beside it.

export type Focus = {
  briefing?: Briefing
  cards: ReadonlyArray<ReactNode>
  /** The machines the answer is about, with their key facts. */
  machines: ReadonlyArray<MachineFacts>
  /** The question asked to see something: then its card is shown instead of the facts. */
  asked: boolean
  thinking: boolean
}

export function FocusView({ briefing, cards, machines, asked, thinking }: Focus) {
  const [headline] = splitHeadline(briefing?.summary ?? "")
  const card = asked ? cards.at(-1) : undefined
  return (
    <article
      className={`mx-auto flex h-full w-full max-w-5xl flex-col gap-8 motion-safe:animate-in motion-safe:fade-in ${card ? "" : "justify-center"}`}
    >
      {headline ? (
        <h1 className="text-5xl leading-tight font-semibold tracking-tight text-balance">{unbroken(headline)}</h1>
      ) : (
        thinking && (
          <div className="flex flex-col gap-4" aria-label="Titan denkt nach">
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-12 w-1/2" />
          </div>
        )
      )}
      {briefing?.recommendation && (
        <p className="flex items-start gap-3 text-2xl text-balance text-foreground/90">
          <ArrowRightIcon className="mt-1.5 size-6 shrink-0 text-primary" aria-label="Empfehlung" />
          {unbroken(briefing.recommendation)}
        </p>
      )}
      {headline && !card && machines.length > 0 && (
        <div className="flex flex-col gap-6">
          {machines.map((one) => (
            <Facts key={one.name} machine={one} />
          ))}
        </div>
      )}
      {card && <Fit>{card}</Fit>}
      {briefing?.suggestion && <p className="text-lg text-muted-foreground">{unbroken(briefing.suggestion)}</p>}
    </article>
  )
}

/** The key facts of one machine in a row: what the person checks at a glance. */
function Facts({ machine }: { machine: MachineFacts }) {
  return (
    <section className="flex flex-col gap-3 border-t pt-5" aria-label={machine.name}>
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-widest text-muted-foreground uppercase">
        <StateSymbol state={machine.state} />
        {machine.name}
      </h2>
      <dl className="grid grid-cols-3 gap-10">
        {machine.facts.map((fact) => (
          <div key={fact.label} className="flex min-w-0 flex-col gap-1">
            <dt className="text-xs tracking-widest text-muted-foreground uppercase">{fact.label}</dt>
            <dd className="line-clamp-2 text-2xl leading-snug font-semibold text-balance">{fact.value}</dd>
            {fact.detail && <dd className="line-clamp-2 text-sm text-muted-foreground">{fact.detail}</dd>}
          </div>
        ))}
      </dl>
    </section>
  )
}

/** Smaller than this, a card cannot be read: it is not shown, and Titan says what it holds. */
const SMALLEST = 0.7
/** A card grows up to this, where the screen has the room. */
const LARGEST = 1.6

/** Its content, made to fill the room left, and smaller when it is taller: the screen never scrolls. */
function Fit({ children }: { children: ReactNode }) {
  const room = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const outer = room.current
    const inner = content.current
    if (!outer || !inner) return
    // As large as the room allows, in height and in width, so that it reads from a step away.
    const measure = () =>
      setScale(Math.min(LARGEST, outer.clientHeight / Math.max(1, inner.offsetHeight), outer.clientWidth / Math.max(1, inner.offsetWidth)))
    const observer = new ResizeObserver(measure)
    observer.observe(outer)
    observer.observe(inner)
    measure()
    return () => observer.disconnect()
  }, [])
  return (
    <div ref={room} className="min-h-0 flex-1 overflow-hidden">
      <div
        ref={content}
        className={`mx-auto max-w-3xl origin-top motion-safe:animate-in motion-safe:fade-in ${scale < SMALLEST ? "invisible" : ""}`}
        style={{ transform: scale !== 1 ? `scale(${scale})` : undefined }}
      >
        {children}
      </div>
    </div>
  )
}

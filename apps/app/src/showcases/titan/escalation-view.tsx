import { StateSymbol } from "@pleiades/cards/machine/state-symbol.tsx"

import { sinceInWords } from "./board.ts"
import type { Escalation, Escalations } from "./escalation.ts"
import { unbroken } from "./words.ts"

// The escalation of Titan: one slim line across the top of the screen, read at a glance. Red what
// stands, amber what to do before a machine fails, then quietly how many run as planned. Each machine
// is its name, what it reports in a few words and for how long; the details come when the person asks.
// A line, not a column: it takes only the room it needs, and the focus below keeps the whole width.

export function EscalationView({ escalations }: { escalations: Escalations }) {
  const { stops, risks, fine, asOf } = escalations
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-10 gap-y-3 border-b px-8 py-4 md:px-16 motion-safe:animate-in motion-safe:fade-in">
      {stops.length > 0 && <Level title="Stillstand" tone="text-state-alarm" entries={stops} asOf={asOf} />}
      {risks.length > 0 && <Level title="Vorbeugen" tone="text-state-warning" entries={risks} asOf={asOf} warning />}
      {fine > 0 && (
        <p className="flex items-center gap-2 text-base text-muted-foreground">
          <StateSymbol state="running" />
          {stops.length + risks.length === 0 ? "Alles läuft planmäßig" : `${fine} ${fine === 1 ? "läuft" : "laufen"} planmäßig`}
        </p>
      )}
    </header>
  )
}

function Level({
  title,
  tone,
  entries,
  asOf,
  warning = false,
}: {
  title: string
  tone: string
  entries: ReadonlyArray<Escalation>
  asOf: string
  warning?: boolean
}) {
  return (
    <section className="flex flex-wrap items-center gap-x-6 gap-y-2" aria-label={title}>
      <h2 className={`text-xs font-semibold tracking-widest uppercase ${tone}`}>{title}</h2>
      {entries.map((entry) => (
        <p key={entry.name} className="flex items-center gap-2 text-base">
          <StateSymbol state={warning ? "warning" : entry.state} label={title} />
          <span className="font-semibold">{entry.name}</span>
          <span className="text-muted-foreground">
            {unbroken(entry.what + (entry.since ? ` · ${sinceInWords(entry.since, asOf)}` : ""))}
          </span>
        </p>
      ))}
    </section>
  )
}

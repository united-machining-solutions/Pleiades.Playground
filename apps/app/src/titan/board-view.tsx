import type { State } from "@pleiades/cards/machine/contract.ts"
import { clock } from "@pleiades/cards/machine/format.ts"
import { StateSymbol } from "@pleiades/cards/machine/state-symbol.tsx"
import { Alert, AlertDescription, AlertTitle } from "@pleiades/ui/components/alert"
import { Badge } from "@pleiades/ui/components/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from "@pleiades/ui/components/item"
import { LightbulbIcon } from "lucide-react"
import { Fragment } from "react"
import type { ReactNode } from "react"

import { headlineOf, sinceInWords } from "./board.ts"
import type { Board, Issue } from "./board.ts"

// The right half of Titan's screen, black on white, built like a brief: the headline with the counts
// of the states, then where to act, then what runs as planned, then what the answer drew, if it drew
// something. What comes later in an answer is put further down, so nothing that stands moves.

/** The states in words, as an operator says them. */
const stateWord: Record<State, string> = {
  alarm: "Störung",
  stopped: "Steht",
  "no-data": "Keine Daten",
  setup: "Einrichten",
  running: "Produziert",
}

/** The counts of the states, worst first, without those that are zero. */
const COUNTED: ReadonlyArray<State> = ["alarm", "stopped", "no-data", "setup", "running"]

/** The colour of the edge of an issue: the colour of its state. */
const edge: Partial<Record<State, string>> = {
  alarm: "border-l-state-alarm",
  stopped: "border-l-state-stopped-edge",
  "no-data": "border-l-muted-foreground",
}

export function BoardView({ board, cards, hint }: { board: Board; cards: ReadonlyArray<ReactNode>; hint?: string }) {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium tracking-widest text-muted-foreground uppercase">Lage · Stand {clock(board.asOf)}</p>
        <h2 className="text-3xl font-semibold tracking-tight text-balance">{headlineOf(board)}</h2>
        <div className="flex flex-wrap gap-2">
          {COUNTED.filter((state) => board.counts[state] > 0).map((state) => (
            <Badge key={state} variant="outline" className="h-8 gap-2 px-3 text-sm">
              <StateSymbol state={state} />
              {board.counts[state]} {stateWord[state]}
            </Badge>
          ))}
        </div>
      </header>

      {board.issues.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle>Handlungsbedarf</SectionTitle>
          {board.issues.map((issue) => (
            <IssueCard key={issue.name} issue={issue} asOf={board.asOf} />
          ))}
        </section>
      )}

      {board.planned.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle>Planmäßig</SectionTitle>
          <Card className="gap-0 py-0">
            <ItemGroup className="gap-0">
              {board.planned.map((one, index) => (
                <Fragment key={one.name}>
                  {index > 0 && <ItemSeparator className="my-0" />}
                  <Item className="rounded-none px-6">
                    <ItemMedia>
                      <StateSymbol state={one.state} label={stateWord[one.state]} />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle className="text-base">
                        {one.name}
                        {one.model && <span className="font-normal text-muted-foreground">{one.model}</span>}
                      </ItemTitle>
                      <ItemDescription>{one.line}</ItemDescription>
                    </ItemContent>
                  </Item>
                </Fragment>
              ))}
            </ItemGroup>
          </Card>
        </section>
      )}

      {cards.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle>Ansicht</SectionTitle>
          {cards.map((card, index) => (
            <div key={index} className="min-w-0 motion-safe:animate-in motion-safe:fade-in">
              {card}
            </div>
          ))}
        </section>
      )}

      {hint && (
        <Alert>
          <LightbulbIcon />
          <AlertTitle>Übrigens</AlertTitle>
          <AlertDescription className="text-base">{hint}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-medium tracking-widest text-muted-foreground uppercase">{children}</h3>
}

/** One machine that needs someone: what is wrong, what it costs, what to do. */
function IssueCard({ issue, asOf }: { issue: Issue; asOf: string }) {
  const lasting = sinceInWords(issue.since, asOf)
  return (
    <Card className={`gap-4 border-l-4 motion-safe:animate-in motion-safe:fade-in ${edge[issue.state] ?? ""}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <StateSymbol state={issue.state} label={stateWord[issue.state]} />
          {issue.name}
          {issue.model && <span className="text-base font-normal text-muted-foreground">{issue.model}</span>}
        </CardTitle>
        <CardDescription>
          {stateWord[issue.state]}
          {issue.code && ` · ${issue.code}`}
        </CardDescription>
        {issue.since && (
          <CardAction className="text-right text-sm text-muted-foreground tabular-nums">
            seit {clock(issue.since)}
            {lasting && <div className="font-medium text-foreground">{lasting}</div>}
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2 text-base">
          <Row term="Problem">{issue.problem}</Row>
          {issue.impact && <Row term="Auswirkung">{issue.impact}</Row>}
          {issue.step && (
            <Row term="Nächster Schritt">
              <span className="font-semibold">{issue.step}</span>
            </Row>
          )}
        </dl>
      </CardContent>
    </Card>
  )
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{term}</dt>
      <dd>{children}</dd>
    </>
  )
}

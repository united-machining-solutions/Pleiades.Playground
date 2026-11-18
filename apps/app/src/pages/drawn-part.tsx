import { SearchXIcon, ServerOffIcon } from "lucide-react"
import { useEffect, useState } from "react"
import type { ReactNode } from "react"

import { chatTools } from "@/chat/cards.tsx"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@pleiades/ui/components/empty"

import { callPart } from "./call-part.ts"
import type { PartAnswer } from "./call-part.ts"
import { drawingTool, noCardFor } from "./parts.ts"
import type { RecipePart } from "./recipe.ts"

// The parts of a page, asked and drawn: what every route that shows a recipe takes, a stored page
// as much as one opened from a link. A part is drawn with the card the chat draws for its tool.

/** The time zone of this browser: a part gives the times of the clock of the person who opens it. */
const { timeZone } = Intl.DateTimeFormat().resolvedOptions()

/** A part with its answer: what the tool gave now, or why it gave nothing. */
export type AnsweredPart = RecipePart & { answer: PartAnswer }

/** A part that has been asked: its answer comes when the tool has given it. */
export type AskedPart = RecipePart & { answer: Promise<PartAnswer> }

/** One part, asked: a tool without a card is not asked, because the server of the app would refuse it too. */
function askPart(part: RecipePart): Promise<PartAnswer> {
  if (!drawingTool(part.tool, chatTools)) return Promise.resolve({ values: null, error: noCardFor(part.tool) })
  // If the server of the app itself is away for a moment, the part says so and the page keeps trying.
  return callPart({ data: { tool: part.tool, args: part.args, timeZone } }).catch(
    (error: unknown): PartAnswer => ({ values: null, error: String(error) }),
  )
}

/**
 * Asks every part of a recipe at the same time, for a loader, and does not wait for them: the page
 * stands at once and each part is drawn when its answer comes, so one slow part does not hold back
 * the others. Each part answers for itself: one without an answer leaves the others whole.
 */
export function askParts(parts: ReadonlyArray<RecipePart>): Array<AskedPart> {
  return parts.map((part) => ({ ...part, answer: askPart(part) }))
}

/** The parts that have answered so far, each by the asked part it belongs to. */
export function useAnswers(asked: ReadonlyArray<AskedPart>): ReadonlyMap<AskedPart, AnsweredPart> {
  const [answers, setAnswers] = useState<ReadonlyMap<AskedPart, AnsweredPart>>(new Map())
  useEffect(() => {
    let gone = false
    for (const part of asked) {
      void part.answer.then((answer) => {
        if (!gone) setAnswers((before) => new Map(before).set(part, { ...part, answer }))
      })
    }
    return () => {
      gone = true
    }
  }, [asked])
  return answers
}

/**
 * Whether a part waits for the backend: it has a card, the tool did not refuse, and no answer came.
 * The part says that the page keeps trying (`DrawnPart`), and the page asks again until it has one.
 */
export function waitsForBackend({ tool, answer }: AnsweredPart): boolean {
  return answer.values === null && !answer.refused && drawingTool(tool, chatTools) !== undefined
}

/**
 * One part: the card the chat draws for its tool, or what is missing. The tool of a part is the one
 * the recipe names, as in the chat the tool that was called: the values do not choose the card.
 */
export function DrawnPart({ part: { tool, answer } }: { part: AnsweredPart }) {
  const drawing = drawingTool(tool, chatTools)
  if (!drawing) return <NoPartAnswer icon={<SearchXIcon />} title="This part has no answer here" reason={noCardFor(tool)} />
  // The tool answered and said no, for these arguments or this machine: asking again does not change it.
  if (answer.values === null && answer.refused) {
    return <NoPartAnswer icon={<SearchXIcon />} title="This part has no answer here" reason={answer.error} />
  }
  if (answer.values === null) {
    // The words of NoAnswer (components/no-answer.tsx), which the other pages show in their place.
    return (
      <NoPartAnswer
        icon={<ServerOffIcon />}
        title="No answer from the backend"
        reason={`${answer.error} This page keeps trying.`}
      />
    )
  }
  const drawn = drawing.draw?.(answer.values)
  if (drawn === null || drawn === undefined) {
    return (
      <NoPartAnswer
        icon={<SearchXIcon />}
        title="This part has no answer here"
        reason={`${tool} answered with values its card cannot draw.`}
      />
    )
  }
  return drawn
}

/** A part without an answer, among the cards: the empty state with the outline of the docs of Empty. */
function NoPartAnswer({ icon, title, reason }: { icon: ReactNode; title: string; reason: string }) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{reason}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

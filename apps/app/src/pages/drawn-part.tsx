import { SearchXIcon, ServerOffIcon } from "lucide-react"
import type { ReactNode } from "react"

import { chatTools } from "@/chat/cards.tsx"
import type { Answer } from "@/machines/get-machines.ts"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@pleiades/ui/components/empty"

import { callPart } from "./call-part.ts"
import { drawingTool, noCardFor } from "./parts.ts"
import type { RecipePart } from "./recipe.ts"

// The parts of a page, asked and drawn: what every route that shows a recipe takes, a stored page
// as much as one opened from a link. A part is drawn with the card the chat draws for its tool.

/** The time zone of this browser: a part gives the times of the clock of the person who opens it. */
const { timeZone } = Intl.DateTimeFormat().resolvedOptions()

/** A part with its answer: what the tool gave now, or why it gave nothing. */
export type AnsweredPart = RecipePart & { answer: Answer<string> }

/**
 * Asks every part of a recipe at the same time, for a loader. Each part answers for itself: one
 * without an answer leaves the others whole. A tool without a card is not asked, because the
 * server of the app would refuse it too.
 */
export function answerParts(parts: ReadonlyArray<RecipePart>): Promise<Array<AnsweredPart>> {
  return Promise.all(
    parts.map(async (part): Promise<AnsweredPart> => {
      if (!drawingTool(part.tool, chatTools)) return { ...part, answer: { values: null, error: noCardFor(part.tool) } }
      // If the server of the app itself is away for a moment, the part says so and the page keeps trying.
      const answer = await callPart({ data: { tool: part.tool, args: part.args, timeZone } }).catch(
        (error: unknown): Answer<string> => ({ values: null, error: String(error) }),
      )
      return { ...part, answer }
    }),
  )
}

/**
 * One part: the card the chat draws for its tool, or what is missing. The tool of a part is the one
 * the recipe names, as in the chat the tool that was called: the values do not choose the card.
 */
export function DrawnPart({ part: { tool, answer } }: { part: AnsweredPart }) {
  const drawing = drawingTool(tool, chatTools)
  if (!drawing) return <NoPartAnswer icon={<SearchXIcon />} title="This part has no answer here" reason={noCardFor(tool)} />
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

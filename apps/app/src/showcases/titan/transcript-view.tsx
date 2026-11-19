import type { UIMessage } from "@tanstack/ai-react"
import { Bubble, BubbleContent } from "@pleiades/ui/components/bubble"
import { Message, MessageContent } from "@pleiades/ui/components/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@pleiades/ui/components/message-scroller"
import { Skeleton } from "@pleiades/ui/components/skeleton"

import { Answer } from "@/chat/answer.tsx"
import { blocksOf } from "@/chat/blocks.ts"
import type { Block } from "@/chat/blocks.ts"
import { chatTools } from "@/chat/cards.tsx"

import { textOf } from "./conversation.ts"
import type { Message as Said } from "./conversation.ts"
import type { Transcript } from "./transcript.ts"
import { isFromTheHall } from "./transcript.ts"

// The conversation with Titan, to read and to scroll through: each question as the person asked it, and
// under it the answer, its words and the cards its tools gave, drawn as the chat of the app draws them
// (chat/cards.tsx) and in the same components. A new question settles near the top and its answer grows
// under it; everything before it stays above, a scroll away.

/**
 * What an answer shows: its words and its cards. The parts have the shape the chat draws
 * (conversation.ts). The steps of the tools are not listed: Titan says that it looks something up, and
 * the card shows what it found.
 */
function shownOf(message: Said, live: boolean): Array<Block> {
  return blocksOf(message.parts as unknown as UIMessage["parts"], live, chatTools).filter((block) => block.kind !== "steps")
}

export function TranscriptView({ transcript }: { transcript: Transcript }) {
  const { messages, isLoading } = transcript
  const last = messages.at(-1)
  // Until the answer shows anything, two lines stand where it will be: also while a tool runs before
  // the first word, since the steps of the tools are not listed.
  const waiting = isLoading && (last?.role === "user" || (last !== undefined && shownOf(last, true).length === 0))
  return (
    <MessageScrollerProvider defaultScrollPosition="last-anchor">
      <MessageScroller>
        <MessageScrollerViewport>
          <MessageScrollerContent aria-busy={isLoading} className="mx-auto w-full max-w-3xl gap-6 p-6">
            {messages.map((message) => {
              if (message.role === "user") {
                // What the hall told Titan is not shown as a question: its answer says what happened.
                if (isFromTheHall(message)) {
                  return (
                    <MessageScrollerItem key={message.id} messageId={message.id} scrollAnchor>
                      <p className="text-center text-sm text-muted-foreground">Meldung aus der Halle</p>
                    </MessageScrollerItem>
                  )
                }
                return (
                  <MessageScrollerItem key={message.id} messageId={message.id} scrollAnchor>
                    <Message align="end">
                      <MessageContent>
                        <Bubble align="end" variant="muted">
                          <BubbleContent>{textOf(message)}</BubbleContent>
                        </Bubble>
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                )
              }
              const blocks = shownOf(message, isLoading && message === last)
              if (blocks.length === 0) return null
              return (
                // A card draws its edge as a ring around itself: one pixel of room keeps that edge.
                <MessageScrollerItem key={message.id} messageId={message.id} className="p-px">
                  <Message>
                    <MessageContent className="gap-3 text-lg">
                      {blocks.map((block, index) => (block.kind === "text" ? <Answer key={index} text={block.text} /> : block.kind === "drawn" ? <div key={index}>{block.node}</div> : null))}
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              )
            })}
            {waiting && (
              <MessageScrollerItem messageId="waiting" className="p-px">
                <div className="flex flex-col gap-3" aria-label="Titan denkt nach">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-5 w-1/2" />
                </div>
              </MessageScrollerItem>
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}

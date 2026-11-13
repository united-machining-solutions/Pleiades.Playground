import { Alert, AlertAction, AlertDescription, AlertTitle } from "@pleiades/ui/components/alert"
import { Badge } from "@pleiades/ui/components/badge"
import { Button } from "@pleiades/ui/components/button"
import { Card, CardContent, CardHeader } from "@pleiades/ui/components/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@pleiades/ui/components/empty"
import { Item, ItemContent, ItemMedia } from "@pleiades/ui/components/item"
import { Progress, ProgressLabel, ProgressValue } from "@pleiades/ui/components/progress"
import { Skeleton } from "@pleiades/ui/components/skeleton"
import { Spinner } from "@pleiades/ui/components/spinner"
import { toast } from "@pleiades/ui/components/toast"
import { CircleAlertIcon, FactoryIcon, InfoIcon, MessageCircleIcon, ServerOffIcon } from "lucide-react"

import { Block, Example, Examples, Section } from "@/block.tsx"

/** One toast for each kind the component draws a sign for, as a machine of the demo would cause it. */
const kinds = [
  { name: "Plain", toast: { description: "The values were read again at 09:30." } },
  { name: "Success", toast: { type: "success", title: "P-04 runs again", description: "Error 2130 has gone." } },
  { name: "Info", toast: { type: "info", title: "M-02 is in setup", description: "Since 08:48." } },
  {
    name: "Warning",
    toast: { type: "warning", title: "P-07 has a warning", description: "Warning 3310, Coolant pressure below minimum" },
  },
  {
    name: "Error",
    toast: {
      type: "error",
      title: "P-04 is in alarm",
      description: "Error 2130, Spindle overtemperature, machine stopped",
      // An error interrupts a screen reader; the other kinds wait their turn.
      priority: "high",
    },
  },
] as const

function withAction() {
  const id = toast.add({
    title: "Chat deleted",
    description: "Why is P-04 in alarm?",
    actionProps: {
      children: "Undo",
      onClick() {
        toast.close(id)
        toast.add({ description: "The chat is back." })
      },
    },
  })
}

function whileItWorks() {
  toast.promise(
    new Promise<{ hours: number }>((resolve) => {
      window.setTimeout(() => resolve({ hours: 8 }), 2000)
    }),
    {
      loading: "Reading the history of P-04…",
      success: (history) => `The last ${history.hours} hours of P-04 are read.`,
      error: "The history of P-04 could not be read.",
    },
  )
}

export function Feedback() {
  return (
    <Section id="feedback" line="How the interface answers: what happened, what is going on, and what is not there.">
      <Block
        name="Alert"
        file="alert"
        line="A message that stays on the page, next to what it is about. For something that just happened and passes, take a toast."
      >
        <Examples>
          <Example title="Typical: with a sign" className="items-start">
            <Alert>
              <InfoIcon />
              <AlertTitle>The chat has no language model</AlertTitle>
              <AlertDescription>
                Set ANTHROPIC_API_KEY, OPENAI_API_KEY or LLM_BASE_URL and start the app again. Everything else works
                without one.
              </AlertDescription>
            </Alert>
          </Example>
          <Example title="Destructive: something went wrong" className="items-start">
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertTitle>No answer from the backend</AlertTitle>
              <AlertDescription>The generative UI backend did not answer. This page keeps trying.</AlertDescription>
            </Alert>
          </Example>
          <Example title="With an action" className="items-start">
            <Alert>
              <AlertTitle>P-04 sent no data for 18 minutes</AlertTitle>
              <AlertDescription>Between 03:40 and 03:58 its state is not known.</AlertDescription>
              <AlertAction>
                <Button size="xs" variant="outline">
                  Ask why
                </Button>
              </AlertAction>
            </Alert>
          </Example>
          <Example title="A title alone" className="items-start">
            <Alert>
              <AlertTitle>The times on this page are those of your clock.</AlertTitle>
            </Alert>
          </Example>
        </Examples>
      </Block>

      <Block
        name="Toast"
        file="toast"
        line="A short message about something that just happened. It appears in the corner and goes by itself. An application has one Toaster at its root, and any code calls toast.add."
      >
        <Example title="Press one: each kind has its sign">
          {kinds.map((kind) => (
            <Button key={kind.name} variant="outline" onClick={() => toast.add(kind.toast)}>
              {kind.name}
            </Button>
          ))}
        </Example>
        <Examples>
          <Example title="With an action that takes it back">
            <Button variant="outline" onClick={withAction}>
              Delete a chat
            </Button>
          </Example>
          <Example title="While something works: loading, then the result">
            <Button variant="outline" onClick={whileItWorks}>
              Read the history
            </Button>
          </Example>
        </Examples>
      </Block>

      <Block
        name="Progress"
        file="progress"
        line="How far a task has come. Not for a measurement in its range: that is Meter."
      >
        <Examples>
          <Example title="Typical: with a label and its value" className="items-start">
            <Progress value={62} className="w-full">
              <ProgressLabel>Reading the history of P-04</ProgressLabel>
              <ProgressValue />
            </Progress>
          </Example>
          <Example title="Not started, and done" className="flex-col items-stretch gap-6">
            <Progress value={0}>
              <ProgressLabel>Reading the history of P-07</ProgressLabel>
              <ProgressValue />
            </Progress>
            <Progress value={100}>
              <ProgressLabel>Reading the history of M-02</ProgressLabel>
              <ProgressValue />
            </Progress>
          </Example>
          <Example title="Without a visible label: it still needs a name" className="items-start">
            <Progress value={62} aria-label="Reading the history of P-04" className="w-full" />
          </Example>
        </Examples>
      </Block>

      <Block name="Spinner" file="spinner" line="Something is going on and it is not known how far it has come. In a button it says that the press was taken.">
        <Examples>
          <Example title="Sizes: as in a badge, as everywhere, as in an empty state">
            <Spinner className="size-3" />
            <Spinner />
            <Spinner className="size-6" />
          </Example>
          <Example title="In a button and in a badge">
            <Button variant="outline" disabled>
              <Spinner data-icon="inline-start" />
              Asking
            </Button>
            <Badge variant="secondary">
              <Spinner data-icon="inline-start" />
              Reading
            </Badge>
          </Example>
        </Examples>
      </Block>

      <Block
        name="Skeleton"
        file="skeleton"
        line="The place of content that is on its way, in the shape it will have, so the page does not jump when it arrives."
      >
        <Examples>
          <Example title="For a card" className="items-start">
            <Card size="sm" className="w-full">
              <CardHeader>
                <Skeleton className="h-5 w-16" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-full rounded-sm" />
              </CardContent>
            </Card>
          </Example>
          <Example title="For a row" className="items-start">
            <Item variant="outline" className="w-full">
              <ItemMedia>
                <Skeleton className="size-4 rounded-full" />
              </ItemMedia>
              <ItemContent>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-2/3" />
              </ItemContent>
            </Item>
          </Example>
        </Examples>
      </Block>

      <Block
        name="Empty"
        file="empty"
        line="Says that nothing is there, why, and what to do about it, in the place where the content would be."
      >
        <Examples>
          <Example title="Typical: with the way out">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessageCircleIcon />
                </EmptyMedia>
                <EmptyTitle>No chat yet</EmptyTitle>
                <EmptyDescription>Ask about a machine, or ask why from a machine that needs you.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button>New chat</Button>
              </EmptyContent>
            </Empty>
          </Example>
          <Example title="With an outline, and nothing to do but wait">
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ServerOffIcon />
                </EmptyMedia>
                <EmptyTitle>No answer from the backend</EmptyTitle>
                <EmptyDescription>The generative UI backend did not answer. This page keeps trying.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </Example>
          <Example title="While it loads">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Spinner />
                </EmptyMedia>
                <EmptyTitle>Reading the machines</EmptyTitle>
              </EmptyHeader>
            </Empty>
          </Example>
          <Example title="A list without entries">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FactoryIcon />
                </EmptyMedia>
                <EmptyTitle>No machines</EmptyTitle>
                <EmptyDescription>No machine has published a value in the last 24 hours.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </Example>
        </Examples>
      </Block>
    </Section>
  )
}

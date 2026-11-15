import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@pleiades/ui/components/attachment"
import { Avatar, AvatarFallback } from "@pleiades/ui/components/avatar"
import { Bubble, BubbleContent, BubbleGroup, BubbleReactions } from "@pleiades/ui/components/bubble"
import { Button } from "@pleiades/ui/components/button"
import { Marker, MarkerContent, MarkerIcon } from "@pleiades/ui/components/marker"
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageGroup,
  MessageHeader,
} from "@pleiades/ui/components/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@pleiades/ui/components/message-scroller"
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireInput,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSkip,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "@pleiades/ui/components/questionnaire"
import { Spinner } from "@pleiades/ui/components/spinner"
import { toast } from "@pleiades/ui/components/toast"
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@pleiades/ui/components/trace"
import {
  ArrowUpRightIcon,
  BotIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleIcon,
  ClockIcon,
  CopyIcon,
  FileSpreadsheetIcon,
  FileWarningIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  ThumbsUpIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react"
import type { FormEvent } from "react"

import { Block, Example, Examples, Section } from "@/block.tsx"

// A chat about a machine, as the example app has one: a person asks, the assistant calls a tool
// of the generative UI backend and answers with what it read. The words of the tool are those
// its result carries for a reader that does not see the card.

const bubbleVariants = ["default", "secondary", "muted", "tinted", "outline", "ghost", "destructive"] as const

const whenToTake: Record<(typeof bubbleVariants)[number], string> = {
  default: "What the person wrote.",
  secondary: "What someone else wrote.",
  muted: "An answer of the assistant.",
  tinted: "A quieter turn of the person.",
  outline: "A turn that stands apart.",
  ghost: "An answer without a frame, as a text.",
  destructive: "A turn that failed.",
}

const attachmentStates = [
  { state: "idle", icon: <ClockIcon />, line: "Ready to send" },
  { state: "uploading", icon: <Spinner />, line: "Sending · 64 %" },
  { state: "processing", icon: <Spinner />, line: "Reading the rows" },
  { state: "error", icon: <FileWarningIcon />, line: "Could not be read" },
  { state: "done", icon: <FileSpreadsheetIcon />, line: "CSV · 4 kB" },
] as const

const questions = [
  {
    name: "machine",
    required: true,
    prompt: "Which machine do you mean?",
    description: "Two machines ran SHAFT_4711.MPF this morning.",
    choices: [
      { value: "P-04", label: "P-04", description: "In alarm since 09:02" },
      { value: "M-02", label: "M-02", description: "In setup since 08:48" },
    ],
    input: { label: "Another machine", placeholder: "Another serial number" },
  },
  {
    name: "hours",
    required: false,
    prompt: "How far back?",
    description: "Skip this to take the last 8 hours.",
    choices: [
      { value: "1", label: "Last hour" },
      { value: "8", label: "Last 8 hours" },
      { value: "24", label: "Last 24 hours" },
    ],
  },
] as const

function answer(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  const answers = new FormData(event.currentTarget)
  toast.add({
    title: "Answered",
    description: `${String(answers.get("machine") ?? "No machine")}, ${String(answers.get("hours") ?? "8")} h`,
  })
}

function Assistant() {
  return (
    <MessageAvatar>
      <Avatar>
        <AvatarFallback>
          <BotIcon className="size-4" aria-label="Assistant" />
        </AvatarFallback>
      </Avatar>
    </MessageAvatar>
  )
}

export function Conversation() {
  return (
    <Section
      id="conversation"
      line="The parts of a chat: the thread that scrolls, a turn, its surface, a file, a note between turns, what the assistant did, and a question it asks back."
    >
      <Block
        name="Message scroller"
        file="message-scroller"
        line="The thread. It follows a new answer while it arrives, keeps the place of a reader who scrolled up, and offers the way back to the end. Never a scroll box of your own."
      >
        <Example title="A thread in a box of a set height: scroll up, and the button to the end appears" className="p-0">
          <div className="flex h-96 w-full flex-col">
            <MessageScrollerProvider autoScroll>
              <MessageScroller>
                <MessageScrollerViewport>
                  <MessageScrollerContent className="p-6">
                    <MessageScrollerItem messageId="today">
                      <Marker variant="separator">
                        <MarkerContent>Today</MarkerContent>
                      </Marker>
                    </MessageScrollerItem>
                    <MessageScrollerItem messageId="question" scrollAnchor>
                      <Message align="end">
                        <MessageContent>
                          <Bubble>
                            <BubbleContent>Why is P-04 in alarm?</BubbleContent>
                          </Bubble>
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                    <MessageScrollerItem messageId="tools">
                      <Trace>
                        <TraceCollapsible>
                          <TraceCollapsibleTrigger>
                            <TraceLine>
                              <TraceIcon>
                                <WrenchIcon />
                              </TraceIcon>
                              <TraceTitle>Read the machine card of P-04</TraceTitle>
                              <TraceDescription>0.4 s</TraceDescription>
                            </TraceLine>
                          </TraceCollapsibleTrigger>
                          <TraceCollapsibleContent className="text-sm">
                            P-04: Alarm since 09:02, 28 min. Spindle overtemperature, machine stopped (Error 2130).
                            Program SHAFT_4711.MPF.
                          </TraceCollapsibleContent>
                        </TraceCollapsible>
                      </Trace>
                    </MessageScrollerItem>
                    <MessageScrollerItem messageId="answer">
                      <Message>
                        <Assistant />
                        <MessageContent>
                          <Bubble variant="muted">
                            <BubbleContent>
                              P-04 stopped at 09:02 with Error 2130, Spindle overtemperature. Before that it ran
                              SHAFT_4711.MPF for 20 minutes. The error is still open, so the machine stays in alarm.
                            </BubbleContent>
                          </Bubble>
                          <MessageFooter>
                            <Button variant="ghost" size="icon-xs" aria-label="Copy the answer" title="Copy">
                              <CopyIcon />
                            </Button>
                          </MessageFooter>
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                    <MessageScrollerItem messageId="file" scrollAnchor>
                      <Message align="end">
                        <MessageContent>
                          <Attachment>
                            <AttachmentMedia>
                              <FileSpreadsheetIcon />
                            </AttachmentMedia>
                            <AttachmentContent>
                              <AttachmentTitle>bearing-temperature-p04.csv</AttachmentTitle>
                              <AttachmentDescription>CSV · 4 kB</AttachmentDescription>
                            </AttachmentContent>
                          </Attachment>
                          <Bubble>
                            <BubbleContent>This is what the control logged. Did the bearing run hot before?</BubbleContent>
                          </Bubble>
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                    <MessageScrollerItem messageId="reading">
                      <Trace>
                        <TraceLine status="running">
                          <TraceIcon>
                            <LoaderCircleIcon className="animate-spin" />
                          </TraceIcon>
                          <TraceTitle>Reading bearing-temperature-p04.csv</TraceTitle>
                        </TraceLine>
                      </Trace>
                    </MessageScrollerItem>
                  </MessageScrollerContent>
                </MessageScrollerViewport>
                <MessageScrollerButton />
              </MessageScroller>
            </MessageScrollerProvider>
          </div>
        </Example>
      </Block>

      <Block
        name="Message"
        file="message"
        line="One turn: who, what, and what belongs under it. The side says whose it is: the person's own turn stands at the end."
      >
        <Examples>
          <Example title="With an avatar, a header and a footer" className="items-start">
            <Message>
              <Assistant />
              <MessageContent>
                <MessageHeader>Assistant</MessageHeader>
                <Bubble variant="muted">
                  <BubbleContent>M-02 is in setup since 08:48.</BubbleContent>
                </Bubble>
                <MessageFooter>09:30</MessageFooter>
              </MessageContent>
            </Message>
          </Example>
          <Example title="The person's own turns, grouped, with one that failed" className="items-start">
            <MessageGroup className="w-full">
              <Message align="end">
                <MessageContent>
                  <Bubble>
                    <BubbleContent>And P-07?</BubbleContent>
                  </Bubble>
                </MessageContent>
              </Message>
              <Message align="end">
                <MessageContent>
                  <Bubble>
                    <BubbleContent>Does its warning matter?</BubbleContent>
                  </Bubble>
                  <MessageFooter className="gap-2">
                    <span className="font-normal text-destructive">Not sent</span>
                    <Button variant="ghost" size="icon-xs" aria-label="Send again" title="Send again">
                      <RefreshCwIcon />
                    </Button>
                  </MessageFooter>
                </MessageContent>
              </Message>
            </MessageGroup>
          </Example>
        </Examples>
      </Block>

      <Block name="Bubble" file="bubble" line="The surface of a turn. It is as wide as its text, up to four fifths of the thread.">
        <Example title="Variants, each with when to take it" className="flex-col items-stretch">
          {bubbleVariants.map((variant) => (
            <div key={variant} className="flex items-center gap-4">
              <code className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{variant}</code>
              <Bubble variant={variant}>
                <BubbleContent>{whenToTake[variant]}</BubbleContent>
              </Bubble>
            </div>
          ))}
        </Example>
        <Examples>
          <Example title="Several in a row, and a long one" className="items-start">
            <BubbleGroup className="w-full">
              <Bubble variant="muted">
                <BubbleContent>P-07 runs HOUSING_0815.MPF since 07:15.</BubbleContent>
              </Bubble>
              <Bubble variant="muted">
                <BubbleContent>
                  It has an open warning, Warning 3310, Coolant pressure below minimum, raised at 09:11. A warning
                  leaves a running machine running: it shows as a sign on the machine, not as a state.
                </BubbleContent>
              </Bubble>
            </BubbleGroup>
          </Example>
          <Example title="With a reaction, at the end" className="items-start pb-10">
            <Bubble align="end" className="ml-auto">
              <BubbleContent>That explains the stop at 08:20.</BubbleContent>
              <BubbleReactions role="img" aria-label="Reactions: 2 thumbs up">
                <ThumbsUpIcon className="size-3.5" />
                <span className="text-xs">2</span>
              </BubbleReactions>
            </Bubble>
          </Example>
        </Examples>
      </Block>

      <Block name="Attachment" file="attachment" line="A file in a chat, with where it stands on its way: chosen, on its way, read, or failed.">
        <Examples>
          <Example title="Its states, from chosen to done" className="flex-col items-stretch">
            {attachmentStates.map((one) => (
              <Attachment key={one.state} state={one.state} className="w-full">
                <AttachmentMedia>{one.icon}</AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>bearing-temperature-p04.csv</AttachmentTitle>
                  <AttachmentDescription>{one.line}</AttachmentDescription>
                </AttachmentContent>
                <AttachmentActions>
                  <AttachmentAction aria-label="Remove bearing-temperature-p04.csv">
                    <XIcon />
                  </AttachmentAction>
                </AttachmentActions>
              </Attachment>
            ))}
          </Example>
          <Example title="Sizes: default, sm, xs" className="flex-col items-start">
            {(["default", "sm", "xs"] as const).map((size) => (
              <Attachment key={size} size={size}>
                <AttachmentMedia>
                  <FileSpreadsheetIcon />
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>bearing-temperature-p04.csv</AttachmentTitle>
                  <AttachmentDescription>CSV · 4 kB</AttachmentDescription>
                </AttachmentContent>
              </Attachment>
            ))}
          </Example>
        </Examples>
        <Example title="Many in a row that scrolls sideways. The whole of one opens what it leads to." className="items-start">
          <AttachmentGroup className="w-full">
            {["bearing-temperature-p04.csv", "active-power-p04.csv", "notifications-p04.csv", "states-p04.csv", "program-shaft-4711.mpf"].map(
              (file) => (
                <Attachment key={file}>
                  <AttachmentMedia>
                    <FileSpreadsheetIcon />
                  </AttachmentMedia>
                  <AttachmentContent>
                    <AttachmentTitle>{file}</AttachmentTitle>
                    <AttachmentDescription>4 kB</AttachmentDescription>
                  </AttachmentContent>
                  <AttachmentTrigger render={<a href="#attachment" />} aria-label={`Open ${file}`} />
                </Attachment>
              ),
            )}
          </AttachmentGroup>
        </Example>
      </Block>

      <Block name="Marker" file="marker" line="A note between turns: a day, something that happened, a boundary. Not what the assistant did: that is Trace.">
        <Example title="As a line of its own, with a sign, as a separator, with a border, and while something goes on" className="flex-col items-stretch gap-6">
          <Marker>
            <MarkerContent>The chat was started from the page of P-04.</MarkerContent>
          </Marker>
          <Marker>
            <MarkerIcon>
              <CircleCheckIcon />
            </MarkerIcon>
            <MarkerContent>P-04 runs again since 09:41.</MarkerContent>
          </Marker>
          <Marker variant="separator">
            <MarkerContent>Today</MarkerContent>
          </Marker>
          <Marker variant="border">
            <MarkerContent>Answers below this line come from another model.</MarkerContent>
          </Marker>
          <Marker role="status">
            <MarkerIcon>
              <Spinner />
            </MarkerIcon>
            <MarkerContent className="shimmer">Waiting for the backend</MarkerContent>
          </Marker>
        </Example>
      </Block>

      <Block
        name="Trace"
        file="trace"
        line="What the assistant did or is doing, one line a step: a tool it called, a file it read. A line may open to show its detail."
      >
        <Examples>
          <Example title="The states of a step: done, failed, running, not started" className="items-start">
            <Trace>
              <TraceLine>
                <TraceIcon>
                  <CircleCheckIcon />
                </TraceIcon>
                <TraceTitle>Read the list of machines</TraceTitle>
                <TraceDescription>3 machines</TraceDescription>
              </TraceLine>
              <TraceLine status="error">
                <TraceIcon>
                  <CircleAlertIcon />
                </TraceIcon>
                <TraceTitle>Failed to read the machine card of P-09</TraceTitle>
              </TraceLine>
              <TraceLine status="running">
                <TraceIcon>
                  <LoaderCircleIcon className="animate-spin" />
                </TraceIcon>
                <TraceTitle>Reading the machine card of P-04</TraceTitle>
              </TraceLine>
              <TraceLine status="pending">
                <TraceIcon>
                  <CircleIcon />
                </TraceIcon>
                <TraceTitle>Read the notifications of P-04</TraceTitle>
              </TraceLine>
            </Trace>
          </Example>
          <Example title="A step that opens, and one that leads somewhere" className="items-start">
            <Trace>
              <TraceCollapsible defaultOpen>
                <TraceCollapsibleTrigger>
                  <TraceLine>
                    <TraceIcon>
                      <WrenchIcon />
                    </TraceIcon>
                    <TraceTitle>Read the machine card of P-07</TraceTitle>
                    <TraceDescription>0.3 s</TraceDescription>
                  </TraceLine>
                </TraceCollapsibleTrigger>
                <TraceCollapsibleContent className="text-sm">
                  P-07: Running since 07:15, 2 h 15 min. Program HOUSING_0815.MPF.
                </TraceCollapsibleContent>
              </TraceCollapsible>
              <a href="#built-from-these">
                <TraceLine>
                  <TraceIcon>
                    <WrenchIcon />
                  </TraceIcon>
                  <TraceTitle>Drew the machine card of P-07</TraceTitle>
                  <TraceIcon>
                    <ArrowUpRightIcon />
                  </TraceIcon>
                </TraceLine>
              </a>
            </Trace>
          </Example>
        </Examples>
      </Block>

      <Block
        name="Questionnaire"
        file="questionnaire"
        line="A question the assistant asks back before it goes on, one at a time, with choices and room for another answer."
      >
        <Example title="Two questions: the first must be answered, the second may be skipped" className="items-start">
          <Questionnaire items={questions} onSubmit={answer} className="max-w-md">
            <QuestionnaireProgress />
            {questions.map((question) => (
              <QuestionnaireItem key={question.name} name={question.name} required={question.required}>
                <QuestionnaireTitle>{question.prompt}</QuestionnaireTitle>
                <QuestionnaireDescription>{question.description}</QuestionnaireDescription>
                <QuestionnaireChoices>
                  {question.choices.map((choice) => (
                    <QuestionnaireChoice key={choice.value} value={choice.value}>
                      <span className="font-medium">{choice.label}</span>
                      {"description" in choice && (
                        <QuestionnaireChoiceDescription>{choice.description}</QuestionnaireChoiceDescription>
                      )}
                    </QuestionnaireChoice>
                  ))}
                  {"input" in question && (
                    <QuestionnaireInput aria-label={question.input.label} placeholder={question.input.placeholder} />
                  )}
                </QuestionnaireChoices>
                <QuestionnaireError />
              </QuestionnaireItem>
            ))}
            <QuestionnaireActions>
              <QuestionnairePrevious />
              <QuestionnaireSkip />
              <QuestionnaireNext />
              <QuestionnaireSubmit />
            </QuestionnaireActions>
          </Questionnaire>
        </Example>
      </Block>
    </Section>
  )
}

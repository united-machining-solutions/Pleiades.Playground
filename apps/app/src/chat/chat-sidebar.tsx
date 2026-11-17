import { createHarnessClient } from "@tanstack/ai-harness/client"
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react"
import { Link, getRouteApi, useRouter } from "@tanstack/react-router"
import {
  ArrowUpIcon,
  BotOffIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  LoaderCircleIcon,
  MessageCircleDashedIcon,
  PlusIcon,
  SquareIcon,
  XIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { FormEvent, KeyboardEvent } from "react"

import { Alert, AlertDescription, AlertTitle } from "@pleiades/ui/components/alert"
import { Bubble, BubbleContent } from "@pleiades/ui/components/bubble"
import { Button } from "@pleiades/ui/components/button"
import { CodeBlock, CodeBlockContent } from "@pleiades/ui/components/code-block"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@pleiades/ui/components/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@pleiades/ui/components/empty"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@pleiades/ui/components/input-group"
import { Message, MessageContent } from "@pleiades/ui/components/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@pleiades/ui/components/message-scroller"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@pleiades/ui/components/sidebar"
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@pleiades/ui/components/trace"

import { Answer } from "./answer.tsx"
import { NEW_CHAT, pickModel, pickedModel, rememberThread, takeFirstQuestion, useChatPanel } from "./ask.ts"
import { blocksOf, questionOf, thinkingLine } from "./blocks.ts"
import type { Block, Call, CallState } from "./blocks.ts"
import { chatTools } from "./cards.tsx"
import { DictateButton } from "./dictate.tsx"
import { chooseChatModel, fetchChatModel } from "./status.ts"
import { suggestions } from "./suggestions.ts"
import { toolLabel } from "./tool-results.ts"

const root = getRouteApi("__root__")
const { timeZone } = Intl.DateTimeFormat().resolvedOptions()

/**
 * Everything about the chat lives in this panel on the right, after the shadcn block sidebar-15:
 * the chat itself, "New chat" and the chats so far. Without it the app is complete; it only loses
 * the chat.
 *
 * It never covers the page. It stands next to it, and where the two do not fit side by side it
 * takes the lower half of the screen.
 */
export function ChatSidebar({ chat }: { chat: string }) {
  const { chatStatus } = root.useLoaderData()
  const panel = useChatPanel()
  return (
    <Sidebar
      side="right"
      collapsible="none"
      aria-label="Chat"
      className="sticky top-0 h-svh w-[clamp(20rem,36vw,28rem)] shrink-0 border-l max-lg:top-auto max-lg:bottom-0 max-lg:h-[50svh] max-lg:w-full max-lg:border-t max-lg:border-l-0"
    >
      <SidebarHeader className="h-14 flex-row items-center justify-between border-b">
        <span className="px-2 font-medium">Chat</span>
        <div className="flex items-center gap-1">
          {chatStatus.configured && chat !== NEW_CHAT && (
            <Button variant="ghost" size="sm" onClick={panel.startNew}>
              <PlusIcon data-icon="inline-start" />
              New chat
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" aria-label="Close the chat" onClick={panel.close}>
            <XIcon />
          </Button>
        </div>
      </SidebarHeader>
      {!chatStatus.configured ? (
        <NoLanguageModel />
      ) : chat === NEW_CHAT ? (
        <Start />
      ) : (
        // The key gives every chat its own state.
        <Conversation key={chat} threadId={chat} />
      )}
    </Sidebar>
  )
}

function NoLanguageModel() {
  const { chatStatus } = root.useLoaderData()
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <BotOffIcon />
        </EmptyMedia>
        <EmptyTitle>No language model configured</EmptyTitle>
        <EmptyDescription>
          {/* What is missing first, by the names of the settings. */}
          {chatStatus.gaps.map((gap) => `${gap}. `)}
          Set <code>LLM_BASE_URL</code> and <code>LLM_API_KEY</code> of a LiteLLM gateway in <code>.env</code>{" "}
          and start the app again with <code>docker compose up -d app</code>. Home needs no language model.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

/** The panel before a chat: the chats so far, and questions to begin with above the field. */
function Start() {
  const { chats, chatStatus } = root.useLoaderData()
  const panel = useChatPanel()
  // The next chat begins with the model picked here.
  const [model, setModel] = useState(() => pickedModel(chatStatus.models))
  const choose = (name: string) => {
    pickModel(name)
    setModel(name)
  }
  return (
    <>
      <SidebarContent>
        {chats.length > 0 ? (
          <SidebarGroup>
            <SidebarGroupLabel>Chats</SidebarGroupLabel>
            <SidebarMenu>
              {chats.map((entry) => (
                <SidebarMenuItem key={entry.threadId}>
                  <SidebarMenuButton render={<Link to="." search={{ chat: entry.threadId }} />}>
                    <span>{entry.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ) : (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageCircleDashedIcon />
              </EmptyMedia>
              <EmptyTitle>No chats yet</EmptyTitle>
              <EmptyDescription>Ask what the machines do, or begin with one of the questions below.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </SidebarContent>
      <Composer
        placeholder="Ask about the machines"
        suggestions={suggestions}
        onSend={panel.ask}
        models={chatStatus.models}
        model={model}
        onModel={choose}
        dictation={chatStatus.dictation}
      />
    </>
  )
}

function Conversation({ threadId }: { threadId: string }) {
  const router = useRouter()
  const { chats, chatStatus } = root.useLoaderData()
  const titled = chats.some((entry) => entry.threadId === threadId && entry.titled)
  const { messages, sendMessage, isLoading, error, stop } = useChat({
    threadId,
    connection: fetchServerSentEvents("/api/harness/run"),
    persistence: true,
    // The time zone of this browser goes along with every question, so the answer gives the
    // times the person's clock shows.
    forwardedProps: { timeZone },
  })
  const [model, setModel] = useState(() => pickedModel(chatStatus.models))
  const [switchError, setSwitchError] = useState<string>()
  const switchTo = (name: string) =>
    chooseChatModel(threadId, name).then(
      () => setSwitchError(undefined),
      (problem: unknown) => setSwitchError(problem instanceof Error ? problem.message : String(problem)),
    )
  const choose = (name: string) => {
    pickModel(name)
    setModel(name)
    void switchTo(name)
  }
  // Stop ends the answer twice: `stop` of the chat stops reading it, and the harness cancels the turn
  // on the server. Without that the model goes on writing, the server keeps the whole answer, and the
  // next question waits until it is done. When the server refuses the cancel, the chat says so with its
  // reason, which is true both when the turn goes on and when it had just ended; the next question
  // takes the alert away.
  const [stopError, setStopError] = useState<string>()
  const halt = () => {
    stop()
    createHarnessClient({ url: "/api/harness", threadId })
      .cancel()
      .then(
        (receipt) => setStopError(receipt.status === "rejected" ? receipt.reason : undefined),
        (problem: unknown) => setStopError(problem instanceof Error ? problem.message : String(problem)),
      )
  }

  useEffect(() => {
    rememberThread(threadId)
    let current = true
    void (async () => {
      // In development React runs this effect twice and cleans up the first run at once
      // (StrictMode). `useChat` detaches then and cuts off a stream the first run had started, so
      // the question stood in the chat and no answer came. Waiting one tick lets only the run that
      // stays take the question.
      await Promise.resolve()
      if (!current) return
      const first = takeFirstQuestion(threadId)
      if (first) {
        // A question asked anywhere in the app opens this chat and is its first message. The chat
        // begins with the model picked last; the first model answers without being picked.
        if (model !== undefined && model !== chatStatus.models[0]) await switchTo(model)
        void sendMessage(first)
      } else {
        // A chat from before keeps the model it picked.
        setModel((await fetchChatModel(threadId)) ?? chatStatus.models[0])
      }
    })()
    return () => {
      current = false
    }
    // Only when the chat opens, whatever the other values are on later renders.
  }, [threadId])

  // After its first turn the chat exists on the server. Name it after its first question, so the
  // list of chats can show it, and read that list again.
  const firstQuestion = messages
    .find((message) => message.role === "user")
    ?.parts.find((part) => part.type === "text")?.content
  useEffect(() => {
    if (isLoading || !firstQuestion || titled) return
    void fetch("/api/harness/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "rename", threadId, title: firstQuestion.slice(0, 80) }),
    }).then(() => router.invalidate())
  }, [isLoading, firstQuestion, titled, threadId, router])

  // Where the running line "Thinking" stands while nothing in the answer moves, if anywhere.
  const thinking = thinkingLine(messages, isLoading, chatTools)

  return (
    <>
      <div className="min-h-0 flex-1">
        {/* A new question settles near the top and the answer grows under it; a chat from before
            opens at its last question. */}
        <MessageScrollerProvider autoScroll defaultScrollPosition="last-anchor">
          <MessageScroller>
            <MessageScrollerViewport>
              <MessageScrollerContent aria-busy={isLoading} className="gap-6 p-4">
                {messages.map((message) => {
                  if (message.role === "user") {
                    return (
                      <MessageScrollerItem key={message.id} messageId={message.id} scrollAnchor>
                        <Message align="end">
                          <MessageContent>
                            <Bubble align="end" variant="muted">
                              <BubbleContent>{questionOf(message.parts)}</BubbleContent>
                            </Bubble>
                          </MessageContent>
                        </Message>
                      </MessageScrollerItem>
                    )
                  }
                  const blocks = blocksOf(message.parts, isLoading && message === messages.at(-1), chatTools)
                  // An answer that has nothing to show yet takes no room.
                  if (blocks.length === 0) return null
                  return (
                    // An item paints nothing outside its box, and a card draws its edge as a ring
                    // around itself: one pixel of room keeps that edge.
                    <MessageScrollerItem key={message.id} messageId={message.id} className="p-px">
                      <Message>
                        <MessageContent className="gap-3">
                          {blocks.map((block, index) => (
                            <AnswerBlock
                              key={index}
                              block={block}
                              thinking={
                                thinking === "in-answer" && message === messages.at(-1) && index === blocks.length - 1
                              }
                            />
                          ))}
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  )
                })}
                {/* Until the answer shows anything, the running line stands on its own where the
                    answer will be: with the pixel of room an answer has, so the first step takes
                    its place without a shift. */}
                {thinking === "apart" && (
                  <MessageScrollerItem messageId="thinking" className="p-px">
                    <Message>
                      <MessageContent>
                        <Trace>
                          <ThinkingLine />
                        </Trace>
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                )}
                {error && (
                  <MessageScrollerItem messageId="error">
                    <Alert>
                      <CircleAlertIcon />
                      <AlertTitle>The language model did not answer</AlertTitle>
                      <AlertDescription>{error.message}</AlertDescription>
                    </Alert>
                  </MessageScrollerItem>
                )}
                {switchError && (
                  <MessageScrollerItem messageId="switch-error">
                    <Alert>
                      <CircleAlertIcon />
                      <AlertTitle>The model was not changed</AlertTitle>
                      <AlertDescription>{switchError}</AlertDescription>
                    </Alert>
                  </MessageScrollerItem>
                )}
                {stopError && (
                  <MessageScrollerItem messageId="stop-error">
                    <Alert>
                      <CircleAlertIcon />
                      <AlertTitle>Stopping did not reach the server</AlertTitle>
                      <AlertDescription>{stopError}</AlertDescription>
                    </Alert>
                  </MessageScrollerItem>
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
      </div>
      <Composer
        placeholder={messages.length === 0 ? "Ask about the machines" : "Ask a follow-up"}
        busy={isLoading}
        onSend={(question) => {
          setStopError(undefined)
          void sendMessage(question)
        }}
        onStop={halt}
        models={chatStatus.models}
        model={model}
        onModel={choose}
        dictation={chatStatus.dictation}
      />
    </>
  )
}

const callIcon: Record<CallState, typeof CircleCheckIcon> = {
  running: LoaderCircleIcon,
  done: CircleCheckIcon,
  failed: CircleAlertIcon,
}

/**
 * One tool call, after the shadcn pattern Tool: a line while it runs, and a line that opens to what
 * the tool gave back, or why it failed, once its result is there.
 */
function CallLine({ call }: { call: Call }) {
  const Icon = callIcon[call.state]
  const line = (
    <TraceLine status={call.state === "running" ? "running" : call.state === "failed" ? "error" : undefined}>
      <TraceIcon>
        <Icon className={call.state === "running" ? "animate-spin" : undefined} />
      </TraceIcon>
      <TraceTitle>{toolLabel(call.name, chatTools)[call.state]}</TraceTitle>
    </TraceLine>
  )
  if (call.output === undefined) return line
  // The output is data of the stack, shown whole and unfiltered: the chat has no sign-in, so whoever
  // reaches it may read what the tools read. `wrap` and `max-h-64` bound the box, not the text; a
  // closed step costs nothing, because the panel of Base UI mounts its children only while open
  // (`keepMounted` is off by default).
  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        <CodeBlock size="sm">
          <CodeBlockContent wrap className="max-h-64">
            {call.output}
          </CodeBlockContent>
        </CodeBlock>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  )
}

/**
 * The running line "Thinking": an answer is coming and nothing in it moves (`thinkingLine` in
 * blocks.ts). Its title shimmers, as every running line of a Trace does.
 */
function ThinkingLine() {
  return (
    <TraceLine status="running">
      <TraceIcon>
        <LoaderCircleIcon className="animate-spin" />
      </TraceIcon>
      <TraceTitle>Thinking</TraceTitle>
    </TraceLine>
  )
}

/**
 * One block of an answer: the tool calls of a stretch, a text, or what a card draws for a result.
 * `thinking` puts the running line "Thinking" under it: under the last step, in the same Trace, or
 * in a Trace of its own under a card.
 */
function AnswerBlock({ block, thinking = false }: { block: Block; thinking?: boolean }) {
  switch (block.kind) {
    case "steps":
      return (
        <Trace>
          {block.calls.map((call) => (
            <CallLine key={call.id} call={call} />
          ))}
          {thinking && <ThinkingLine />}
        </Trace>
      )
    case "text":
      return <Answer text={block.text} />
    // What the card of a tool draws for its result: a card, a list. The chat names no card.
    case "drawn":
      return thinking ? (
        <>
          {block.node}
          <Trace>
            <ThinkingLine />
          </Trace>
        </>
      ) : (
        block.node
      )
  }
}

/**
 * Where a question is written. With more than one model in the settings it also says which model
 * answers and lets the chat pick another one, after the shadcn pattern "Model Selector". At the
 * start of the panel the questions to begin with stand above it, after the pattern "Suggestion".
 * With a model for speech in the settings, a question can also be spoken into it (dictate.tsx).
 * While an answer comes, send is stop, after the pattern "Prompt Input": what came so far stays.
 */
function Composer({
  placeholder,
  suggestions: questions = [],
  busy = false,
  onSend,
  onStop,
  models,
  model,
  onModel,
  dictation,
}: {
  placeholder: string
  suggestions?: ReadonlyArray<string>
  busy?: boolean
  onSend: (question: string) => void
  onStop?: () => void
  models: ReadonlyArray<string>
  model: string | undefined
  onModel: (name: string) => void
  dictation: boolean
}) {
  const [text, setText] = useState("")
  const field = useRef<HTMLTextAreaElement>(null)
  // What was said comes after what is written, and the cursor waits behind it.
  const dictated = (words: string) => {
    setText((written) => (written.trim() === "" ? words : `${written.trimEnd()} ${words}`))
    field.current?.focus()
  }
  const send = () => {
    const question = text.trim()
    if (question === "" || busy) return
    setText("")
    onSend(question)
  }
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    send()
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      send()
    }
  }
  const choice = models.length > 1 && model !== undefined
  // One button that sends, and stops the answer while it comes: the same element, so that it keeps
  // the focus when it turns from one into the other.
  const stoppable = busy && onStop !== undefined
  return (
    <SidebarFooter className="border-t">
      {questions.length > 0 && (
        <div className="flex scroll-fade-x scrollbar-none gap-2 overflow-x-auto overscroll-x-contain">
          {questions.map((question) => (
            <Button key={question} variant="outline" size="sm" className="shrink-0" onClick={() => onSend(question)}>
              {question}
            </Button>
          ))}
        </div>
      )}
      <form onSubmit={onSubmit}>
        <InputGroup className="bg-background">
          <InputGroupTextarea
            ref={field}
            rows={1}
            aria-label="Message"
            placeholder={placeholder}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
          />
          {/* With a choice of models the field gets a second line: the model on the left, dictation
              and send on the right. */}
          <InputGroupAddon align={choice ? "block-end" : "inline-end"}>
            {choice && (
              <DropdownMenu>
                <DropdownMenuTrigger render={<InputGroupButton variant="ghost" aria-label={`Model: ${model}`} />}>
                  {model}
                  <ChevronDownIcon data-icon="inline-end" />
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" className="w-auto min-w-48">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Model</DropdownMenuLabel>
                    <DropdownMenuRadioGroup value={model} onValueChange={(name) => onModel(String(name))}>
                      {models.map((name) => (
                        <DropdownMenuRadioItem key={name} value={name} closeOnClick>
                          {name}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {dictation && <DictateButton className={choice ? "ml-auto" : undefined} onText={dictated} />}
            <InputGroupButton
              type={stoppable ? "button" : "submit"}
              variant="default"
              size="icon-sm"
              className={choice && !dictation ? "ml-auto" : undefined}
              aria-label={stoppable ? "Stop" : "Send"}
              disabled={busy && !stoppable}
              onClick={stoppable ? onStop : undefined}
            >
              {stoppable ? <SquareIcon /> : <ArrowUpIcon />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </SidebarFooter>
  )
}

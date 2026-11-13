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
  XIcon,
} from "lucide-react"
import { useEffect, useState } from "react"
import type { FormEvent, KeyboardEvent } from "react"

import { Alert, AlertDescription, AlertTitle } from "@pleiades/ui/components/alert"
import { Bubble, BubbleContent } from "@pleiades/ui/components/bubble"
import { Button } from "@pleiades/ui/components/button"
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
import { Trace, TraceIcon, TraceLine, TraceTitle } from "@pleiades/ui/components/trace"

import { Answer } from "./answer.tsx"
import { NEW_CHAT, pickModel, pickedModel, rememberThread, takeFirstQuestion, useChatPanel } from "./ask.ts"
import { blocksOf, questionOf } from "./blocks.ts"
import type { Block, CallState } from "./blocks.ts"
import { chatTools } from "./cards.tsx"
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
          Set one block in <code>.env</code> and start the app again with <code>docker compose up -d app</code>:{" "}
          <code>ANTHROPIC_API_KEY</code> with <code>ANTHROPIC_MODELS</code>, <code>OPENAI_API_KEY</code> with{" "}
          <code>OPENAI_MODELS</code>, or <code>LLM_BASE_URL</code> with <code>LLM_MODELS</code> for any
          OpenAI-compatible endpoint. Home needs no language model.
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
      />
    </>
  )
}

function Conversation({ threadId }: { threadId: string }) {
  const router = useRouter()
  const { chats, chatStatus } = root.useLoaderData()
  const titled = chats.some((entry) => entry.threadId === threadId && entry.titled)
  const { messages, sendMessage, isLoading, error } = useChat({
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

  useEffect(() => {
    rememberThread(threadId)
    const first = takeFirstQuestion(threadId)
    void (async () => {
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
                            <AnswerBlock key={index} block={block} />
                          ))}
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  )
                })}
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
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
      </div>
      <Composer
        placeholder={messages.length === 0 ? "Ask about the machines" : "Ask a follow-up"}
        busy={isLoading}
        onSend={(question) => void sendMessage(question)}
        models={chatStatus.models}
        model={model}
        onModel={choose}
      />
    </>
  )
}

const callIcon: Record<CallState, typeof CircleCheckIcon> = {
  running: LoaderCircleIcon,
  done: CircleCheckIcon,
  failed: CircleAlertIcon,
}

/** One block of an answer: the tool calls of a stretch, a text, or what a card draws for a result. */
function AnswerBlock({ block }: { block: Block }) {
  switch (block.kind) {
    case "steps":
      return (
        <Trace>
          {block.calls.map((call) => {
            const Icon = callIcon[call.state]
            return (
              <TraceLine
                key={call.id}
                status={call.state === "running" ? "running" : call.state === "failed" ? "error" : undefined}
              >
                <TraceIcon>
                  <Icon className={call.state === "running" ? "animate-spin" : undefined} />
                </TraceIcon>
                <TraceTitle>{toolLabel(call.name, chatTools)[call.state]}</TraceTitle>
              </TraceLine>
            )
          })}
        </Trace>
      )
    case "text":
      return <Answer text={block.text} />
    // What the card of a tool draws for its result: a card, a list. The chat names no card.
    case "drawn":
      return block.node
  }
}

/**
 * Where a question is written. With more than one model in the settings it also says which model
 * answers and lets the chat pick another one, after the shadcn pattern "Model Selector". At the
 * start of the panel the questions to begin with stand above it, after the pattern "Suggestion".
 */
function Composer({
  placeholder,
  suggestions: questions = [],
  busy = false,
  onSend,
  models,
  model,
  onModel,
}: {
  placeholder: string
  suggestions?: ReadonlyArray<string>
  busy?: boolean
  onSend: (question: string) => void
  models: ReadonlyArray<string>
  model: string | undefined
  onModel: (name: string) => void
}) {
  const [text, setText] = useState("")
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
            rows={1}
            aria-label="Message"
            placeholder={placeholder}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
          />
          {/* With a choice of models the field gets a second line: the model on the left, send on the right. */}
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
            <InputGroupButton
              type="submit"
              variant="default"
              size="icon-sm"
              className={choice ? "ml-auto" : undefined}
              aria-label="Send"
              disabled={busy}
            >
              <ArrowUpIcon />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </SidebarFooter>
  )
}

import { createHarnessClient } from "@tanstack/ai-harness/client"
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react"
import { Link, getRouteApi, useRouter } from "@tanstack/react-router"
import {
  ArrowUpIcon,
  BotOffIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  LoaderCircleIcon,
  MessageCircleDashedIcon,
  PlusIcon,
  SlashIcon,
  SquareIcon,
  XIcon,
} from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import type { FormEvent, KeyboardEvent, ReactNode } from "react"

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
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@pleiades/ui/components/item"
import { Message, MessageContent } from "@pleiades/ui/components/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
} from "@pleiades/ui/components/message-scroller"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@pleiades/ui/components/sidebar"
import { ScrollArea } from "@pleiades/ui/components/scroll-area"
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@pleiades/ui/components/trace"

import { commandsFor, completion, matching, readTyped, stepped, toolCommand, usage } from "@/opcua/commands.ts"
import type { ChatCommand } from "@/opcua/commands.ts"
import { keepOfAnswer } from "@/pages/from-answer.ts"

import { Answer } from "./answer.tsx"
import {
  CHAT_LIST,
  NEW_CHAT,
  afterSwitch,
  markPress,
  peekFirstQuestion,
  pickModel,
  pickSwitchedOff,
  pickedModel,
  pickedSwitchedOff,
  rememberThread,
  takeFirstQuestion,
  takePress,
  useChatPanel,
} from "./ask.ts"
import { blocksOf, questionOf, thinkingLine } from "./blocks.ts"
import type { Block, Call, CallState } from "./blocks.ts"
import { chatTools } from "./cards.tsx"
import { UNNAMED_CHAT, chatName, nameOfQuestion } from "./chat-name.ts"
import { DictateButton } from "./dictate.tsx"
import { SaveAsPage } from "./save-as-page.tsx"
import type { ListedServer } from "./server-list.ts"
import { chooseChatModel, fetchChatSettings, getChatServers, switchChatServer } from "./status.ts"
import { suggestions } from "./suggestions.ts"
import { forModel, toolLabel } from "./tool-results.ts"
import { ToolsMenu } from "./tools-menu.tsx"

const root = getRouteApi("__root__")
const { timeZone } = Intl.DateTimeFormat().resolvedOptions()

/**
 * Everything about the chat lives in this panel on the right, after the shadcn block sidebar-15:
 * the list of the chats and the chat itself. It works like a chat app on a phone, a list and a
 * chat with a way back: in a chat the head says what the chat is called and leads back to the list.
 * "New chat" in the head begins a new one, and so does the field at the foot of the list. Without the
 * panel the app is complete; it only loses the chat.
 *
 * It never covers the page. It stands next to it, and where the two do not fit side by side it
 * takes the lower half of the screen.
 */
export function ChatSidebar({ chat }: { chat: string }) {
  const { chatStatus } = root.useLoaderData()
  return (
    <Sidebar
      side="right"
      collapsible="none"
      aria-label="Chat"
      className="sticky top-0 h-svh w-[clamp(20rem,36vw,28rem)] shrink-0 border-l max-lg:top-auto max-lg:bottom-0 max-lg:h-[50svh] max-lg:w-full max-lg:border-t max-lg:border-l-0"
    >
      {!chatStatus.configured ? (
        <NoLanguageModel />
      ) : chat === CHAT_LIST ? (
        // The keys keep the two views apart: going from one to the other mounts the new one, so its
        // head and its field take the focus a press asked for.
        <Start key={CHAT_LIST} />
      ) : chat === NEW_CHAT ? (
        <Start key={NEW_CHAT} fresh />
      ) : (
        // The key gives every chat its own state.
        <Conversation key={chat} threadId={chat} />
      )}
    </Sidebar>
  )
}

/**
 * The head of the panel. In a chat (`back`) a button leads back to the list, then comes the name of
 * the chat; elsewhere there is only the title of the view. The name takes the room that is left and
 * is cut where it is too long: the buttons never give way. Where a new chat can begin (`add`), "New
 * chat" stands before the button that closes the panel, in the list and in every chat.
 *
 * "All chats" and the link of a chat go away with the view they stand in. After such a press the
 * heading of the new view takes the focus, so it does not fall to the page and a screen reader says
 * where it is; after "New chat" the field takes it (`Composer`). On a page load the focus stays where
 * it was.
 */
function PanelHead({ title, back = false, add = false }: { title: string; back?: boolean; add?: boolean }) {
  const panel = useChatPanel()
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (takePress("heading")) heading.current?.focus()
  }, [])
  return (
    <SidebarHeader className="h-14 flex-row items-center gap-1 border-b">
      {back && (
        <Button variant="ghost" size="icon-sm" aria-label="All chats" onClick={panel.showList}>
          <ChevronLeftIcon />
        </Button>
      )}
      <h2 ref={heading} tabIndex={-1} className="min-w-0 flex-1 truncate px-2 font-medium outline-none">
        {title}
      </h2>
      {add && (
        <Button variant="ghost" size="icon-sm" aria-label="New chat" onClick={panel.newChat}>
          <PlusIcon />
        </Button>
      )}
      <Button variant="ghost" size="icon-sm" aria-label="Close the chat" onClick={panel.close}>
        <XIcon />
      </Button>
    </SidebarHeader>
  )
}

function NoLanguageModel() {
  const { chatStatus } = root.useLoaderData()
  return (
    <>
      <PanelHead title="Chat" />
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
    </>
  )
}

/**
 * The list of the chats, where a chat leads back to: the chats so far, and below them the field that
 * begins a new chat, with questions to begin with above it. The head says "Chats", so the group has no
 * label of its own.
 *
 * `fresh` is a new chat that has no question yet, where "New chat" leads: the head says so and leads
 * back to the list, and there is only the field with its questions to begin with. A chat exists from
 * its first question on; until then it is in no list.
 *
 * A question asked here opens its chat, and the field of that chat takes the focus, so the next
 * question can follow without a click.
 */
function Start({ fresh = false }: { fresh?: boolean }) {
  const { chats, chatStatus } = root.useLoaderData()
  const panel = useChatPanel()
  // The next chat begins with the model picked here.
  const [model, setModel] = useState(() => pickedModel(chatStatus.models))
  const choose = (name: string) => {
    pickModel(name)
    setModel(name)
  }
  // And without the tools of the servers switched off here.
  const [off, setOff] = useState(() => pickedSwitchedOff(chatStatus.servers))
  const switchServer = (name: string, on: boolean) => {
    const next = afterSwitch(off, name, on)
    pickSwitchedOff(next)
    setOff(next)
  }
  const ask = (question: string) => {
    markPress("field")
    panel.ask(question)
  }
  return (
    <>
      {fresh ? <PanelHead title={UNNAMED_CHAT} back /> : <PanelHead title="Chats" add />}
      <SidebarContent>
        {!fresh && chats.length > 0 ? (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {chats.map((entry) => (
                  <SidebarMenuItem key={entry.threadId}>
                    <SidebarMenuButton render={<Link to="." search={{ chat: entry.threadId }} onClick={() => markPress()} />}>
                      <span>{entry.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageCircleDashedIcon />
              </EmptyMedia>
              <EmptyTitle>{fresh ? "No question yet" : "No chats yet"}</EmptyTitle>
              <EmptyDescription>
                Ask what the machines do, begin with one of the questions below, or type <code>/help</code> for the
                commands.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </SidebarContent>
      <Composer
        placeholder="Ask about the machines, or type / for commands"
        suggestions={suggestions}
        commands={commandsFor(chatStatus.opcua)}
        onSend={ask}
        models={chatStatus.models}
        model={model}
        onModel={choose}
        off={off}
        onSwitch={switchServer}
        dictation={chatStatus.dictation}
      />
    </>
  )
}

function Conversation({ threadId }: { threadId: string }) {
  const router = useRouter()
  const { chats, chatStatus } = root.useLoaderData()
  const entry = chats.find((chat) => chat.threadId === threadId)
  const titled = entry?.titled ?? false
  // The first question of a chat begun from the list or from a machine, as long as it waits for this
  // panel: the head can call the chat by it from the first render.
  const [asked] = useState(() => peekFirstQuestion(threadId))
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
  // The further servers this chat has switched off. The harness keeps them with the chat, as it keeps
  // the model, and the server of the app gives the model no tool of a server that is off.
  // A switch shows what the harness holds: it moves once the harness has taken it, and stays where it
  // was when the harness did not. Until the chat has opened, the panel does not know what the harness
  // holds: the switches wait (`settled`), and they keep waiting when the harness did not say.
  const [off, setOff] = useState<Array<string>>([])
  const offNow = useRef(off)
  const [settled, setSettled] = useState(false)
  const hold = (next: Array<string>) => {
    offNow.current = next
    setOff(next)
  }
  const [serverError, setServerError] = useState<string>()
  /** Tells the harness, and says whether it took the switch. */
  const tell = (name: string, on: boolean) =>
    switchChatServer(threadId, name, on).then(
      () => true,
      (problem: unknown) => {
        setServerError(problem instanceof Error ? problem.message : String(problem))
        return false
      },
    )
  const switchServer = async (name: string, on: boolean) => {
    if (!(await tell(name, on))) return
    setServerError(undefined)
    hold(afterSwitch(offNow.current, name, on))
    // The next chat begins as this one was left.
    pickSwitchedOff(offNow.current)
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
        // And without the servers switched off last. The question goes out only once the harness has
        // taken every one of them: a model must not get the tools of a server the person switched off.
        // A switch shows off only once the harness has taken it.
        let taken = true
        for (const name of pickedSwitchedOff(chatStatus.servers)) {
          if (await tell(name, false)) hold(afterSwitch(offNow.current, name, false))
          else taken = false
        }
        setSettled(true)
        if (taken) void sendMessage(first)
        else setServerError((reason) => `${reason ?? "A server could not be switched off."} The question was not sent: ask it again.`)
      } else {
        // A chat from before keeps the model it picked, and the servers it switched off. When the
        // harness does not say, the chat says so and its switches stay locked: they would show the
        // switches of another chat.
        try {
          const picked = await fetchChatSettings(threadId)
          setModel(picked.model ?? chatStatus.models[0])
          hold(picked.off)
          setSettled(true)
        } catch (problem) {
          setModel(chatStatus.models[0])
          setServerError(
            `The chat did not say what it has switched off (${problem instanceof Error ? problem.message : String(problem)}). Its tools cannot be switched until it does: open the chat again.`,
          )
        }
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
      body: JSON.stringify({ op: "rename", threadId, title: nameOfQuestion(firstQuestion) }),
    }).then(() => router.invalidate())
  }, [isLoading, firstQuestion, titled, threadId, router])

  // Where the running line "Thinking" stands while nothing in the answer moves, if anywhere.
  const thinking = thinkingLine(messages, isLoading, chatTools)

  return (
    <>
      <PanelHead title={chatName(entry, firstQuestion ?? asked)} back add />
      <div className="min-h-0 flex-1">
        {/* A new question settles near the top and the answer grows under it, a long text as a tall
            card; a chat from before opens at its last question. Without `autoScroll`: with it, the
            scroller keeps the question at the top only while the answer fits, and then follows its
            end, so a card taller than the panel, which comes in one piece, took the question out of
            sight at once. The button at the foot leads to the end as it stands; an alert comes into
            view by itself (`AlertItem`). */}
        <MessageScrollerProvider defaultScrollPosition="last-anchor">
          <MessageScroller>
            <MessageScrollerViewport>
              <MessageScrollerContent aria-busy={isLoading} className="gap-6 p-4">
                {messages.map((message, position) => {
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
                  const live = isLoading && message === messages.at(-1)
                  const blocks = blocksOf(message.parts, live, chatTools)
                  // An answer that has nothing to show yet takes no room.
                  if (blocks.length === 0) return null
                  // An answer that has ended, and for which the chat drew a card, can be saved as a
                  // page: its cards, titled with the question it answers (pages/from-answer.ts). The
                  // answer is more than this message: the button stands under its last one.
                  const keep = keepOfAnswer(messages, position, chatTools, isLoading)
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
                          {keep && <SaveAsPage answer={`${threadId}/${message.id}`} recipe={keep.recipe} left={keep.left} />}
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
                  <AlertItem messageId="error">
                    <Alert>
                      <CircleAlertIcon />
                      <AlertTitle>The language model did not answer</AlertTitle>
                      <AlertDescription>{error.message}</AlertDescription>
                    </Alert>
                  </AlertItem>
                )}
                {switchError && (
                  <AlertItem messageId="switch-error">
                    <Alert>
                      <CircleAlertIcon />
                      <AlertTitle>The model was not changed</AlertTitle>
                      <AlertDescription>{switchError}</AlertDescription>
                    </Alert>
                  </AlertItem>
                )}
                {serverError && (
                  <AlertItem messageId="server-error">
                    <Alert>
                      <CircleAlertIcon />
                      <AlertTitle>The tools of this chat</AlertTitle>
                      <AlertDescription>{serverError}</AlertDescription>
                    </Alert>
                  </AlertItem>
                )}
                {stopError && (
                  <AlertItem messageId="stop-error">
                    <Alert>
                      <CircleAlertIcon />
                      <AlertTitle>Stopping did not reach the server</AlertTitle>
                      <AlertDescription>{stopError}</AlertDescription>
                    </Alert>
                  </AlertItem>
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
      </div>
      <Composer
        placeholder={messages.length === 0 ? "Ask about the machines, or type / for commands" : "Ask a follow-up, or type /"}
        commands={commandsFor(chatStatus.opcua)}
        busy={isLoading}
        onSend={(question) => {
          setStopError(undefined)
          void sendMessage(question)
        }}
        onStop={halt}
        models={chatStatus.models}
        model={model}
        onModel={choose}
        off={off}
        settled={settled}
        onSwitch={(name, on) => void switchServer(name, on)}
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
 * An item of the chat that holds an alert. It comes into view when it appears: a new question stays at
 * the top of the panel while its answer grows under it, so an alert under a tall answer would stand
 * below the fold, and the answer would look as if all went well. "nearest" moves the panel only as far
 * as the alert needs, and not at all when it is in sight; the question no longer holds the top after
 * that. `useMessageScroller` is the escape hatch the rules of the chat name for what the parts do not
 * express (`.claude/skills/shadcn/rules/chat.md`).
 */
function AlertItem({ messageId, children }: { messageId: string; children: ReactNode }) {
  const { scrollToMessage } = useMessageScroller()
  // Once, when the alert appears; `scrollToMessage` stays the same while the chat is open.
  useEffect(() => {
    scrollToMessage(messageId, { align: "nearest" })
  }, [messageId, scrollToMessage])
  return <MessageScrollerItem messageId={messageId}>{children}</MessageScrollerItem>
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
 * The commands, under the field, and after them the tools of the MCP servers the chat has: all of them
 * after /help, while a name is typed the ones it fits. A command with an argument is put into the field
 * to be completed; one without is sent. One entry is marked: the field keeps the focus and moves the
 * mark with the arrow keys, and Tab or Enter take the marked one (Composer). The field points to it with
 * aria-activedescendant.
 */
function CommandList({
  id,
  commands,
  marked,
  titled,
  onMark,
  onPick,
}: {
  id: string
  /** The commands of the chat first, then the tools: the order the arrow keys go. */
  commands: ReadonlyArray<ChatCommand>
  marked: number
  /** Whether each group says what it is: after /help, and wherever tools are in the list. */
  titled: boolean
  onMark: (index: number) => void
  onPick: (command: ChatCommand) => void
}) {
  // The marked command stays in sight when the arrow keys move past the edge of the scrolling part.
  useEffect(() => {
    document.getElementById(`${id}-${marked}`)?.scrollIntoView({ block: "nearest" })
  }, [id, marked])
  const split = commands.findIndex((command) => command.server !== undefined)
  const groups = [
    { title: "Commands", start: 0, entries: split < 0 ? commands : commands.slice(0, split) },
    { title: "Tools", start: split, entries: split < 0 ? [] : commands.slice(split) },
  ].filter((group) => group.entries.length > 0)
  // A ScrollArea of the design system for the scrolling part; its viewport is bounded, so it scrolls. Not a
  // Combobox: the list is filtered by what is typed into the message field itself, which a Combobox would
  // double with an input of its own.
  return (
    <ScrollArea className="[&>[data-slot=scroll-area-viewport]]:max-h-64">
      <div id={id} role="listbox" aria-label="Commands and tools" className="flex flex-col gap-2">
        {groups.map((group) => (
          <ItemGroup key={group.title} className="gap-0" role="group" aria-label={group.title}>
            {titled && (
              <span aria-hidden className="block px-2 pb-1 text-xs font-medium text-muted-foreground">
                {group.title}
              </span>
            )}
            {group.entries.map((command, offset) => {
              const index = group.start + offset
              return (
                <Item
                  key={command.name}
                  id={`${id}-${index}`}
                  size="sm"
                  role="option"
                  aria-selected={index === marked}
                  // The field keeps the focus: a click must not take it, and Tab must not stop on an option.
                  render={
                    <button
                      type="button"
                      tabIndex={-1}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseMove={() => onMark(index)}
                      onClick={() => onPick(command)}
                    />
                  }
                  className="cursor-pointer text-left aria-selected:bg-muted"
                >
                  <ItemContent>
                    <ItemTitle className="font-mono break-all">{usage(command)}</ItemTitle>
                    <ItemDescription>{command.summary}</ItemDescription>
                  </ItemContent>
                </Item>
              )
            })}
          </ItemGroup>
        ))}
      </div>
    </ScrollArea>
  )
}

/**
 * Where a question is written. Below the text it says which servers give the chat tools and switches
 * them (tools-menu.tsx). With more than one model in the settings it also says which model
 * answers and lets the chat pick another one, after the shadcn pattern "Model Selector". At the
 * start of the panel the questions to begin with stand above it, after the pattern "Suggestion".
 * With a model for speech in the settings, a question can also be spoken into it (dictate.tsx).
 * While an answer comes, send is stop, after the pattern "Prompt Input": what came so far stays.
 */
function Composer({
  placeholder,
  suggestions: questions = [],
  commands,
  busy = false,
  onSend,
  onStop,
  models,
  model,
  onModel,
  off,
  settled = true,
  onSwitch,
  dictation,
}: {
  placeholder: string
  suggestions?: ReadonlyArray<string>
  commands: ReadonlyArray<ChatCommand>
  busy?: boolean
  onSend: (question: string) => void
  onStop?: () => void
  models: ReadonlyArray<string>
  model: string | undefined
  onModel: (name: string) => void
  off: ReadonlyArray<string>
  settled?: boolean
  onSwitch: (name: string, on: boolean) => void
  dictation: boolean
}) {
  const [text, setText] = useState("")
  const [help, setHelp] = useState(false)
  const [notice, setNotice] = useState<string>()
  // The command marked in the list, and whether Escape closed the list until the next keystroke.
  const [marked, setMarked] = useState(0)
  const [closed, setClosed] = useState(false)
  const listId = useId()
  // The tools of the MCP servers come into the list after the commands, so a person can name the tool
  // the model should take. They are asked for when the list opens, as the panel "Tools" asks when it
  // opens, so the list says what answers now. A server this chat switched off gives none, and neither
  // does a tool only a card calls.
  const [servers, setServers] = useState<ReadonlyArray<ListedServer>>([])
  const listing = help || text.startsWith("/")
  useEffect(() => {
    if (!listing) return
    let wanted = true
    getChatServers().then(
      (listed) => wanted && setServers(listed),
      () => undefined,
    )
    return () => {
      wanted = false
    }
  }, [listing])
  const tools = servers
    .filter((server) => server.reachable && !off.includes(server.name))
    .flatMap((server) => forModel(server.tools, chatTools).map((tool) => toolCommand(server.name, tool)))
  const all = [...commands, ...tools]
  const field = useRef<HTMLTextAreaElement>(null)
  // After "New chat", and in a chat its first question opened from the panel, the field takes the focus.
  useEffect(() => {
    if (takePress("field")) field.current?.focus()
  }, [])
  const prepare = (value: string) => {
    setText(value)
    setNotice(undefined)
    field.current?.focus()
  }
  // What was said comes after what is written, and the cursor waits behind it.
  const dictated = (words: string) => {
    setText((written) => (written.trim() === "" ? words : `${written.trimEnd()} ${words}`))
    setNotice(undefined)
    field.current?.focus()
  }
  // What was typed: a question goes out, a command becomes its question, /help shows the commands.
  const submit = (value: string) => {
    if (value.trim() === "" || busy) return
    const typed = readTyped(value, all)
    switch (typed.kind) {
      case "question":
        setText("")
        setHelp(false)
        setNotice(undefined)
        onSend(typed.text)
        return
      case "help":
        setText("")
        setHelp(true)
        return
      case "incomplete":
        prepare(`/${typed.command.name} `)
        setNotice(`${usage(typed.command)}: ${typed.command.summary}`)
        return
      case "unknown":
        setHelp(true)
        setNotice(`There is no command /${typed.name}.`)
        return
    }
  }
  const send = () => submit(text)
  const pick = (command: ChatCommand) => {
    if (!command.question) {
      setText("")
      setHelp(true)
    } else if (command.argument) {
      prepare(`/${command.name} `)
    } else {
      submit(`/${command.name}`)
    }
  }
  const offered = closed ? [] : help ? all : [...matching(text, commands), ...matching(text, tools)]
  const current = Math.min(marked, Math.max(offered.length - 1, 0))
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    send()
  }
  // While the list of commands is open, the keys of the field work it, as the slash commands of other
  // chats do: the arrows move the mark, Tab writes the marked command into the field, Enter takes it,
  // Escape closes the list. Otherwise Enter sends and Tab leaves the field.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.nativeEvent.isComposing) return
    const command = offered[current]
    if (command) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        setMarked(stepped(current, event.key === "ArrowDown" ? 1 : -1, offered.length))
        return
      }
      if (event.key === "Tab" && !event.shiftKey) {
        event.preventDefault()
        prepare(completion(command))
        setHelp(false)
        return
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault()
        pick(command)
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        setHelp(false)
        setClosed(true)
        return
      }
    }
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
      {offered.length > 0 && (
        <CommandList
          id={listId}
          commands={offered}
          marked={current}
          titled={help || offered.some((command) => command.server !== undefined)}
          onMark={setMarked}
          onPick={pick}
        />
      )}
      {notice && <p className="px-2 text-sm text-muted-foreground">{notice}</p>}
      {questions.length > 0 && offered.length === 0 && (
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
            aria-controls={offered.length > 0 ? listId : undefined}
            aria-activedescendant={offered.length > 0 ? `${listId}-${current}` : undefined}
            onChange={(event) => {
              setText(event.target.value)
              setNotice(undefined)
              setMarked(0)
              setClosed(false)
              if (event.target.value !== "") setHelp(false)
            }}
            onKeyDown={onKeyDown}
          />
          {/* The second line of the field: the tools, the commands and, with a choice of models, the
              model on the left, dictation and send on the right. */}
          <InputGroupAddon align="block-end">
            <ToolsMenu off={off} settled={settled} onSwitch={onSwitch} />
            <InputGroupButton
              variant="ghost"
              size="icon-sm"
              aria-label="Commands"
              aria-pressed={help}
              onClick={() => {
                setHelp((open) => !open)
                setClosed(false)
                setMarked(0)
              }}
            >
              <SlashIcon />
            </InputGroupButton>
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
            {dictation && <DictateButton className="ml-auto" onText={dictated} />}
            <InputGroupButton
              type={stoppable ? "button" : "submit"}
              variant="default"
              size="icon-sm"
              className={dictation ? undefined : "ml-auto"}
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

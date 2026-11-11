import { stateOf } from "@pleiades/cards/machine/state.ts"
import { Card } from "@pleiades/cards/ui/card.tsx"
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react"
import { Link, getRouteApi, useRouter } from "@tanstack/react-router"
import { ArrowUpIcon, CheckIcon, LoaderIcon, MessageSquareIcon, PlusIcon, XIcon } from "lucide-react"
import { useEffect, useState } from "react"
import type { FormEvent, KeyboardEvent } from "react"

import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group"
import { ItemGroup, ItemSeparator } from "@/components/ui/item"
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker"
import { Message, MessageContent } from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
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
} from "@/components/ui/sidebar"
import { MachineRow } from "@/machines/machine-item.tsx"

import { NEW_CHAT, rememberThread, takeFirstQuestion, useChatPanel } from "./ask.ts"
import { suggestions } from "./suggestions.ts"
import { machineListOf, toolLabels } from "./tool-results.ts"

const root = getRouteApi("__root__")

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
              <PlusIcon />
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
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>No language model configured</EmptyTitle>
        <EmptyDescription>
          Set <code>LLM_BASE_URL</code>, <code>LLM_MODEL</code> and <code>LLM_API_KEY</code> in <code>.env</code> and
          start the stack again. Any OpenAI-compatible endpoint works. Home needs no language model.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

/** The panel before a chat: questions to begin with, and the chats so far. */
function Start() {
  const { chats } = root.useLoaderData()
  const panel = useChatPanel()
  return (
    <>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Ask</SidebarGroupLabel>
          <SidebarMenu>
            {suggestions.map((question) => (
              <SidebarMenuItem key={question}>
                <SidebarMenuButton onClick={() => panel.ask(question)}>
                  <MessageSquareIcon />
                  <span>{question}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
        {chats.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Chats</SidebarGroupLabel>
            <SidebarMenu>
              {chats.map((entry) => (
                <SidebarMenuItem key={entry.threadId}>
                  <SidebarMenuButton render={<Link to="/" search={{ chat: entry.threadId }} />}>
                    <span>{entry.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        )}
      </SidebarContent>
      <Composer placeholder="Ask about the machines" onSend={panel.ask} />
    </>
  )
}

function Conversation({ threadId }: { threadId: string }) {
  const router = useRouter()
  const { chats } = root.useLoaderData()
  const titled = chats.some((entry) => entry.threadId === threadId && entry.titled)
  const { messages, sendMessage, isLoading, error } = useChat({
    threadId,
    connection: fetchServerSentEvents("/api/harness/run"),
    persistence: true,
  })

  // A question asked anywhere in the app opens this chat and is its first message.
  useEffect(() => {
    rememberThread(threadId)
    const first = takeFirstQuestion(threadId)
    if (first) void sendMessage(first)
    // Only when the chat opens, whatever sendMessage is on later renders.
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
        <MessageScrollerProvider>
          <MessageScroller>
            <MessageScrollerViewport>
              <MessageScrollerContent className="gap-5 p-4">
                {messages.map((message) => (
                  <MessageScrollerItem key={message.id}>
                    <Message align={message.role === "user" ? "end" : "start"}>
                      <MessageContent>
                        {message.parts.map((part, index) => {
                          if (part.type === "text") {
                            return message.role === "user" ? (
                              <div key={index} className="max-w-[85%] self-end rounded-2xl bg-sidebar-accent px-3.5 py-2">
                                {part.content}
                              </div>
                            ) : (
                              <p key={index} className="whitespace-pre-wrap">
                                {part.content}
                              </p>
                            )
                          }
                          if (part.type === "tool-call") {
                            const done = message.parts.some(
                              (other) => other.type === "tool-result" && other.toolCallId === part.id,
                            )
                            const label = toolLabels[part.name]
                            return (
                              <Marker key={index}>
                                <MarkerIcon>{done ? <CheckIcon /> : <LoaderIcon className="animate-spin" />}</MarkerIcon>
                                <MarkerContent>{(done ? label?.done : label?.running) ?? part.name}</MarkerContent>
                              </Marker>
                            )
                          }
                          if (part.type === "tool-result") {
                            // The app draws the values of a tool itself, with the same parts as Home.
                            const list = machineListOf(part.content)
                            if (!list) return null
                            return (
                              <Card key={index} className="gap-0 py-0">
                                <ItemGroup className="gap-0">
                                  {list.machines.map((machine, position) => (
                                    <div key={machine.machine} role="presentation">
                                      {position > 0 && <ItemSeparator className="my-0" />}
                                      <MachineRow machine={machine} state={stateOf(machine, list.asOf)} asOf={list.asOf} />
                                    </div>
                                  ))}
                                </ItemGroup>
                              </Card>
                            )
                          }
                          return null
                        })}
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                ))}
                {error && (
                  <Marker>
                    <MarkerContent>The language model did not answer: {error.message}</MarkerContent>
                  </Marker>
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
      />
    </>
  )
}

function Composer({
  placeholder,
  busy = false,
  onSend,
}: {
  placeholder: string
  busy?: boolean
  onSend: (question: string) => void
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
  return (
    <SidebarFooter className="border-t">
      <form onSubmit={onSubmit}>
        <InputGroup className="bg-background">
          <InputGroupTextarea
            rows={1}
            placeholder={placeholder}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton type="submit" variant="default" size="icon-sm" aria-label="Send" disabled={busy}>
              <ArrowUpIcon />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </SidebarFooter>
  )
}

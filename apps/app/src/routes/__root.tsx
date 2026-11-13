import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router"
import { PanelRightIcon } from "lucide-react"
import type { ReactNode } from "react"

import { useChatPanel } from "@/chat/ask.ts"
import { ChatSidebar } from "@/chat/chat-sidebar.tsx"
import { fetchChats, getChatStatus } from "@/chat/status.ts"
import { AppSidebar } from "@/components/app-sidebar.tsx"
import { AskAnything } from "@/components/ask-anything.tsx"
import { PageBreadcrumb } from "@/components/page-breadcrumb.tsx"
import { Button } from "@pleiades/ui/components/button"
import { Separator } from "@pleiades/ui/components/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@pleiades/ui/components/sidebar"

import appCss from "../styles.css?url"

export const Route = createRootRoute({
  // The app renders in the browser; every route inherits this. Only the document below comes from
  // the server, together with the server routes and server functions.
  ssr: false,
  // Whether the chat panel is open, and with which chat, is part of the URL.
  validateSearch: (search): { chat?: string } => (typeof search.chat === "string" ? { chat: search.chat } : {}),
  loader: async () => {
    try {
      const chatStatus = await getChatStatus()
      // Without a language model there is no harness to ask for chats.
      return { chatStatus, chats: chatStatus.configured ? await fetchChats() : [] }
    } catch {
      // The server is away for a moment, for example while it restarts. The next read sets it right.
      return { chatStatus: { configured: false, models: [], gaps: [] }, chats: [] }
    }
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Pleiades Playground" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: Document,
  component: Layout,
  notFoundComponent: () => <p>This page does not exist.</p>,
})

function Document({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

/**
 * After the shadcn block sidebar-15: the pages on the left, the page, the chat on the right.
 *
 * The chat never covers the page: you chat about what you see. Next to the open chat the page
 * narrows; where the two do not fit side by side, the page takes the upper half and the chat the
 * lower.
 */
function Layout() {
  const { chat } = Route.useSearch()
  const panel = useChatPanel()
  return (
    <SidebarProvider>
      <AppSidebar />
      {/* The page and the chat share what the sidebar leaves. */}
      <div className="flex min-w-0 flex-1 max-lg:flex-col">
        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3">
            <SidebarTrigger />
            {/* The classes of the block; self-center because the separator stretches by default,
                and a stretched item of a set height sits at the top of the header. */}
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4 data-vertical:self-center" />
            <PageBreadcrumb />
            <AskAnything />
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto"
              aria-label={chat ? "Close the chat" : "Open the chat"}
              aria-pressed={Boolean(chat)}
              onClick={chat ? panel.close : panel.open}
            >
              <PanelRightIcon />
            </Button>
          </header>
          <div className="p-6">
            <Outlet />
          </div>
        </SidebarInset>
        {chat && <ChatSidebar chat={chat} />}
      </div>
    </SidebarProvider>
  )
}

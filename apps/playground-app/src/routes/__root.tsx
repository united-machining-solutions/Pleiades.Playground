import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router"
import type { ReactNode } from "react"

import appCss from "../styles.css?url"

export const Route = createRootRoute({
  // The app renders in the browser; every route inherits this. Only the document below comes from
  // the server, together with the server routes and server functions.
  ssr: false,
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

function Layout() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center border-b px-6">
        <span className="font-medium">Pleiades Playground</span>
      </header>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  )
}

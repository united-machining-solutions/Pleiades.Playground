import { buttonVariants } from "@pleiades/ui/components/button"
import { Toaster } from "@pleiades/ui/components/toast"
import { TooltipProvider } from "@pleiades/ui/components/tooltip"

import { sections } from "@/block.tsx"
import { Actions } from "@/sections/actions.tsx"
import { BuiltFromThese } from "@/sections/built-from-these.tsx"
import { Conversation } from "@/sections/conversation.tsx"
import { DataDisplay } from "@/sections/data-display.tsx"
import { DoAndDont } from "@/sections/do-and-dont.tsx"
import { Feedback } from "@/sections/feedback.tsx"
import { Foundations } from "@/sections/foundations.tsx"
import { Inputs } from "@/sections/inputs.tsx"
import { Navigation } from "@/sections/navigation.tsx"
import { Overlays } from "@/sections/overlays.tsx"

/**
 * The design system on one page: the tokens, every component of packages/ui in its variants and
 * states, and what the repository builds from them. Every example stands with fixed values;
 * nothing is read from a backend.
 *
 * A section is a file of its own under sections/. The two providers are the ones the docs of
 * tooltip and of toast want at the root of an application.
 */
export function App() {
  return (
    <TooltipProvider>
      <div className="mx-auto flex w-full max-w-5xl flex-col px-4 pb-24 sm:px-6">
        <header className="flex flex-col gap-1 pt-10 pb-4">
          <h1 className="text-2xl font-semibold">Design system</h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            What the user interface of Pleiades Playground is built from: the tokens, every component of
            packages/ui, and what the repository builds from them. Take from here before you build an element of
            your own or add a library.
          </p>
        </header>
        {/* The jumps stay in reach while the page scrolls. In a narrow window the row scrolls sideways. */}
        <nav
          aria-label="Sections"
          className="sticky top-0 z-10 -mx-2 flex scroll-fade-x no-scrollbar gap-1 overflow-x-auto border-b bg-background py-2"
        >
          {sections.map((section) => (
            // A jump is a link that looks like a button, as the docs of Button want it.
            <a key={section.id} href={`#${section.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              {section.title}
            </a>
          ))}
        </nav>
        <main className="flex flex-col gap-20 pt-10">
          <Foundations />
          <Actions />
          <Inputs />
          <Navigation />
          <DataDisplay />
          <Feedback />
          <Overlays />
          <Conversation />
          <DoAndDont />
          <BuiltFromThese />
        </main>
      </div>
      <Toaster />
    </TooltipProvider>
  )
}

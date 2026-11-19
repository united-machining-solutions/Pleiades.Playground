import { Button } from "@pleiades/ui/components/button"
import { CheckIcon } from "lucide-react"
import type { ReactNode } from "react"

// The steps of a form that leads a person to what is missing, one at a time, in one flat card: a step that is
// open, a small heading and what answers it, without a frame of its own; and a step that is done, as a quiet
// line with a check mark that opens it again on a click.

/** An open step: a short question, and what answers it. */
export function OpenStep({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

/** A step that is done, as one line with a check mark; a click opens it again. */
export function DoneStep({ children, onOpen }: { children: ReactNode; onOpen: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-auto min-h-8 w-full justify-between gap-2 px-2 py-1 text-left font-normal whitespace-normal"
      onClick={onOpen}
    >
      <span className="min-w-0 wrap-anywhere">{children}</span>
      <CheckIcon aria-hidden className="size-4 shrink-0" />
    </Button>
  )
}

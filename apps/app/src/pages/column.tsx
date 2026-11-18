import type { ReactNode } from "react"

import { Skeleton } from "@pleiades/ui/components/skeleton"

// What every route that shows a recipe shares: a page kept in this browser (`routes/pages.$page.tsx`)
// and a page opened from a link (`routes/pages.open.tsx`) are the same column, so they look alike.

/** One column, as wide as the page of a machine, with the head of the page on top. */
export function Column({ head, children }: { head?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      {head}
      {children}
    </div>
  )
}

/** While the parts are asked: the title, if there is one, and a placeholder for each part. */
export function PartsLoading({ title, parts }: { title?: string; parts: number }) {
  return (
    <Column head={title !== undefined && <h1 className="text-2xl font-semibold wrap-break-word">{title}</h1>}>
      {Array.from({ length: parts }, (_, index) => (
        <Skeleton key={index} className="h-40 w-full" />
      ))}
    </Column>
  )
}

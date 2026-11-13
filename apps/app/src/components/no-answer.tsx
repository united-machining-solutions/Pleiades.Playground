import { ServerOffIcon } from "lucide-react"

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@pleiades/ui/components/empty"

/**
 * A page without its values says why, and that it keeps trying. The reason is a sentence that
 * names who did not answer: the backend, or the API behind it. There is nothing to do but wait,
 * so the empty state has no action.
 */
export function NoAnswer({ error }: { error: string }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ServerOffIcon />
        </EmptyMedia>
        <EmptyTitle>No answer from the backend</EmptyTitle>
        <EmptyDescription>{error} This page keeps trying.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

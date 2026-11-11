import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"

/**
 * A page without its values says why, and that it keeps trying. The reason is a sentence that
 * names who did not answer: the backend, or the API behind it.
 */
export function NoAnswer({ error }: { error: string }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>No answer from the backend</EmptyTitle>
        <EmptyDescription>{error} This page keeps trying.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

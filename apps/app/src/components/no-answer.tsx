import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"

/** A page without its values says why, and that it keeps trying. */
export function NoAnswer({ error }: { error: string }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>No answer from the backend</EmptyTitle>
        <EmptyDescription>The generative UI backend did not answer ({error}). This page keeps trying.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

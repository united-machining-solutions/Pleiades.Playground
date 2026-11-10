import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({ component: Home })

function Home() {
  return (
    <div className="text-sm">
      <h1 className="font-medium">No cards yet</h1>
      <p className="text-muted-foreground">This view will show the machines of the demo stack.</p>
    </div>
  )
}

import { Alert, AlertDescription, AlertTitle } from "@pleiades/ui/components/alert"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { TriangleAlertIcon } from "lucide-react"
import { useEffect } from "react"

import { DrinkPicker } from "@/cards/juicebar/chat.tsx"
import { drinksOf } from "@/cards/juicebar/results.ts"
import { readDrinks } from "@/showcases/juice-bar/drinks.ts"

/**
 * The juice bar for a fair: the drink card of the chat as a page of its own, to stand on a screen next to
 * the machine. A guest picks a drink and orders it with its button; no language model is asked. The drinks
 * come from the machine through the Juice bar API, read again every half minute, so a bottle that runs low
 * takes its drinks off the page.
 *
 * It is a showcase: the page is only in a build with the showcases (APP_SHOWCASES), and the folder
 * `(showcases)` adds nothing to its address. It names no entry in the sidebar: it is reached by its
 * address, /juice-bar.
 */
export const Route = createFileRoute("/(showcases)/juice-bar")({
  staticData: { crumb: "Juice bar" },
  loader: () => readDrinks(),
  component: JuiceBar,
})

/** How often the page reads the card of the machine again. */
const REFRESH_MS = 30_000

function JuiceBar() {
  const answer = Route.useLoaderData()
  const router = useRouter()
  useEffect(() => {
    const timer = setInterval(() => void router.invalidate(), REFRESH_MS)
    return () => clearInterval(timer)
  }, [router])

  const drinks = answer.ok ? drinksOf(answer.json) : null
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold">Juice bar</h1>
      {drinks ? (
        <DrinkPicker drinks={drinks} />
      ) : (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>The juice bar has no card for us</AlertTitle>
          <AlertDescription>{answer.ok ? "It answered with something that is no list of drinks." : answer.reason}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

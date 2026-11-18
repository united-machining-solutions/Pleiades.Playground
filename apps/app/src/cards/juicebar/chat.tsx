import { CheckIcon, CupSodaIcon, TriangleAlertIcon } from "lucide-react"
import { useEffect, useState } from "react"

import type { ChatTool } from "@/chat/tool-results.ts"
import { orderDrink, readOrder } from "@/juicebar/orders.ts"
import { Alert, AlertDescription, AlertTitle } from "@pleiades/ui/components/alert"
import { Button } from "@pleiades/ui/components/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@pleiades/ui/components/empty"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@pleiades/ui/components/item"
import { Spinner } from "@pleiades/ui/components/spinner"

import { PouringGlass, SmallGlass } from "./glass.tsx"
import type { Pour } from "./glass.tsx"
import { drinksOf, glassOf, ingredientsOf, isFizzy, orderOf, orderable, shortName, stageOf } from "./results.ts"
import type { Drink, Order, Stage } from "./results.ts"

// The drink card in the chat: what the juice bar can mix now, one drink to pick, and its order. The
// button orders at once, without a question of the language model; the start button on the machine is
// the last step, pressed by the person at the glass. chat/cards.tsx lists this module.

/** The dots and short names of the ingredients, the water last. */
function Ingredients({ drink }: { drink: Drink }) {
  return (
    <span className="flex flex-wrap gap-x-2.5">
      {ingredientsOf(drink).map((one) => (
        <span key={one.id} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span className="size-2 shrink-0 rounded-full ring-1 ring-foreground/25" style={{ backgroundColor: one.color ?? "var(--muted)" }} />
          {shortName(one)}
        </span>
      ))}
    </span>
  )
}

/** Where a person is with the card: picking, sending the order, following it, or told why it failed. */
type Step =
  | { at: "pick" }
  | { at: "sending" }
  | { at: "order"; order: Order; stage: Stage; misses: number }
  | { at: "failed"; reason: string }

/** How often in a row reading an order may fail before the card says so, at one read a second. */
const patience = 10

export function DrinkPicker({ drinks: listed }: { drinks: Array<Drink> }) {
  const { drinks, hidden, low } = orderable(listed)
  const [pickedId, setPickedId] = useState(drinks[0]?.id)
  const [step, setStep] = useState<Step>({ at: "pick" })
  const picked = drinks.find((one) => one.id === pickedId) ?? drinks[0]

  const following = step.at === "order" && (step.stage === "queued" || step.stage === "mixing")
  const orderNumber = step.at === "order" ? step.order.orderNumber : undefined
  useEffect(() => {
    if (!following || orderNumber === undefined) return
    let stopped = false
    const timer = setInterval(async () => {
      const answer = await readOrder({ data: orderNumber })
      if (stopped) return
      const order = answer.ok ? orderOf(answer.json) : null
      setStep((now) => {
        if (now.at !== "order") return now
        if (order) return { at: "order", order: { ...now.order, ...order }, stage: stageOf(order), misses: 0 }
        if (now.misses + 1 < patience) return { ...now, misses: now.misses + 1 }
        return { at: "failed", reason: answer.ok ? "The juice bar answered without the order." : answer.reason }
      })
    }, 1000)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [following, orderNumber])

  async function order(drink: Drink) {
    setStep({ at: "sending" })
    const answer = await orderDrink({ data: drink.id })
    if (!answer.ok) return setStep({ at: "failed", reason: answer.reason })
    const placed = orderOf(answer.json)
    if (!placed) return setStep({ at: "failed", reason: "The juice bar answered without an order number." })
    setStep({ at: "order", order: placed, stage: stageOf(placed), misses: 0 })
  }

  if (!picked) {
    return (
      <Card>
        <CardContent>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CupSodaIcon />
              </EmptyMedia>
              <EmptyTitle>No drink can be mixed now</EmptyTitle>
              <EmptyDescription>
                {low.length > 0 ? `${low.join(", ")} ${low.length === 1 ? "runs" : "run"} low.` : "The juice bar lists no drink."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    )
  }

  if (step.at === "order" || step.at === "failed") {
    return <OrderView drink={picked} step={step} onAgain={() => setStep({ at: "pick" })} />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pick a drink</CardTitle>
        <CardDescription>What the juice bar can mix now</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {hidden > 0 && (
          <Alert>
            <TriangleAlertIcon />
            <AlertTitle>{`${low.join(", ")} ${low.length === 1 ? "runs" : "run"} low`}</AlertTitle>
            <AlertDescription>
              {hidden === 1 ? "One drink is hidden" : `${hidden} drinks are hidden`} until the bottle is refilled.
            </AlertDescription>
          </Alert>
        )}
        <ItemGroup className="gap-1" aria-label="Drinks">
          {drinks.map((drink) => {
            const selected = drink.id === picked.id
            return (
              <Item
                key={drink.id}
                size="sm"
                variant={selected ? "muted" : "default"}
                className="cursor-pointer text-left"
                render={<button type="button" aria-pressed={selected} onClick={() => setPickedId(drink.id)} />}
              >
                <ItemMedia>
                  <SmallGlass shape={glassOf(drink)} colour={drink.color} fizzy={isFizzy(drink)} umbrella={selected} />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{drink.title}</ItemTitle>
                  <ItemDescription>
                    <Ingredients drink={drink} />
                  </ItemDescription>
                  {selected && drink.description && <ItemDescription>{drink.description}</ItemDescription>}
                </ItemContent>
                <ItemActions>{selected && <CheckIcon aria-hidden="true" />}</ItemActions>
              </Item>
            )
          })}
        </ItemGroup>
      </CardContent>
      <CardFooter>
        <Button className="w-full" size="lg" disabled={step.at === "sending"} onClick={() => void order(picked)}>
          {step.at === "sending" && <Spinner data-icon="inline-start" />}
          {step.at === "sending" ? "Ordering" : `Order ${picked.title}`}
        </Button>
      </CardFooter>
    </Card>
  )
}

const pourOf: Record<Stage, Pour> = { queued: "waiting", mixing: "pouring", ready: "full", failed: "waiting" }

/** The order after the button: the glass, where it stands in words, and the way back to the drinks. */
function OrderView({
  drink,
  step,
  onAgain,
}: {
  drink: Drink
  step: Extract<Step, { at: "order" } | { at: "failed" }>
  onAgain: () => void
}) {
  const stage: Stage = step.at === "failed" ? "failed" : step.stage
  const progress = step.at === "order" ? (step.order.progressFraction ?? 0) : 0
  const ingredients = ingredientsOf(drink)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your drink</CardTitle>
        <CardDescription>{drink.title}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {stage === "failed" ? (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>{step.at === "order" ? "The order stopped" : "Not ordered"}</AlertTitle>
            <AlertDescription>{step.at === "failed" ? step.reason : step.order.errorMessage}</AlertDescription>
          </Alert>
        ) : (
          <PouringGlass
            shape={glassOf(drink)}
            colour={drink.color}
            fizzy={isFizzy(drink)}
            pour={pourOf[stage]}
            progress={progress}
            confetti={ingredients.flatMap((one) => (one.color ? [one.color] : []))}
          />
        )}
        <div aria-live="polite" className="flex flex-col items-center gap-1 text-center">
          {stage === "queued" && (
            <>
              <p className="font-medium">Put a glass under the outlet</p>
              <p className="text-muted-foreground">and press start on the machine.</p>
            </>
          )}
          {stage === "mixing" && (
            <>
              <p className="font-medium tabular-nums">Mixing · {Math.round(progress * 100)} %</p>
              <p className="text-muted-foreground">{ingredients.map(shortName).join(" · ")}</p>
            </>
          )}
          {stage === "ready" && (
            <div className="flex animate-in flex-col items-center gap-1 duration-500 fade-in-0 zoom-in-90 motion-reduce:animate-none">
              <p className="font-medium">Ready. Cheers!</p>
              <p className="text-muted-foreground">Take your glass from the outlet.</p>
            </div>
          )}
        </div>
      </CardContent>
      {(stage === "ready" || stage === "failed") && (
        <CardFooter className="justify-center">
          <Button variant="outline" size="lg" onClick={onAgain}>
            {stage === "ready" ? "Pick another drink" : "Back to the drinks"}
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}

export const juicebarTools: ReadonlyArray<ChatTool> = [
  {
    name: "juicebar_drinks_list",
    label: { running: "Reading the drinks", done: "Read the drinks", failed: "Failed to read the drinks" },
    draw(content) {
      const drinks = drinksOf(content)
      return drinks && <DrinkPicker drinks={drinks} />
    },
  },
  {
    name: "juicebar_status",
    label: { running: "Looking at the juice bar", done: "Looked at the juice bar", failed: "Failed to look at the juice bar" },
  },
  {
    name: "juicebar_order_create",
    label: { running: "Ordering a drink", done: "Ordered a drink", failed: "Failed to order a drink" },
  },
]

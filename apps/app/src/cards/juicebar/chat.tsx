import { CupSodaIcon, TriangleAlertIcon } from "lucide-react"
import { useEffect, useId, useState } from "react"

import type { ChatTool } from "@/chat/tool-results.ts"
import { orderDrink, readOrder } from "@/juicebar/orders.ts"
import { Alert, AlertDescription, AlertTitle } from "@pleiades/ui/components/alert"
import { Button } from "@pleiades/ui/components/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@pleiades/ui/components/empty"
import { Field, FieldContent, FieldDescription, FieldLabel, FieldLegend, FieldSet, FieldTitle } from "@pleiades/ui/components/field"
import { RadioGroup, RadioGroupItem } from "@pleiades/ui/components/radio-group"
import { Spinner } from "@pleiades/ui/components/spinner"

import { readAgainAndAgain, reached } from "./follow.ts"
import { PouringGlass, SmallGlass } from "./glass.tsx"
import type { Pour } from "./glass.tsx"
import { drinksOf, glassOf, ingredientsOf, isFizzy, orderOf, orderable, shortName, stageOf, whereLost, whyNoOrder } from "./results.ts"
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

/**
 * Where a person is with the card. From the button on, a step keeps the drink that was ordered: the list is
 * read again while the machine mixes, and the drink may leave it then, when its bottle starts to warn.
 * `refused`: the juice bar said no and placed nothing. `unsure`: no answer came, so the order may stand in
 * the machine. `lost`: the order stands in the machine, and the card lost sight of it.
 */
type Step =
  | { at: "pick" }
  | { at: "sending"; drink: Drink }
  | { at: "order"; drink: Drink; order: Order; stage: Stage; misses: number }
  | { at: "refused" | "unsure"; drink: Drink; reason: string }
  | { at: "lost"; drink: Drink; order: Order; reason: string }

type AfterTheButton = Exclude<Step, { at: "pick" } | { at: "sending" }>

/** How often in a row reading an order may fail before the card says so. */
const patience = 10
/** The pause between two reads of an order. The next read starts when the last one has ended. */
const READ_EVERY_MS = 1000

export function DrinkPicker({ drinks: listed }: { drinks: Array<Drink> }) {
  const { drinks, hidden, low } = orderable(listed)
  const [pickedId, setPickedId] = useState(drinks[0]?.id)
  const [step, setStep] = useState<Step>({ at: "pick" })
  const ids = useId()
  const picked = drinks.find((one) => one.id === pickedId) ?? drinks[0]

  const following = step.at === "order" && (step.stage === "queued" || step.stage === "mixing")
  const orderNumber = step.at === "order" ? step.order.orderNumber : undefined
  useEffect(() => {
    if (!following || orderNumber === undefined) return
    let stopped = false
    const stop = readAgainAndAgain(async () => {
      const answer = await reached(readOrder({ data: orderNumber }))
      if (stopped) return
      const order = answer.ok ? orderOf(answer.json) : null
      setStep((now) => {
        if (now.at !== "order") return now
        if (order) return { ...now, order: { ...now.order, ...order }, stage: stageOf(order), misses: 0 }
        if (now.misses + 1 < patience) return { ...now, misses: now.misses + 1 }
        return { at: "lost", drink: now.drink, order: now.order, reason: answer.ok ? "The juice bar answered without the order." : answer.reason }
      })
    }, READ_EVERY_MS)
    return () => {
      stopped = true
      stop()
    }
  }, [following, orderNumber])

  async function order(drink: Drink) {
    setStep({ at: "sending", drink })
    const answer = await reached(orderDrink({ data: drink.id }))
    if (!answer.ok) return setStep({ at: whyNoOrder(answer), drink, reason: answer.reason })
    const placed = orderOf(answer.json)
    if (!placed) return setStep({ at: "unsure", drink, reason: "The juice bar answered without an order number." })
    setStep({ at: "order", drink, order: placed, stage: stageOf(placed), misses: 0 })
  }

  // The order comes first: it stands whatever the list says now.
  if (step.at !== "pick" && step.at !== "sending") {
    return <OrderView step={step} onAgain={() => setStep({ at: "pick" })} />
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
        <FieldSet>
          <FieldLegend variant="label" className="sr-only">
            Drinks
          </FieldLegend>
          <RadioGroup value={picked.id} onValueChange={(value) => setPickedId(String(value))}>
            {drinks.map((drink) => {
              const selected = drink.id === picked.id
              const id = `${ids}-${drink.id}`
              return (
                <FieldLabel key={drink.id} htmlFor={id}>
                  <Field orientation="horizontal">
                    <SmallGlass shape={glassOf(drink)} colour={drink.color} fizzy={isFizzy(drink)} umbrella={selected} />
                    <FieldContent>
                      <FieldTitle>{drink.title}</FieldTitle>
                      <FieldDescription>
                        <Ingredients drink={drink} />
                      </FieldDescription>
                      {selected && drink.description && <FieldDescription>{drink.description}</FieldDescription>}
                    </FieldContent>
                    <RadioGroupItem value={drink.id} id={id} />
                  </Field>
                </FieldLabel>
              )
            })}
          </RadioGroup>
        </FieldSet>
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

/** Why there is no glass to follow: the title and the sentences of each case. */
function trouble(step: AfterTheButton): { title: string; text: string } | null {
  switch (step.at) {
    case "refused":
      return { title: "Not ordered", text: step.reason }
    case "unsure":
      return {
        title: "Not sure it was ordered",
        text: `${step.reason} Look at the machine before you order again: an order that went through waits there.`,
      }
    case "lost":
      return {
        title: "Lost track of the order",
        text: `${whereLost(step.order)} ${step.reason}`,
      }
    case "order":
      return step.stage === "failed"
        ? { title: "The order stopped", text: step.order.errorMessage ?? "The machine reports an error." }
        : null
  }
}

/** The order after the button: the glass of the drink ordered, where it stands in words, and the way back. */
function OrderView({ step, onAgain }: { step: AfterTheButton; onAgain: () => void }) {
  const { drink } = step
  const stage = step.at === "order" ? step.stage : undefined
  const progress = step.at === "order" ? (step.order.progressFraction ?? 0) : 0
  const ingredients = ingredientsOf(drink)
  const problem = trouble(step)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your drink</CardTitle>
        <CardDescription>{drink.title}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {problem ? (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>{problem.title}</AlertTitle>
            <AlertDescription>{problem.text}</AlertDescription>
          </Alert>
        ) : (
          stage && (
            <PouringGlass
              shape={glassOf(drink)}
              colour={drink.color}
              fizzy={isFizzy(drink)}
              pour={pourOf[stage]}
              progress={progress}
              confetti={ingredients.flatMap((one) => (one.color ? [one.color] : []))}
            />
          )
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
      {(stage === "ready" || problem) && (
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
    // For the chat only: a page asks the generative UI backend alone (pages/call-part.ts), which has no
    // juicebar_* tool. The showcase page /juice-bar draws the card on a page of its own.
    saveAsPage: false,
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

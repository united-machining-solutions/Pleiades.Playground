import { z } from "zod"

import { jsonOf } from "../../chat/tool-results.ts"

// The answers of the Juice bar API (source/Pleiades.Playground.JuiceBar.Api/Contracts.cs), as a chat has
// them in the result of a tool call. They come from a machine that anyone in its network can publish a
// recipe to, so each is checked before it is drawn: a colour that is not #rrggbb is dropped, and what
// does not have the shape is not drawn at all.

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((colour) => colour.toLowerCase())

/** A colour, or nothing if the machine said something else. */
const colour = z.preprocess((value) => (hex.safeParse(value).success ? value : undefined), hex.optional())

const ingredient = z.object({
  id: z.string().min(1),
  name: z.string().nullish(),
  color: colour,
  runsLow: z.boolean().nullish(),
})

const drink = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullish(),
  color: colour,
  picture: z
    .string()
    .regex(/^[\w-]{1,64}$/)
    .nullish()
    .catch(null),
  components: z.array(ingredient),
})

export type Ingredient = z.infer<typeof ingredient>
export type Drink = z.infer<typeof drink>

/**
 * The drinks in the result of `juicebar_drinks_list`, or null if it is not such a list. A server that gives
 * structured content wraps a list in an object, `{ "result": [...] }`; that is read too.
 */
export function drinksOf(content: unknown): Array<Drink> | null {
  const json = jsonOf(content)
  const wrapped = json !== null && typeof json === "object" && !Array.isArray(json) ? (json as { result?: unknown }).result : json
  const list = z.array(drink).safeParse(wrapped)
  return list.success ? list.data : null
}

const ingredientUse = z.object({
  componentId: z.string().min(1),
  name: z.string().nullish(),
  color: colour,
  pumps: z.array(z.number().int()),
  drinksInHours: z.number().int().min(0).nullish(),
  drinksSinceStart: z.number().int().min(0).nullish(),
  runsLow: z.boolean().nullish(),
})

const consumption = z.object({
  from: z.string(),
  to: z.string(),
  hours: z.number().int().min(1),
  ingredients: z.array(ingredientUse),
  leastUsedId: z.string().nullish(),
  summary: z.string(),
  source: z.string(),
})

export type IngredientUse = z.infer<typeof ingredientUse>
export type Consumption = z.infer<typeof consumption>

/**
 * The use of the ingredients in the result of `juicebar_consumption_get`, or null if it is not one. The tool
 * counts, orders and names the least used one; the card only words it.
 */
export function consumptionOf(content: unknown): Consumption | null {
  const parsed = consumption.safeParse(jsonOf(content))
  return parsed.success ? parsed.data : null
}

/** How the card lists the ingredients: as the tool gave them, the most used since the start first, or by the last hours. */
export type UseOrder = "start" | "hours"

/**
 * The ingredients in the order a person chose. The tool's order stands for "start"; for "hours" the most used in
 * the last hours come first, those whose count is not known last, and a tie keeps the tool's order.
 */
export function inUseOrder(ingredients: ReadonlyArray<IngredientUse>, order: UseOrder): Array<IngredientUse> {
  if (order === "start") return [...ingredients]
  return [...ingredients].sort((a, b) => (b.drinksInHours ?? -1) - (a.drinksInHours ?? -1))
}

const order = z.object({
  orderNumber: z.number().int(),
  orderName: z.string().nullish(),
  drinkId: z.string().nullish(),
  state: z.string().nullish(),
  progressFraction: z.number().min(0).max(1).nullish(),
  queuePlace: z.number().int().nullish(),
  errorMessage: z.string().nullish(),
})

export type Order = z.infer<typeof order>

/** An order in the result of `juicebar_order_create` or `juicebar_order_get`, or null. */
export function orderOf(content: unknown): Order | null {
  const parsed = order.safeParse(jsonOf(content))
  return parsed.success ? parsed.data : null
}

/**
 * Why an order got no number. `refused`: the juice bar answered and placed nothing, so ordering again is
 * safe. `unsure`: no answer came, or the service itself does not know whether the machine took the order
 * (its words, source/Pleiades.Playground.JuiceBar.Api/MixerClient.cs, CreateOrderAsync): a second order may
 * make a second drink.
 */
export function whyNoOrder(failure: { reason: string; answered: boolean }): "refused" | "unsure" {
  return failure.answered && !/whether it was placed is unknown/i.test(failure.reason) ? "refused" : "unsure"
}

/** Where an order stands, as the card shows it. */
export type Stage = "queued" | "mixing" | "ready" | "failed"

/**
 * The stage of an order by the words of MixerControl: `waitForProduction` while it waits for the start
 * button, `inProduction` while the pumps run, `productionFinished` when the glass is full.
 */
export function stageOf(order: Order): Stage {
  if (order.state === "error" || order.errorMessage) return "failed"
  if (order.state === "productionFinished") return "ready"
  if (order.state === "inProduction" || (order.progressFraction ?? 0) > 0) return "mixing"
  return "queued"
}

/**
 * Where an order stands that the card lost sight of, by the state it was read in last: one that waited for
 * the start button waits there still, one that was mixing fills its glass at the machine.
 */
export function whereLost(order: Order): string {
  return stageOf(order) === "queued"
    ? `Order ${order.orderNumber} was placed and waits in the machine: put a glass under the outlet and press start there.`
    : `Order ${order.orderNumber} was mixing when the card lost sight of it: take the glass from the outlet when the machine is done.`
}

/** The shapes of glass the card draws. */
export type Glass = "highball" | "straw" | "hurricane" | "martini" | "margarita"

/**
 * The pictures of glasses an author can choose in the marketplace, by the id of their drawing, and the
 * glass the card draws for each. A picture not named here, and the default one, `AkiSchorle`, which
 * every recipe gets that its author did not give a picture, take a glass by the ingredients.
 */
const glassOfPicture: Record<string, Glass> = { _2: "straw", _6: "straw", _22: "martini", _63: "margarita" }

const tropical = /maracuja|passion|mango|pineapple|ananas/i

/** The glass of a drink: the one its author chose, else a hurricane for a tropical drink, else a highball. */
export function glassOf(drink: Drink): Glass {
  const chosen = drink.picture ? glassOfPicture[drink.picture] : undefined
  if (chosen) return chosen
  return drink.components.some((one) => tropical.test(one.name ?? "")) ? "hurricane" : "highball"
}

const water = /water|wasser/i

/** Whether a drink has mineral water in it: it gets bubbles. */
export function isFizzy(drink: Drink): boolean {
  return drink.components.some((one) => water.test(one.name ?? ""))
}

/** The name of an ingredient as a row shows it: "Cherry" for "Cherry Juice", "Kirsch" for "Kirschsaft". */
export function shortName(one: Ingredient): string {
  const name = one.name?.trim() || "Unknown"
  return name.replace(/\s+juice$/i, "").replace(/(?<=\p{L}{3})saft$/u, "") || name
}

/**
 * The ingredients in a fixed order, because the machine sends them in a new order every time: the juices
 * by name, the water last.
 */
export function ingredientsOf(drink: Drink): Array<Ingredient> {
  const isWater = (one: Ingredient) => water.test(one.name ?? "")
  return [...drink.components].sort(
    (a, b) => Number(isWater(a)) - Number(isWater(b)) || shortName(a).localeCompare(shortName(b)),
  )
}

/**
 * What a person can order now: every drink whose bottles do not warn. The machine measures no fill level;
 * a bottle that warns runs low, and a drink is better left out early than half poured. The ingredients
 * that run low come along, so the card can say why a drink is missing.
 */
export function orderable(drinks: ReadonlyArray<Drink>): { drinks: Array<Drink>; hidden: number; low: Array<string> } {
  const runsLow = (one: Drink) => one.components.some((part) => part.runsLow === true)
  const low = [
    ...new Set(drinks.flatMap((one) => one.components.filter((part) => part.runsLow === true).map(shortName))),
  ].sort((a, b) => a.localeCompare(b))
  const shown = drinks.filter((one) => !runsLow(one)).sort((a, b) => a.title.localeCompare(b.title))
  return { drinks: shown, hidden: drinks.length - shown.length, low }
}

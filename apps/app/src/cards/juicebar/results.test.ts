import assert from "node:assert/strict"
import { test } from "node:test"

import {
  consumptionOf,
  drinksOf,
  glassOf,
  inUseOrder,
  ingredientsOf,
  isFizzy,
  orderOf,
  orderable,
  shortName,
  stageOf,
  whereLost,
  whyNoOrder,
} from "./results.ts"
import type { Drink } from "./results.ts"

/** The use of the ingredients as juicebar_consumption_get returns it, from the machine of the demo on 19 Nov 2026. */
const used = {
  from: "2026-11-19T10:00:00+00:00",
  to: "2026-11-19T18:00:00+00:00",
  hours: 8,
  ingredients: [
    { componentId: "f6d3", name: "Orange Juice", color: "#FF9900", pumps: [6], drinksInHours: 2, drinksSinceStart: 19, runsLow: false },
    { componentId: "0425", name: "Cherry Juice", color: "#cc0000", pumps: [4], drinksInHours: 3, drinksSinceStart: 7, runsLow: null },
    { componentId: "198f", name: "Apple Juice", color: "white", pumps: [3], drinksInHours: 2, drinksSinceStart: 5, runsLow: true },
    { componentId: "x", name: null, pumps: [9], drinksInHours: null, drinksSinceStart: null },
  ],
  leastUsedId: "198f",
  summary: "Apple Juice is used least.",
  source: "The report of the marketplace.",
}

test("the use of the ingredients is read as the tool gives it, and a colour that is not #rrggbb is dropped", () => {
  const read = consumptionOf(JSON.stringify(used))
  assert.ok(read)
  assert.equal(read.leastUsedId, "198f")
  assert.equal(read.ingredients[0]?.color, "#ff9900")
  assert.equal(read.ingredients[2]?.color, undefined)
  assert.equal(read.ingredients[3]?.drinksSinceStart, null)
  assert.equal(consumptionOf(JSON.stringify({ ...used, hours: 0 })), null)
  assert.equal(consumptionOf(JSON.stringify([used])), null)
})

test("the ingredients stand in the tool's order since the start, or by the last hours with the unknown last", () => {
  const read = consumptionOf(JSON.stringify(used))
  assert.ok(read)
  assert.deepEqual(
    inUseOrder(read.ingredients, "start").map((one) => one.componentId),
    ["f6d3", "0425", "198f", "x"],
  )
  assert.deepEqual(
    inUseOrder(read.ingredients, "hours").map((one) => one.componentId),
    ["0425", "f6d3", "198f", "x"],
  )
})

/** Two drinks as juicebar_drinks_list returns them, from the machine of the demo on 18 Nov 2026. */
const listed = [
  {
    id: "2201036c-bbd1-42b6-aa5a-cdffd2aba98c",
    title: "Virgin Screwdriver",
    description: "Bei Bedarf mit Vodka auffüllen ;)",
    color: "#FF9A00",
    picture: "_22",
    components: [{ id: "f6d3", name: "Orange Juice", color: "#ff9900", runsLow: false }],
  },
  {
    id: "fd96af6c-96d5-4029-8b9a-8ac5c7a3cd7e",
    title: "Maracuja Sunrise",
    description: null,
    color: "#ffcc00",
    picture: "AkiSchorle",
    components: [
      { id: "570a", name: "Mineral Water", color: "#00bfff", runsLow: false },
      { id: "14b7", name: "Maracuja Juice", color: "#ffcc00", runsLow: true },
      { id: "f6d3", name: "Orange Juice", color: "#ff9900", runsLow: false },
    ],
  },
]

test("a list of drinks is read with its colours and pictures, the colours in lower case", () => {
  const drinks = drinksOf(JSON.stringify(listed))
  assert.ok(drinks)
  assert.equal(drinks.length, 2)
  assert.equal(drinks[0]?.color, "#ff9a00")
  assert.equal(drinks[0]?.picture, "_22")
  assert.equal(drinks[1]?.components[1]?.runsLow, true)
})

test("a colour that is not #rrggbb and a picture that is not an id are dropped, the drink stays", () => {
  const drinks = drinksOf(
    JSON.stringify([
      { ...listed[0], color: "red; background: url(x)", picture: "<script>", components: [{ id: "a", color: "blue" }] },
    ]),
  )
  assert.equal(drinks?.length, 1)
  assert.equal(drinks?.[0]?.color, undefined)
  assert.equal(drinks?.[0]?.picture, null)
  assert.equal(drinks?.[0]?.components[0]?.color, undefined)
})

test("what is not a list of drinks is not drawn", () => {
  assert.equal(drinksOf("The juice bar is not reachable."), null)
  assert.equal(drinksOf(JSON.stringify({ title: "Tropical Mix" })), null)
  assert.equal(drinksOf(JSON.stringify([{ id: "x" }])), null)
})

const drinkNamed = (title: string, picture: string | null, names: Array<string>): Drink => ({
  id: title,
  title,
  picture,
  components: names.map((name) => ({ id: name, name })),
})

test("the glass is the one the author chose, else a hurricane for a tropical drink, else a highball", () => {
  assert.equal(glassOf(drinkNamed("Virgin Screwdriver", "_22", ["Orange Juice"])), "martini")
  assert.equal(glassOf(drinkNamed("All in", "_63", ["Mango Juice"])), "margarita")
  assert.equal(glassOf(drinkNamed("90s KIBA", "_6", ["Cherry Juice"])), "straw")
  assert.equal(glassOf(drinkNamed("Tropical Mix", "AkiSchorle", ["Orange Juice", "Pineapple Juice"])), "hurricane")
  assert.equal(glassOf(drinkNamed("Apple Spritzer", "AkiSchorle", ["Apple Juice", "Mineral Water"])), "highball")
  assert.equal(glassOf(drinkNamed("Unknown picture", "_99", ["Kirschsaft"])), "highball")
  assert.equal(glassOf(drinkNamed("No picture", null, ["Mangosaft"])), "hurricane")
})

test("ingredients come in a fixed order, the water last, with short names", () => {
  const sunrise = drinksOf(JSON.stringify(listed))?.[1]
  assert.ok(sunrise)
  assert.deepEqual(ingredientsOf(sunrise).map(shortName), ["Maracuja", "Orange", "Mineral Water"])
  assert.equal(isFizzy(sunrise), true)
  assert.equal(shortName({ id: "k", name: "Kirschsaft" }), "Kirsch")
  assert.equal(shortName({ id: "w", name: "Mineralwasser" }), "Mineralwasser")
  assert.equal(shortName({ id: "u" }), "Unknown")
})

test("a drink whose bottle runs low is left out, and the card can say which bottle", () => {
  const drinks = drinksOf(JSON.stringify(listed))
  assert.ok(drinks)
  const shown = orderable(drinks)
  assert.deepEqual(
    shown.drinks.map((one) => one.title),
    ["Virgin Screwdriver"],
  )
  assert.equal(shown.hidden, 1)
  assert.deepEqual(shown.low, ["Maracuja"])
})

test("an order is in the queue until the pumps run, then mixing, then ready", () => {
  const placed = orderOf(JSON.stringify({ orderNumber: 4, orderName: "Tropical Mix", state: "waitForProduction", progressFraction: null }))
  assert.ok(placed)
  assert.equal(stageOf(placed), "queued")
  assert.equal(stageOf({ ...placed, state: "inProduction", progressFraction: 0.4 }), "mixing")
  assert.equal(stageOf({ ...placed, state: null, progressFraction: 0.1 }), "mixing")
  assert.equal(stageOf({ ...placed, state: "productionFinished", progressFraction: 1 }), "ready")
  assert.equal(stageOf({ ...placed, state: "error" }), "failed")
  assert.equal(orderOf("The juice bar refused the order."), null)
})

test("a lost order is told by the state it was read in last: waiting for the start button, or mixing", () => {
  const placed = orderOf(JSON.stringify({ orderNumber: 4, orderName: "Tropical Mix", state: "waitForProduction", progressFraction: null }))
  assert.ok(placed)
  assert.match(whereLost(placed), /^Order 4 was placed and waits in the machine: put a glass under the outlet and press start there\.$/)
  const mixing = whereLost({ ...placed, state: "inProduction", progressFraction: 0.4 })
  assert.match(mixing, /^Order 4 was mixing/)
  assert.doesNotMatch(mixing, /press start|put a glass/)
})

test("an order without a number is refused only where the juice bar said so; else it may stand in the machine", () => {
  assert.equal(whyNoOrder({ reason: "3 orders wait at the juice bar; the limit is 3. Try again when one is made.", answered: true }), "refused")
  assert.equal(whyNoOrder({ reason: "Ordering is switched off in this service (JUICEBAR_ENABLE_ORDERING).", answered: true }), "refused")
  assert.equal(
    whyNoOrder({
      reason: "The juice bar did not answer the order. Whether it was placed is unknown: read the status before ordering again.",
      answered: true,
    }),
    "unsure",
  )
  assert.equal(whyNoOrder({ reason: "The juice bar did not answer: REQUEST_TIMEOUT.", answered: false }), "unsure")
})

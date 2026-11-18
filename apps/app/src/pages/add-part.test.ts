import assert from "node:assert/strict"
import { test } from "node:test"

import type { ChatTool } from "../chat/tool-results.ts"
import { argumentsOf, cannotAdd, cardChoicesOf, hintOf, labelOf, partOf, whyOff } from "./add-part.ts"
import type { CardChoice } from "./add-part.ts"
import { MAX_PARTS } from "./recipe.ts"

// The input schemas as the generative UI backend lists them (JSON schema): the time zone every card
// takes, a machine, the hours of a history.
const timeZone = { type: "string", description: "The IANA time zone to write every instant of the result in." }
const machine = { type: "string", pattern: "^[^/+#]+$", description: "The machine id." }
const hours = { type: "integer", minimum: 1, maximum: 24, description: "How many hours back the history goes. 8 if omitted." }

const listed = [
  { name: "genui_describe_server", inputSchema: { type: "object", properties: {}, required: [] } },
  { name: "genui_machine_list", inputSchema: { type: "object", properties: { timeZone }, required: [] } },
  {
    name: "genui_machine_show",
    inputSchema: { type: "object", properties: { machine, hours, timeZone }, required: ["machine"] },
  },
  { name: "genui_measurement_list", inputSchema: { type: "object", properties: { machine, timeZone } } },
  {
    name: "genui_span_list",
    inputSchema: { type: "object", properties: { machine, from: { type: "string" }, to: { type: "string" } }, required: ["machine", "from", "to"] },
  },
]

// The tools as the chat lists them (chat/cards.tsx): one of the backend itself without a card, the
// cards a page can hold, one only a card calls, and one only the chat calls.
const tools: ReadonlyArray<ChatTool> = [
  { name: "genui_describe_server" },
  { name: "genui_machine_show", part: "One machine and its last hours", draw: () => "card" },
  { name: "genui_machine_list", part: "Every machine and what it does now", draw: () => "list" },
  { name: "genui_measurement_list", part: "What the machines measure now", draw: () => "measurements" },
  { name: "genui_site_list", part: "Every site and its machines", draw: () => "sites" },
  { name: "genui_span_list", cardOnly: true, draw: () => "band" },
  { name: "app_page_propose", saveAsPage: false, draw: () => "proposal" },
]

const show: CardChoice = {
  tool: "genui_machine_show",
  shows: "One machine and its last hours",
  asks: [
    { name: "machine", kind: "machine", required: true },
    { name: "hours", kind: "whole", required: false, min: 1, max: 24 },
  ],
  cannotAsk: [],
}

test("the cards a person can add are the tools a page can call that the backend lists, in the order of the chat", () => {
  assert.deepEqual(cardChoicesOf(listed, tools), [
    show,
    { tool: "genui_machine_list", shows: "Every machine and what it does now", asks: [], cannotAsk: [] },
    {
      tool: "genui_measurement_list",
      shows: "What the machines measure now",
      asks: [{ name: "machine", kind: "machine", required: false }],
      cannotAsk: [],
    },
  ])
})

test("a card without words for what it shows is not offered: a person never chooses a tool by its name", () => {
  const nameless = tools.map((tool) => (tool.name === "genui_machine_list" ? { ...tool, part: undefined } : tool))
  assert.deepEqual(
    cardChoicesOf(listed, nameless).map((card) => card.tool),
    ["genui_machine_show", "genui_measurement_list"],
  )
})

test("a new card that takes the arguments of today needs no line here", () => {
  const more = [...tools, { name: "genui_energy_show", part: "The energy of one machine", draw: () => "energy" }]
  const energy = {
    name: "genui_energy_show",
    inputSchema: { type: "object", properties: { machine, days: { type: "integer", minimum: 1, maximum: 7 } }, required: ["machine", "days"] },
  }
  assert.deepEqual(cardChoicesOf([...listed, energy], more).at(-1), {
    tool: "genui_energy_show",
    shows: "The energy of one machine",
    asks: [
      { name: "machine", kind: "machine", required: true },
      { name: "days", kind: "whole", required: true, min: 1, max: 7 },
    ],
    cannotAsk: [],
  })
})

test("the time zone is never asked, an optional argument the form does not know stays out, a required one cannot be asked", () => {
  assert.deepEqual(
    argumentsOf({
      type: "object",
      properties: { timeZone, site: { type: "string" }, ratio: { type: "number" }, mode: { type: "string", enum: ["a", "b"] }, slots: { type: "integer" } },
      required: ["site", "timeZone"],
    }),
    { asks: [{ name: "slots", kind: "whole", required: false }], cannotAsk: ["site"] },
  )
  // A required argument the schema does not describe cannot be asked either.
  assert.deepEqual(argumentsOf({ type: "object", properties: {}, required: ["machine"] }), { asks: [], cannotAsk: ["machine"] })
  // Only an argument called machine is a machine.
  assert.deepEqual(argumentsOf({ type: "object", properties: { machineId: { type: "string" } }, required: ["machineId"] }), {
    asks: [],
    cannotAsk: ["machineId"],
  })
})

test("a schema that is not one asks for nothing", () => {
  for (const schema of [undefined, null, "{}", [], { properties: null }, { properties: { hours: null } }]) {
    assert.deepEqual(argumentsOf(schema), { asks: [], cannotAsk: [] })
  }
})

test("a card the form cannot fill makes no part, and says what it needs", () => {
  const sites = { tool: "genui_site_show", shows: "One site", asks: [], cannotAsk: ["site"] }
  assert.deepEqual(partOf(sites, {}), { part: null, problems: { site: "This card needs site, which this form cannot ask for." } })
})

test("the part of a card has its arguments in the order of the schema, without those left empty", () => {
  assert.deepEqual(partOf(show, { hours: 24, machine: "P-04" }), {
    part: { tool: "genui_machine_show", args: { machine: "P-04", hours: 24 } },
    problems: null,
  })
  assert.deepEqual(partOf(show, { machine: "P-04", hours: null }), {
    part: { tool: "genui_machine_show", args: { machine: "P-04" } },
    problems: null,
  })
  // An optional machine left empty is every machine: the tool takes no machine then.
  const measurements: CardChoice = { tool: "genui_measurement_list", shows: "Measurements", asks: [{ name: "machine", kind: "machine", required: false }], cannotAsk: [] }
  assert.deepEqual(partOf(measurements, {}), { part: { tool: "genui_measurement_list", args: {} }, problems: null })
  // What the form does not ask for does not go into the part.
  assert.deepEqual(partOf({ tool: "genui_machine_list", shows: "Machines", asks: [], cannotAsk: [] }, { timeZone: "Europe/Zurich" }), {
    part: { tool: "genui_machine_list", args: {} },
    problems: null,
  })
})

test("a required argument left empty, or a number out of its range, says why", () => {
  assert.deepEqual(partOf(show, { hours: 30 }), {
    part: null,
    problems: { machine: "Choose a machine.", hours: "A whole number from 1 to 24." },
  })
  assert.deepEqual(partOf(show, { machine: "P-04", hours: 2.5 }).problems, { hours: "A whole number from 1 to 24." })
  assert.deepEqual(partOf(show, { machine: 4, hours: "8" }).problems, { machine: "Choose a machine.", hours: "A whole number." })
  const days: CardChoice = { tool: "t", shows: "Days", asks: [{ name: "days", kind: "whole", required: true, min: 1 }], cannotAsk: [] }
  assert.deepEqual(partOf(days, {}).problems, { days: "Give a whole number." })
  assert.deepEqual(partOf(days, { days: 0 }).problems, { days: "A whole number, 1 or more." })
})

test("the energy card is offered with its hours, and without a choice of machines it shows every machine", () => {
  // As genui-mcp lists genui_energy_show: an optional list of machines, and the hours.
  const energy = {
    name: "genui_energy_show",
    inputSchema: {
      type: "object",
      properties: {
        machines: { type: "array", minItems: 1, items: machine, description: "The machines to compare." },
        hours: { type: "integer", minimum: 1, maximum: 24, description: "How many hours back. The card offers 1, 8 and 24." },
        timeZone,
      },
      required: [],
    },
  }
  const withEnergy = [{ name: "genui_energy_show", part: "The energy of the machines over the last hours", draw: () => "energy" }, ...tools]
  const [card] = cardChoicesOf([energy, ...listed], withEnergy)
  assert.deepEqual(card, {
    tool: "genui_energy_show",
    shows: "The energy of the machines over the last hours",
    asks: [{ name: "hours", kind: "whole", required: false, min: 1, max: 24 }],
    cannotAsk: [],
  })
  assert.equal(whyOff(card, null), null)
  assert.deepEqual(partOf(card, {}), { part: { tool: "genui_energy_show", args: {} }, problems: null })
  assert.deepEqual(partOf(card, { hours: 1 }).part, { tool: "genui_energy_show", args: { hours: 1 } })
})

test("the hint under a number says its range in words, not what the schema tells a language model", () => {
  assert.equal(hintOf({ name: "hours", kind: "whole", required: false, min: 1, max: 24 }), "A whole number from 1 to 24. Left empty, the card takes its own.")
  assert.equal(hintOf({ name: "days", kind: "whole", required: true, min: 1 }), "A whole number, 1 or more.")
  assert.equal(hintOf({ name: "slots", kind: "whole", required: true }), "A whole number.")
})

test("a field is called by what it asks", () => {
  assert.equal(labelOf({ name: "machine", kind: "machine", required: true }), "Machine")
  assert.equal(labelOf({ name: "hours", kind: "whole", required: false }), "Hours")
  assert.equal(labelOf({ name: "historyDays", kind: "whole", required: false }), "History days")
})

test("a page that shows the same part, or is full, says why nothing is added", () => {
  const parts = [
    { tool: "genui_machine_list", args: {} },
    { tool: "genui_machine_show", args: { machine: "P-04", hours: 8 } },
  ]
  assert.equal(cannotAdd(parts, { tool: "genui_machine_show", args: { machine: "P-04" } }), null)
  assert.equal(cannotAdd(parts, { tool: "genui_machine_show", args: { machine: "M-02", hours: 8 } }), null)
  assert.equal(
    cannotAdd(parts, { tool: "genui_machine_show", args: { hours: 8, machine: "P-04" } }),
    "Part 2 of this page is the same card with the same choices, and a page shows it once.",
  )
  const full = Array.from({ length: MAX_PARTS }, (_, at) => ({ tool: "genui_machine_show", args: { machine: `M-${at}` } }))
  assert.equal(cannotAdd(full, { tool: "genui_site_list", args: {} }), `A page holds at most ${MAX_PARTS} parts. Remove one to add another.`)
})

test("a card is off where the form cannot ask what it takes, or it needs a machine and there are none to choose", () => {
  assert.equal(whyOff(show, null), null)
  const machines = "The Events API answered 404."
  assert.equal(whyOff(show, machines), `It needs a machine, and the machines cannot be read now. ${machines}`)
  // A machine that may stay out is every machine then: the card stays on.
  const measurements: CardChoice = { tool: "genui_measurement_list", shows: "Measurements", asks: [{ name: "machine", kind: "machine", required: false }], cannotAsk: [] }
  assert.equal(whyOff(measurements, machines), null)
  assert.equal(whyOff({ tool: "genui_site_show", shows: "One site", asks: [], cannotAsk: ["site", "hall"] }, null), "It takes site, hall, which this form cannot ask for.")
})

import assert from "node:assert/strict"
import { test } from "node:test"

import type { ChatTool } from "../chat/tool-results.ts"
import { PROPOSE_PAGE_TOOL, pageToolNames, partInWords, proposePage, proposedRecipe } from "./proposal.ts"
import { MAX_ARGS_LENGTH, MAX_PARTS, MAX_TITLE_LENGTH } from "./recipe.ts"

// The tools as the chat lists them (chat/cards.tsx): the two of the backend itself, without a card,
// two the chat draws, one only a card calls, and the proposal of a page, which the chat draws and only
// the chat calls.
const tools: ReadonlyArray<ChatTool> = [
  { name: "genui_describe_server" },
  { name: "genui_get_skill_guide" },
  { name: "genui_machine_list", part: "Every machine and what it does now", draw: () => "list" },
  { name: "genui_machine_show", part: "One machine and its last hours", draw: () => "card" },
  { name: "genui_span_list", cardOnly: true, draw: () => "band" },
  { name: PROPOSE_PAGE_TOOL, saveAsPage: false, draw: () => "proposal" },
]

const list = { tool: "genui_machine_list" }
const show = (machine: string, hours?: number) => ({
  tool: "genui_machine_show",
  args: hours === undefined ? { machine } : { machine, hours },
})

test("the tools a page can call are the ones the chat draws, read from its list", () => {
  assert.deepEqual(pageToolNames(tools), ["genui_machine_list", "genui_machine_show"])
})

test("a new card is a tool a page can call without a line of its own here", () => {
  const more = [...tools, { name: "genui_energy_list", draw: () => "energy" }]
  assert.deepEqual(pageToolNames(more), ["genui_machine_list", "genui_machine_show", "genui_energy_list"])
})

test("a proposal is the checked recipe: the title and the parts in their order", () => {
  const proposal = proposePage({ title: "Shop floor", parts: [list, show("P-04", 12)] }, tools)
  assert.deepEqual(proposal, {
    recipe: {
      title: "Shop floor",
      parts: [
        { tool: "genui_machine_list", args: {} },
        { tool: "genui_machine_show", args: { machine: "P-04", hours: 12 } },
      ],
    },
    leftOut: [],
  })
})

test("a part whose tool a page cannot call is left out, with the tools a page can call", () => {
  const proposal = proposePage(
    {
      title: "Shop floor",
      parts: [
        { tool: "genui_span_list", args: { machine: "P-04" } },
        list,
        { tool: PROPOSE_PAGE_TOOL },
        { tool: "genui_get_skill_guide" },
        { tool: "genui_alarm_list" },
      ],
    },
    tools,
  )
  assert.deepEqual(proposal.recipe.parts, [{ tool: "genui_machine_list", args: {} }])
  assert.deepEqual(
    proposal.leftOut.map(({ part, tool }) => [part, tool]),
    [
      [1, "genui_span_list"],
      [3, PROPOSE_PAGE_TOOL],
      [4, "genui_get_skill_guide"],
      [5, "genui_alarm_list"],
    ],
  )
  for (const { reason } of proposal.leftOut) {
    assert.match(reason, /The tools a page can call are genui_machine_list, genui_machine_show\./)
  }
  assert.equal(proposal.leftOut[0]?.reason.startsWith("A page cannot call genui_span_list."), true)
})

test("a part keeps no time zone: the app adds the one of the person who opens the page", () => {
  const proposal = proposePage(
    { title: "P-04", parts: [{ tool: "genui_machine_show", args: { machine: "P-04", timeZone: "Europe/Zurich" } }] },
    tools,
  )
  assert.deepEqual(proposal.recipe.parts, [{ tool: "genui_machine_show", args: { machine: "P-04" } }])
  assert.deepEqual(proposal.leftOut, [])
})

test("a part with arguments that are not an object, or too large, is left out and says why", () => {
  const proposal = proposePage(
    {
      title: "Shop floor",
      parts: [
        { tool: "genui_machine_show", args: "P-04" },
        { tool: "genui_machine_show", args: ["P-04"] },
        { tool: "genui_machine_show", args: { machine: "x".repeat(MAX_ARGS_LENGTH) } },
        list,
      ],
    },
    tools,
  )
  assert.deepEqual(proposal.recipe.parts, [{ tool: "genui_machine_list", args: {} }])
  assert.deepEqual(
    proposal.leftOut.map(({ part }) => part),
    [1, 2, 3],
  )
  assert.match(proposal.leftOut[0]?.reason ?? "", /object of names and values/)
  assert.match(proposal.leftOut[2]?.reason ?? "", new RegExp(`at most ${MAX_ARGS_LENGTH} characters`))
})

test("the same part twice is shown once, where it first stands, whatever the order of its arguments", () => {
  const proposal = proposePage(
    {
      title: "P-04",
      parts: [
        { tool: "genui_machine_show", args: { machine: "P-04", hours: 8 } },
        list,
        { tool: "genui_machine_show", args: { hours: 8, machine: "P-04" } },
      ],
    },
    tools,
  )
  assert.equal(proposal.recipe.parts.length, 2)
  assert.deepEqual(proposal.leftOut, [
    { part: 3, tool: "genui_machine_show", reason: "It is the same as part 1, and a page shows it once." },
  ])
})

test("a page holds at most MAX_PARTS parts; the ones beyond are left out and say so", () => {
  const parts = Array.from({ length: MAX_PARTS + 2 }, (_, index) => show(`P-${index}`))
  const proposal = proposePage({ title: "Every machine", parts }, tools)
  assert.equal(proposal.recipe.parts.length, MAX_PARTS)
  assert.deepEqual(
    proposal.leftOut.map(({ part, reason }) => [part, reason]),
    [
      [MAX_PARTS + 1, `A page holds at most ${MAX_PARTS} parts.`],
      [MAX_PARTS + 2, `A page holds at most ${MAX_PARTS} parts.`],
    ],
  )
})

test("a title is one line, cut where it is longer than a title may be", () => {
  const proposal = proposePage({ title: `  Shop\nfloor ${"a".repeat(MAX_TITLE_LENGTH)} `, parts: [list] }, tools)
  assert.equal(proposal.recipe.title.length, MAX_TITLE_LENGTH)
  assert.ok(proposal.recipe.title.startsWith("Shop floor a"))
  assert.ok(proposal.recipe.title.endsWith("…"))
})

test("without a title there is no page, and the error says what a title is", () => {
  assert.throws(() => proposePage({ title: " \n ", parts: [list] }, tools), {
    message: "A page needs a title: a few words that say what it shows.",
  })
})

test("without a part left there is no page, and the error gives the reason of each part", () => {
  assert.throws(() => proposePage({ title: "Spans", parts: [{ tool: "genui_span_list" }] }, tools), (error: Error) => {
    assert.match(error.message, /^No part is left, so there is no page to propose\. Part 1: A page cannot call genui_span_list\./)
    return true
  })
  assert.throws(() => proposePage({ title: "Nothing", parts: [] }, tools), {
    message: "No part is left, so there is no page to propose.",
  })
})

test("the chat reads the recipe of a result, and nothing that is not exactly a recipe", () => {
  const proposal = proposePage({ title: "Shop floor", parts: [list, show("P-04")] }, tools)
  assert.deepEqual(proposedRecipe(JSON.stringify(proposal)), proposal.recipe)
  for (const content of [
    "",
    "not JSON",
    "null",
    "[]",
    JSON.stringify({ leftOut: [] }),
    JSON.stringify({ recipe: { title: "", parts: [list] } }),
    JSON.stringify({ recipe: { title: "Shop floor", parts: [] } }),
    JSON.stringify({ recipe: { title: "Shop floor", parts: [{ tool: "genui_machine_list", args: { timeZone: "UTC" } }] } }),
    { recipe: proposal.recipe },
  ]) {
    assert.equal(proposedRecipe(content), null, JSON.stringify(content))
  }
})

test("a part in words is what its card shows and the arguments it is called with", () => {
  assert.deepEqual(partInWords({ tool: "genui_machine_list", args: {} }, tools), {
    shows: "Every machine and what it does now",
    given: "",
  })
  assert.deepEqual(partInWords({ tool: "genui_machine_show", args: { machine: "P-04", hours: 12 } }, tools), {
    shows: "One machine and its last hours",
    given: "machine: P-04, hours: 12",
  })
})

test("a part of a tool without words of its own is named by its tool", () => {
  const more = [...tools, { name: "genui_energy_list", draw: () => "energy" }]
  assert.deepEqual(partInWords({ tool: "genui_energy_list", args: { machines: ["P-04"] } }, more), {
    shows: "genui_energy_list",
    given: 'machines: ["P-04"]',
  })
})

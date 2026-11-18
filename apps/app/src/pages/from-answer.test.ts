import assert from "node:assert/strict"
import { test } from "node:test"

import type { UIMessage } from "@tanstack/ai-react"

import { blocksOf } from "../chat/blocks.ts"
import { jsonOf } from "../chat/tool-results.ts"
import type { ChatTool } from "../chat/tool-results.ts"
import { callsOfAnswer, keepOfAnswer, recipeOfAnswer } from "./from-answer.ts"
import { MAX_ARGS_LENGTH, MAX_PARTS, MAX_TITLE_LENGTH } from "./recipe.ts"

type Parts = UIMessage["parts"]

const call = (id: string, name: string, args: unknown = {}, extra: object = {}) =>
  ({
    type: "tool-call",
    id,
    name,
    arguments: typeof args === "string" ? args : JSON.stringify(args),
    state: "input-complete",
    ...extra,
  }) as Parts[number]
const result = (toolCallId: string, content: string, state = "complete") =>
  ({ type: "tool-result", toolCallId, content, state }) as Parts[number]
const text = (content: string) => ({ type: "text", content }) as Parts[number]
const list = '{"asOf":"2026-11-16T09:30:00.000Z","windowSeconds":1800,"machines":[]}'
const shown = '{"asOf":"2026-11-16T09:30:00.000Z","windowSeconds":1800,"machine":{}}'

/** Whether a result has that key: a stand-in for the contract of a card. */
const has = (key: string) => (content: unknown) =>
  typeof jsonOf(content) === "object" && jsonOf(content) !== null && key in (jsonOf(content) as object)

// The tools the way the chat lists them: two the chat draws, one that draws nothing, one only a card calls.
const tools: ReadonlyArray<ChatTool> = [
  { name: "genui_get_skill_guide" },
  { name: "genui_machine_show", draw: (content) => (has("machine")(content) ? "the card" : null) },
  { name: "genui_machine_list", draw: (content) => (has("machines")(content) ? "the list" : null) },
  { name: "genui_span_list", cardOnly: true, draw: () => "band" },
]

/** The parts of an answer with one drawn card. */
const oneCard = (args: unknown = { machine: "P-04" }) => [
  call("a", "genui_machine_show", args),
  result("a", shown),
  text("P-04 is stopped."),
]

test("the recipe of an answer is its question and the tool calls the chat drew, in their order", () => {
  const parts = [
    call("a", "genui_get_skill_guide"),
    result("a", "# The guide"),
    call("b", "genui_machine_list", { windowSeconds: 1800 }),
    result("b", list),
    call("c", "genui_machine_show", { machine: "P-04", hours: 12 }),
    result("c", shown),
    text("Here is what the machines do."),
  ]
  assert.deepEqual(recipeOfAnswer("What needs me?", parts, tools), {
    title: "What needs me?",
    parts: [
      { tool: "genui_machine_list", args: { windowSeconds: 1800 } },
      { tool: "genui_machine_show", args: { machine: "P-04", hours: 12 } },
    ],
  })
})

test("no sentence of the answer and no value goes into the recipe", () => {
  const recipe = recipeOfAnswer("What needs me?", oneCard(), tools)
  const written = JSON.stringify(recipe)
  assert.ok(!written.includes("stopped"))
  assert.ok(!written.includes("asOf"))
})

test("the title is the question, on one line and cut where it is too long", () => {
  assert.equal(recipeOfAnswer("  How were P-04\nand   P-07 overnight? ", oneCard(), tools)?.title, "How were P-04 and P-07 overnight?")
  const long = recipeOfAnswer("a ".repeat(200), oneCard(), tools)
  assert.equal(long?.title.length, MAX_TITLE_LENGTH)
  assert.ok(long?.title.endsWith("…"))
})

test("no question, no recipe", () => {
  assert.equal(recipeOfAnswer("", oneCard(), tools), null)
  assert.equal(recipeOfAnswer(" \n ", oneCard(), tools), null)
})

test("an answer without a card has no recipe: only text, only the guide, only a result no card takes", () => {
  assert.equal(recipeOfAnswer("Hi", [text("Hello.")], tools), null)
  assert.equal(recipeOfAnswer("Hi", [call("a", "genui_get_skill_guide"), result("a", "# The guide")], tools), null)
  // The tool is right, but the result does not keep the contract of its card.
  assert.equal(recipeOfAnswer("Hi", [call("a", "genui_machine_show"), result("a", list)], tools), null)
  assert.equal(recipeOfAnswer("Hi", [], tools), null)
})

test("a tool that only a card calls, one the chat does not know, and a result without its call are no parts", () => {
  const parts = [
    call("a", "genui_span_list"),
    result("a", '{"spans":[]}'),
    call("b", "genui_alarm_list"),
    result("b", list),
    result("gone", shown),
  ]
  assert.equal(recipeOfAnswer("Hi", parts, tools), null)
})

test("a call without a result, or with an error as its result, is no part", () => {
  const parts = [
    call("a", "genui_machine_show", { machine: "P-01" }),
    call("b", "genui_machine_show", { machine: "P-02" }),
    result("b", "No machine P-02 is known.", "error"),
    call("c", "genui_machine_show", { machine: "P-03" }),
    result("c", shown),
  ]
  assert.deepEqual(callsOfAnswer(parts, tools), [{ tool: "genui_machine_show", args: { machine: "P-03" } }])
  // An error that still looks like the contract is an error all the same.
  assert.equal(recipeOfAnswer("Hi", [call("a", "genui_machine_show"), result("a", shown, "error")], tools), null)
})

test("the arguments are read from the string of JSON, or from the parsed input where the client has it", () => {
  const parsed = call("a", "genui_machine_show", '{"machine":"P-04"', { input: { machine: "P-07" } })
  assert.deepEqual(callsOfAnswer([parsed, result("a", shown)], tools), [{ tool: "genui_machine_show", args: { machine: "P-07" } }])
  assert.deepEqual(callsOfAnswer(oneCard('{ "machine" : "P-04" }'), tools), [{ tool: "genui_machine_show", args: { machine: "P-04" } }])
  // A call without arguments may carry an empty string.
  assert.deepEqual(callsOfAnswer([call("a", "genui_machine_list", ""), result("a", list)], tools), [
    { tool: "genui_machine_list", args: {} },
  ])
})

test("a call whose arguments cannot be read is left out, the others stay", () => {
  for (const broken of ['{"machine":', "not json", "[1,2]", "null", '"P-04"', "42"]) {
    const parts = [
      call("a", "genui_machine_show", broken),
      result("a", shown),
      call("b", "genui_machine_list"),
      result("b", list),
    ]
    assert.deepEqual(callsOfAnswer(parts, tools), [{ tool: "genui_machine_list", args: {} }], broken)
  }
})

test("arguments the schema of a recipe refuses leave out that part alone", () => {
  const parts = [
    call("a", "genui_machine_show", { machine: "x".repeat(MAX_ARGS_LENGTH) }),
    result("a", shown),
    call("b", "genui_machine_list"),
    result("b", list),
  ]
  assert.deepEqual(callsOfAnswer(parts, tools), [{ tool: "genui_machine_list", args: {} }])
})

test("the time zone is not kept: the app adds the one of the person who opens the page", () => {
  const recipe = recipeOfAnswer("Hi", oneCard({ machine: "P-04", timeZone: "Europe/Zurich" }), tools)
  assert.deepEqual(recipe?.parts, [{ tool: "genui_machine_show", args: { machine: "P-04" } }])
})

test("the same tool with the same arguments counts once, where it first stands", () => {
  const parts = [
    call("a", "genui_machine_show", { machine: "P-04", hours: 12 }),
    result("a", shown),
    call("b", "genui_machine_list"),
    result("b", list),
    // The same arguments in another order, and once with another zone: the same call.
    call("c", "genui_machine_show", { hours: 12, machine: "P-04", timeZone: "Asia/Tokyo" }),
    result("c", shown),
    // Other arguments, or another tool: another part.
    call("d", "genui_machine_show", { machine: "P-07", hours: 12 }),
    result("d", shown),
  ]
  assert.deepEqual(
    callsOfAnswer(parts, tools).map((part) => [part.tool, part.args]),
    [
      ["genui_machine_show", { machine: "P-04", hours: 12 }],
      ["genui_machine_list", {}],
      ["genui_machine_show", { machine: "P-07", hours: 12 }],
    ],
  )
})

test("an answer with more calls than a page holds keeps the first ones, and says how many there were", () => {
  const many: Parts = Array.from({ length: MAX_PARTS + 3 }, (_, index) => [
    call(`c${index}`, "genui_machine_show", { machine: `P-${index}` }),
    result(`c${index}`, shown),
  ]).flat()
  assert.equal(callsOfAnswer(many, tools).length, MAX_PARTS + 3)
  const recipe = recipeOfAnswer("Everything", many, tools)
  assert.equal(recipe?.parts.length, MAX_PARTS)
  assert.deepEqual(recipe?.parts[0], { tool: "genui_machine_show", args: { machine: "P-0" } })
  assert.deepEqual(recipe?.parts.at(-1), { tool: "genui_machine_show", args: { machine: `P-${MAX_PARTS - 1}` } })
})

test("the recipe does not change the answer it was read from", () => {
  const parts = oneCard({ machine: "P-04", timeZone: "Europe/Zurich" })
  const before = JSON.stringify(parts)
  recipeOfAnswer("Hi", parts, tools)
  assert.equal(JSON.stringify(parts), before)
})

const asked = (content: string) => ({ id: `q-${content}`, role: "user", parts: [text(content)] }) as UIMessage
const answered = (parts: Parts) => ({ id: "a", role: "assistant", parts }) as UIMessage
/** The messages of a chat after a question, with ids, so that two answers can be told apart. */
const said = (id: string, parts: Parts) => ({ id, role: "assistant", parts }) as UIMessage

test("the question of an answer is the nearest message of the person before it", () => {
  const messages = [asked("First?"), answered(oneCard()), asked("And P-04 now?"), answered(oneCard({ machine: "P-04" }))]
  assert.equal(keepOfAnswer(messages, 1, tools, false)?.recipe.title, "First?")
  assert.equal(keepOfAnswer(messages, 3, tools, false)?.recipe.title, "And P-04 now?")
})

test("a message that is no answer, an answer without a question and an answer without a card keep nothing", () => {
  const messages = [asked("First?"), answered(oneCard())]
  assert.equal(keepOfAnswer(messages, 0, tools, false), null)
  assert.equal(keepOfAnswer(messages, 5, tools, false), null)
  assert.equal(keepOfAnswer([answered(oneCard())], 0, tools, false), null)
  assert.equal(keepOfAnswer([asked("Hi"), answered([text("Hello.")])], 1, tools, false), null)
})

test("the answer says how many of its cards did not fit on the page", () => {
  const cards = (count: number): Parts =>
    Array.from({ length: count }, (_, index) => [
      call(`c${index}`, "genui_machine_show", { machine: `P-${index}` }),
      result(`c${index}`, shown),
    ]).flat()
  assert.equal(keepOfAnswer([asked("All"), answered(cards(MAX_PARTS - 1))], 1, tools, false)?.left, 0)
  assert.equal(keepOfAnswer([asked("All"), answered(cards(MAX_PARTS))], 1, tools, false)?.left, 0)
  assert.equal(keepOfAnswer([asked("All"), answered(cards(MAX_PARTS + 3))], 1, tools, false)?.left, 3)
})

// The model answers in more than one message: the calls and their results, then the words.
const calls = (id: string, machine: string): Parts => [call(id, "genui_machine_show", { machine }), result(id, shown)]

test("the button stands under the last message of the answer, and keeps the calls of all of them", () => {
  const messages = [
    asked("How were P-04 and P-07?"),
    said("calls", [...calls("a", "P-04"), ...calls("b", "P-07")]),
    said("words", [text("Both ran.")]),
  ]
  assert.equal(keepOfAnswer(messages, 1, tools, false), null)
  assert.deepEqual(keepOfAnswer(messages, 2, tools, false), {
    recipe: {
      title: "How were P-04 and P-07?",
      parts: [
        { tool: "genui_machine_show", args: { machine: "P-04" } },
        { tool: "genui_machine_show", args: { machine: "P-07" } },
      ],
    },
    left: 0,
  })
})

test("calls in several messages of one answer are one list, the same call once", () => {
  const messages = [
    asked("Again?"),
    said("one", calls("a", "P-04")),
    said("two", [...calls("b", "P-04"), ...calls("c", "P-07"), text("Done.")]),
  ]
  assert.deepEqual(
    keepOfAnswer(messages, 2, tools, false)?.recipe.parts.map((part) => part.args.machine),
    ["P-04", "P-07"],
  )
})

test("a message after the last one that shows anything does not take the button", () => {
  const messages = [asked("P-04?"), said("calls", calls("a", "P-04")), said("words", [text("Stopped.")]), said("empty", [text("")])]
  assert.equal(keepOfAnswer(messages, 3, tools, false), null)
  assert.notEqual(keepOfAnswer(messages, 2, tools, false), null)
})

test("the answer that is still coming keeps nothing, and the ones before it still do", () => {
  const earlier = [asked("First?"), said("calls-1", calls("a", "P-04")), said("words-1", [text("One.")])]
  const messages = [...earlier, asked("Second?"), said("calls-2", calls("b", "P-07")), said("words-2", [text("Tw")])]
  assert.equal(keepOfAnswer(messages, 5, tools, true), null)
  assert.equal(keepOfAnswer(messages, 4, tools, true), null)
  assert.equal(keepOfAnswer(messages, 2, tools, true)?.recipe.title, "First?")
  assert.equal(keepOfAnswer(messages, 5, tools, false)?.recipe.title, "Second?")
  // A question that has no answer yet: the answer before it has ended.
  assert.equal(keepOfAnswer([...earlier, asked("Second?")], 2, tools, true)?.recipe.title, "First?")
})

test("an answer is only what follows its own question", () => {
  const messages = [
    asked("First?"),
    said("calls-1", calls("a", "P-04")),
    said("words-1", [text("One.")]),
    asked("Second?"),
    said("calls-2", calls("b", "P-07")),
    said("words-2", [text("Two.")]),
  ]
  assert.deepEqual(keepOfAnswer(messages, 2, tools, false)?.recipe.parts, [{ tool: "genui_machine_show", args: { machine: "P-04" } }])
  assert.deepEqual(keepOfAnswer(messages, 5, tools, false)?.recipe.parts, [{ tool: "genui_machine_show", args: { machine: "P-07" } }])
})

test("documentation references stay visible in chat but are not replayed as GenUI saved-page parts", () => {
  const allTools: ReadonlyArray<ChatTool> = [...tools, { name: "docs_search", draw: () => "documentation source references", saveAsPage: false }]
  const docs = [call("docs", "docs_search", { query: "CYCLE832" }), result("docs", '{"hits":[]}')]
  assert.equal(blocksOf(docs, false, allTools).some(block => block.kind === "drawn" && block.node === "documentation source references"), true)
  assert.equal(recipeOfAnswer("What does the manual say?", docs, allTools), null)
  assert.deepEqual(callsOfAnswer([...docs, ...oneCard()], allTools), [{ tool: "genui_machine_show", args: { machine: "P-04" } }])
})

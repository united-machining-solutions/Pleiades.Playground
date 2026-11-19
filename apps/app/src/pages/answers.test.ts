import assert from "node:assert/strict"
import { test } from "node:test"

import { withAnswer } from "./answers.ts"
import type { Held } from "./answers.ts"
import type { RecipePart } from "./recipe.ts"

type Answered = RecipePart & { answer: string }

const p04 = (answer: string): Answered => ({ tool: "genui_machine_show", args: { machine: "P-04" }, answer })
const m02 = (answer: string): Answered => ({ tool: "genui_machine_show", args: { machine: "M-02" }, answer })
const none: ReadonlyMap<string, Held<Answered>> = new Map()

const answers = (held: ReadonlyMap<string, Held<Answered>>) => [...held.values()].map((one) => one.answered.answer)

test("an answer stands until a newer one of the same part comes, and the other parts keep theirs", () => {
  const first = withAnswer(withAnswer(none, p04("first"), 1), m02("M-02"), 2)
  assert.deepEqual(answers(first), ["first", "M-02"])
  assert.deepEqual(answers(withAnswer(first, p04("again"), 3)), ["again", "M-02"])
})

test("an answer to an older question does not replace one to a newer", () => {
  const newer = withAnswer(none, p04("newer"), 5)
  assert.equal(withAnswer(newer, p04("older"), 4), newer)
})

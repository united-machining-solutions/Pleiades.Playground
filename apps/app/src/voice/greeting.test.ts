import assert from "node:assert/strict"
import { test } from "node:test"

import { greetingFor, machinesInWords } from "./greeting.ts"

test("a known person is greeted by name", () => {
  assert.equal(greetingFor("Tom", []), "Hallo Tom, wie kann ich dir helfen?")
})

test("someone unknown is greeted without a name", () => {
  assert.equal(greetingFor(undefined, []), "Hallo, wie kann ich helfen?")
})

test("with an open error the greeting goes straight to it", () => {
  assert.equal(greetingFor("Tom", ["P-07"]), "Hallo Tom, du hast ungeplante Ausfälle: P-07.")
  assert.equal(greetingFor(undefined, ["P-04", "P-07"]), "Hallo, es gibt ungeplante Ausfälle: P-04 und P-07.")
})

test("machines are listed the way they are said", () => {
  assert.equal(machinesInWords(["M-02", "P-04", "P-07"]), "M-02, P-04 und P-07")
  assert.equal(machinesInWords([]), "")
})

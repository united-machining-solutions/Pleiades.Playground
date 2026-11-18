import assert from "node:assert/strict"
import { test } from "node:test"

import { levelOf, isPause, wakeQuestion } from "./wake.ts"

test("Hey Titan with a question wakes and keeps the question", () => {
  assert.deepEqual(wakeQuestion("Hey Titan, welche Maschine steht?"), { woke: true, question: "welche Maschine steht?" })
  assert.deepEqual(wakeQuestion("Hei Titan welche Maschine steht"), { woke: true, question: "welche Maschine steht" })
})

test("the name alone wakes without a question", () => {
  assert.deepEqual(wakeQuestion("Hey Titan."), { woke: true, question: "" })
  assert.deepEqual(wakeQuestion("Titan!"), { woke: true, question: "" })
})

test("the name as the recognition may write it still wakes", () => {
  assert.equal(wakeQuestion("Hey Tieten, wie läuft P-04?").woke, true)
  assert.equal(wakeQuestion("Hi Titen").woke, true)
})

test("talking about Titan is no call", () => {
  assert.equal(wakeQuestion("Was kann Titan eigentlich alles?").woke, false)
  assert.equal(wakeQuestion("Welche Maschine steht?").woke, false)
})

test("silence has no level, a full wave has one", () => {
  assert.equal(levelOf(new Float32Array(100)), 0)
  assert.ok(levelOf(Float32Array.from({ length: 100 }, (_, index) => Math.sin(index))) > 0.5)
})

test("a growing answer is said up to its last complete sentence", async () => {
  const { sentencesEnd } = await import("./voice.ts")
  const text = "P-04 steht. Die Tür ist offen. Soll ich"
  assert.equal(text.slice(0, sentencesEnd(text, 0)), "P-04 steht. Die Tür ist offen. ")
  assert.equal(sentencesEnd(text, 31), 31)
  assert.equal(sentencesEnd("Noch kein Satz", 0), 0)
})

test("a pause is asked for in a few words", () => {
  for (const said of ["Pause.", "Mach mal Pause!", "Sei still", "Stopp", "Ruhe bitte", "schlafen"]) assert.equal(isPause(said), true, said)
  for (const said of ["Welche Maschine macht Pause?", "Pause von P-04 zeigen", ""]) assert.equal(isPause(said), false, said)
})

test("in a loud room, Hey Titan counts after what others said", () => {
  assert.deepEqual(wakeQuestion("und dann haben wir gegessen. Hey Titan, wie ist die Lage?"), { woke: true, question: "wie ist die Lage?" })
  assert.equal(wakeQuestion("Heytitan, wie läuft P-04?").woke, true)
  assert.equal(wakeQuestion("Hey Taitan").woke, true)
  assert.equal(wakeQuestion("Ich glaube, Titan kann das nicht.").woke, false)
})

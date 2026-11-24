import assert from "node:assert/strict"
import { test } from "node:test"

import { LONGEST_MS, QUIET_MS, levelOf, piecesOf } from "./pieces.ts"

const RATE = 16_000
/** A block as the page hands them over: 128 ms. */
const BLOCK = 2_048
const BLOCK_S = BLOCK / RATE

/** Noise that is the same in every run. */
function noiseOf(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return (state / 0x7fffffff - 0.5) * 2 * Math.sqrt(3)
  }
}

/**
 * A room of `seconds`: a hiss, and with `talk` the voices of others, a level that goes up and down from
 * block to block as talk does, between 0.4 and 1.4 times `talk`.
 */
function room(seconds: number, talk = 0, seed = 7): Float32Array {
  const next = noiseOf(seed)
  const sound = new Float32Array(Math.floor(seconds / BLOCK_S) * BLOCK)
  for (let at = 0; at < sound.length; at += BLOCK) {
    const level = 0.004 + talk * (0.4 + Math.abs(next()) / Math.sqrt(3))
    for (let i = 0; i < BLOCK; i++) sound[at + i] = next() * level
  }
  return sound
}

/** A voice at the microphone from `from` to `to` seconds: syllables of 200 ms with 60 ms between them. */
function say(sound: Float32Array, from: number, to: number, level = 0.15, seed = 3) {
  const next = noiseOf(seed)
  for (let i = Math.floor(from * RATE); i < Math.floor(to * RATE); i++) {
    const inSyllable = ((i / RATE - from) * 1000) % 260 < 200
    sound[i] = (sound[i] ?? 0) + (inSyllable ? next() * level : 0)
  }
}

/** The pieces cut out of a sound, each with the seconds where it begins and where it was cut. */
function cut(sound: Float32Array): Array<{ from: number; to: number }> {
  const pieces = piecesOf(RATE)
  const found: Array<{ from: number; to: number }> = []
  for (let at = 0; at + BLOCK <= sound.length; at += BLOCK) {
    const piece = pieces.take(sound.slice(at, at + BLOCK))
    if (piece) found.push({ from: (at + BLOCK - piece.length) / RATE, to: (at + BLOCK) / RATE })
  }
  return found
}

/** The longest a piece is cut after the voice ended: the quiet that ends it, and the blocks around it. */
const SOON = QUIET_MS / 1000 + 3 * BLOCK_S

test("silence has no level, a full wave has one", () => {
  assert.equal(levelOf(new Float32Array(100)), 0)
  assert.ok(levelOf(Float32Array.from({ length: 100 }, (_, index) => Math.sin(index))) > 0.5)
})

test("in a quiet room a question is one piece, cut soon after its end, with what came just before", () => {
  const sound = room(12)
  say(sound, 4, 7)
  const pieces = cut(sound)
  assert.equal(pieces.length, 1)
  const [piece] = pieces
  assert.ok(piece && piece.from < 4 && piece.from > 3.4, "it begins a little before the voice")
  assert.ok(piece.to > 7 && piece.to < 7 + SOON, `cut at ${piece.to}`)
})

test("in a room where people talk a question still ends when the voice at the microphone does", () => {
  // The talk alone is louder than the level that counts as speech in a quiet room.
  const sound = room(30, 0.04)
  say(sound, 20, 23)
  const pieces = cut(sound)
  const asked = pieces.find((piece) => piece.from < 20 && piece.to > 23)
  assert.ok(asked, `the question is whole in one piece: ${JSON.stringify(pieces)}`)
  assert.ok(asked.from > 19.4, "and it does not begin with the talk of the room")
  assert.ok(asked.to < 23 + SOON, `cut at ${asked.to}, not at the longest a piece can be`)
})

test("the talk of the room is learned: after some seconds it is no longer taken for speech", () => {
  const pieces = cut(room(40, 0.04))
  assert.ok(pieces.every((piece) => piece.to < 12), `pieces of talk after the first seconds: ${JSON.stringify(pieces)}`)
})

test("a second question right after the first is a piece of its own", () => {
  const sound = room(34, 0.04)
  say(sound, 20, 23)
  say(sound, 24.5, 27, 0.15, 5)
  const pieces = cut(sound).filter((piece) => piece.to > 20)
  assert.equal(pieces.length, 2, JSON.stringify(pieces))
  assert.ok(pieces[1] && pieces[1].from < 24.5 && pieces[1].from > 23.9 && pieces[1].to > 27 && pieces[1].to < 27 + SOON)
})

test("a voice with a pause for breath in it stays one piece", () => {
  const sound = room(14)
  say(sound, 4, 6)
  say(sound, 6.5, 8.5)
  assert.equal(cut(sound).length, 1)
})

test("who speaks on and on is cut at the longest a piece can be", () => {
  const sound = room(24)
  say(sound, 2, 20)
  const [first] = cut(sound)
  assert.ok(first && Math.abs(first.to - first.from - LONGEST_MS / 1000) < 2 * BLOCK_S)
})

test("a piece that is let go is not handed over, and the next one is whole", () => {
  const sound = room(16)
  say(sound, 2, 4)
  say(sound, 9, 11)
  const pieces = piecesOf(RATE)
  const found: Array<number> = []
  for (let at = 0; at + BLOCK <= sound.length; at += BLOCK) {
    // Titan speaks from second 3 to second 6: nothing is heard then.
    if (at / RATE >= 3 && at / RATE < 6) {
      pieces.drop()
      assert.equal(pieces.speaking(), false)
      continue
    }
    if (pieces.take(sound.slice(at, at + BLOCK))) found.push((at + BLOCK) / RATE)
  }
  assert.equal(found.length, 1)
  assert.ok(found[0]! > 11 && found[0]! < 11 + SOON)
})

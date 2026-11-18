import assert from "node:assert/strict"
import { test } from "node:test"

import { Track } from "./motion.ts"

test("a track stands at its first position", () => {
  const track = new Track()
  assert.equal(track.at(0), null)
  track.push({ value: 10, at: 1_000 }, 0)
  assert.equal(track.at(0), 10)
  assert.equal(track.at(5_000), 10)
})

test("a track moves at constant speed over the time between two measurements", () => {
  const track = new Track()
  track.push({ value: 0, at: 1_000 }, 0)
  track.push({ value: 10, at: 2_000 }, 100)
  assert.equal(track.at(100), 0)
  assert.equal(track.at(600), 5)
  assert.equal(track.at(1_100), 10)
  assert.equal(track.at(9_999), 10)
})

test("a new position takes over from where the axis is drawn, without a jump", () => {
  const track = new Track()
  track.push({ value: 0, at: 0 }, 0)
  track.push({ value: 10, at: 1_000 }, 0)
  // Half way, the next position comes: the move starts at 5, where the axis stands.
  track.push({ value: 20, at: 2_000 }, 500)
  assert.equal(track.at(500), 5)
  assert.equal(track.at(1_500), 20)
})

test("a position seen before changes nothing, and a long pause makes no slow crawl", () => {
  const track = new Track()
  track.push({ value: 0, at: 0 }, 0)
  track.push({ value: 10, at: 60_000 }, 0)
  track.push({ value: 10, at: 60_000 }, 1_000)
  // After a minute without a change the move takes at most two seconds.
  assert.equal(track.at(1_000), 5)
  assert.equal(track.at(2_000), 10)
})

// Cuts what someone says out of the sound of the microphone, block by block: "Hey Titan" (wake.ts)
// listens with it. A piece begins when a block is clearly louder than the room, and ends after a short
// quiet, with a little of what came just before it, so the "Hey" is not cut off.
//
// What "the room" is, is the whole difficulty where people talk. The noise of the room is followed
// while nobody speaks; but in a room that is never quiet, nobody ever "does not speak", so that alone
// never learns it: every piece then ran to its longest, eight seconds, and an answer began only then.
// So the level the quietest blocks of the last seconds reach counts as well: even a room full of voices
// has gaps. What does not rise clearly above them is the room, and a voice at the microphone does.
//
// While a piece is said, the room is what it was when the piece began: the voice has gaps too, between
// its words, and they are not the room. For the same reason a piece that ended in a quiet is taken out
// of those last seconds again. One that ran to its longest stays in: that is the room being loud.

/** Sound louder than this is speech: a root mean square of the samples, between 0 and 1. */
export const SPEECH_LEVEL = 0.02
/** This long quiet ends what is said. */
export const QUIET_MS = 700
/** Speech is this many times louder than the noise of the room. */
const NOISE_FACTOR = 3
/** A piece shorter than this is a noise, not a word. */
export const SHORTEST_MS = 400
/** The longest piece: a question, not a speech. */
export const LONGEST_MS = 8_000
/** Kept from before the voice began. */
const BEFORE_MS = 400
/** The quietest blocks of this long tell the level of the room. */
const ROOM_MS = 4_000
/** The share of those blocks that count as the quietest. */
const ROOM_SHARE = 0.2
/** Speech is this many times louder than the quietest blocks. */
const ROOM_FACTOR = 2.5

/** The root mean square of a block of samples. */
export function levelOf(samples: Float32Array): number {
  let sum = 0
  for (const sample of samples) sum += sample * sample
  return Math.sqrt(sum / Math.max(samples.length, 1))
}

/** The level the quietest share of the levels stays under; 0 for none. */
function quietestOf(levels: ReadonlyArray<number>): number {
  if (levels.length === 0) return 0
  const sorted = [...levels].sort((one, other) => one - other)
  return sorted[Math.floor((sorted.length - 1) * ROOM_SHARE)] ?? 0
}

export type Pieces = {
  /**
   * The next block of the microphone. Gives a piece when one just ended: the samples of what was said,
   * without the quiet at its end counted as its length. A noise too short for a word gives nothing.
   */
  take(block: Float32Array): Float32Array | undefined
  /** Whether a piece is being said now. */
  speaking(): boolean
  /** Lets go of the piece being said, for the time nothing is heard: while Titan itself speaks. */
  drop(): void
}

/** Cuts pieces of speech out of blocks of sound recorded at `rate` samples a second. */
export function piecesOf(rate: number): Pieces {
  /** The blocks just before a piece, and the piece that is being said. */
  let before: Array<Float32Array> = []
  let piece: Array<Float32Array> | undefined
  let quietMs = 0
  /** The level of the noise of the room, followed slowly while nobody speaks. */
  let noise = SPEECH_LEVEL / NOISE_FACTOR
  /** The levels of the last blocks, `ROOM_MS` of them, and what they were when the piece began. */
  let recent: Array<number> = []
  let recentBefore: Array<number> = []
  /** The level of the quietest blocks when the piece began. */
  let roomBefore = 0

  return {
    speaking: () => piece !== undefined,
    drop() {
      if (piece) recent = recentBefore
      piece = undefined
      before = []
      quietMs = 0
    },
    take(block) {
      const level = levelOf(block)
      const blockMs = (block.length / rate) * 1000
      if (!piece) {
        // The quietest blocks say something about the room only once there are some seconds of them.
        const room = recent.length * blockMs >= ROOM_MS / 2 ? quietestOf(recent) : 0
        const speech = level > Math.max(SPEECH_LEVEL, noise * NOISE_FACTOR, room * ROOM_FACTOR)
        if (!speech) noise = noise * 0.97 + level * 0.03
        before.push(block)
        while (before.length * blockMs > BEFORE_MS) before.shift()
        if (speech) {
          piece = [...before]
          before = []
          quietMs = 0
          recentBefore = [...recent]
          roomBefore = room
        }
        recent.push(level)
        while (recent.length * blockMs > ROOM_MS) recent.shift()
        return undefined
      }
      piece.push(block)
      recent.push(level)
      while (recent.length * blockMs > ROOM_MS) recent.shift()
      const speech = level > Math.max(SPEECH_LEVEL, noise * NOISE_FACTOR, roomBefore * ROOM_FACTOR)
      quietMs = speech ? 0 : quietMs + blockMs
      const length = piece.length * blockMs
      if (quietMs < QUIET_MS && length < LONGEST_MS) return undefined
      const done = piece
      piece = undefined
      // What ended in a quiet was a voice, not the room: only the quiet at its end is kept of it.
      if (quietMs >= QUIET_MS) {
        const quiet = Math.round(quietMs / blockMs)
        recent = [...recentBefore, ...recent.slice(-quiet)]
        while (recent.length * blockMs > ROOM_MS) recent.shift()
      }
      if (length - quietMs < SHORTEST_MS) return undefined
      const samples = new Float32Array(done.reduce((sum, one) => sum + one.length, 0))
      let at = 0
      for (const one of done) {
        samples.set(one, at)
        at += one.length
      }
      return samples
    },
  }
}

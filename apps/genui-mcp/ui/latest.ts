// Answers that arrive out of order. A card asks the server again for every result the host sends;
// only the answer to the newest question may be drawn, never one that comes back later for an
// older result. This file imports nothing, so the card file and a test can use it.

/** Takes the answer of the newest question only: an older one that comes back later is dropped. */
export function lastAsked() {
  let asked = 0
  return <TAnswer>(answer: Promise<TAnswer>, take: (answer: TAnswer) => void): void => {
    const mine = ++asked
    void answer.then((one) => {
      if (mine === asked) take(one)
    })
  }
}

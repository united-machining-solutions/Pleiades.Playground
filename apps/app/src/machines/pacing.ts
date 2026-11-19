// How often a page asks the backend again: not while it waits for the answer to the last question,
// and once for a burst of news instead of once for each.

/**
 * A read that starts only when the last one has ended: a call while one is under way is dropped,
 * so slow answers do not pile up questions behind them. Answers whether it started.
 */
export function oneAtATime(read: () => Promise<unknown>): () => boolean {
  let reading = false
  return () => {
    if (reading) return false
    reading = true
    read().finally(() => {
      reading = false
    })
    return true
  }
}

/**
 * Runs `act` once, `ms` after the last of a burst of calls: a machine that sends many alerts in a row
 * is read again once. `cancel` drops what is waiting, as when the page closes.
 */
export function debounce(act: () => void, ms: number): { call: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined
  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }
  return {
    call: () => {
      cancel()
      timer = setTimeout(() => {
        timer = undefined
        act()
      }, ms)
    },
    cancel,
  }
}

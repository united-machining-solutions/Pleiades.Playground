import { useEffect, useState } from "react"

/**
 * What a read gives, read again each time the read changes: undefined while on its way and while there is
 * no read, null if it failed or had nothing. A host makes the read with `useCallback`, so that it changes
 * only with what it reads: the machine, the view, the hours, the tile.
 */
export function useRead<T>(read: (() => Promise<T | null>) | null): T | null | undefined {
  const [value, setValue] = useState<T | null>()
  useEffect(() => {
    setValue(undefined)
    if (!read) return
    let wanted = true
    read().then(
      (got) => wanted && setValue(got),
      () => wanted && setValue(null),
    )
    return () => {
      wanted = false
    }
  }, [read])
  return value
}

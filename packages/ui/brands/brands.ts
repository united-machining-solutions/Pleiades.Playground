import { useSyncExternalStore } from "react"

import exampleLogo from "./example/logo.svg"

/**
 * A brand is a look for the whole user interface: a block of theme tokens that holds while <html>
 * carries `data-brand="<id>"`. The switch sets that one attribute and nothing else. Without it the
 * page shows the theme as it comes.
 *
 * A brand is a folder next to this file, named by its id, and one line in the list below and in
 * brands.css. README.md says what a brand may set and how to add one.
 */
export type Brand = {
  /** The name of its folder, and the value of `data-brand`. */
  id: string
  /** What a person reads in the switch. */
  name: string
  /** The address of its logo, drawn 32 pixels high. Without one the switch shows the name. */
  logo?: string
}

export const brands: readonly Brand[] = [{ id: "example", name: "Example", logo: exampleLogo }]

const storageKey = "pleiades.brand"
const listeners = new Set<() => void>()

/** The id of the brand the page wears now. Empty: no brand, the theme as it comes. */
export function currentBrand(): string {
  return typeof document === "undefined" ? "" : (document.documentElement.dataset.brand ?? "")
}

/** Puts a brand on the page and remembers it for the next visit. An empty id takes the brand off. */
export function setBrand(id: string): void {
  if (id) document.documentElement.dataset.brand = id
  else delete document.documentElement.dataset.brand
  try {
    if (id) localStorage.setItem(storageKey, id)
    else localStorage.removeItem(storageKey)
  } catch {
    // A browser that keeps nothing: the brand holds until the page is loaded again.
  }
  for (const listener of listeners) listener()
}

/** The brand of the page, for a component that shows which one is on. */
export function useBrand(): string {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    currentBrand,
    () => "",
  )
}

// The brand of the last visit goes back on before anything is drawn. A brand that is no longer in
// the list is forgotten.
if (typeof document !== "undefined") {
  try {
    const remembered = localStorage.getItem(storageKey)
    if (remembered && brands.some((brand) => brand.id === remembered)) {
      document.documentElement.dataset.brand = remembered
    }
  } catch {
    // Nothing remembered.
  }
}

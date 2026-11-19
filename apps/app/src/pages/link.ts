import { recipeOf } from "./recipe.ts"
import type { Recipe } from "./recipe.ts"

// Sharing a page is a link, because the stack has no sign-in and keeps no page: the link carries the
// recipe, which tools, for which machines and hours, and never a value. Whoever opens it sees the
// values of that moment and can keep the page in their own browser. The recipe stands in one search
// parameter of the route that opens a link, as JSON in UTF-8 written in base64url. A link is input
// from outside: what comes back from it is a recipe only if `recipeOf` says so, and nothing else
// of it is read, least of all where the app goes next.

/** The path of the route that opens a link (`routes/pages.open.tsx`). Twelve hex digits make the id of a kept page, so it never meets `/pages/$page`. */
export const OPEN_PATH = "/pages/open"
/** The search parameter that carries the recipe. */
export const RECIPE_PARAM = "r"
/**
 * The most characters the parameter takes. The server of the app is a Node server that refuses a
 * request line and its headers beyond 16 KiB with a 431, and a browser sends the cookies of every
 * port of `localhost` along. This stays well under that. A page of twelve parts with arguments as
 * long as a person would choose them is a fraction of it; a page that reaches it has no link.
 */
export const MAX_PARAM_LENGTH = 8_000

/** What base64url writes, and nothing else: no `+`, no `/`, no padding. */
const BASE64URL = /^[A-Za-z0-9_-]+$/

/**
 * A recipe written for an address: its JSON as UTF-8 in base64url without padding. It starts with
 * `eyJ`, which is not JSON, so the router leaves the text a string. Null if the value is not a
 * recipe, or the text would be longer than `MAX_PARAM_LENGTH`.
 */
export function encodeRecipe(recipe: Recipe): string | null {
  const checked = recipeOf(recipe)
  if (checked === null) return null
  let binary = ""
  for (const byte of new TextEncoder().encode(JSON.stringify(checked))) binary += String.fromCharCode(byte)
  const text = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
  return text.length <= MAX_PARAM_LENGTH ? text : null
}

/**
 * The recipe in the parameter of a link, or null. Anything that is not exactly a recipe is null: a
 * value that is not a string, a text that is too long, not base64url, not UTF-8, not JSON, or JSON
 * that does not keep the schema of a recipe (`recipeOf`).
 */
export function decodeRecipe(text: unknown): Recipe | null {
  if (typeof text !== "string" || text.length > MAX_PARAM_LENGTH || !BASE64URL.test(text)) return null
  try {
    const base64 = text.replaceAll("-", "+").replaceAll("_", "/")
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    return recipeOf(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)))
  } catch {
    // Not base64, not UTF-8, not JSON.
    return null
  }
}

/**
 * The link to a recipe, absolute, with the origin the browser has: `<origin>/pages/open?r=<recipe>`.
 * Null if the recipe has no link: it is not a recipe, or too long to write into an address.
 */
export function linkOf(recipe: Recipe, origin: string): string | null {
  const text = encodeRecipe(recipe)
  return text === null ? null : `${origin}${OPEN_PATH}?${RECIPE_PARAM}=${text}`
}

import { FileIcon } from "lucide-react"

import type { NavPage } from "../components/nav.ts"
import type { StoredPage } from "./recipe.ts"

/**
 * The entries of the sidebar for the pinned pages of this browser: each one on the top level, like
 * Home, with the default order, so that it stands by its title among the pages of the routes.
 */
export function pinnedEntries(pages: ReadonlyArray<StoredPage>): Array<NavPage> {
  return pages
    .filter((page) => page.pinned)
    .map((page) => ({ title: page.recipe.title, icon: FileIcon, path: `/pages/${page.id}` }))
}

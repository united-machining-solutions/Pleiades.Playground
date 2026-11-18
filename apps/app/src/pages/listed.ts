import type { StoredPage } from "./recipe.ts"

// The pages of this browser that stand in the group "Pages" of the sidebar (components/page-group.tsx):
// a row of plain text for each page that is not pinned. A pinned page stands on the top level of the
// sidebar, like Home (pinned.ts), and is not listed a second time.

/** One row of the group: a page that is not pinned. */
export type PageRow = { id: string; title: string; path: string }

/**
 * The rows of the group, in the order of the store, the newest first: the pages that are not pinned.
 * No row at all where every page is pinned or none is kept, and then the sidebar shows no group.
 */
export function listedRows(pages: ReadonlyArray<StoredPage>): Array<PageRow> {
  return pages
    .filter((page) => !page.pinned)
    .map((page) => ({ id: page.id, title: page.recipe.title, path: `/pages/${page.id}` }))
}

/**
 * The row of the page a person is on, or undefined. A pinned page has no row, so none is marked for
 * it; the same for the list of the pages (`/pages`), for a page this browser does not keep, and for
 * a page opened from a link (`/pages/open`), which is in nobody's pages yet.
 */
export function markedRow(rows: ReadonlyArray<PageRow>, pathname: string): PageRow | undefined {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname
  return rows.find((row) => row.path === path)
}

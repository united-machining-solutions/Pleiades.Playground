// Pages of a long list, for the cards and the pages of the app that show one: which items a page
// holds, and which links the pagination shows.

/** One page of a list, and where it lies among all of them. */
export type Slice<TItem> = {
  items: Array<TItem>
  /** The page shown, from 1. A page below the first shows the first, one beyond the last the last. */
  page: number
  pages: number
  /** Where the page starts in the whole list, from 0. */
  start: number
}

/** The items of one page of `size` items. A list without items has one empty page. */
export function sliceOf<TItem>(items: ReadonlyArray<TItem>, size: number, page: number): Slice<TItem> {
  const pages = Math.max(1, Math.ceil(items.length / size))
  const shown = Math.min(Math.max(1, Math.floor(page)), pages)
  const start = (shown - 1) * size
  return { items: items.slice(start, start + size), page: shown, pages, start }
}

/** A link of the pagination: a page, or a gap for the pages between that it leaves out. */
export type PageLink = number | "gap"

/**
 * The links the pagination shows for a page among so many: the first, the current one and its
 * neighbours, the last, and a gap where pages are left out. A gap of one page shows that page.
 * Where there is little room, it shows no neighbours.
 */
export function pageLinks(page: number, pages: number, neighbours = 1): Array<PageLink> {
  const near = Array.from({ length: 2 * neighbours + 1 }, (_, index) => page - neighbours + index)
  const shown = new Set([1, ...near, pages].filter((one) => one >= 1 && one <= pages))
  const sorted = [...shown].sort((a, b) => a - b)
  return sorted.flatMap((one, index): Array<PageLink> => {
    const before = sorted[index - 1]
    if (before === undefined || one - before === 1) return [one]
    return one - before === 2 ? [before + 1, one] : ["gap", one]
  })
}

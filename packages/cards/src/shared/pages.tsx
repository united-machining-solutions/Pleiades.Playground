import type { ReactNode } from "react"

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@pleiades/ui/components/pagination"

import { pageLinks } from "./paging.ts"

/**
 * Where a page lies among all, and the way to the others: the words of the caller on the left, the
 * pagination on the right. It does not navigate: `onPage` gets the page chosen. Where it is narrow,
 * the links leave out the neighbours of the current page.
 */
export function Pages({
  page,
  pages,
  onPage,
  children,
  className,
}: {
  page: number
  pages: number
  onPage: (page: number) => void
  /** Where the page lies, in the words of the caller, such as "6–10 of 12". */
  children: ReactNode
  className?: string
}) {
  const go = (next: number) => (event: { preventDefault: () => void }) => {
    event.preventDefault()
    if (next >= 1 && next <= pages && next !== page) onPage(next)
  }
  const off = (disabled: boolean) => (disabled ? { "aria-disabled": true, tabIndex: -1, className: "pointer-events-none opacity-50" } : {})
  const links = (neighbours: number) => (
    <PaginationContent>
      <PaginationItem>
        <PaginationPrevious href="#" onClick={go(page - 1)} {...off(page === 1)} />
      </PaginationItem>
      {pageLinks(page, pages, neighbours).map((one, index) =>
        one === "gap" ? (
          <PaginationItem key={`gap-${index}`}>
            <PaginationEllipsis />
          </PaginationItem>
        ) : (
          <PaginationItem key={one}>
            <PaginationLink href="#" isActive={one === page} onClick={go(one)}>
              {one}
            </PaginationLink>
          </PaginationItem>
        ),
      )}
      <PaginationItem>
        <PaginationNext href="#" onClick={go(page + 1)} {...off(page === pages)} />
      </PaginationItem>
    </PaginationContent>
  )
  return (
    <div className={`@container/pages flex flex-wrap items-center justify-between gap-2 ${className ?? ""}`}>
      {children}
      <Pagination className="mx-0 hidden w-auto @sm/pages:flex">{links(1)}</Pagination>
      <Pagination className="mx-0 w-auto @sm/pages:hidden">{links(0)}</Pagination>
    </div>
  )
}

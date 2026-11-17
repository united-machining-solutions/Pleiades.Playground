import { Badge } from "@pleiades/ui/components/badge"
import { Card } from "@pleiades/ui/components/card"
import { Link, createFileRoute } from "@tanstack/react-router"
import { ChevronRightIcon, FileIcon, FilesIcon, ListIcon } from "lucide-react"
import { Fragment } from "react"
import type { ReactNode } from "react"

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@pleiades/ui/components/empty"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from "@pleiades/ui/components/item"
import { usePages } from "@/pages/store.ts"

const savedFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

/**
 * All pages kept from the chat in this browser, pinned or not, the newest first. A row opens its
 * page. The pages are read from the browser, so the list needs no backend and follows every change.
 */
export const Route = createFileRoute("/pages/")({
  // The entry that the pages kept in this browser stand under, in the breadcrumb and in the mark
  // of the sidebar. It is no row of the sidebar: the pages themselves are listed there, in the group
  // "Pages" (app-sidebar.tsx), and this list is reached through the breadcrumb.
  staticData: { nav: { title: "Pages", icon: ListIcon, sidebar: false } },
  component: Pages,
})

function Pages() {
  const pages = usePages()
  if (pages.length === 0) {
    return (
      <Page>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FilesIcon />
            </EmptyMedia>
            <EmptyTitle>No pages yet</EmptyTitle>
            <EmptyDescription>
              Ask the chat something, and press "Save as page" under its answer. This browser keeps the page.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Page>
    )
  }
  return (
    <Page line={`${pages.length} ${pages.length === 1 ? "page" : "pages"} · kept in this browser`}>
      <Card className="gap-0 py-0">
        <ItemGroup className="gap-0">
          {pages.map((page, index) => (
            <Fragment key={page.id}>
              {index > 0 && <ItemSeparator className="my-0" />}
              {/* The group is a list; the row is a link, as the docs of Item make one. */}
              <div role="listitem">
                {/* The chat stays open while the page changes. */}
                <Item render={<Link to="/pages/$page" params={{ page: page.id }} search />}>
                  <ItemMedia variant="icon">
                    <FileIcon />
                  </ItemMedia>
                  {/* A title a person gave can be one long word: it breaks anywhere, so the row keeps its width. */}
                  <ItemContent className="min-w-0">
                    <ItemTitle className="wrap-anywhere">
                      {page.recipe.title}
                      {page.pinned && <Badge variant="secondary">Pinned</Badge>}
                    </ItemTitle>
                    <ItemDescription>
                      {page.recipe.parts.length} {page.recipe.parts.length === 1 ? "part" : "parts"} · saved{" "}
                      {savedFormat.format(new Date(page.savedAt))}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    {/* Sized as in the example "Link" of the docs: an action of an item does not size its icon. */}
                    <ChevronRightIcon className="size-4" />
                  </ItemActions>
                </Item>
              </div>
            </Fragment>
          ))}
        </ItemGroup>
      </Card>
    </Page>
  )
}

/** Laid out like the other pages: the title on top, and a line under it. */
function Page({ line, children }: { line?: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Pages</h1>
        {line && <p className="text-sm text-muted-foreground">{line}</p>}
      </div>
      {children}
    </div>
  )
}

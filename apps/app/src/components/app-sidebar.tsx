import { Link, useLocation, useRouter } from "@tanstack/react-router"

import { versionOf } from "@/components/app-version.ts"
import { BrandSwitcher } from "@/components/brand-switcher.tsx"
import { PageGroup } from "@/components/page-group.tsx"
import { activePage, navPages, sidebarPages } from "@/components/nav.ts"
import { listedRows, markedRow } from "@/pages/listed.ts"
import { pinnedEntries } from "@/pages/pinned.ts"
import { usePages } from "@/pages/store.ts"
import { Badge } from "@pleiades/ui/components/badge"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@pleiades/ui/components/sidebar"

const version = versionOf({
  version: import.meta.env.APP_VERSION,
  revision: import.meta.env.APP_REVISION,
  source: import.meta.env.APP_SOURCE,
})

/**
 * The pages of the app, on the left. Everything about the chat is in the panel on the right, so
 * this side stays the same with or without a chat.
 *
 * No page is named here. A page that stands in the sidebar says so in its route file
 * (`staticData.nav`), and this list is read from the routes. Beside them stand the pages a person
 * kept from the chat and pinned, read from this browser: a pin or a new title shows at once. Under
 * them stands the group "Pages" with the pages that are not pinned, which folds; where there are
 * none, there is no group, and the sidebar is as it was before pages were kept.
 */
export function AppSidebar() {
  const router = useRouter()
  const pathname = useLocation({ select: (location) => location.pathname })
  const kept = usePages()
  // All the entries, also those that are no row: the mark of a page under one of them is theirs.
  const entries = navPages(Object.values(router.routesById), pinnedEntries(kept))
  const active = activePage(entries, pathname)
  const rows = listedRows(kept)
  return (
    <Sidebar>
      <SidebarHeader>
        <BrandSwitcher />
        <SidebarMenu>
          {sidebarPages(entries).map((page) => (
            <SidebarMenuItem key={page.path}>
              {/* A page of the sidebar has no parameter in its path, which the type of a path read
                  from the routes cannot say; a pinned page has its id in it. The chat stays open
                  while the page changes. */}
              <SidebarMenuButton
                isActive={page === active}
                render={<Link to={page.path as "/"} search={(before) => before} />}
              >
                <page.icon />
                <span>{page.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarHeader>
      {/* The pages of the routes and the pinned ones stand in the header, which stays where it is; the
          content is the group of the other pages, which scrolls if there are many, and keeps the footer
          at the bottom. */}
      <SidebarContent>{rows.length > 0 && <PageGroup rows={rows} marked={markedRow(rows, pathname)} />}</SidebarContent>
      <SidebarFooter>
        {/* Which build runs, as a link to its commit where the build knows the repository. In line
            with the wordmark. */}
        <div className="px-2">
          <Badge
            variant="outline"
            render={
              version.href ? <a href={version.href} target="_blank" rel="noreferrer" /> : undefined
            }
          >
            {version.label}
          </Badge>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

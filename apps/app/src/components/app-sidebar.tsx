import { Link, useLocation, useRouter } from "@tanstack/react-router"

import { versionOf } from "@/components/app-version.ts"
import { activePage, navPages } from "@/components/nav.ts"
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
 * (`staticData.nav`), and this list is read from the routes.
 */
export function AppSidebar() {
  const router = useRouter()
  const pathname = useLocation({ select: (location) => location.pathname })
  const pages = navPages(Object.values(router.routesById))
  const active = activePage(pages, pathname)
  return (
    <Sidebar>
      <SidebarHeader>
        {/* The wordmark of umati, from public/. The name of the app stays the title of the page. */}
        <div className="px-2 py-1.5">
          <img src="/umati-wordmark.svg" alt="umati" className="h-8 w-auto" />
        </div>
        <SidebarMenu>
          {pages.map((page) => (
            <SidebarMenuItem key={page.path}>
              {/* A page of the sidebar has no parameter in its path, which the type of a path read
                  from the routes cannot say. The chat stays open while the page changes. */}
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
      {/* The pages stand in the header; the content is empty and keeps the footer at the bottom. */}
      <SidebarContent />
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

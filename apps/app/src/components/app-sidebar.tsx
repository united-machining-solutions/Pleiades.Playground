import { Link, useLocation, useRouter } from "@tanstack/react-router"

import { activePage, navPages } from "@/components/nav.ts"
import {
  Sidebar,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@pleiades/ui/components/sidebar"

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
        <span className="px-2 py-1.5 font-medium">Pleiades Playground</span>
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
      <SidebarRail />
    </Sidebar>
  )
}

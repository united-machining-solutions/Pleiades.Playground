import { Link } from "@tanstack/react-router"
import { HouseIcon } from "lucide-react"

import {
  Sidebar,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

/**
 * The pages of the app, on the left. Everything about the chat is in the panel on the right, so
 * this side stays the same with or without a chat.
 */
export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader>
        <span className="px-2 py-1.5 font-medium">Pleiades Playground</span>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton isActive render={<Link to="/" search={(before) => before} />}>
              <HouseIcon />
              <span>Home</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarRail />
    </Sidebar>
  )
}

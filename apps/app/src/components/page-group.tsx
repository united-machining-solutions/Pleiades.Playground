import { Link } from "@tanstack/react-router"
import { ChevronDownIcon } from "lucide-react"

import type { PageRow } from "@/pages/listed.ts"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@pleiades/ui/components/collapsible"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@pleiades/ui/components/sidebar"

/**
 * The pages this browser keeps and that are not pinned, as a group of the sidebar that folds, in the
 * composition the docs of the sidebar give for it: `Collapsible` around a `SidebarGroup`, whose label
 * is the trigger. A row is plain text without an icon and is cut on one line, as the top level cuts a
 * title; the row of the page a person is on is marked. The group is open when the app starts, and it
 * stays as a person left it while the app runs: a reload opens it again.
 */
export function PageGroup({ rows, marked }: { rows: ReadonlyArray<PageRow>; marked: PageRow | undefined }) {
  return (
    <Collapsible defaultOpen className="group/collapsible">
      <SidebarGroup>
        <SidebarGroupLabel render={<CollapsibleTrigger />}>
          Pages
          {/* Down while it is open, to the right while it is folded. */}
          <ChevronDownIcon className="ml-auto -rotate-90 transition-transform group-data-open/collapsible:rotate-0" />
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {rows.map((row) => (
                <SidebarMenuItem key={row.id}>
                  {/* The chat stays open while the page changes. */}
                  <SidebarMenuButton
                    isActive={row === marked}
                    render={<Link to="/pages/$page" params={{ page: row.id }} search={(before) => before} />}
                  >
                    <span>{row.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}

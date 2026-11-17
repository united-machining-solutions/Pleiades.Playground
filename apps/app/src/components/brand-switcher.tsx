import { ChevronsUpDownIcon } from "lucide-react"

import { brands, setBrand, useBrand } from "@pleiades/ui/brands"
import type { Brand } from "@pleiades/ui/brands"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@pleiades/ui/components/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@pleiades/ui/components/sidebar"

/** How the app looks without a brand: the theme as it comes, under the wordmark of umati, from public/. */
const own: Brand = { id: "", name: "Default", logo: "/umati-wordmark.svg" }

/** The value of a choice in the menu: the id of a brand, or this word for the look without one. */
const noBrand = "default"

/**
 * The top of the sidebar: the logo of the look the app wears, and the choice between the looks. After
 * the team switcher of the shadcn block sidebar-07, with the radio group the docs of the dropdown
 * menu take for one choice out of several.
 *
 * Choosing sets `data-brand` on <html>, and nothing else: a brand is a block of theme tokens
 * (packages/ui/brands). Without a brand in the list there is nothing to choose, and the wordmark
 * stands alone.
 */
export function BrandSwitcher() {
  const { isMobile } = useSidebar()
  const id = useBrand()
  const looks = [own, ...brands]
  const look = looks.find((candidate) => candidate.id === id) ?? own
  // The name of the app stays the title of the page. The wordmark of the look without a brand says "umati".
  const logo = look.logo ? (
    <img src={look.logo} alt={look === own ? "umati" : look.name} className="h-8 w-auto" />
  ) : (
    <span className="truncate font-medium">{look.name}</span>
  )
  if (brands.length === 0) return <div className="px-2 py-1.5">{logo}</div>
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                aria-label={`Brand: ${look.name}`}
                className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
              />
            }
          >
            {logo}
            <ChevronsUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-fit" align="start" side={isMobile ? "bottom" : "right"} sideOffset={4}>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Brand</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={look.id || noBrand}
                onValueChange={(value) => setBrand(value === noBrand ? "" : String(value))}
              >
                {looks.map((candidate) => (
                  <DropdownMenuRadioItem key={candidate.id} value={candidate.id || noBrand} closeOnClick>
                    {candidate.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

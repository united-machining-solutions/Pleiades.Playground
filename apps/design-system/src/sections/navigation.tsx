import { StateSymbol } from "@pleiades/cards/machine/state-symbol.tsx"
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@pleiades/ui/components/breadcrumb"
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@pleiades/ui/components/menubar"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@pleiades/ui/components/navigation-menu"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@pleiades/ui/components/pagination"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
} from "@pleiades/ui/components/sidebar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@pleiades/ui/components/tabs"
import { ClockIcon, FactoryIcon, HouseIcon, ListIcon, MessageCircleIcon } from "lucide-react"
import { useState } from "react"

import { Block, Example, Examples, Section } from "@/block.tsx"
import { StateMatrix, previewState } from "@/state-matrix.tsx"

/** The three machines of the demo, as a menu names them. */
const machines = [
  { name: "P-04", state: "alarm", line: "Spindle overtemperature, machine stopped" },
  { name: "P-07", state: "running", line: "HOUSING_0815.MPF" },
  { name: "M-02", state: "setup", line: "Setup mode" },
] as const

function ViewMenubar() {
  const [hours, setHours] = useState("8")
  return (
    <Menubar>
      <MenubarMenu>
        <MenubarTrigger>Machine</MenubarTrigger>
        <MenubarContent>
          <MenubarGroup>
            <MenubarLabel>Open</MenubarLabel>
            {machines.map((machine) => (
              <MenubarItem key={machine.name}>
                <StateSymbol state={machine.state} />
                {machine.name}
              </MenubarItem>
            ))}
          </MenubarGroup>
          <MenubarSeparator />
          <MenubarGroup>
            <MenubarItem>
              Ask a question <MenubarShortcut>Ctrl K</MenubarShortcut>
            </MenubarItem>
            <MenubarItem disabled>Ask why</MenubarItem>
          </MenubarGroup>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>View</MenubarTrigger>
        <MenubarContent>
          <MenubarGroup>
            <MenubarCheckboxItem defaultChecked>Warnings on running machines</MenubarCheckboxItem>
            <MenubarCheckboxItem>Topics of every value</MenubarCheckboxItem>
          </MenubarGroup>
          <MenubarSeparator />
          <MenubarGroup>
            <MenubarLabel inset>History</MenubarLabel>
            <MenubarRadioGroup value={hours} onValueChange={setHours}>
              <MenubarRadioItem value="1">Last hour</MenubarRadioItem>
              <MenubarRadioItem value="8">Last 8 hours</MenubarRadioItem>
              <MenubarRadioItem value="24">Last 24 hours</MenubarRadioItem>
            </MenubarRadioGroup>
          </MenubarGroup>
          <MenubarSeparator />
          <MenubarGroup>
            <MenubarSub>
              <MenubarSubTrigger inset>Sidebar</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarGroup>
                  <MenubarItem>
                    Fold <MenubarShortcut>Ctrl B</MenubarShortcut>
                  </MenubarItem>
                  <MenubarItem>Open the chat</MenubarItem>
                </MenubarGroup>
              </MenubarSubContent>
            </MenubarSub>
          </MenubarGroup>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  )
}

export function Navigation() {
  return (
    <Section id="navigation" line="How a person gets from one place to another, and sees where they are.">
      <Block
        name="Tabs"
        file="tabs"
        line="Views of the same thing, one at a time. Not for steps, and not for things that belong side by side."
      >
        <Example title="Typical: with their content" className="items-start">
          <Tabs defaultValue="now" className="w-full">
            <TabsList>
              <TabsTrigger value="now">Now</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="notifications">Notifications</TabsTrigger>
            </TabsList>
            <TabsContent value="now" className="text-muted-foreground">
              P-04 is in alarm since 09:02: spindle overtemperature, machine stopped.
            </TabsContent>
            <TabsContent value="history" className="text-muted-foreground">
              In the last 8 hours P-04 ran for 6 h 12 min and stood in alarm for 28 min.
            </TabsContent>
            <TabsContent value="notifications" className="text-muted-foreground">
              One error is open, Error 2130. No warning.
            </TabsContent>
          </Tabs>
        </Example>
        <Example title="The two variants and the states of a tab: the second tab of each pair. In the last column it is the chosen one.">
          <StateMatrix
            rows={["default", "line"] as const}
            states={["default", "hover", "focus", "disabled", "chosen"]}
            render={(variant, state) => (
              <Tabs defaultValue={state === "chosen" ? "history" : "now"}>
                <TabsList variant={variant}>
                  <TabsTrigger value="now">Now</TabsTrigger>
                  <TabsTrigger value="history" {...previewState(state)}>
                    History
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}
          />
        </Example>
        <Examples>
          <Example title="As a line, with icons">
            <Tabs defaultValue="now">
              <TabsList variant="line">
                <TabsTrigger value="now">
                  <FactoryIcon />
                  Now
                </TabsTrigger>
                <TabsTrigger value="history">
                  <ClockIcon />
                  History
                </TabsTrigger>
                <TabsTrigger value="notifications" disabled>
                  <ListIcon />
                  Notifications
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </Example>
          <Example title="Vertical">
            <Tabs defaultValue="now" orientation="vertical">
              <TabsList>
                <TabsTrigger value="now">Now</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
                <TabsTrigger value="notifications">Notifications</TabsTrigger>
              </TabsList>
            </Tabs>
          </Example>
        </Examples>
      </Block>

      <Block name="Breadcrumb" file="breadcrumb" line="Where a page stands, and the way back up. The page itself is the last entry and no link.">
        <Examples>
          <Example title="Typical">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="#breadcrumb">Machines</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>P-04</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </Example>
          <Example title="A long way, with the middle folded and a long name cut">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="#breadcrumb">Machines</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbEllipsis />
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink href="#breadcrumb">Programs</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="max-w-40 truncate">
                    SHAFT_4711_ROUGHING_SECOND_SETUP_REVISION_C.MPF
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </Example>
        </Examples>
      </Block>

      <Block name="Pagination" file="pagination" line="The pages of a long list, with the way to the next and the one before.">
        <Example title="Typical: many pages, the ones far away folded">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious href="#pagination" />
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#pagination">1</PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#pagination" isActive>
                  2
                </PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#pagination">3</PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#pagination">12</PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext href="#pagination" />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </Example>
      </Block>

      <Block
        name="Navigation menu"
        file="navigation-menu"
        line="The main ways of a site, across the top, each with a panel of links. For an application with many pages take the sidebar."
      >
        <Example title="Typical: a panel of links, a short list, and a plain link">
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger>Machines</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-72 gap-1">
                    {machines.map((machine) => (
                      <li key={machine.name}>
                        <NavigationMenuLink href="#navigation-menu">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 leading-none font-medium">
                              <StateSymbol state={machine.state} />
                              {machine.name}
                            </div>
                            <div className="line-clamp-2 text-muted-foreground">{machine.line}</div>
                          </div>
                        </NavigationMenuLink>
                      </li>
                    ))}
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuTrigger>Build your own</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-48 gap-1">
                    <li>
                      <NavigationMenuLink href="#navigation-menu">A page</NavigationMenuLink>
                      <NavigationMenuLink href="#navigation-menu">A card</NavigationMenuLink>
                      <NavigationMenuLink href="#navigation-menu">A source of data</NavigationMenuLink>
                    </li>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink href="#navigation-menu" className={navigationMenuTriggerStyle()}>
                  Tour
                </NavigationMenuLink>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </Example>
      </Block>

      <Block
        name="Menubar"
        file="menubar"
        line="The commands of an application in menus across its top, as a desktop program has them: with keys, ticks, a choice and a second level."
      >
        <Example title="Typical">
          <ViewMenubar />
        </Example>
      </Block>

      <Block
        name="Sidebar"
        file="sidebar"
        line="The pages of an application, at its side. The example app stands in one: it folds with Ctrl B and becomes a sheet on a phone."
      >
        <Example title="Typical, standing still in a frame: two groups, a count, a second level with the page a person is on, and a row that is still loading" className="p-0">
          {/* The provider would fill the window, and the sidebar would stick to its edge: here both stay in the frame. */}
          <SidebarProvider className="min-h-0 overflow-hidden rounded-lg">
            <Sidebar collapsible="none" className="border-r">
              <SidebarHeader>
                <span className="px-2 py-1.5 font-medium">Pleiades Playground</span>
              </SidebarHeader>
              <SidebarContent>
                <SidebarGroup>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton render={<a href="#sidebar" />}>
                          <HouseIcon />
                          <span>Home</span>
                        </SidebarMenuButton>
                        <SidebarMenuBadge>3</SidebarMenuBadge>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton render={<a href="#sidebar" />}>
                          <FactoryIcon />
                          <span>Machines</span>
                        </SidebarMenuButton>
                        <SidebarMenuSub>
                          {machines.map((machine) => (
                            <SidebarMenuSubItem key={machine.name}>
                              <SidebarMenuSubButton isActive={machine.name === "P-04"} render={<a href="#sidebar" />}>
                                <span>{machine.name}</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
                <SidebarGroup>
                  <SidebarGroupLabel>Chats</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton render={<a href="#sidebar" />}>
                          <MessageCircleIcon />
                          <span>Why is P-04 in alarm?</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuSkeleton showIcon />
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
              <SidebarFooter>
                <span className="px-2 py-1.5 text-xs text-sidebar-foreground/70">3 machines · live</span>
              </SidebarFooter>
            </Sidebar>
            <SidebarInset className="min-w-0">
              <div className="flex flex-col gap-1 p-6">
                <span className="text-base font-medium">Machines</span>
                <span className="text-sm text-muted-foreground">
                  The page stands here, in SidebarInset. The sidebar reads its entries from the pages.
                </span>
              </div>
            </SidebarInset>
          </SidebarProvider>
        </Example>
      </Block>
    </Section>
  )
}

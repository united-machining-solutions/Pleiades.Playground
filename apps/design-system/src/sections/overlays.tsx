import { StateSymbol } from "@pleiades/cards/machine/state-symbol.tsx"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@pleiades/ui/components/alert-dialog"
import { Badge } from "@pleiades/ui/components/badge"
import { Button } from "@pleiades/ui/components/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@pleiades/ui/components/context-menu"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@pleiades/ui/components/dialog"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@pleiades/ui/components/drawer"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@pleiades/ui/components/dropdown-menu"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@pleiades/ui/components/field"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@pleiades/ui/components/hover-card"
import { Input } from "@pleiades/ui/components/input"
import { Kbd } from "@pleiades/ui/components/kbd"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@pleiades/ui/components/popover"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@pleiades/ui/components/sheet"
import { Textarea } from "@pleiades/ui/components/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@pleiades/ui/components/tooltip"
import { EllipsisIcon, PanelRightIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"

import { Block, Example, Examples, Section } from "@/block.tsx"

// Every overlay opens from a real trigger, and the trigger says what it opens. Which one to take:
// a task that needs input is a Dialog, a confirmation an AlertDialog, a panel of details a Sheet,
// a panel from the bottom on a phone a Drawer, something small next to its trigger a Popover.

const topics = [
  "umati/State/MachineryItemState",
  "umati/State/MachineryOperationMode",
  "umati/Connection/State",
  "umati/Connection/Heartbeat",
  "umati/Production/ActiveProgram",
]

function DeleteChat() {
  const [open, setOpen] = useState(false)
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="outline" />}>Delete the chat</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
          <AlertDialogDescription>
            "Why is P-04 in alarm?" and its answers are removed for everyone who can open the app. This cannot be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => setOpen(false)}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function MoreMenu() {
  const [warnings, setWarnings] = useState(true)
  const [hours, setHours] = useState("8")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="More about P-04" />}>
        <EllipsisIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>P-04</DropdownMenuLabel>
          <DropdownMenuItem>
            Ask why <DropdownMenuShortcut>Ctrl K</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>Open the page</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuCheckboxItem checked={warnings} onCheckedChange={setWarnings}>
            Show warnings
          </DropdownMenuCheckboxItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>History</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={hours} onValueChange={setHours}>
                <DropdownMenuRadioItem value="1">Last hour</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="8">Last 8 hours</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="24">Last 24 hours</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem variant="destructive">
            <Trash2Icon />
            Remove the note
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function Overlays() {
  return (
    <Section
      id="overlays"
      line="What opens above the page. Each one here opens from its trigger: press it, point at it, or press the right button of the mouse."
    >
      <Block name="Dialog" file="dialog" line="A task that needs input, in the middle of the page. The page behind it waits.">
        <Example title="Opens a dialog with a form">
          <Dialog>
            <DialogTrigger render={<Button variant="outline" />}>Add a note to P-04</DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Note for the next shift</DialogTitle>
                <DialogDescription>What the next shift should know about P-04.</DialogDescription>
              </DialogHeader>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="dialog-note">Note</FieldLabel>
                  <Textarea id="dialog-note" defaultValue="Spindle ran hot at 09:02. Coolant checked, level is fine." />
                  <FieldDescription>A few sentences are enough.</FieldDescription>
                </Field>
              </FieldGroup>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                <DialogClose render={<Button />}>Save the note</DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Example>
      </Block>

      <Block
        name="Alert dialog"
        file="alert-dialog"
        line="Asks before something that cannot be undone. It closes only with one of its two buttons, and the safe one comes first."
      >
        <Example title="Opens a confirmation">
          <DeleteChat />
        </Example>
      </Block>

      <Block name="Sheet" file="sheet" line="A panel from the side with details or settings of what is on the page, which stays in view behind it.">
        <Example title="Opens a sheet from the right">
          <Sheet>
            <SheetTrigger render={<Button variant="outline" />}>
              <PanelRightIcon data-icon="inline-start" />
              Topics of P-04
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Topics of P-04</SheetTitle>
                <SheetDescription>Where the values of its card come from, below machines/P-04/.</SheetDescription>
              </SheetHeader>
              <ul className="flex flex-col gap-2 px-4 font-mono text-xs">
                {topics.map((topic) => (
                  <li key={topic} className="break-all">
                    {topic}
                  </li>
                ))}
              </ul>
              <SheetFooter>
                <SheetClose render={<Button variant="outline" />}>Close</SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </Example>
      </Block>

      <Block name="Drawer" file="drawer" line="A panel from the bottom, to pull down with a finger. For a phone, where a dialog would be too far from the thumb.">
        <Example title="Opens a drawer from the bottom">
          <Drawer>
            <DrawerTrigger render={<Button variant="outline" />}>Rename the chat</DrawerTrigger>
            <DrawerContent>
              <div className="mx-auto flex w-full max-w-sm flex-col">
                <DrawerHeader>
                  <DrawerTitle>Rename the chat</DrawerTitle>
                  <DrawerDescription>The name it has in the list of chats.</DrawerDescription>
                </DrawerHeader>
                <FieldGroup className="p-4">
                  <Field>
                    <FieldLabel htmlFor="drawer-name">Name</FieldLabel>
                    <Input id="drawer-name" defaultValue="Why is P-04 in alarm?" />
                  </Field>
                </FieldGroup>
                <DrawerFooter>
                  <DrawerClose render={<Button />}>Save the name</DrawerClose>
                  <DrawerClose render={<Button variant="outline" />}>Cancel</DrawerClose>
                </DrawerFooter>
              </div>
            </DrawerContent>
          </Drawer>
        </Example>
      </Block>

      <Block name="Popover" file="popover" line="Something small that belongs to its trigger: a few values, a short form. It opens on a press and closes on a press outside.">
        <Example title="Opens a popover">
          <Popover>
            <PopoverTrigger render={<Button variant="outline" />}>Since when?</PopoverTrigger>
            <PopoverContent align="start">
              <PopoverHeader>
                <PopoverTitle>P-04 is in alarm since 09:02</PopoverTitle>
                <PopoverDescription>
                  The error was raised at 09:02, 28 minutes ago. Before that P-04 ran for 20 minutes.
                </PopoverDescription>
              </PopoverHeader>
            </PopoverContent>
          </Popover>
        </Example>
      </Block>

      <Block
        name="Hover card"
        file="hover-card"
        line="A look ahead at what a link leads to, for a person with a pointer. Nothing a person needs may be only here: a finger cannot point."
      >
        <Example title="Point at the link">
          <p className="text-sm">
            The alarm belongs to{" "}
            <HoverCard>
              <HoverCardTrigger href="#hover-card" className="font-medium underline underline-offset-4">
                P-04
              </HoverCardTrigger>
              <HoverCardContent className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">P-04</span>
                  <Badge variant="outline">
                    <StateSymbol state="alarm" />
                    Alarm
                  </Badge>
                </div>
                <p className="text-muted-foreground">Spindle overtemperature, machine stopped. Since 09:02, 28 min.</p>
              </HoverCardContent>
            </HoverCard>
            , which ran SHAFT_4711.MPF.
          </p>
        </Example>
      </Block>

      <Block name="Tooltip" file="tooltip" line="The name of a control that shows only a sign, on pointing at it or reaching it with the keyboard. A few words, never a sentence a person needs.">
        <Examples>
          <Example title="Point at the button, or reach it with Tab">
            <Tooltip>
              <TooltipTrigger render={<Button variant="outline" size="icon" aria-label="Open the chat" />}>
                <PanelRightIcon />
              </TooltipTrigger>
              <TooltipContent>Open the chat</TooltipContent>
            </Tooltip>
          </Example>
          <Example title="With a key, and below its trigger">
            <Tooltip>
              <TooltipTrigger render={<Button variant="outline" />}>Ask a question</TooltipTrigger>
              <TooltipContent side="bottom">
                Ask a question <Kbd>Ctrl K</Kbd>
              </TooltipContent>
            </Tooltip>
          </Example>
        </Examples>
      </Block>

      <Block
        name="Dropdown menu"
        file="dropdown-menu"
        line="The actions that belong to one thing, behind a button. With a label, keys, a tick, a second level and a destructive entry."
      >
        <Example title="Opens a menu">
          <MoreMenu />
        </Example>
      </Block>

      <Block
        name="Context menu"
        file="context-menu"
        line="The same actions on the right button of the mouse, or a long press. Never the only way to an action: a finger and a keyboard need a visible one."
      >
        <Example title="Press the right button of the mouse on the row" className="items-stretch">
          <ContextMenu>
            <ContextMenuTrigger className="flex w-full items-center justify-between gap-3 rounded-md border border-dashed px-4 py-3 text-sm">
              <span className="flex items-center gap-2 font-medium">
                <StateSymbol state="alarm" />
                P-04
              </span>
              <span className="text-muted-foreground">Spindle overtemperature, machine stopped</span>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-56">
              <ContextMenuGroup>
                <ContextMenuLabel>P-04</ContextMenuLabel>
                <ContextMenuItem>
                  Ask why <ContextMenuShortcut>Ctrl K</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuItem>Open the page</ContextMenuItem>
              </ContextMenuGroup>
              <ContextMenuSeparator />
              <ContextMenuGroup>
                <ContextMenuItem>Copy the serial number</ContextMenuItem>
              </ContextMenuGroup>
            </ContextMenuContent>
          </ContextMenu>
        </Example>
      </Block>
    </Section>
  )
}

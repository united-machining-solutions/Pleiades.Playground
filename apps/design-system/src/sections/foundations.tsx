import type { State } from "@pleiades/cards/machine/contract.ts"
import { stateLabel } from "@pleiades/cards/machine/state.ts"
import { StateSymbol } from "@pleiades/cards/machine/state-symbol.tsx"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@pleiades/ui/components/table"
import { cn } from "@pleiades/ui/lib/utils"
import { FactoryIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"

import { Section, Token, Topic } from "@/block.tsx"
import { ColorPair } from "@/color-pair.tsx"

// Foundations: the tokens the components are drawn with. Every value on this page is read from the
// stylesheet while the page runs, so the page cannot say something else than the theme.

/** The value of a token, as the stylesheet has it. */
function useToken(token: string): string {
  const [value, setValue] = useState("")
  useEffect(() => {
    setValue(getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim())
  }, [token])
  return value
}

/** What the browser made of the classes of an element. */
function useComputed<Element extends HTMLElement>(read: (style: CSSStyleDeclaration) => string) {
  const ref = useRef<Element>(null)
  const [value, setValue] = useState("")
  useEffect(() => {
    if (ref.current) setValue(read(getComputedStyle(ref.current)))
    // The classes of an example do not change while the page stands: read once.
  }, [])
  return [ref, value] as const
}

const roles = [
  { name: "Background", background: "background", foreground: "foreground" },
  { name: "Card", background: "card", foreground: "card-foreground" },
  { name: "Popover", background: "popover", foreground: "popover-foreground" },
  { name: "Primary", background: "primary", foreground: "primary-foreground" },
  { name: "Secondary", background: "secondary", foreground: "secondary-foreground" },
  { name: "Muted", background: "muted", foreground: "muted-foreground" },
  { name: "Accent", background: "accent", foreground: "accent-foreground" },
  { name: "Sidebar", background: "sidebar", foreground: "sidebar-foreground" },
  { name: "Sidebar primary", background: "sidebar-primary", foreground: "sidebar-primary-foreground" },
  { name: "Sidebar accent", background: "sidebar-accent", foreground: "sidebar-accent-foreground" },
  { name: "Muted text on the page", background: "background", foreground: "muted-foreground" },
  { name: "Primary text on the page", background: "background", foreground: "primary" },
  { name: "Destructive on the page", background: "background", foreground: "destructive" },
  { name: "State ink on stopped", background: "state-stopped", foreground: "state-ink" },
  { name: "State ink on setup", background: "state-setup", foreground: "state-ink" },
] as const

function Swatch({ token, name, children }: { token: string; name: string; children?: ReactNode }) {
  const value = useToken(token)
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {children ?? <div className="h-10 rounded-md border" style={{ background: `var(--${token})` }} />}
      <div className="flex flex-col text-xs">
        <span className="font-medium">{name}</span>
        <code className="truncate font-mono text-muted-foreground">--{token}</code>
        <span className="truncate font-mono text-muted-foreground">{value}</span>
      </div>
    </div>
  )
}

/** The categories of a chart, in the order a chart takes them. The names are those of IBM Carbon. */
const categories = [
  "Purple 70",
  "Cyan 50",
  "Teal 70",
  "Magenta 70",
  "Red 50",
  "Red 90",
  "Green 60",
  "Blue 80",
  "Magenta 50",
  "Yellow 50",
  "Teal 50",
  "Cyan 90",
  "Orange 70",
  "Purple 50",
]

/** How a state fills a band on a time axis, as the band of the machine card draws it. */
const bands: Record<State, { band: string; how: string; tokens: ReadonlyArray<string> }> = {
  running: { band: "bg-state-running", how: "Filled", tokens: ["--state-running"] },
  alarm: { band: "band-alarm", how: "Hatched", tokens: ["--state-alarm", "--state-alarm-stripe"] },
  stopped: {
    band: "bg-state-stopped shadow-[inset_0_0_0_1px_var(--state-stopped-edge)]",
    how: "Filled, with an edge",
    tokens: ["--state-stopped", "--state-stopped-edge"],
  },
  setup: {
    band: "bg-state-setup shadow-[inset_0_0_0_1px_var(--state-setup-edge)]",
    how: "Filled, with an edge",
    tokens: ["--state-setup", "--state-setup-edge"],
  },
  "no-data": {
    band: "band-no-data",
    how: "Hatched, with an edge",
    tokens: ["--state-no-data", "--state-no-data-edge"],
  },
}

const stateRules: ReadonlyArray<ReactNode> = [
  <>
    Categories take the chart colours in this order, never cyclically. More than 14 series: group the rest as
    "Other" or draw small multiples, never a new colour.
  </>,
  <>
    A single series is Cyan 50, <Token>--chart-single</Token>.
  </>,
  <>
    States have their own tokens: never a state from <Token>--chart-*</Token>, never a series from{" "}
    <Token>--state-*</Token>.
  </>,
  <>
    An alarm band is hatched as well: its red and the green of "running" are equally light, so with red-green
    colour blindness the two would look the same.
  </>,
  <>Never colour alone: a badge carries a symbol and a word, a band a colour and a pattern or an edge.</>,
  <>
    Close to IEC 60204-1 and IEC 60073: red is a fault, yellow is abnormal, green is normal, grey is neutral. So a
    stop without an alarm is yellow and setup is neutral. Blue stays free for "operator needed", and there is no
    orange.
  </>,
  <>
    A stop and a warning share the yellow and differ in shape: a stop is a whole band with an edge, a warning
    only a symbol on the running band.
  </>,
]

const type = [
  { classes: "text-2xl font-semibold", use: "Title of a page", specimen: "Machines" },
  { classes: "text-lg font-medium", use: "Title of an empty state and of a confirmation", specimen: "No answer from the backend" },
  { classes: "text-base font-medium", use: "Title of a card, of a group, of a field set", specimen: "Needs you" },
  {
    classes: "text-sm font-medium",
    use: "Label, button, title of a row and of an alert",
    specimen: "Spindle overtemperature, machine stopped",
  },
  {
    classes: "text-sm",
    use: "Body: a description, a field, a cell, a menu",
    specimen: "No alarm, no reason recorded · NotExecuting, as the control reports",
  },
  { classes: "text-xs font-medium", use: "Badge, keyboard key, header of a message", specimen: "Running" },
  {
    classes: "text-xs",
    use: "Tooltip, label of a menu group, axis of a chart, footer of a card",
    specimen: "Read at 09:30 from the topics of P-04",
  },
  {
    classes: "font-mono text-xs",
    use: "A value in the tooltip of a chart, a topic, code",
    specimen: "machines/P-04/umati/State/MachineryItemState",
  },
]

function TypeRow({ classes, use, specimen }: (typeof type)[number]) {
  const [ref, spec] = useComputed<HTMLSpanElement>(
    (style) => `${style.fontSize} / ${style.lineHeight} · ${style.fontWeight}`,
  )
  return (
    <TableRow>
      <TableCell>
        <code className="font-mono text-xs">{classes}</code>
      </TableCell>
      <TableCell className="text-muted-foreground tabular-nums">{spec}</TableCell>
      <TableCell className="text-muted-foreground">{use}</TableCell>
      <TableCell className="max-w-64">
        <span ref={ref} className={cn("block truncate", classes)}>
          {specimen}
        </span>
      </TableCell>
    </TableRow>
  )
}

const radii = [
  { classes: "rounded-[4px]", use: "Checkbox" },
  { classes: "rounded-sm", use: "Entry of a menu or a select, keyboard key, chip" },
  { classes: "rounded-md", use: "Button, input, select, toggle, popover, menu, row" },
  { classes: "rounded-lg", use: "Alert, list of tabs, empty state, hover card" },
  { classes: "rounded-xl", use: "Card, dialog, bubble, attachment" },
  { classes: "rounded-2xl", use: "Toast" },
  { classes: "rounded-4xl", use: "Badge" },
  { classes: "rounded-full", use: "Avatar, switch, thumb of a slider, track of a progress bar and a meter" },
]

function Radius({ classes, use }: (typeof radii)[number]) {
  const [ref, value] = useComputed<HTMLDivElement>((style) => style.borderTopLeftRadius)
  return (
    <div className="flex flex-col gap-1.5">
      <div ref={ref} className={cn("h-16 border bg-muted", classes)} />
      <div className="flex flex-col text-xs">
        <code className="font-mono font-medium">{classes}</code>
        <span className="font-mono text-muted-foreground">{classes === "rounded-full" ? "half the height" : value}</span>
        <span className="text-muted-foreground">{use}</span>
      </div>
    </div>
  )
}

const elevations = [
  { classes: "border", name: "Flat, with a border", use: "The page, an alert, a row with an outline, the frame of an example" },
  {
    classes: "shadow-xs ring-1 ring-foreground/10",
    name: "shadow-xs",
    use: "Card. The same shadow, with a border for the ring: button with an outline, input, select, toggle, checkbox",
  },
  { classes: "shadow-sm", name: "shadow-sm", use: "Thumb of a slider, the active tab" },
  {
    classes: "shadow-md ring-1 ring-foreground/10",
    name: "shadow-md",
    use: "Popover, hover card, the list of a select or a combobox, a menu",
  },
  { classes: "border shadow-lg", name: "shadow-lg", use: "Sheet, toast, the second level of a menu" },
  {
    classes: "ring-1 ring-foreground/10",
    name: "No shadow, above a dimmed page",
    use: "Dialog and confirmation: the dimmed page lifts them, not a shadow",
  },
]

const iconSizes = [
  { classes: "size-3", use: "Badge, keyboard key, the smallest button" },
  { classes: "size-3.5", use: "Tick of a checkbox, separator of a breadcrumb" },
  { classes: "size-4", use: "Everywhere else: a component sizes its icon itself" },
  { classes: "size-6", use: "Empty state" },
  { classes: "size-8", use: "Confirmation" },
]

export function Foundations() {
  return (
    <Section
      id="foundations"
      line="The tokens every component is drawn with. The theme is packages/ui/src/styles/globals.css, the chart and state colours are packages/cards/src/dataviz.css. There is one theme, and it is light."
    >
      <Topic
        title="Color roles"
        line="A colour is a role: a surface with the text that stands on it. Each pair shows its contrast as the browser draws it; 4.5:1 is what text of body size needs."
      >
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {roles.map((role) => (
            <ColorPair key={role.name} {...role} />
          ))}
        </div>
      </Topic>

      <Topic title="Lines and focus" line="The border of a surface, the border of a field, and the ring of the element that has the focus.">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          <Swatch token="border" name="Border">
            <div className="h-10 rounded-md border bg-background" />
          </Swatch>
          <Swatch token="input" name="Input">
            <div className="h-10 rounded-md border border-input bg-background shadow-xs" />
          </Swatch>
          <Swatch token="ring" name="Ring">
            <div className="h-10 rounded-md border border-ring bg-background ring-3 ring-ring/50" />
          </Swatch>
        </div>
      </Topic>

      <Topic
        title="Chart colors"
        line={
          <>
            Fourteen categories from IBM Carbon, taken in this order, and one colour for a single series:{" "}
            <Token>--chart-1</Token> to <Token>--chart-14</Token>, and <Token>--chart-single</Token>.
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          {categories.map((name, index) => (
            <Swatch key={name} token={`chart-${index + 1}`} name={`${index + 1} · ${name}`} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          <Swatch token="chart-single" name="Single series · Cyan 50" />
        </div>
      </Topic>

      <Topic
        title="State colors"
        line="What a machine does has colours of its own, and never a colour alone: each state has a symbol and a word, and a band has a pattern or an edge as well."
      >
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {(Object.keys(bands) as Array<State>).map((state) => (
            <div key={state} className="flex flex-col gap-1.5">
              <div className={cn("h-10 rounded-sm", bands[state].band)} />
              <div className="flex flex-col gap-0.5 text-xs">
                <span className="flex items-center gap-1.5 font-medium">
                  <StateSymbol state={state} />
                  {stateLabel[state]}
                </span>
                <span className="text-muted-foreground">{bands[state].how}</span>
                {bands[state].tokens.map((token) => (
                  <code key={token} className="truncate font-mono text-muted-foreground">
                    {token}
                  </code>
                ))}
              </div>
            </div>
          ))}
          <div className="flex flex-col gap-1.5">
            <div className="flex h-10 items-center justify-center rounded-sm bg-state-running">
              <StateSymbol state="warning" label="Warning" />
            </div>
            <div className="flex flex-col gap-0.5 text-xs">
              <span className="flex items-center gap-1.5 font-medium">
                <StateSymbol state="warning" />
                Warning
              </span>
              <span className="text-muted-foreground">A symbol, never a band</span>
              <code className="truncate font-mono text-muted-foreground">--state-warning</code>
              <code className="truncate font-mono text-muted-foreground">--state-warning-edge</code>
            </div>
          </div>
        </div>
        <ul className="flex max-w-prose list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
          {stateRules.map((rule, index) => (
            <li key={index}>{rule}</li>
          ))}
        </ul>
      </Topic>

      <Topic
        title="Typography"
        line="Roboto, as a variable font. These are the sizes the components and the pages use; the numbers are what the browser set."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Classes</TableHead>
              <TableHead>Size / line · weight</TableHead>
              <TableHead>For</TableHead>
              <TableHead>Specimen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {type.map((row) => (
              <TypeRow key={row.classes} {...row} />
            ))}
          </TableBody>
        </Table>
        <p className="max-w-prose text-sm">
          Home of the example app asks "what needs you?": it lists the machines of the demo stack, first those in
          alarm, stopped or without data, then those in setup, then the running ones. Which value of a machine is
          which state is decided in one file, <code className="font-mono text-xs">packages/cards/src/machine/state.ts</code>.
          How a longer text is set, with headings and lists, shows the{" "}
          <a
            href="https://ui.shadcn.com/docs/components/base/typography"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4"
          >
            typography page of shadcn/ui
          </a>
          .
        </p>
      </Topic>

      <Topic
        title="Radius"
        line={
          <>
            One scale, from <Token>--radius</Token>. The same box at every step, with the components that have it.
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {radii.map((radius) => (
            <Radius key={radius.classes} {...radius} />
          ))}
        </div>
      </Topic>

      <Topic title="Elevation" line="What rests on the page is flat or nearly so. What floats above it carries a shadow.">
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3">
          {elevations.map((elevation) => (
            <div key={elevation.name} className="flex flex-col gap-2.5">
              <div className={cn("h-16 rounded-lg bg-card", elevation.classes)} />
              <div className="flex flex-col text-xs">
                <span className="font-medium">{elevation.name}</span>
                <span className="text-muted-foreground">{elevation.use}</span>
              </div>
            </div>
          ))}
        </div>
      </Topic>

      <Topic
        title="Icons"
        line="Lucide, imported from lucide-react. Inside a component an icon takes no size class: the component sets it."
      >
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {iconSizes.map((size) => (
            <div key={size.classes} className="flex flex-col gap-1.5">
              <div className="flex h-12 items-center gap-4">
                <FactoryIcon className={size.classes} aria-hidden />
                <FactoryIcon className={cn(size.classes, "text-muted-foreground")} aria-hidden />
              </div>
              <div className="flex flex-col text-xs">
                <code className="font-mono font-medium">{size.classes}</code>
                <span className="text-muted-foreground">{size.use}</span>
              </div>
            </div>
          ))}
        </div>
      </Topic>
    </Section>
  )
}

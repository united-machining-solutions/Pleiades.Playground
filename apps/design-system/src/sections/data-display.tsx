import type { State } from "@pleiades/cards/machine/contract.ts"
import { lasting } from "@pleiades/cards/machine/format.ts"
import { stateLabel } from "@pleiades/cards/machine/state.ts"
import { StateSymbol } from "@pleiades/cards/machine/state-symbol.tsx"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@pleiades/ui/components/accordion"
import { AspectRatio } from "@pleiades/ui/components/aspect-ratio"
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@pleiades/ui/components/avatar"
import { Badge } from "@pleiades/ui/components/badge"
import { Button } from "@pleiades/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@pleiades/ui/components/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@pleiades/ui/components/chart"
import type { ChartConfig } from "@pleiades/ui/components/chart"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@pleiades/ui/components/collapsible"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@pleiades/ui/components/empty"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@pleiades/ui/components/item"
import { Meter, MeterLabel, MeterValue } from "@pleiades/ui/components/meter"
import { ScrollArea, ScrollBar } from "@pleiades/ui/components/scroll-area"
import { Separator } from "@pleiades/ui/components/separator"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@pleiades/ui/components/table"
import { BotIcon, ChevronDownIcon, ChevronRightIcon, FactoryIcon } from "lucide-react"
import { Fragment } from "react"
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { Block, Example, Examples, Section, Token } from "@/block.tsx"
import { activePower, bearingTemperature } from "@/series-data.ts"

/** What every machine does at the instant of the examples, as a table lists it. */
const rows: ReadonlyArray<{ machine: string; state: State; matter: string; program: string; since: string }> = [
  { machine: "P-04", state: "alarm", matter: "Spindle overtemperature, machine stopped", program: "SHAFT_4711.MPF", since: "09:02" },
  { machine: "M-02", state: "setup", matter: "Setup mode", program: "SHAFT_4711.MPF", since: "08:48" },
  { machine: "P-07", state: "running", matter: "Coolant pressure below minimum", program: "HOUSING_0815.MPF", since: "07:15" },
]

/** How long each machine ran in the last eight hours, in minutes. */
const ran = [
  { machine: "P-04", running: 372, standing: 108 },
  { machine: "P-07", running: 450, standing: 30 },
  { machine: "M-02", running: 291, standing: 189 },
]

/** A number of minutes as the card catalogue writes a duration: 38 min, 1 h 30 min. */
function hours(minutes: number): string {
  return lasting(minutes * 60_000)
}

const notifications = [
  { at: "09:11", machine: "P-07", title: "Warning 3310, Coolant pressure below minimum" },
  { at: "09:02", machine: "P-04", title: "Error 2130, Spindle overtemperature, machine stopped" },
  { at: "08:41", machine: "P-04", title: "Program finished" },
  { at: "08:20", machine: "P-04", title: "Warning 4105, Safety door open, machining interrupted" },
  { at: "07:52", machine: "M-02", title: "Program finished" },
  { at: "07:15", machine: "P-07", title: "Warning 4105, Safety door open, machining interrupted" },
  { at: "06:44", machine: "P-07", title: "Program finished" },
  { at: "06:10", machine: "P-04", title: "Warning 3310, Coolant pressure below minimum" },
  { at: "05:30", machine: "P-04", title: "Program finished" },
  { at: "04:12", machine: "M-02", title: "Warning 3310, Coolant pressure below minimum" },
]

const cardTopics = [
  "machines/P-04/umati/State/MachineryItemState",
  "machines/P-04/umati/State/MachineryOperationMode",
  "machines/P-04/umati/Connection/State",
  "machines/P-04/umati/Connection/Heartbeat",
  "machines/P-04/umati/Production/ActiveProgram",
  "machines/P-04/events/notifications",
]

/** A picture for an avatar that needs no request: a person, drawn on a ground of the given grey. */
function portrait(ground: string): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><rect width='40' height='40' fill='${ground}'/><circle cx='20' cy='15' r='7' fill='#f5f5f5'/><path d='M6 40a14 14 0 0 1 28 0z' fill='#f5f5f5'/></svg>`,
  )}`
}
const picture = portrait("#525252")
/** A picture that does not load, as an address that went away does not. */
const noPicture = "data:image/png;base64,AAAA"

// Categories take the chart colours in their order: the first series is --chart-1, the second
// --chart-2. A single series is --chart-single.
const temperatureConfig = {
  p04: { label: "P-04", color: "var(--chart-1)" },
  p07: { label: "P-07", color: "var(--chart-2)" },
} satisfies ChartConfig

const powerConfig = {
  kilowatts: { label: "Active power, kW", color: "var(--chart-single)" },
} satisfies ChartConfig

export function DataDisplay() {
  return (
    <Section id="data-display" line="How values and things are shown: a card, a table, a chart, a row, and the small parts around them.">
      <Block
        name="Card"
        file="card"
        line="One thing with what belongs to it, set apart from the page: a title, what it is about, its content, and what can be done with it."
      >
        <Examples>
          <Example title="Typical: header with an action, content, footer" className="items-start">
            <Card className="w-full">
              <CardHeader>
                <CardTitle>History of P-04</CardTitle>
                <CardDescription>Last 8 hours, 01:30 to 09:30</CardDescription>
                <CardAction>
                  <Button variant="outline" size="sm">
                    Ask why
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <p>Ran for 6 h 12 min. Stood in alarm for 28 min, stopped for 22 min, and sent no data for 18 min.</p>
              </CardContent>
              <CardFooter className="text-xs text-muted-foreground">Read at 09:30</CardFooter>
            </Card>
          </Example>
          <Example title="Small, as the machine card is" className="items-start">
            <Card size="sm" className="w-full">
              <CardHeader>
                <CardTitle>History of P-04</CardTitle>
                <CardDescription>Last 8 hours, 01:30 to 09:30</CardDescription>
              </CardHeader>
              <CardContent>
                <p>Ran for 6 h 12 min. Stood in alarm for 28 min, stopped for 22 min, and sent no data for 18 min.</p>
              </CardContent>
            </Card>
          </Example>
        </Examples>
      </Block>

      <Block name="Table" file="table" line="Things of one kind with the same values, to compare down a column. Numbers stand right, in figures of equal width.">
        <Example title="Typical: a caption, a footer with the sum, a long text cut, and the row a person chose">
          <Table>
            <TableCaption>How long each machine ran in the last 8 hours, read at 09:30.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Machine</TableHead>
                <TableHead>State</TableHead>
                <TableHead>What is the matter</TableHead>
                <TableHead>Program</TableHead>
                <TableHead className="text-right">Ran</TableHead>
                <TableHead className="text-right">Stood</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const time = ran.find((one) => one.machine === row.machine)
                return (
                  <TableRow key={row.machine} data-state={row.machine === "P-04" ? "selected" : undefined}>
                    <TableCell className="font-medium">{row.machine}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        <StateSymbol state={row.state} />
                        {stateLabel[row.state]}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-48 truncate">{row.matter}</TableCell>
                    <TableCell>{row.program}</TableCell>
                    <TableCell className="text-right tabular-nums">{time && hours(time.running)}</TableCell>
                    <TableCell className="text-right tabular-nums">{time && hours(time.standing)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4}>All machines</TableCell>
                <TableCell className="text-right tabular-nums">{hours(372 + 450 + 291)}</TableCell>
                <TableCell className="text-right tabular-nums">{hours(108 + 30 + 189)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </Example>
        <Example title="Without rows: the table says so with an empty state">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Machine</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Program</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={3} className="whitespace-normal">
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <FactoryIcon />
                      </EmptyMedia>
                      <EmptyTitle>No machines</EmptyTitle>
                      <EmptyDescription>No machine has published a value in the last 24 hours.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Example>
      </Block>

      <Block
        name="Chart"
        file="chart"
        line="A series over time or across things, drawn with Recharts in the colours of the theme. A series is thinned out before it is drawn: never more points than the picture is wide in pixels."
      >
        <Example
          title={
            <>
              A line for each machine, 96 points each: the first series in <Token>--chart-1</Token>, the second in{" "}
              <Token>--chart-2</Token>
            </>
          }
        >
          <figure className="flex w-full min-w-0 flex-col gap-2">
            <figcaption className="text-sm font-medium">Bearing temperature of spindle 1, °C</figcaption>
            <ChartContainer config={temperatureConfig} className="aspect-auto h-64 w-full">
              <LineChart accessibilityLayer data={bearingTemperature} margin={{ left: 0, right: 12 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={8} interval={11} />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} width={32} domain={[30, 70]} />
                <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line dataKey="p04" type="monotone" stroke="var(--color-p04)" strokeWidth={2} dot={false} />
                <Line dataKey="p07" type="monotone" stroke="var(--color-p07)" strokeWidth={2} dot={false} />
              </LineChart>
            </ChartContainer>
          </figure>
        </Example>
        <Example
          title={
            <>
              Bars for one series, in <Token>--chart-single</Token>
            </>
          }
        >
          <figure className="flex w-full min-w-0 flex-col gap-2">
            <figcaption className="text-sm font-medium">Active power of P-04, mean of each hour, kW</figcaption>
            <ChartContainer config={powerConfig} className="aspect-auto h-56 w-full">
              <BarChart accessibilityLayer data={activePower} margin={{ left: 0, right: 12 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="hour" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} width={32} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="kilowatts" fill="var(--color-kilowatts)" radius={4} />
              </BarChart>
            </ChartContainer>
          </figure>
        </Example>
      </Block>

      <Block
        name="Meter"
        file="meter"
        ours
        line="A measurement in its range: an override, a load, a temperature. Not for how far a task has come: that is Progress."
      >
        <Examples>
          <Example title="Typical: a fraction, written as a percentage. Its range ends at 120 %." className="items-start">
            <Meter value={0.8} max={1.2} format={{ style: "percent" }} className="w-full">
              <MeterLabel>Feed override</MeterLabel>
              <MeterValue />
            </Meter>
          </Example>
          <Example title="A value with its unit, in a range that does not start at zero" className="items-start">
            <Meter
              value={51}
              min={20}
              max={80}
              format={{ style: "unit", unit: "celsius", maximumFractionDigits: 0 }}
              className="w-full"
            >
              <MeterLabel>Bearing temperature, 20 to 80 °C</MeterLabel>
              <MeterValue />
            </Meter>
          </Example>
          <Example title="At the ends of its range" className="flex-col items-stretch gap-6">
            <Meter value={0} max={1.2} format={{ style: "percent" }}>
              <MeterLabel>Spindle override, machine stopped</MeterLabel>
              <MeterValue />
            </Meter>
            <Meter value={1.2} max={1.2} format={{ style: "percent" }}>
              <MeterLabel>Spindle override, at its most</MeterLabel>
              <MeterValue />
            </Meter>
          </Example>
          <Example title="Without a visible label: it still needs a name" className="items-start">
            <Meter value={0.97} max={1.2} aria-label="Spindle override" className="w-full" />
          </Example>
        </Examples>
      </Block>

      <Block
        name="Item"
        file="item"
        line="A row: a thing with its title, a line about it, and what can be done with it. The lists of the example app are made of these."
      >
        <Example title="Typical: a list in a card, with a sign, a line, and actions" className="items-start">
          <Card className="w-full gap-0 py-0">
            <ItemGroup className="gap-0">
              {rows.map((row, index) => (
                <Fragment key={row.machine}>
                  {index > 0 && <ItemSeparator className="my-0" />}
                  <Item role="listitem">
                    <ItemMedia variant="icon" className="h-5">
                      <StateSymbol state={row.state} />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>
                        {row.machine}
                        <Badge variant="outline">{stateLabel[row.state]}</Badge>
                      </ItemTitle>
                      <ItemDescription>
                        {row.matter} · {row.program}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      {/* Only a machine that needs someone offers the question why. */}
                      {row.state === "alarm" && (
                        <Button variant="outline" size="sm">
                          Ask why
                        </Button>
                      )}
                      <Button variant="ghost" size="icon-sm" aria-label={`Open ${row.machine}`}>
                        <ChevronRightIcon />
                      </Button>
                    </ItemActions>
                  </Item>
                </Fragment>
              ))}
            </ItemGroup>
          </Card>
        </Example>
        <Examples>
          <Example title="Variants: default, outline, muted" className="flex-col items-stretch">
            {(["default", "outline", "muted"] as const).map((variant) => (
              <Item key={variant} variant={variant}>
                <ItemContent>
                  <ItemTitle>M-02</ItemTitle>
                  <ItemDescription>Setup mode</ItemDescription>
                </ItemContent>
              </Item>
            ))}
          </Example>
          <Example title="Sizes: default, sm, xs" className="flex-col items-stretch">
            {(["default", "sm", "xs"] as const).map((size) => (
              <Item key={size} variant="outline" size={size}>
                <ItemMedia variant="icon">
                  <StateSymbol state="setup" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>M-02</ItemTitle>
                  <ItemDescription>Setup mode</ItemDescription>
                </ItemContent>
              </Item>
            ))}
          </Example>
          <Example title="As a link, with a header and a footer" className="items-start">
            <Item variant="outline" render={<a href="#item" />}>
              <ItemHeader>
                <span className="text-xs text-muted-foreground">Machine</span>
                <Badge variant="outline">
                  <StateSymbol state="running" />
                  Running
                </Badge>
              </ItemHeader>
              <ItemContent>
                <ItemTitle>P-07</ItemTitle>
                <ItemDescription>HOUSING_0815.MPF</ItemDescription>
              </ItemContent>
              <ItemFooter>
                <span className="text-xs text-muted-foreground tabular-nums">since 07:15 · 2 h 15 min</span>
              </ItemFooter>
            </Item>
          </Example>
          <Example title="A long title wraps, a long line is cut after two" className="items-start">
            <Item variant="outline" className="w-full">
              <ItemContent className="min-w-0">
                <ItemTitle>Spindle overtemperature, machine stopped, program SHAFT_4711.MPF interrupted in its third pass</ItemTitle>
                <ItemDescription>
                  Spindle overtemperature, machine stopped. The error was raised at 09:02 and has not gone; the
                  program was interrupted in its third pass, and the control reports NotExecuting since then.
                </ItemDescription>
              </ItemContent>
            </Item>
          </Example>
        </Examples>
      </Block>

      <Block name="Avatar" file="avatar" line="Who: a person or a program, as a picture, or as initials or a sign where there is no picture.">
        <Examples>
          <Example title="With a picture, with a picture that does not load, with a sign">
            <Avatar>
              <AvatarImage src={picture} alt="Maria Keller" />
              <AvatarFallback>MK</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarImage src={noPicture} alt="Jonas Weber" />
              <AvatarFallback>JW</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>
                <BotIcon className="size-4" aria-label="Assistant" />
              </AvatarFallback>
            </Avatar>
          </Example>
          <Example title="Sizes: sm, default, lg, and with a badge">
            {(["sm", "default", "lg"] as const).map((size) => (
              <Avatar key={size} size={size}>
                <AvatarFallback>MK</AvatarFallback>
              </Avatar>
            ))}
            <Avatar>
              <AvatarFallback>MK</AvatarFallback>
              <AvatarBadge aria-label="In this chat" />
            </Avatar>
          </Example>
          <Example title="Many: a group with the count of the rest">
            <AvatarGroup>
              <Avatar>
                <AvatarImage src={picture} alt="Maria Keller" />
                <AvatarFallback>MK</AvatarFallback>
              </Avatar>
              <Avatar>
                <AvatarImage src={portrait("#737373")} alt="Jonas Weber" />
                <AvatarFallback>JW</AvatarFallback>
              </Avatar>
              <Avatar>
                <AvatarImage src={portrait("#a3a3a3")} alt="Anna Baumann" />
                <AvatarFallback>AB</AvatarFallback>
              </Avatar>
              <AvatarGroupCount>+3</AvatarGroupCount>
            </AvatarGroup>
          </Example>
        </Examples>
      </Block>

      <Block
        name="Accordion"
        file="accordion"
        line="Several questions with their answers, of which a person opens the one they need."
      >
        <Examples>
          <Example title="Typical: one open at a time" className="items-start">
            <Accordion defaultValue={["no-data"]}>
              <AccordionItem value="no-data">
                <AccordionTrigger>When does a machine show "No data"?</AccordionTrigger>
                <AccordionContent>
                  When it has given no sign of life for more than 30 seconds, or is not connected. Its values are
                  then the last known ones, not the present.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="alarm">
                <AccordionTrigger>What is an alarm?</AccordionTrigger>
                <AccordionContent>An error was raised and has not gone, whatever the machine reports.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="stopped">
                <AccordionTrigger>And a stop?</AccordionTrigger>
                <AccordionContent>The machine does not execute, and no error is open.</AccordionContent>
              </AccordionItem>
            </Accordion>
          </Example>
          <Example title="Several open at once" className="items-start">
            <Accordion multiple defaultValue={["alarm", "stopped"]}>
              <AccordionItem value="alarm">
                <AccordionTrigger>What is an alarm?</AccordionTrigger>
                <AccordionContent>An error was raised and has not gone, whatever the machine reports.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="stopped">
                <AccordionTrigger>And a stop?</AccordionTrigger>
                <AccordionContent>The machine does not execute, and no error is open.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="setup">
                <AccordionTrigger>And setup?</AccordionTrigger>
                <AccordionContent>The operation mode is Setup, also while nothing executes.</AccordionContent>
              </AccordionItem>
            </Accordion>
          </Example>
        </Examples>
      </Block>

      <Block name="Collapsible" file="collapsible" line="One part of a view that a person folds away or opens. It brings no look: the trigger is a button.">
        <Example title="Typical" className="items-start">
          <Collapsible className="w-full">
            <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>
              The six topics the card of P-04 reads
              <ChevronDownIcon data-icon="inline-end" className="group-data-panel-open/button:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="flex flex-col gap-1 px-2.5 pt-2 font-mono text-xs text-muted-foreground">
                {cardTopics.map((topic) => (
                  <li key={topic} className="break-all">
                    {topic}
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        </Example>
      </Block>

      <Block name="Scroll area" file="scroll-area" line="A box that scrolls its content, with a quiet scrollbar that looks the same in every browser.">
        <Examples>
          <Example title="Many rows in a box of a set height" className="items-start">
            <ScrollArea className="h-48 w-full rounded-md border">
              <ul className="flex flex-col p-3 text-sm">
                {notifications.map((one, index) => (
                  <Fragment key={`${one.at}-${one.machine}`}>
                    {index > 0 && <Separator className="my-2" />}
                    <li className="flex gap-3">
                      <span className="text-muted-foreground tabular-nums">{one.at}</span>
                      <span className="font-medium">{one.machine}</span>
                      <span className="min-w-0 flex-1">{one.title}</span>
                    </li>
                  </Fragment>
                ))}
              </ul>
            </ScrollArea>
          </Example>
          <Example title="Sideways, with its own scrollbar" className="items-start">
            <ScrollArea className="w-full rounded-md border">
              <div className="flex w-max gap-2 p-3">
                {cardTopics.map((topic) => (
                  <Badge key={topic} variant="secondary" className="font-mono">
                    {topic}
                  </Badge>
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </Example>
        </Examples>
      </Block>

      <Block name="Aspect ratio" file="aspect-ratio" line="Keeps a picture, a video or a drawing in its proportion, whatever the width.">
        <Example title="16 to 9, square, and 3 to 4" className="items-end">
          {[
            { ratio: 16 / 9, name: "16 : 9", width: "w-64" },
            { ratio: 1, name: "1 : 1", width: "w-32" },
            { ratio: 3 / 4, name: "3 : 4", width: "w-24" },
          ].map((one) => (
            <div key={one.name} className={one.width}>
              <AspectRatio ratio={one.ratio} className="flex items-center justify-center rounded-md bg-muted text-sm text-muted-foreground tabular-nums">
                {one.name}
              </AspectRatio>
            </div>
          ))}
        </Example>
      </Block>

      <Block name="Separator" file="separator" line="A line between two things that belong to the same view. Not a border drawn by hand.">
        <Example title="Across, and upright between values of one line" className="flex-col items-stretch">
          <div className="text-sm">
            <div className="font-medium">P-04</div>
            <div className="text-muted-foreground">Spindle overtemperature, machine stopped</div>
          </div>
          <Separator />
          <div className="flex h-5 items-center gap-3 text-sm">
            <span>SHAFT_4711.MPF</span>
            <Separator orientation="vertical" />
            <span className="tabular-nums">since 09:02</span>
            <Separator orientation="vertical" />
            <span className="tabular-nums">28 min</span>
          </div>
        </Example>
      </Block>
    </Section>
  )
}

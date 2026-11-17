import { Alert, AlertDescription } from "@pleiades/ui/components/alert"
import { Badge } from "@pleiades/ui/components/badge"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { Meter, MeterLabel } from "@pleiades/ui/components/meter"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@pleiades/ui/components/table"
import type { ReactNode } from "react"

import { clock } from "../machine/format.ts"
import { StateSymbol } from "../machine/state-symbol.tsx"
import { HallPlan } from "../shopfloor/hall-plan.tsx"
import type { Block, ViewShow } from "./contract.ts"
import { secondsText, valueText, windowText } from "./format.ts"

/**
 * The view card: an answer a language model laid out from blocks. It draws the blocks in their order
 * and computes nothing but the wording: every value comes from `genui_view_show`.
 */
export function ViewCard({ title, asOf, blocks }: ViewShow) {
  const sources = [...new Set(blocks.flatMap((one) => ("source" in one ? [one.source] : one.type === "hall" ? [one.shopfloor.hall.source] : [])))]
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="font-semibold group-data-[size=sm]/card:text-base">{title}</CardTitle>
        <CardDescription>Laid out by the assistant · values read at {clock(asOf)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {groups(blocks).map((group, index) =>
          group.every((one) => one.type === "kpi") ? (
            // Figures next to each other stand in one row.
            <div key={index} className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3">
              {group.map((one, inner) => (
                <BlockView key={inner} block={one} />
              ))}
            </div>
          ) : (
            <BlockView key={index} block={group[0]!} />
          ),
        )}
      </CardContent>
      {sources.length > 0 && (
        <CardFooter className="block text-xs break-words text-muted-foreground">From {sources.join("; ")}</CardFooter>
      )}
    </Card>
  )
}

/** Blocks in their order, with figures that follow each other in one group. */
function groups(blocks: ReadonlyArray<Block>): Array<Array<Block>> {
  const grouped: Array<Array<Block>> = []
  for (const one of blocks) {
    const last = grouped.at(-1)
    if (one.type === "kpi" && last?.[0]?.type === "kpi") last.push(one)
    else grouped.push([one])
  }
  return grouped
}

function Section({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="flex items-baseline justify-between gap-2 text-sm font-medium">
        {title}
        {aside && <span className="text-xs font-normal text-muted-foreground">{aside}</span>}
      </h3>
      {children}
    </section>
  )
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case "kpi":
      return (
        <div className="flex flex-col gap-1 rounded-lg border bg-muted/30 p-3">
          <span className="text-xs text-muted-foreground">{block.label}</span>
          <span className="text-3xl font-semibold tracking-tight tabular-nums">{valueText(block.value, block.unit)}</span>
          <span className="text-xs text-muted-foreground">
            {block.machine ?? "Hall"} · {windowText(block.from, block.to)}
          </span>
        </div>
      )
    case "ranking": {
      const largest = Math.max(...block.items.map((one) => one.value ?? 0), block.unit === "one" ? 1 : 0)
      return (
        <Section title={block.title} aside={windowText(block.from, block.to)}>
          <div className="flex flex-col gap-3">
            {block.items.map((one) => (
              <Meter key={one.machine} value={one.value ?? 0} max={largest > 0 ? largest : 1}>
                <MeterLabel>{one.machine}</MeterLabel>
                <span className="ml-auto text-sm tabular-nums">{valueText(one.value, block.unit)}</span>
              </Meter>
            ))}
          </div>
        </Section>
      )
    }
    case "causes":
      return (
        <Section title={block.title} aside={windowText(block.from, block.to)}>
          {block.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No warning or error in this time.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fault</TableHead>
                  <TableHead className="text-right">Times</TableHead>
                  <TableHead className="text-right">In total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {block.items.map((one) => (
                  <TableRow key={`${one.level}-${one.title}`}>
                    <TableCell className="whitespace-normal">
                      <span className="flex items-center gap-2">
                        <StateSymbol state={one.level === "Error" ? "alarm" : "warning"} label={one.level} />
                        {one.title}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{one.count}</TableCell>
                    <TableCell className="text-right tabular-nums">{secondsText(one.seconds)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
      )
    case "hall":
      return (
        <Section title={block.title}>
          <HallPlan hall={block.shopfloor.hall} machines={block.shopfloor.machines} highlight={block.highlight} />
        </Section>
      )
    case "note":
      return (
        <Alert variant={block.tone === "warning" ? "destructive" : "default"}>
          <AlertDescription>{block.text}</AlertDescription>
        </Alert>
      )
    case "gaps":
      return (
        <Section title={block.title}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Badge variant="secondary" className="self-start">
                In the data
              </Badge>
              <ul className="flex flex-col gap-1.5 text-sm">
                {block.have.map((one) => (
                  <li key={one} className="flex items-center gap-2">
                    <StateSymbol state="running" label="Available" />
                    {one}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-2">
              <Badge variant="outline" className="self-start">
                Missing
              </Badge>
              <ul className="flex flex-col gap-1.5 text-sm">
                {block.missing.map((one) => (
                  <li key={one.what} className="flex items-start gap-2">
                    <StateSymbol state="no-data" label="Missing" />
                    <span>
                      {one.what}
                      <span className="block text-xs text-muted-foreground">from {one.source}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>
      )
  }
}

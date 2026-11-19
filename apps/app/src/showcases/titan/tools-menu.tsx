import { CircleAlertIcon, WrenchIcon } from "lucide-react"
import { Fragment, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@pleiades/ui/components/alert"
import { Badge } from "@pleiades/ui/components/badge"
import { Button } from "@pleiades/ui/components/button"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@pleiades/ui/components/item"
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@pleiades/ui/components/popover"
import { Skeleton } from "@pleiades/ui/components/skeleton"
import { Switch } from "@pleiades/ui/components/switch"

import type { FurtherServer } from "./further-tools.ts"

// Where Titan says what it can read with, and where a person switches a further server on for it: a
// button at the foot of Titan's panel that opens the list, as the button "Tools" of the chat does
// (chat/tools-menu.tsx), in the same components. Titan's own tools are always there. A further server,
// the juice bar for example, is off until it is switched on here: every tool more makes Titan's first
// word later. A switch holds from the next question.

type Listed = { own: Array<string>; servers: Array<FurtherServer> }

/** What stands under the name of a server. */
function toolsLine(server: FurtherServer): string {
  if (!server.reachable) return "Antwortet nicht: Titan hat keines seiner Tools."
  if (server.tools.length === 0) return "Hat kein Tool, das nur liest."
  return `${server.tools.length} ${server.tools.length === 1 ? "Tool" : "Tools"}, nur lesend: ${server.tools.map((tool) => tool.name).join(", ")}`
}

export function TitanToolsMenu({ on, onSwitch }: { on: ReadonlyArray<string>; onSwitch: (name: string, on: boolean) => void }) {
  const [listed, setListed] = useState<Listed | "failed">()
  // The list is asked for when it opens, so it says what answers the app now.
  const read = (open: boolean) => {
    if (!open) return
    setListed(undefined)
    fetch("/titan/api/tools")
      .then((answer) => (answer.ok ? (answer.json() as Promise<Listed>) : Promise.reject(new Error(String(answer.status)))))
      .then(
        (list) => {
          setListed(list)
          // A server that was switched on in this browser and that the app no longer has is switched off.
          for (const name of on) if (!list.servers.some((server) => server.name === name)) onSwitch(name, false)
        },
        () => setListed("failed"),
      )
  }
  return (
    <Popover onOpenChange={read}>
      <PopoverTrigger render={<Button variant="outline" aria-label={on.length > 0 ? `Tools von Titan, ${on.length} zugeschaltet` : "Tools von Titan"} />}>
        <WrenchIcon data-icon="inline-start" />
        Tools
        {on.length > 0 && <Badge variant="secondary">+{on.length}</Badge>}
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="max-h-[70svh] w-96 max-w-[calc(100vw-2rem)] overflow-y-auto">
        <PopoverHeader>
          <PopoverTitle>Tools von Titan</PopoverTitle>
          <PopoverDescription>Womit Titan liest. Ein Schalter gilt ab der nächsten Frage; jedes Tool mehr macht die Antwort etwas später.</PopoverDescription>
        </PopoverHeader>
        {listed === undefined ? (
          <Skeleton className="h-16 w-full" />
        ) : listed === "failed" ? (
          <Alert>
            <CircleAlertIcon />
            <AlertTitle>Die Liste kam nicht</AlertTitle>
            <AlertDescription>Die App hat nicht geantwortet. Schliesse das Menü und öffne es noch einmal.</AlertDescription>
          </Alert>
        ) : (
          <>
            <ItemGroup className="gap-0">
              <Item role="listitem" size="sm" className="px-0">
                <ItemContent>
                  <ItemTitle>
                    Maschinen
                    <Badge variant="secondary">immer an</Badge>
                  </ItemTitle>
                  <ItemDescription>{`${listed.own.length} Tools: ${listed.own.join(", ")}`}</ItemDescription>
                </ItemContent>
              </Item>
              {listed.servers.map((server) => (
                <Fragment key={server.name}>
                  <ItemSeparator className="my-0" />
                  <Item role="listitem" size="sm" className="px-0">
                    <ItemContent>
                      <ItemTitle>
                        {server.name}
                        {!server.reachable && <Badge variant="destructive">nicht erreichbar</Badge>}
                      </ItemTitle>
                      <ItemDescription>{toolsLine(server)}</ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Switch
                        aria-label={`${server.name} für Titan zuschalten`}
                        checked={on.includes(server.name)}
                        onCheckedChange={(checked) => onSwitch(server.name, checked)}
                      />
                    </ItemActions>
                  </Item>
                </Fragment>
              ))}
            </ItemGroup>
            {listed.servers.length === 0 && <p className="text-muted-foreground">Für diese App sind keine weiteren Server eingerichtet.</p>}
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

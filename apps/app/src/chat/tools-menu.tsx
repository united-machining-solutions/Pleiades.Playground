import { ChevronDownIcon, CircleAlertIcon, WrenchIcon } from "lucide-react"
import { Fragment, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@pleiades/ui/components/alert"
import { Badge } from "@pleiades/ui/components/badge"
import { Button } from "@pleiades/ui/components/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@pleiades/ui/components/collapsible"
import { InputGroupButton } from "@pleiades/ui/components/input-group"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@pleiades/ui/components/item"
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@pleiades/ui/components/popover"
import { Skeleton } from "@pleiades/ui/components/skeleton"
import { Switch } from "@pleiades/ui/components/switch"

import { chatTools } from "./cards.tsx"
import type { ListedServer } from "./server-list.ts"
import { getChatServers } from "./status.ts"
import { forModel } from "./tool-results.ts"

/** The words for the tools of a server: how many, and that none came where it did not answer. */
function toolsLine(server: ListedServer, tools: ReadonlyArray<unknown>): string {
  if (!server.reachable) return "It does not answer, so the chat has none of its tools."
  const count = `${tools.length} ${tools.length === 1 ? "tool" : "tools"}`
  return server.builtIn ? `${count}. The machines and their cards: always on.` : `${count}.`
}

/**
 * Where the chat says which servers give it tools, and switches the further ones off and on: a button in
 * the message field, next to the model, that opens the list. The list is asked for when it opens, so it
 * says what answers the app now. A switch is the chat's and holds from its next question; the server of the app
 * holds the chat to it (assistant.server.ts).
 */
export function ToolsMenu({
  off,
  settled = true,
  onSwitch,
}: {
  /** The further servers this chat has switched off, by name. */
  off: ReadonlyArray<string>
  /** Whether the panel knows what the chat has switched off. Until it does, the switches wait. */
  settled?: boolean
  onSwitch: (name: string, on: boolean) => void
}) {
  const [servers, setServers] = useState<Array<ListedServer> | "failed">()
  const read = (open: boolean) => {
    if (!open) return
    setServers(undefined)
    getChatServers().then(setServers, () => setServers("failed"))
  }
  return (
    <Popover onOpenChange={read}>
      {/* The label is what a screen reader hears in place of the content, so it says what is off too. */}
      <PopoverTrigger
        render={
          <InputGroupButton
            variant="ghost"
            aria-label={off.length > 0 ? `Tools of this chat, ${off.length} off` : "Tools of this chat"}
          />
        }
      >
        <WrenchIcon data-icon="inline-start" />
        Tools
        {/* What is off shows without opening the list. */}
        {off.length > 0 && <Badge variant="secondary">{off.length} off</Badge>}
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="max-h-[70svh] w-96 max-w-[calc(100vw-2rem)] overflow-y-auto">
        <PopoverHeader>
          <PopoverTitle>Tools</PopoverTitle>
          <PopoverDescription>
            What this chat can read and do besides answering. A switch holds from the next question.
          </PopoverDescription>
        </PopoverHeader>
        {servers === undefined ? (
          <Skeleton className="h-16 w-full" />
        ) : servers === "failed" ? (
          <Alert>
            <CircleAlertIcon />
            <AlertTitle>The list did not come</AlertTitle>
            <AlertDescription>The app did not answer. Close this and open it again.</AlertDescription>
          </Alert>
        ) : (
          <>
            <ItemGroup className="gap-0">
              {servers.map((server, index) => (
                <Fragment key={server.name}>
                  {index > 0 && <ItemSeparator className="my-0" />}
                  <ServerItem server={server} on={!off.includes(server.name)} settled={settled} onSwitch={onSwitch} />
                </Fragment>
              ))}
            </ItemGroup>
            {servers.every((server) => server.builtIn) && (
              <p className="text-muted-foreground">No further servers are set up for this app.</p>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

function ServerItem({
  server,
  on,
  settled,
  onSwitch,
}: {
  server: ListedServer
  on: boolean
  settled: boolean
  onSwitch: (name: string, on: boolean) => void
}) {
  // A tool only a card calls is not for the model, so it is not a tool of the chat.
  const tools = forModel(server.tools, chatTools)
  const changes = tools.some((tool) => tool.changes)
  return (
    <Item role="listitem" size="sm" className="px-0">
      <ItemContent>
        <ItemTitle>
          {server.name}
          {server.reachable ? (
            <Badge variant="secondary">Connected</Badge>
          ) : (
            <Badge variant="destructive">Not reachable</Badge>
          )}
        </ItemTitle>
        <ItemDescription>
          {toolsLine(server, tools)}
          {changes && " Some of them start or change things."}
        </ItemDescription>
      </ItemContent>
      {!server.builtIn && (
        <ItemActions>
          <Switch
            aria-label={`Use ${server.name} in this chat`}
            checked={on}
            disabled={!settled}
            onCheckedChange={(checked) => onSwitch(server.name, checked)}
          />
        </ItemActions>
      )}
      {tools.length > 0 && (
        <ItemFooter>
          <Collapsible className="w-full">
            <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>
              Its tools
              <ChevronDownIcon data-icon="inline-end" className="group-data-panel-open/button:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="flex flex-col gap-1 px-2.5 pt-2 font-mono text-xs text-muted-foreground">
                {tools.map((tool) => (
                  <li key={tool.name} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 break-all">{tool.name}</span>
                    {tool.changes && <Badge variant="outline">can change</Badge>}
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        </ItemFooter>
      )}
    </Item>
  )
}

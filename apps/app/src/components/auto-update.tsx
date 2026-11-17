import { RefreshCwIcon } from "lucide-react"

import { parseRefreshInterval, refreshChoices, refreshLabel, setRefreshInterval } from "@/hooks/refresh-interval.ts"
import { useRefreshInterval } from "@/hooks/use-live.ts"
import { Button } from "@pleiades/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@pleiades/ui/components/dropdown-menu"

/**
 * The auto update in the header, left of the chat: how often Home and the page of a machine read
 * their values again. One choice out of several, with the radio group of the dropdown menu, as the
 * brand switcher has it.
 */
export function AutoUpdate({ className }: { className?: string }) {
  const interval = useRefreshInterval()
  const label = refreshLabel(interval)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="sm" className={className} aria-label={`Auto update: every ${label}`} />}
      >
        <RefreshCwIcon />
        {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-fit" align="end" sideOffset={4}>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Auto update</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={String(interval)}
            onValueChange={(value) => setRefreshInterval(parseRefreshInterval(value))}
          >
            {refreshChoices.map((choice) => (
              <DropdownMenuRadioItem key={choice} value={String(choice)} closeOnClick>
                {refreshLabel(choice)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

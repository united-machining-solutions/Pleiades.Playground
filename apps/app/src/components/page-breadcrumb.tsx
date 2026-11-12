import { Link, useMatch } from "@tanstack/react-router"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

/**
 * Where the page stands, in the header as in the shadcn block sidebar-15: "Machines" on Home,
 * "Machines › P-04" on the page of a machine. A page the app does not know has none.
 */
export function PageBreadcrumb() {
  const home = useMatch({ from: "/", shouldThrow: false })
  const machine = useMatch({ from: "/machines/$machine", shouldThrow: false })
  if (!home && !machine) return null
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          {machine ? (
            // The chat stays open while the page changes.
            <BreadcrumbLink render={<Link to="/" search />}>Machines</BreadcrumbLink>
          ) : (
            <BreadcrumbPage className="line-clamp-1">Machines</BreadcrumbPage>
          )}
        </BreadcrumbItem>
        {machine && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="line-clamp-1">{machine.params.machine}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

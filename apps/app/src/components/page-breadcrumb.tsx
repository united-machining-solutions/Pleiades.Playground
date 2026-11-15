import { Link, useMatches, useRouter } from "@tanstack/react-router"
import { Fragment } from "react"

import { crumbsOf, navPages } from "@/components/nav.ts"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@pleiades/ui/components/breadcrumb"

/**
 * Where the page stands, in the header as in the shadcn block sidebar-15: "Machines" on Home,
 * "Machines › P-04" on the page of a machine. It names no page: it reads the routes, as the sidebar
 * does (nav.ts). A page the app does not know has none.
 */
export function PageBreadcrumb() {
  const router = useRouter()
  // The innermost route that matched is the page. Where none did, it is the root route alone.
  const page = useMatches({ select: (matches) => matches.at(-1) })
  if (!page || page.routeId === "__root__") return null
  const steps = crumbsOf(navPages(Object.values(router.routesById)), {
    fullPath: page.fullPath,
    pathname: page.pathname,
    params: page.params,
    staticData: page.staticData,
  })
  if (steps.length === 0) return null
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {steps.map((step, index) => (
          <Fragment key={step.path ?? step.title}>
            {index > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {step.path ? (
                // The chat stays open while the page changes.
                <BreadcrumbLink render={<Link to={step.path as "/"} search />}>{step.title}</BreadcrumbLink>
              ) : (
                <BreadcrumbPage className="line-clamp-1">{step.title}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

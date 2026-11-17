import { Link, useMatches, useRouter } from "@tanstack/react-router"
import { Fragment } from "react"

import { crumbsOf, navPages } from "@/components/nav.ts"
import { usePages } from "@/pages/store.ts"
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
 * does (nav.ts). A page the app does not know has none. A page kept from the chat is called by its
 * title, which a person can change while it is open: the breadcrumb follows the pages of this
 * browser for that.
 */
export function PageBreadcrumb() {
  const router = useRouter()
  usePages()
  // The innermost route that matched is the page. Where none did, it is the root route alone.
  const page = useMatches({ select: (matches) => matches.at(-1) })
  if (!page || page.routeId === "__root__") return null
  const steps = crumbsOf(navPages(Object.values(router.routesById)), {
    fullPath: page.fullPath,
    pathname: page.pathname,
    params: page.params,
    search: page.search,
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
                // One line. The block sidebar-15 has `line-clamp-1` here, which lets a long title take
                // the width of the header, and a title a person gave to a page kept from the chat can
                // be a whole question. So it is cut at a width, and the field beside it keeps its own.
                <BreadcrumbPage className="max-w-40 truncate">{step.title}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

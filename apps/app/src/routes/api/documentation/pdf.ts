import { createFileRoute } from "@tanstack/react-router"
import { servePdf } from "@/documentation/pdf-source.ts"
export const Route = createFileRoute("/api/documentation/pdf")({ server: { handlers: { GET: ({ request }) => servePdf(request) } } })

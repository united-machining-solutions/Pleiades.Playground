# Ultimaker service contract (draft)

The optional Ultimaker service slices STL files for an Ultimaker 3 and uses its local HTTP API.
The decision is [ADR-0012](../../docs/adr/0012-headless-ultimaker-tool-service.md); the discussion is [issue #117](https://github.com/united-machining-solutions/Pleiades.Playground/issues/117).

REST OpenAPI is served at `/openapi/v1.json`, Streamable HTTP MCP at `/mcp`.
Both use the same services. Public values use metre, second, kelvin, cubic metre and fractions (`one`).
STL coordinates are millimetres. G-code is an opaque manufacturer-format artifact. Only the adapter
converts units. The initial profile supports PLA, left AA 0.4, single extrusion and bed centring.

| MCP tool | REST | Effect |
|---|---|---|
| `ultimaker_printer_status` | `GET /printer` | Model, firmware, status, cores, materials |
| `ultimaker_profiles_list` | `GET /profiles` | Supported profile |
| `ultimaker_model_store` | `POST /models` (raw STL body) | Store STL; MCP accepts base64 |
| `ultimaker_model_slice` | `POST /slices` | Slice a model without contacting the printer |
| `ultimaker_slice_get` | `GET /slices/{id}` | Metadata and SHA-256 |
| `ultimaker_slice_validate` | `GET /slices/{id}/validation` | Recheck SHA-256, travel envelope and clip exclusions |
| — | `GET /slices/{id}/gcode` | Download completed G-code |
| `ultimaker_printer_pair` | `POST /printer/pair` | Request display approval, privately persist credentials |
| `ultimaker_pairing_status` | `GET /printer/pair` | Poll approval and verify Digest credentials |
| `ultimaker_print_start` | `POST /printer/print` | Validate hash, model, core, material and idle state, upload/start |
| `ultimaker_slice_validate_header` | `POST /slices/{id}/printer-validation` | Ask the paired printer to validate the exact artifact header; never starts printing |
| `ultimaker_print_current` | `GET /printer/print/current` | Current job, progress fraction, times and exact slice associations; job is null when none exists |
| `ultimaker_print_history` | `GET /printer/print/history?offset=0&count=20` | Bounded page of historical jobs with slice associations |
| `ultimaker_print_get` | `GET /printer/print/history/{jobId}` | One historical job by printer UUID |
| `ultimaker_slice_prints` | `GET /slices/{id}/prints?offset=0&count=20` | Durable local submission attempts for this slice, including ambiguous uploads |

Slicing accepts a model ID, profile ID, loaded PLA material UUID, layer height in metre (0.00006–0.0003),
infill fraction (0–1) and support boolean. Result includes exact settings, SHA-256, time in second,
filament volume in cubic metre, creation time and input model ID. IDs are server-generated UUIDs,
never filesystem paths. Only completed, server-generated slices can be printed.

Pairing needs approval on the printer display. The key is stored in a private volume file and never
returned. The printer uses HTTP Digest, never Basic. Printing requires `Ultimaker:EnablePrinting=true`
and the exact artifact SHA-256. On firmware 5.3.0, multipart `POST /api/v1/print_job` with `jobname`
and `file` starts printing immediately. Uploads are never automatically retried; inspect state first.

The optional `ultimaker` Compose profile binds to loopback. Pleiades `ultimaker:read` and
`ultimaker:write` policies protect REST and MCP. Local deployments may explicitly disable auth.
Do not expose that mode to an untrusted network.

`profileId` currently accepts `ultimaker3-pla-aa04-left` only; unknown IDs fail. No desktop-profile
import is implied. The conservative model envelope is 0.17 × 0.19 × 0.195 metre. Validation checks
explicit nozzle coordinates/segments only; it does not simulate the complete head, firmware-controlled
motions or objects already on the plate. G-code can be opened in Cura for layer inspection, but is
not an editable project. Validation reports name these limits alongside the checked SI bounds.

## Header validation, job status and traceability

Printer header validation requires pairing but not EnablePrinting. The result identifies the slice,
exact SHA-256, printer UUID, check time and the manufacturer's fault code, level and message.
Passed means no findings: warnings, errors and unknown levels all block print-start. This is a
point-in-time header check, not collision simulation. Print-start repeats it immediately before upload.

Current/history results expose nullable progress (fraction), durations in second and UTC timestamps.
Empty vendor timestamps and absent values remain null. Unknown state/result strings are preserved.
An absent current job returns HTTP 200 with job=null; a missing historical UUID returns HTTP 404.
History and slice submission pages use offset>=0 and count=1..100, default 20. NextOffset is null
when fewer than count items are returned; there is no claim of a known total count.

Each print attempt is journalled under /data/print-submissions before the upload is sent, with
submission ID, printer UUID, slice ID, SHA-256, job name and timestamps. Accepted responses add the
printer job UUID. Current/history jobs are linked only by the exact printer UUID and job UUID,
never by a filename, time or material guess. External jobs have no slice association.
Mapping survives service restarts. Printer history retention remains controlled by the device.

Interrupted/failed uploads remain state=uploading or unknown with a potentially missing job UUID.
These are visible through the slice's submissions. Do not retry automatically or invent a match.
Inspect printer state and reconcile manually. A persistence failure after API acceptance is also
ambiguous. Submission records contain no pairing secrets. One replica owns the printer/data volume.

Pairing can be explicitly repeated after the printer reports unauthorized, or HTTP 404 for a forgotten
request (exposed as expired). Authorized credentials and requests still awaiting display approval
(unknown) are preserved; repeating those requests returns HTTP 409. A failed status check or replacement
request never removes existing credentials. New credentials are persisted privately by atomic replacement.
Malformed printer status payloads or JSON return HTTP 502 with a message that excludes the payload;
MCP reports a tool error. Client input and artifact validation errors retain their existing status codes.

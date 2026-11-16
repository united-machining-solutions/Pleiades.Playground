# Ultimaker service contract (proposal)

The optional Ultimaker service slices STL files for an Ultimaker 3 and uses its local HTTP API.
This new contract needs a maintainer issue before merge; see the draft in
[the service README](../../source/Pleiades.Playground.Ultimaker.Api/README.md).

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

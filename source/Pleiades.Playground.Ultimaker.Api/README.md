# Ultimaker 3: CuraEngine, REST and MCP

An optional .NET 10 service with CuraEngine in one Linux container. It uses the existing Pleiades MCP,
JSON, authorization and health-check libraries. The [contract](../../contracts/ultimaker/README.md)
is a draft. This is a tool service, not an MQTT telemetry adapter or a new application page.

## Start

From the repository root:

```bash
docker compose --profile ultimaker up -d --build --wait ultimaker-api
```

Only this service is started; it needs neither the demo database nor the broker.
MCP: <http://localhost:5530/mcp>. REST schema: <http://localhost:5530/openapi/v1.json>.
Liveness: `/health`. Diagnostics, including engine/definitions: `/healthcheck`.
The service does not connect to the printer until a printer operation is called.

The default host is `http://ultimaker.local/`. Set `ULTIMAKER_PRINTER_URL` if needed;
the Docker host/container must resolve and reach that internal name. The reference device identifies
itself as Ultimaker 3, hardware type 9066, firmware 5.3.0. No printer address is discovered or changed.

Defaults bind port 5530 to loopback and explicitly disable client authentication in Compose.
For remote use, enable `ULTIMAKER_AUTH_ENABLED`, configure the three `ULTIMAKER_AUTH_*` issuer/
audience settings and use the existing Pleiades `ultimaker:read` / `ultimaker:write` permissions.
The executable itself defaults to authentication enabled and fails closed if unconfigured.
Printer credentials are separate from client authentication and are stored privately in `/data`.

Example MCP host entry (Streamable HTTP; adapt the wrapper to your client):

```json
{ "url": "http://localhost:5530/mcp" }
```

## Profiles and units

`GET /profiles` / `ultimaker_profiles_list` list the profiles. Initially there is one:
`ultimaker3-pla-aa04-left`: PLA, left AA 0.4 core, 2.85 mm filament, 200 °C nozzle, 60 °C bed,
three walls, grid infill and a 4 mm brim. These are manufacturer settings inside the adapter.
This is an explicit headless profile, not an evaluation or import of a complete Cura desktop stack.
CuraEngine CLI does not evaluate Cura's Python expressions. Its inherited defaults are supplemented
by the effective fixed settings in `CuraSlicer.CreateStartInfo`.

Choose `profileId` in REST or MCP. Unknown IDs are rejected. Within this profile callers may vary
layer height (0.00006–0.0003 metre), infill fraction (0–1) and support. Arbitrary engine overrides,
dual extrusion, additional materials, auto-rotation and project-file import are not supported.
Keep the original STL orientation; the service translates it to the bed centre and lowers it to Z=0.
The conservative model limit is 0.17 × 0.19 × 0.195 metre, with adhesion clearance.

STL coordinates conventionally use millimetres. **The public contract uses SI**: metre, kelvin,
second and cubic metre; infill is a fraction. Manufacturer-format STL/G-code are opaque artifacts.

## Slice and inspect in Cura

Get the left material UUID with `GET /printer` / `ultimaker_printer_status`. Check that PLA is loaded.
For REST, upload raw STL bytes (PowerShell):

```powershell
$model = Invoke-RestMethod http://localhost:5530/models -Method Post `
  -ContentType model/stl -InFile 'C:\models\part.stl'
$settings = @{
  modelId = $model.id
  materialId = '<loaded PLA material UUID>'
  profileId = 'ultimaker3-pla-aa04-left'
  layerHeightMetre = 0.0002
  infillFraction = 0.2
  support = $false
} | ConvertTo-Json
$slice = Invoke-RestMethod http://localhost:5530/slices -Method Post `
  -ContentType application/json -Body $settings -TimeoutSec 210
Invoke-WebRequest ("http://localhost:5530" + $slice.downloadPath) -OutFile part.gcode
Invoke-WebRequest ("http://localhost:5530" + $slice.validationPath) -OutFile part.validation.json
```

MCP uses `ultimaker_model_store` (base64 STL), `ultimaker_model_slice` (same settings),
`ultimaker_slice_get` and `ultimaker_slice_validate`. The original downloaded STL need not be copied
into the repository. Artifacts are persistent in the `ultimaker_data` volume, referenced by UUID;
user-supplied filesystem paths and URLs are never executed or fetched.

Open `part.gcode` through **File → Open File(s)** in Cura and select the Ultimaker 3. Cura opens
G-code as a layer preview. Inspect the layer slider, build-plate placement, brim, support and travel
paths. G-code is already sliced: it is not an editable Cura project. To change model orientation or
desktop profiles, open the original STL in Cura and slice again there.

The engine CLI writes an initial Griffin header without final time/material statistics. The .NET
adapter completes that header from the engine's elapsed-time comments and the extrusion path, replacing
placeholder bounds. The exact resulting bytes are hashed and are the same bytes downloaded/printed.
Filament use is an estimate from absolute-extrusion high-water marks and the 2.85 mm filament area.

## Validation and its limits

Every slice is checked before completion; `GET /slices/{id}/validation` or
`ultimaker_slice_validate` rechecks the exact hashed artifact. Checks include:

- Complete STL triangles, finite coordinates, conservative dimensions and bed placement.
- Ultimaker 3 Griffin header, nonempty layers, positive extrusion and elapsed time.
- All explicit XYZ travel within the 0.233 × 0.215 × 0.200 metre manufacturer envelope.
- Single left tool and segment intersection with Cura 4.13's plate-clip exclusions near the bed,
  including a 0.0002 metre nozzle-radius margin.
- SHA-256 before download and print, matching material UUID / AA 0.4 / printer model / idle state.

**This is not full collision simulation.** It does not model the whole print head against the printed
object, firmware-controlled homing/levelling/G280 priming, a previously printed object on the bed,
mesh manifoldness, adhesion or support adequacy. A passed report is not proof of a successful print.
Inspect the layers in Cura and the physical printer before printing.

## Pair and explicitly print

The service never pairs on startup. Call `ultimaker_printer_pair` with the user name to show on the
printer display (REST `POST /printer/pair`, body `{ "user": "Your name" }`). Approve on the printer,
then poll `ultimaker_pairing_status` / `GET /printer/pair`. The returned printer key is saved with
mode 0600 in the Linux data volume; no key is returned to the client. Back up/protect this volume.
Repeat the same pairing call after rejection (`unauthorized`) or a forgotten request (`expired`,
HTTP 404 from the printer). Authorized and pending (`unknown`) pairings return HTTP 409 and keep
their credentials. Reject a pending request on the display before trying again. Network errors,
unknown status values and malformed replacement credentials preserve the existing file; successful
replacement is atomic. Malformed printer status responses return HTTP 502 over REST and a tool error
over MCP without echoing the printer payload.

Printing defaults to disabled. Set `ULTIMAKER_ENABLE_PRINTING=true` and recreate the service when
you intend to use it. Then call `ultimaker_print_start` or `POST /printer/print` with:

```json
{ "sliceId": "<completed slice ID>", "sha256": "<exact returned SHA-256>", "jobName": "part" }
```

On the Ultimaker 3, upload to `POST /api/v1/print_job` **starts printing**. The adapter sends multipart
`jobname` and `file`, authenticates with HTTP Digest only and never retries uploads automatically.
A timeout can mean the printer already received the job. Read its state and inspect the printer
before retrying. Status `accepted` proves API acceptance, not a completed print.

## Runtime and verification

### Printer header checks and job traceability

`POST /slices/{id}/printer-validation` and `ultimaker_slice_validate_header` send the exact hashed
artifact to the paired printer's validation endpoint. This never starts a print and does not
require printing enabled. Results identify slice, hash, printer, check time and structured findings.
Print-start repeats the check and blocks on any warning, error or unknown finding level.

`GET /printer/print/current` / `ultimaker_print_current` return the current job, or job=null when none
exists. History is `GET /printer/print/history?offset=0&count=20` / `ultimaker_print_history`; a single
job is `GET /printer/print/history/{jobId}` / `ultimaker_print_get`. Pages accept count=1..100.
Unknown states/results are preserved; missing dates/numbers remain null. All durations use second,
progress is a fraction and timestamps are UTC. A finished job is not a part-quality assessment.

`GET /slices/{id}/prints` / `ultimaker_slice_prints` list the local submission journal. Each attempt
is persisted before upload and bound to printer UUID, slice ID and SHA-256. Accepted responses add
the printer job UUID. Current/history results join by those exact printer/job IDs, never by name.
Externally started jobs therefore have no inferred association. The journal survives restarts.
Remote job history remains subject to the printer's own retention.

An upload failure/crash can leave state=unknown or uploading without a UUID. Do not retry
automatically. Inspect the printer and the journal before deciding what happened. A persistence
failure after API acceptance is ambiguous too. No printer pairing secrets appear in journal records.

One slice runs at a time, with two OpenMP threads and a default 180-second timeout. Concurrent slices
are rejected rather than queued. On cancellation/timeout the engine process tree is killed and
incomplete artifacts are removed. Input is limited to 20 MiB. No automatic retention policy deletes
completed files; monitor disk use and manage the volume administratively. Keep one service replica
per data volume/printer so the in-process serialization remains meaningful.

```powershell
dotnet build source/Pleiades.Playground.slnx
dotnet test --solution source/Pleiades.Playground.slnx
$env:ULTIMAKER_TEST_URL = 'http://localhost:5530'
dotnet test --project source/Pleiades.Playground.Ultimaker.Api.Test/Pleiades.Playground.Ultimaker.Api.Test.csproj
node .github/scripts/check-doc-links.mjs
```

The optional container test exercises real slicing and MCP without calling any printer write.
Fake-printer tests exercise pairing, print preflight and multipart upload without physical hardware.
The Images workflow publishes `ghcr.io/united-machining-solutions/pleiades.playground.ultimaker.api`
after a merge to main or a release tag. To activate it in the deployed stack, set
`COMPOSE_PROFILES=ultimaker` and the real printer URL in the deployment computer's private .env.
See [deployment](../../docs/deployment.md#enable-the-ultimaker-services).
No UI screenshot is required: this integration has no new application screen.

## Dependencies and licences

The image pins Debian Bookworm `cura-engine` 1:4.13.0-1+b1 and Cura data 4.13.0-1. It extracts
the data package without installing a Cura desktop environment. CuraEngine runs as a separate
process; all application code is C#/.NET. The final runtime is the official .NET 10 Ubuntu Noble
image, with the engine's matching non-glibc libraries in its private library path.
Copyright/licence notices are retained under `/opt/cura/licenses`.

- [CuraEngine source, AGPL-3.0](https://sources.debian.org/src/cura-engine/1%3A4.13.0-1/)
- [Cura data source, LGPL-3.0 and bundled notices](https://sources.debian.org/src/cura/4.13.0-1/)
- [Upstream CuraEngine](https://github.com/Ultimaker/CuraEngine)
- Local printer contract: the device's `/docs/api/api_documentation.json` (firmware 5.3.0).

## Decision

[ADR-0012](../../docs/adr/0012-headless-ultimaker-tool-service.md) records the decision; the discussion is
[issue #117](https://github.com/united-machining-solutions/Pleiades.Playground/issues/117).

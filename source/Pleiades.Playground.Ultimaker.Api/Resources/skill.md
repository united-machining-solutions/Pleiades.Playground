# Ultimaker 3 workflow

Call `ultimaker_profiles_list` and `ultimaker_printer_status` first. The initial profile supports
PLA in the left AA 0.4 core only. Read the loaded material UUID. Do not infer material from colour
or temperature. The print-start preflight also checks the printer's material definition for PLA.

Store an STL with `ultimaker_model_store` (base64), or raw REST `POST /models` for larger files.
STL coordinates are millimetres; the service centres the object and puts it on the bed. Public layer
heights and bounds use metre, infill uses a fraction, temperature uses kelvin. Models must fit in
0.17 × 0.19 × 0.195 metre, allowing space for adhesion. The service does not repair meshes or orient
them for printability. Ask the person for the intended orientation if it is unclear.

Call `ultimaker_model_slice` with the model ID, profileId and PLA UUID. Only the profile listed by
`ultimaker_profiles_list` is supported; unknown IDs fail. It never contacts the printer. Inspect
the returned settings, time in second, material volume in cubic metre, artifact hash and download
path. Retrieve metadata with `ultimaker_slice_get`. Download G-code with REST at the returned path.
Use `ultimaker_slice_validate` for static nozzle-path checks and their explicit limitations. Open
the G-code in Cura's layer preview; this is not an editable Cura project or full collision simulation.
Slicing is bounded by a timeout, and only one process may slice at a time. Stored artifacts persist
in the data volume across restarts. An administrator manages retention.

Pair only when asked: `ultimaker_printer_pair` shows the user name on the physical printer display.
A person approves there; poll `ultimaker_pairing_status`. Credentials are stored privately, never
shown in responses. Pairing does not start printing.

Only use `ultimaker_print_start` when the person explicitly requests this artifact to be printed.
Supply its exact SHA-256. Printing must be enabled by configuration. The printer must be idle and
have the correct model, core and matching loaded PLA. UPLOADING STARTS PRINTING on this firmware.
Never automatically retry a failed or timed-out upload: it may already have started the print.
Read status and ask the person to inspect the printer before retrying an ambiguous result.

Call `ultimaker_slice_validate_header` to send the exact hashed slice to the paired printer for its
own header checks, without printing. Print-start repeats this; any finding, including warnings or
unknown severity, blocks the upload. The report identifies slice/hash/printer and check time.

Use `ultimaker_print_current` for current job state/progress and `ultimaker_print_history` for bounded
history pages (count 1..100, default 20). `ultimaker_print_get` reads one historical UUID. Missing
current jobs are null; missing historical jobs are errors. Empty timestamps/numbers remain null.
All progress is a fraction, durations are seconds and timestamps UTC.

Use `ultimaker_slice_prints` for the persistent submission journal. Associations are exact joins
by printer UUID and printer job UUID. External jobs are not guessed into a slice. Unknown/uploading
attempts may already have started printing even without a recorded UUID; never retry automatically.

No tools here move axes, heat cores, change firmware, pause or abort an existing print.

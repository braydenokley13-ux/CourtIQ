# World-first browser verification — 2026-10-05

The completed anonymous Chromium run passed all 15 checks in `report.json`. The serial supplemental run passed all 3 checks in `edges-report.json`. These are executed checks; the scripts exercise the visible UI and observe real browser worker messages. No authenticated session, film upload, or application test mutation API was used.

The main run verified full-world rendering with the local skinned athlete asset; exact freezes at 0.75 s and 1.40 s; timed D3 coaching; identical frames before the edit; changed modeled windows and first reads; actual Break My Defense worker evidence; the same opening predicate at the frozen frame; a paired replay of the previous opponent against the revised answer; keyboard movement without an instant position jump; complete configuration restoration after reload; Teach from the saved revision with the saved role and primary job; explicit supported coaching previews; rejected arbitrary coaching text; a 390 px viewport; modal keyboard dismissal; invalid import preservation; and successful in-memory saving plus export when device storage rejects writes.

The supplemental run imported the actual exported collection through the file input, dragged D3 in the rendered court to a new floor target, verified unchanged prior frames and no instant displacement, and verified that disabling WebGL still exposes an interactive overhead court and freezes Run at 0.75 s.

Evidence includes screenshots `01` through `15`, the complete raw observed worker reports in `first-attack.json.gz` and `second-attack.json.gz`, and the valid answer export in `answers-export.json`. Decompress the worker files with `gzip -dc` to inspect every candidate, simulation frame, witness, and paired replay. The main report keeps the relevant paired configuration and witness while omitting duplicated frame arrays.

A real browser finding was repaired during verification: decimal division selected the prior discrete snapshot at an exact witness time (2.525 / 0.025), so the attack panel claimed an opening while the court label said covered. Timestamp-based frame selection now agrees with the worker witness. The comparison also now exposes changed opportunities and the offense's changed first read, instead of only showing unchanged zero-duration windows. Earlier failure captures are retained as diagnostic evidence and are not the final verified state.

The completed main run recorded no browser runtime errors and no failed requests. It recorded Three.js warnings about PMREM sample clipping and a deprecated shadow-map mode; these are preserved in the report. Verification uses Chromium with SwiftShader and device scale factor 0.75 in the managed cloud. Screenshots demonstrate the renderer and interactions, not a physical laptop performance benchmark or photorealism. The bounded attack search remains finite and makes no universal coverage claim.

Run against the existing dev server, without starting another one:

```bash
source /workspace/.courtiq-env/activate.sh
BASE_URL=http://localhost:3000 pnpm exec tsx scripts/verify-defense-lab.ts
pnpm exec tsx scripts/verify-defense-lab-edges.ts
```

The supplemental runner reads the export produced by the main runner. The browser sessions run serially and close on completion.

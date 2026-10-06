# CourtIQ perf run dev-nodraw

- Verdict: **NOT A VALID FPS TEST** — nodraw: JS pipeline only, FPS not meaningful; tier low (software-gl, auto)
- Device: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) | 4 cores | 8 GB | dpr 1 | canvas 840x472 | GPU timer yes | warm-up n/a
- Page: http://localhost:3104/?bench=1&nodraw=1 | load 22824 ms | js heap at end 82 MB | DOM nodes 984

| segment | frames | fps | frame p50 ms | p95 ms | p99 ms | js ms (p50/p95) | gpu ms p50 | main-thread busy ms/frame | non-runtime JS ms/frame | long tasks | calls | tris | scale |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| entry-ambient | 0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 / 0.0 | n/a | n/a | n/a | 0 (max 0 ms) | 0 | 0k | 1.00 |
| run-normal | 203 | 53.8 | 16.7 | 33.3 | 50.0 | 1.6 / 4.8 | n/a | 6.3 | 2.6 | 1 (max 77 ms) | 1 | 0k | 1.00 |
| xray-ownership | 41 | 11.9 | 66.7 | 133.4 | 160.0 | 2.7 / 6.7 | n/a | 12.3 | 6.9 | 0 (max 0 ms) | 1 | 0k | 1.00 |
| xray-reach | 41 | 12.9 | 66.8 | 116.6 | 166.7 | 2.2 / 5.4 | n/a | 11.2 | 6.6 | 0 (max 0 ms) | 1 | 0k | 1.00 |
| xray-passing | 43 | 12.3 | 66.7 | 163.3 | 183.4 | 2.6 / 5.4 | n/a | 12.7 | 7.2 | 0 (max 0 ms) | 1 | 0k | 1.00 |
| xray-space | 41 | 12.7 | 83.3 | 116.6 | 143.4 | 2.0 / 6.2 | n/a | 11.9 | 6.8 | 0 (max 0 ms) | 1 | 0k | 1.00 |
| compare-run | 177 | 35.1 | 16.7 | 53.4 | 306.1 | 1.3 / 2.2 | n/a | 6.0 | 3.1 | 1 (max 50 ms) | 1 | 0k | 1.00 |
| break-search | 28 | 11.3 | 83.3 | 195.0 | 237.0 | 2.0 / 34.4 | n/a | 27.7 | 13.5 | 2 (max 84 ms) | 1 | 0k | 1.00 |
| break-play | 167 | 41.6 | 16.7 | 61.6 | 89.0 | 1.7 / 3.2 | n/a | 5.5 | 2.4 | 0 (max 0 ms) | 1 | 0k | 1.00 |

- Resources at end: 0 shader programs, 1 textures, 0 geometries
- Fix search (worker): 2484 ms, UI timer lag p95 13.1 / max 92.7 ms; 2187 ms, UI timer lag p95 15 / max 46.6 ms
- Break search (worker): 2990 ms, UI timer lag p95 20.9 / max 138.8 ms
- Transferred: 8618 KB total; font 137 KB (4), css 23 KB (2), js 7694 KB (14), other 10 KB (6), glb 753 KB (4)

Pass checks (p50 >= 45 fps, p95 interval < 33 ms): run-normal FAIL (59.9 fps, p95 33.3 ms); xray-ownership FAIL (15 fps, p95 133.4 ms); xray-reach FAIL (15 fps, p95 116.6 ms); xray-passing FAIL (15 fps, p95 163.27 ms); xray-space FAIL (12 fps, p95 116.6 ms); compare-run FAIL (59.9 fps, p95 53.4 ms); break-play FAIL (59.9 fps, p95 61.62 ms)
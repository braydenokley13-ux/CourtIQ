# CourtIQ perf run prod-nodraw-uiclock0

- Verdict: **NOT A VALID FPS TEST** — nodraw: JS pipeline only, FPS not meaningful; tier low (software-gl, auto)
- Device: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) | 4 cores | 8 GB | dpr 1 | canvas 840x472 | GPU timer yes | warm-up n/a
- Page: http://localhost:3106/?bench=1&nodraw=1&uiclock=0 | load 139 ms | js heap at end 58.7 MB | DOM nodes 442

| segment | frames | fps | frame p50 ms | p95 ms | p99 ms | js ms (p50/p95) | gpu ms p50 | main-thread busy ms/frame | non-runtime JS ms/frame | long tasks | calls | tris | scale |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| entry-ambient | 236 | 59.0 | 16.7 | 16.8 | 27.5 | 1.2 / 2.1 | n/a | 1.7 | 0.1 | 0 (max 0 ms) | 1 | 0k | 1.00 |
| run-normal | 216 | 55.6 | 16.7 | 16.8 | 33.4 | 1.0 / 2.1 | n/a | 4.2 | 1.2 | 0 (max 0 ms) | 1 | 0k | 1.00 |
| xray-ownership | 90 | 29.2 | 33.3 | 85.0 | 120.3 | 1.7 / 3.6 | n/a | 5.2 | 1.4 | 0 (max 0 ms) | 1 | 0k | 1.00 |
| xray-reach | 74 | 22.9 | 33.4 | 105.9 | 171.2 | 1.4 / 2.4 | n/a | 3.7 | 1.0 | 0 (max 0 ms) | 1 | 0k | 1.00 |
| xray-passing | 71 | 21.0 | 33.4 | 141.6 | 208.3 | 1.8 / 3.0 | n/a | 8.8 | 1.2 | 1 (max 263 ms) | 1 | 0k | 1.00 |
| xray-space | 101 | 28.7 | 16.7 | 83.4 | 200.0 | 1.2 / 2.3 | n/a | 3.2 | 0.9 | 0 (max 0 ms) | 1 | 0k | 1.00 |
| compare-run | 199 | 45.4 | 16.7 | 33.3 | 218.4 | 1.0 / 1.8 | n/a | 4.2 | 1.1 | 1 (max 53 ms) | 1 | 0k | 1.00 |
| break-search | 23 | 10.6 | 41.6 | 326.6 | 464.9 | 1.5 / 3.7 | n/a | 6.8 | 1.9 | 0 (max 0 ms) | 1 | 0k | 1.00 |
| break-play | 206 | 51.3 | 16.7 | 16.8 | 82.6 | 1.1 / 2.2 | n/a | 3.1 | 0.7 | 0 (max 0 ms) | 1 | 0k | 1.00 |

- Resources at end: 0 shader programs, 1 textures, 0 geometries
- Fix search (worker): 2311 ms, UI timer lag p95 5.2 / max 77.3 ms; 1505 ms, UI timer lag p95 10.3 / max 193.6 ms
- Break search (worker): 2945 ms, UI timer lag p95 4.3 / max 34.4 ms
- Transferred: 1586 KB total; font 110 KB (3), css 18 KB (2), js 713 KB (33), other 2 KB (2), glb 744 KB (4)

Pass checks (p50 >= 45 fps, p95 interval < 33 ms): run-normal ok (59.9 fps, p95 16.8 ms); xray-ownership FAIL (30 fps, p95 85.02 ms); xray-reach FAIL (29.9 fps, p95 105.88 ms); xray-passing FAIL (29.9 fps, p95 141.55 ms); xray-space FAIL (59.9 fps, p95 83.4 ms); compare-run FAIL (59.9 fps, p95 33.3 ms); break-play ok (59.9 fps, p95 16.8 ms)
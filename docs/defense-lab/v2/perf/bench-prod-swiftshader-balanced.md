# CourtIQ perf run prod-swiftshader-balanced

- Verdict: **NOT A VALID FPS TEST** — software GL: FPS not meaningful, JS/counters only; tier balanced (override:balanced, user override)
- Device: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) | 4 cores | 8 GB | dpr 1 | canvas 840x472 | GPU timer yes | warm-up n/a
- Page: http://localhost:3106/?bench=1&quality=balanced&soak=3 | load 59 ms | js heap at end 38.5 MB | DOM nodes 488

| segment | frames | fps | frame p50 ms | p95 ms | p99 ms | js ms (p50/p95) | gpu ms p50 | main-thread busy ms/frame | non-runtime JS ms/frame | long tasks | calls | tris | scale |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| entry-ambient | 4 | 60.2 | 16.6 | 16.6 | 16.6 | 6.6 / 7.7 | 1308.42 | 10.6 | 1.1 | 0 (max 0 ms) | 32 | 175k | 1.00 |
| run-normal | 41 | 7.7 | 33.4 | 359.1 | 405.1 | 6.0 / 11.7 | 1531.99 | 22.8 | 5.2 | 2 (max 102 ms) | 40 | 217k | 1.00 |
| xray-ownership | 32 | 5.6 | 158.4 | 310.8 | 328.8 | 10.9 / 18.7 | 1568.14 | 176.5 | 2.3 | 1 (max 4958 ms) | 101 | 221k | 1.00 |
| xray-reach | 34 | 10.3 | 83.3 | 157.5 | 164.8 | 8.0 / 4907.9 | 1101.16 | 579.0 | 2.2 | 4 (max 5690 ms) | 66 | 218k | 1.00 |
| xray-passing | 34 | 10.7 | 83.4 | 160.0 | 178.6 | 9.0 / 4670.9 | 1101.16 | 1095.3 | 2.1 | 10 (max 4894 ms) | 62 | 218k | 1.00 |
| xray-space | 34 | 12.5 | 83.3 | 125.0 | 131.6 | 6.9 / 5124.0 | 1101.16 | 898.5 | 1.7 | 6 (max 6172 ms) | 47 | 217k | 1.00 |
| compare-run | 42 | 9.1 | 66.6 | 295.1 | 339.1 | 5.8 / 11.1 | 1101.16 | 146.0 | 5.1 | 2 (max 5136 ms) | 40 | 217k | 1.00 |
| break-search | 0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 / 0.0 | n/a | n/a | n/a | 0 (max 0 ms) | 0 | 0k | 1.00 |
| break-play | 41 | 14.4 | 75.0 | 100.0 | 100.0 | 8.0 / 17.2 | 1542.28 | 163.4 | 2.0 | 2 (max 4674 ms) | 110 | 220k | 1.00 |
| soak-1 | 60 | 7.5 | 116.7 | 176.7 | 182.1 | 8.9 / 23.1 | 1542.28 | 27.2 | 2.0 | 1 (max 77 ms) | 126 | 221k | 1.00 |
| soak-2 | 61 | 18.5 | 50.0 | 78.3 | 82.3 | 8.1 / 13.7 | 1216.92 | 19.2 | 1.7 | 0 (max 0 ms) | 126 | 221k | 1.00 |
| soak-3 | 61 | 13.3 | 66.7 | 109.2 | 115.2 | 7.7 / 14.4 | 1216.92 | 20.6 | 2.1 | 0 (max 0 ms) | 126 | 221k | 1.00 |

- Resources at end: 30 shader programs, 47 textures, 109 geometries
- Fix search (worker): 1369 ms, UI timer lag p95 2.3 / max 112.4 ms; 1409 ms, UI timer lag p95 3.2 / max 85.5 ms
- Break search (worker): 2071 ms, UI timer lag p95 5.4 / max 26.3 ms
- Transferred: 1586 KB total; font 110 KB (3), css 18 KB (2), js 713 KB (33), other 2 KB (2), glb 744 KB (4)

| soak iteration | heap MB (after gc) | geometries | textures | programs |
|---|---|---|---|---|
| 1 | 53.5 | 109 | 47 | 30 |
| 2 | 53.6 | 109 | 47 | 30 |
| 3 | 53.6 | 109 | 47 | 30 |

Pass checks (p50 >= 45 fps, p95 interval < 33 ms): run-normal FAIL (29.9 fps, p95 359.12 ms); xray-ownership FAIL (6.3 fps, p95 310.82 ms); xray-reach FAIL (12 fps, p95 157.47 ms); xray-passing FAIL (12 fps, p95 159.99 ms); xray-space FAIL (12 fps, p95 125 ms); compare-run FAIL (15 fps, p95 295.08 ms); break-play FAIL (13.3 fps, p95 100 ms)
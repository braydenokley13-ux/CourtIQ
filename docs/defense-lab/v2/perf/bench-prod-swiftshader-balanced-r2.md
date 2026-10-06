# CourtIQ perf run prod-swiftshader-balanced-r2

- Verdict: **NOT A VALID FPS TEST** — software GL: FPS not meaningful, JS/counters only; tier balanced (override:balanced, user override)
- Device: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) | 4 cores | 8 GB | dpr 1 | canvas 840x472 | GPU timer yes | warm-up n/a
- Page: http://localhost:3106/?bench=1&quality=balanced&soak=3 | load 541 ms | js heap at end 38.8 MB | DOM nodes 483

| segment | frames | fps | frame p50 ms | p95 ms | p99 ms | js ms (p50/p95) | gpu ms p50 | main-thread busy ms/frame | non-runtime JS ms/frame | long tasks | calls | tris | scale |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| entry-ambient | 3 | 0.0 | 0.0 | 0.0 | 0.0 | 7.2 / 7.7 | 1571.93 | 12.7 | 1.3 | 0 (max 0 ms) | 32 | 181k | 1.00 |
| run-normal | 42 | 26.7 | 33.3 | 61.6 | 65.6 | 8.1 / 14.9 | 2018.78 | 25.6 | 6.0 | 1 (max 125 ms) | 40 | 223k | 1.00 |
| xray-ownership | 32 | 12.0 | 83.3 | 83.3 | 83.3 | 12.6 / 28.8 | 1965.58 | 34.2 | 3.9 | 2 (max 84 ms) | 101 | 228k | 1.00 |
| xray-reach | 31 | 0.0 | 0.0 | 0.0 | 0.0 | 11.0 / 18.3 | 1625.87 | 35.3 | 3.3 | 1 (max 77 ms) | 66 | 225k | 1.00 |
| xray-passing | 33 | 18.0 | 50.1 | 65.0 | 66.4 | 10.7 / 17.7 | 1729.36 | 26.3 | 3.2 | 0 (max 0 ms) | 56 | 224k | 1.00 |
| xray-space | 32 | 15.0 | 66.7 | 66.7 | 66.7 | 8.2 / 81.1 | 2173.89 | 41.5 | 3.6 | 4 (max 237 ms) | 47 | 223k | 1.00 |
| compare-run | 41 | 20.0 | 50.0 | 66.7 | 66.7 | 6.2 / 20.3 | 1870.78 | 187.6 | 4.4 | 2 (max 6565 ms) | 40 | 223k | 1.00 |
| break-search | 0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 / 0.0 | n/a | n/a | n/a | 0 (max 0 ms) | 0 | 0k | 1.00 |
| break-play | 39 | 0.0 | 0.0 | 0.0 | 0.0 | 10.2 / 23.5 | 1859.15 | 35.6 | 2.6 | 0 (max 0 ms) | 110 | 227k | 1.00 |
| soak-1 | 49 | 5.6 | 83.4 | 338.3 | 360.9 | 10.1 / 19.6 | 2239.58 | 36.4 | 5.7 | 2 (max 169 ms) | 126 | 227k | 1.00 |
| soak-2 | 57 | 15.0 | 66.7 | 66.7 | 66.7 | 9.2 / 19.1 | 2008.40 | 28.4 | 2.5 | 0 (max 0 ms) | 126 | 227k | 1.00 |
| soak-3 | 59 | 0.0 | 0.0 | 0.0 | 0.0 | 8.9 / 19.4 | 1793.21 | 24.8 | 2.3 | 1 (max 83 ms) | 126 | 227k | 1.00 |

- Resources at end: 33 shader programs, 49 textures, 140 geometries
- Fix search (worker): 1052 ms, UI timer lag p95 3.7 / max 127.5 ms; 2179 ms, UI timer lag p95 17.5 / max 62.1 ms
- Break search (worker): 2214 ms, UI timer lag p95 7.1 / max 160.9 ms
- Transferred: 1601 KB total; font 110 KB (3), css 18 KB (2), js 715 KB (33), other 2 KB (2), glb 758 KB (4)

| soak iteration | heap MB (after gc) | geometries | textures | programs |
|---|---|---|---|---|
| 1 | 54.8 | 140 | 49 | 33 |
| 2 | 55.0 | 140 | 49 | 33 |
| 3 | 55.1 | 140 | 49 | 33 |

Pass checks (p50 >= 45 fps, p95 interval < 33 ms): run-normal FAIL (30.1 fps, p95 61.61 ms); xray-ownership FAIL (12 fps, p95 83.3 ms); xray-passing FAIL (20 fps, p95 65.04 ms); xray-space FAIL (15 fps, p95 66.7 ms); compare-run FAIL (20 fps, p95 66.69 ms)
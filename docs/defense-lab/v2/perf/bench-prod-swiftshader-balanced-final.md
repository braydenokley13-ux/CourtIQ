# CourtIQ perf run prod-swiftshader-balanced-final

- Verdict: **NOT A VALID FPS TEST** — software GL: FPS not meaningful, JS/counters only; tier balanced (override:balanced, user override)
- Device: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) | 4 cores | 8 GB | dpr 1 | canvas 840x472 | GPU timer yes | warm-up n/a
- Page: http://localhost:3106/?bench=1&quality=balanced | load 91 ms | js heap at end 39.7 MB | DOM nodes 443

| segment | frames | fps | frame p50 ms | p95 ms | p99 ms | js ms (p50/p95) | gpu ms p50 | main-thread busy ms/frame | non-runtime JS ms/frame | long tasks | calls | tris | scale |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| entry-ambient | 1 | 0.0 | 0.0 | 0.0 | 0.0 | 9.8 / 9.8 | 1864.51 | 29.2 | 8.3 | 0 (max 0 ms) | 32 | 180k | 1.00 |
| run-normal | 39 | 10.0 | 100.1 | 100.1 | 100.1 | 8.2 / 17.0 | 1839.57 | 25.8 | 4.0 | 1 (max 57 ms) | 40 | 223k | 1.00 |
| xray-ownership | 31 | 0.0 | 0.0 | 0.0 | 0.0 | 10.6 / 20.7 | 1595.38 | 21.4 | 2.3 | 0 (max 0 ms) | 101 | 227k | 1.00 |
| xray-reach | 32 | 17.1 | 58.4 | 80.9 | 82.9 | 9.3 / 22.3 | 1632.66 | 26.7 | 2.2 | 1 (max 61 ms) | 66 | 224k | 1.00 |
| xray-passing | 32 | 17.1 | 58.4 | 65.9 | 66.5 | 9.3 / 17.9 | 1579.57 | 19.9 | 2.5 | 0 (max 0 ms) | 56 | 223k | 1.00 |
| xray-space | 32 | 20.0 | 50.0 | 50.0 | 50.0 | 8.3 / 14.7 | 1577.51 | 18.4 | 2.1 | 0 (max 0 ms) | 47 | 223k | 1.00 |
| compare-run | 42 | 16.4 | 58.3 | 120.8 | 130.8 | 5.8 / 10.1 | 1050.36 | 146.5 | 4.1 | 2 (max 5179 ms) | 40 | 223k | 1.00 |
| break-search | 0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 / 0.0 | n/a | n/a | n/a | 0 (max 0 ms) | 0 | 0k | 1.00 |
| break-play | 42 | 23.1 | 33.3 | 76.7 | 82.1 | 7.5 / 12.6 | 1014.24 | 17.0 | 1.5 | 0 (max 0 ms) | 110 | 227k | 1.00 |

- Resources at end: 33 shader programs, 48 textures, 129 geometries
- Fix search (worker): 1590 ms, UI timer lag p95 2 / max 57.4 ms; 1320 ms, UI timer lag p95 7.6 / max 88.8 ms
- Break search (worker): 1672 ms, UI timer lag p95 1.7 / max 45.8 ms
- Transferred: 1601 KB total; font 110 KB (3), css 18 KB (2), js 715 KB (33), other 2 KB (2), glb 757 KB (4)

Pass checks (p50 >= 45 fps, p95 interval < 33 ms): run-normal FAIL (10 fps, p95 100.1 ms); xray-reach FAIL (17.1 fps, p95 80.89 ms); xray-passing FAIL (17.1 fps, p95 65.87 ms); xray-space FAIL (20 fps, p95 50 ms); compare-run FAIL (17.2 fps, p95 120.82 ms); break-play FAIL (30 fps, p95 76.72 ms)
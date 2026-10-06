# CourtIQ perf run prod-nodraw-uiclock80

- Verdict: **NOT A VALID FPS TEST** — nodraw: JS pipeline only, FPS not meaningful; tier low (software-gl, auto)
- Device: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) | 4 cores | 8 GB | dpr 1 | canvas 840x472 | GPU timer yes | warm-up n/a
- Page: http://localhost:3106/?bench=1&nodraw=1 | load 214 ms | js heap at end 47.9 MB | DOM nodes 547

| segment | frames | fps | frame p50 ms | p95 ms | p99 ms | js ms (p50/p95) | gpu ms p50 | main-thread busy ms/frame | non-runtime JS ms/frame | long tasks | calls | tris | scale |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| entry-ambient | 236 | 58.8 | 16.7 | 16.8 | 33.3 | 1.0 / 1.8 | n/a | 1.5 | 0.1 | 0 (max 0 ms) | 1 | 0k | 1.00 |
| run-normal | 225 | 56.2 | 16.7 | 16.7 | 16.8 | 1.0 / 1.7 | n/a | 3.0 | 1.0 | 1 (max 145 ms) | 1 | 0k | 1.00 |
| xray-ownership | 144 | 46.5 | 16.7 | 33.4 | 133.2 | 1.3 / 3.6 | n/a | 3.0 | 0.4 | 0 (max 0 ms) | 1 | 0k | 1.00 |
| xray-reach | 130 | 39.2 | 16.7 | 66.8 | 150.1 | 1.0 / 2.0 | n/a | 3.3 | 0.5 | 0 (max 0 ms) | 1 | 0k | 1.00 |
| xray-passing | 136 | 44.1 | 16.7 | 70.8 | 116.7 | 1.3 / 2.6 | n/a | 3.4 | 0.6 | 0 (max 0 ms) | 1 | 0k | 1.00 |
| xray-space | 149 | 47.3 | 16.7 | 43.3 | 126.0 | 1.1 / 4.2 | n/a | 3.5 | 0.6 | 0 (max 0 ms) | 1 | 0k | 1.00 |
| compare-run | 209 | 51.6 | 16.7 | 16.8 | 114.0 | 0.9 / 1.7 | n/a | 3.5 | 1.0 | 1 (max 132 ms) | 1 | 0k | 1.00 |
| break-search | 15 | 11.4 | 66.6 | 219.2 | 297.3 | 1.4 / 2.2 | n/a | 13.7 | 3.6 | 0 (max 0 ms) | 1 | 0k | 1.00 |
| break-play | 217 | 51.9 | 16.7 | 16.8 | 148.1 | 1.1 / 2.7 | n/a | 2.2 | 0.3 | 0 (max 0 ms) | 1 | 0k | 1.00 |

- Resources at end: 0 shader programs, 1 textures, 0 geometries
- Fix search (worker): 1665 ms, UI timer lag p95 4.9 / max 145.2 ms; 1468 ms, UI timer lag p95 15.2 / max 136.7 ms
- Break search (worker): 1922 ms, UI timer lag p95 10.5 / max 31.6 ms
- Transferred: 1586 KB total; font 110 KB (3), css 18 KB (2), js 713 KB (33), other 2 KB (2), glb 744 KB (4)

Pass checks (p50 >= 45 fps, p95 interval < 33 ms): run-normal ok (59.9 fps, p95 16.7 ms); xray-ownership FAIL (59.9 fps, p95 33.4 ms); xray-reach FAIL (59.9 fps, p95 66.76 ms); xray-passing FAIL (59.9 fps, p95 70.85 ms); xray-space FAIL (59.9 fps, p95 43.3 ms); compare-run ok (59.9 fps, p95 16.8 ms); break-play ok (59.9 fps, p95 16.8 ms)
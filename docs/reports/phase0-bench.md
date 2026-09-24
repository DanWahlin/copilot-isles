# Phase 0 benchmark

Generated: 2026-09-24T09:44:11.990Z

## Tier emulation flythrough

| Backend | Tier | Avg FPS | 1% low | GPU ms | CPU ms | Draws | Tris | Programs | Result |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| webgpu | lite | 59.9 | 59.5 | 1.46 / 0.5 ❌ | 10.61 / 7 ❌ | 182 / 100 ❌ | 432k / 300k ❌ | 102 / 150 ✅ | red |
| webgpu | low | 60.0 | 59.5 | 3.03 / 1 ❌ | 6.04 / 6 ❌ | 187 / 150 ❌ | 447k / 500k ✅ | 145 / 150 ✅ | red |
| webgpu | medium | 60.0 | 59.5 | 4.76 / 2.5 ❌ | 5.97 / 5 ❌ | 188 / 225 ✅ | 662k / 1000k ✅ | 146 / 150 ✅ | red |
| webgpu | high | 60.0 | 59.5 | 7.27 / 4 ❌ | 3.72 / 4 ✅ | 188 / 300 ✅ | 1200k / 2000k ✅ | 150 / 150 ✅ | red |
| webgpu | ultra | 60.0 | 59.5 | 5.83 / 14 ✅ | 3.75 / 4 ✅ | 188 / 400 ✅ | 1512k / 3500k ✅ | 150 / 150 ✅ | green |
| webgl | lite | 58.7 | 29.9 | 2.77 / 0.5 ❌ | 13.73 / 7 ❌ | 182 / 100 ❌ | 432k / 300k ❌ | 101 / 150 ✅ | red |
| webgl | low | 60.0 | 59.5 | 1.95 / 1 ❌ | 6.97 / 6 ❌ | 187 / 150 ❌ | 447k / 500k ✅ | 143 / 150 ✅ | red |
| webgl | medium | 60.0 | 59.5 | 3.60 / 2.5 ❌ | 4.84 / 5 ✅ | 188 / 225 ✅ | 662k / 1000k ✅ | 144 / 150 ✅ | red |
| webgl | high | 60.0 | 59.5 | 5.00 / 4 ❌ | 2.91 / 4 ✅ | 188 / 300 ✅ | 1198k / 2000k ✅ | 148 / 150 ✅ | red |
| webgl | ultra | 60.0 | 59.5 | 4.10 / 14 ✅ | 2.60 / 4 ✅ | 188 / 400 ✅ | 1508k / 3500k ✅ | 148 / 150 ✅ | green |

## Title / §7a checks

| Backend | Tier | TTI ms | Programs | §7a |
|---|---:|---:|---:|---|
| webgpu | high | 704 / 5000 | 26 / 40 | ✅ |
| webgpu | low | 1144 / 10000 | 26 / 40 | ✅ |
| webgl | high | 701 / 5000 | 26 / 40 | ✅ |
| webgl | low | 1318 / 10000 | 26 / 40 | ✅ |

- Low forced-WebGL floor shots/flythrough budget: ❌
- forceSoftware routes to 2D stub: ✅
- WebGPU init failure → WebGL2 fallback: covered by `src/boot/main.ts`; use browser/device override to force an init exception manually until an injectable renderer factory lands.

## Logs

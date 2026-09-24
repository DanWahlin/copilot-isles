# Phase 0 benchmark

Generated: 2026-09-24T06:16:27.316Z

## Tier emulation flythrough

| Backend | Tier | Avg FPS | 1% low | GPU ms | CPU ms | Draws | Tris | Programs | Result |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| webgpu | lite | 60.0 | 59.5 | 1.18 / 0.5 ❌ | 10.12 / 7 ❌ | 73 / 100 ✅ | 340k / 300k ❌ | 93 / 150 ✅ | red |
| webgpu | low | 60.0 | 59.5 | 2.68 / 1 ❌ | 6.73 / 6 ❌ | 79 / 150 ✅ | 378k / 500k ✅ | 133 / 150 ✅ | red |
| webgpu | medium | 60.0 | 59.5 | 4.64 / 2.5 ❌ | 5.18 / 5 ❌ | 83 / 225 ✅ | 584k / 1000k ✅ | 137 / 150 ✅ | red |
| webgpu | high | 60.0 | 59.5 | 5.93 / 4 ❌ | 3.62 / 4 ✅ | 83 / 300 ✅ | 1027k / 2000k ✅ | 139 / 150 ✅ | red |
| webgpu | ultra | 60.1 | 59.5 | 6.88 / 14 ✅ | 3.73 / 4 ✅ | 86 / 400 ✅ | 1251k / 3500k ✅ | 139 / 150 ✅ | green |
| webgl | lite | 59.2 | 30.0 | 1.84 / 0.5 ❌ | 13.16 / 7 ❌ | 73 / 100 ✅ | 310k / 300k ❌ | 92 / 150 ✅ | red |
| webgl | low | 60.0 | 59.5 | 1.67 / 1 ❌ | 6.35 / 6 ❌ | 76 / 150 ✅ | 340k / 500k ✅ | 131 / 150 ✅ | red |
| webgl | medium | 60.0 | 59.5 | 2.65 / 2.5 ❌ | 3.82 / 5 ✅ | 83 / 225 ✅ | 584k / 1000k ✅ | 135 / 150 ✅ | red |
| webgl | high | 60.0 | 59.5 | 3.64 / 4 ✅ | 2.27 / 4 ✅ | 83 / 300 ✅ | 1027k / 2000k ✅ | 137 / 150 ✅ | green |
| webgl | ultra | 60.0 | 59.5 | 4.26 / 14 ✅ | 2.60 / 4 ✅ | 86 / 400 ✅ | 1251k / 3500k ✅ | 137 / 150 ✅ | green |

## Title / §7a checks

| Backend | Tier | TTI ms | Programs | §7a |
|---|---:|---:|---:|---|
| webgpu | high | 908 / 5000 | 38 / 40 | ✅ |
| webgpu | low | 1575 / 10000 | 38 / 40 | ✅ |
| webgl | high | 926 / 5000 | 38 / 40 | ✅ |
| webgl | low | 1650 / 10000 | 38 / 40 | ✅ |

- Low forced-WebGL floor shots/flythrough budget: ❌
- forceSoftware routes to 2D stub: ✅
- WebGPU init failure → WebGL2 fallback: covered by `src/boot/main.ts`; use browser/device override to force an init exception manually until an injectable renderer factory lands.

## Logs

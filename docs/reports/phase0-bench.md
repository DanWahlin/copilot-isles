# Phase 0 benchmark

Generated: 2026-09-24T05:44:16.649Z

## Tier emulation flythrough

| Backend | Tier | Avg FPS | 1% low | GPU ms | CPU ms | Draws | Tris | Programs | Result |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| webgpu | low | 60.1 | 59.5 | 2.39 / 1 ❌ | 7.60 / 6 ❌ | 79 / 150 ✅ | 300k / 500k ✅ | 135 / 150 ✅ | red |
| webgpu | high | 60.0 | 59.5 | 16.61 / 4 ❌ | 4.88 / 4 ❌ | 99 / 300 ✅ | 802k / 2000k ✅ | 162 / 150 ❌ | red |
| webgl | low | 59.9 | 59.5 | 1.78 / 1 ❌ | 6.29 / 6 ❌ | 79 / 150 ✅ | 300k / 500k ✅ | 134 / 150 ✅ | red |
| webgl | high | 59.8 | 59.5 | 7.66 / 4 ❌ | 3.86 / 4 ✅ | 99 / 300 ✅ | 802k / 2000k ✅ | 159 / 150 ❌ | red |

## Title / §7a checks

| Backend | Tier | TTI ms | Programs | §7a |
|---|---:|---:|---:|---|
| webgpu | high | 2003 / 5000 | 65 / 40 | ❌ |
| webgpu | low | 2105 / 10000 | 50 / 40 | ❌ |
| webgl | high | 3671 / 5000 | 64 / 40 | ❌ |
| webgl | low | 2959 / 10000 | 50 / 40 | ❌ |

- Low forced-WebGL floor shots/flythrough budget: ❌
- forceSoftware routes to 2D stub: ✅
- WebGPU init failure → WebGL2 fallback: covered by `src/boot/main.ts`; use browser/device override to force an init exception manually until an injectable renderer factory lands.

## Logs

### webgpu low
```
[warning] THREE.AttributeNode: Vertex attribute "uv" not found on geometry.
[warning] THREE.AttributeNode: Vertex attribute "uv" not found on geometry.
[warning] THREE.AttributeNode: Vertex attribute "uv" not found on geometry.
```

### webgpu high
```
[warning] THREE.AttributeNode: Vertex attribute "uv" not found on geometry.
[warning] THREE.AttributeNode: Vertex attribute "uv" not found on geometry.
[warning] THREE.AttributeNode: Vertex attribute "uv" not found on geometry.
```

### webgl low
```
[warning] THREE.AttributeNode: Vertex attribute "uv" not found on geometry.
[warning] THREE.AttributeNode: Vertex attribute "uv" not found on geometry.
[warning] THREE.AttributeNode: Vertex attribute "uv" not found on geometry.
```

### webgl high
```
[warning] THREE.AttributeNode: Vertex attribute "uv" not found on geometry.
[warning] THREE.AttributeNode: Vertex attribute "uv" not found on geometry.
[warning] THREE.AttributeNode: Vertex attribute "uv" not found on geometry.
```

### webgpu high
```
[warning] THREE.AttributeNode: Vertex attribute "uv" not found on geometry.
[warning] THREE.AttributeNode: Vertex attribute "uv" not found on geometry.
[warning] THREE.AttributeNode: Vertex attribute "uv" not found on geometry.
```

### webgpu low
```
[warning] THREE.AttributeNode: Vertex attribute "uv" not found on geometry.
[warning] THREE.AttributeNode: Vertex attribute "uv" not found on geometry.
[warning] THREE.AttributeNode: Vertex attribute "uv" not found on geometry.
```

### webgl high
```
[warning] THREE.AttributeNode: Vertex attribute "uv" not found on geometry.
[warning] THREE.AttributeNode: Vertex attribute "uv" not found on geometry.
[warning] THREE.AttributeNode: Vertex attribute "uv" not found on geometry.
```

### webgl low
```
[warning] THREE.AttributeNode: Vertex attribute "uv" not found on geometry.
[warning] THREE.AttributeNode: Vertex attribute "uv" not found on geometry.
[warning] THREE.AttributeNode: Vertex attribute "uv" not found on geometry.
```

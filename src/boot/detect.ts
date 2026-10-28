export type GpuKind = 'none' | 'software' | 'hardware';
export type Backend = 'webgpu' | 'webgl2';

export interface GpuInfo {
  webgl2: boolean;
  renderer: string;
  kind: GpuKind;
}

export interface WebGpuInfo {
  available: boolean;
  kind: GpuKind;
  vendor: string;
  architecture: string;
  features: string[];
}

const SOFTWARE = /swiftshader|llvmpipe|softpipe|lavapipe|microsoft basic render|software/i;

/** PLAN §14.2: renderer strings that mean "no real GPU" (VMs, remote desktop, disabled acceleration). */
export function classifyRenderer(renderer: string): Exclude<GpuKind, 'none'> {
  return SOFTWARE.test(renderer) ? 'software' : 'hardware';
}

/** A WebGPU fallback adapter (or a SwiftShader-backed one) is software rendering. */
export function classifyAdapter(a: {
  isFallbackAdapter?: boolean;
  vendor?: string;
  architecture?: string;
  description?: string;
}): Exclude<GpuKind, 'none'> {
  if (a.isFallbackAdapter) return 'software';
  return classifyRenderer(`${a.vendor ?? ''} ${a.architecture ?? ''} ${a.description ?? ''}`);
}

export async function detectWebGPU(): Promise<WebGpuInfo> {
  const none: WebGpuInfo = { available: false, kind: 'none', vendor: '', architecture: '', features: [] };
  if (!('gpu' in navigator) || !navigator.gpu) return none;
  try {
    // Same options three.js uses internally, so we probe the adapter the renderer will actually get.
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance',
      featureLevel: 'compatibility',
    });
    if (!adapter) return none;
    const info = (adapter.info ?? {}) as Partial<GPUAdapterInfo> & { isFallbackAdapter?: boolean };
    const legacyFallback = (adapter as GPUAdapter & { isFallbackAdapter?: boolean }).isFallbackAdapter;
    const vendor = info.vendor ?? '';
    const architecture = info.architecture ?? '';
    return {
      available: true,
      kind: classifyAdapter({
        isFallbackAdapter: info.isFallbackAdapter ?? legacyFallback,
        vendor,
        architecture,
        description: info.description ?? '',
      }),
      vendor,
      architecture,
      features: [...adapter.features].map(String).sort(),
    };
  } catch {
    return none;
  }
}

export function detectWebGL2(doc: Document = document): GpuInfo {
  const canvas = doc.createElement('canvas');
  const gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
  if (!gl) return { webgl2: false, renderer: '', kind: 'none' };
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = ext
    ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
    : String(gl.getParameter(gl.RENDERER));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return { webgl2: true, renderer, kind: classifyRenderer(renderer) };
}

/**
 * Waits between tries when neither WebGPU nor WebGL2 answers. Both missing at once on a browser that
 * has them means its GPU process is restarting (after a GPU reset, or under load), which takes a moment.
 */
export const PROBE_RETRY_MS: readonly number[] = [400, 1200, 2400];

/**
 * Probes until a backend is found or the retries run out. Only "no WebGL2" is retried: software
 * rendering is a setting, not a moment, so a retry wouldn't change it.
 */
export async function probeBackend(
  probe: () => Promise<{ webgpu: WebGpuInfo; webgl: GpuInfo; choice: BackendChoice }>,
  wait: (ms: number) => Promise<void>,
  delays: readonly number[] = PROBE_RETRY_MS,
): Promise<{ webgpu: WebGpuInfo; webgl: GpuInfo; choice: BackendChoice }> {
  let result = await probe();
  for (const ms of delays) {
    if (result.choice.backend || result.choice.reason !== 'no-webgl2') break;
    await wait(ms);
    result = await probe();
  }
  return result;
}

export type BackendChoice =
  { backend: Backend; reason: string } | { backend: null; reason: 'no-webgl2' | 'software' };

/**
 * PLAN §15 / §14.2 order: a hardware WebGPU adapter first, then a hardware WebGL2 context, else the 2D mode.
 * `force` (tests only) accepts software rendering so CI can exercise the 3D path.
 */
export function chooseBackend(
  webgpu: WebGpuInfo,
  webgl: GpuInfo,
  opts: { preferWebGL?: boolean; force?: boolean; forceSoftware?: boolean } = {},
): BackendChoice {
  if (opts.forceSoftware) return { backend: null, reason: 'software' };
  if (!opts.preferWebGL && webgpu.available && (webgpu.kind === 'hardware' || opts.force)) {
    return { backend: 'webgpu', reason: webgpu.kind === 'hardware' ? 'webgpu adapter' : 'forced' };
  }
  if (!webgl.webgl2) {
    // ?webgl was asked for but WebGL2 is missing: a hardware WebGPU adapter beats the 2D stub.
    if (webgpu.available && (webgpu.kind === 'hardware' || opts.force)) {
      return { backend: 'webgpu', reason: 'webgl2 unavailable' };
    }
    return { backend: null, reason: 'no-webgl2' };
  }
  if (webgl.kind === 'hardware' || opts.force)
    return { backend: 'webgl2', reason: opts.preferWebGL ? 'requested' : 'webgl2 fallback' };
  return { backend: null, reason: 'software' };
}

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
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return none;
    const info = adapter.info as GPUAdapterInfo & { isFallbackAdapter?: boolean };
    const legacyFallback = (adapter as GPUAdapter & { isFallbackAdapter?: boolean }).isFallbackAdapter;
    return {
      available: true,
      kind: classifyAdapter({
        ...info,
        isFallbackAdapter: info.isFallbackAdapter ?? legacyFallback,
        vendor: info.vendor,
        architecture: info.architecture,
        description: info.description,
      }),
      vendor: info.vendor,
      architecture: info.architecture,
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
  if (!webgl.webgl2)
    return webgpu.available && opts.force
      ? { backend: 'webgpu', reason: 'forced' }
      : { backend: null, reason: 'no-webgl2' };
  if (webgl.kind === 'hardware' || opts.force)
    return { backend: 'webgl2', reason: opts.preferWebGL ? 'requested' : 'webgl2 fallback' };
  return { backend: null, reason: 'software' };
}

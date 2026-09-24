export type GpuKind = 'none' | 'software' | 'hardware';

export interface GpuInfo {
  webgl2: boolean;
  renderer: string;
  kind: GpuKind;
}

const SOFTWARE = /swiftshader|llvmpipe|softpipe|lavapipe|microsoft basic render|software/i;

/** PLAN §14.2: renderer strings that mean "no real GPU" (VMs, remote desktop, disabled acceleration). */
export function classifyRenderer(renderer: string): Exclude<GpuKind, 'none'> {
  return SOFTWARE.test(renderer) ? 'software' : 'hardware';
}

export function detectGpu(doc: Document = document): GpuInfo {
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

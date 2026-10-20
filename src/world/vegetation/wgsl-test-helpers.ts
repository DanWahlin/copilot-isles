import {
  BasicNodeLibrary,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  WGSLNodeBuilder,
  type Material,
  type Object3D,
} from 'three/webgpu';
import { context, lights } from 'three/tsl';

/** three's node builder for a mesh, as the helpers here drive it (the typings leave this out). */
export interface MeshNodeBuilder {
  build(): void;
  buildAsync(): Promise<unknown>;
  material: unknown;
  camera: unknown;
  scene: unknown;
  lightsNode: unknown;
  vertexShader: string;
  fragmentShader: string;
  /** Nodes a draw updates (each frame, render or object), as three's renderer does after a build. */
  updateNodes: unknown[];
  getBindings(): { bindings: { isSampledTexture?: boolean; texture?: unknown }[] }[];
}

/**
 * three's own WGSL node builder for a mesh with a stand-in renderer (no GPU, one directional light),
 * not yet built.
 */
export function meshNodeBuilder(mesh: Object3D, material: Material): MeshNodeBuilder {
  const renderer = {
    backend: {
      isWebGPUBackend: true,
      compatibilityMode: false,
      parameters: {},
      utils: { getTextureSampleData: () => ({ primarySamples: 1 }) },
      // No room for instance matrices in a uniform buffer: they're vertex attributes, as for big batches.
      capabilities: { getUniformBufferLimit: () => 0 },
    },
    getRenderTarget: () => null,
    getOutputRenderTarget: () => null,
    getMRT: () => null,
    hasFeature: () => false,
    library: new BasicNodeLibrary(),
    contextNode: context(),
    debug: { checkShaderErrors: false, diagnostics: { keywords: false } },
    lighting: { enabled: true },
    highPrecision: false,
  };
  const builder = new WGSLNodeBuilder(mesh, renderer as never) as unknown as MeshNodeBuilder;
  builder.material = material;
  builder.camera = new PerspectiveCamera();
  builder.scene = new Scene();
  builder.lightsNode = lights([new DirectionalLight()]);
  return builder;
}

/**
 * Builds a mesh's WGSL with three's own node builder and a stand-in renderer (no GPU, no lights): enough
 * to see how the material's graph turns into shader code.
 */
export function buildWgsl(mesh: Object3D, material: Material): { vertex: string; fragment: string } {
  const builder = meshNodeBuilder(mesh, material);
  builder.build();
  return { vertex: builder.vertexShader, fragment: builder.fragmentShader };
}

/**
 * Reads of a shader variable that no path above has set. three's `select` writes an `if`/`else`, and a
 * node shared with the rest of the graph is set where it's first built: built first inside one branch,
 * it's only set when that branch runs, and every other read gets zero (WGSL) or garbage (GLSL). Counts a
 * variable as set once an enclosing block sets it, or both halves of an `if`/`else` do.
 */
export function unsetReads(wgsl: string): string[] {
  // Private and function variables (not bindings: uniforms, textures, samplers).
  const declared = new Set([...wgsl.matchAll(/^(?:var<private>|\s+var)\s+(\w+)\s*:/gm)].map((m) => m[1]!));
  const start = wgsl.search(/^fn main\(/m);
  const lines = wgsl.slice(start).split('\n');
  const body = lines.slice(lines.findIndex((l) => /->.*\{\s*$/.test(l)) + 1);
  const frames: { kind: 'root' | 'if' | 'else'; set: Set<string>; ifSet?: Set<string> }[] = [
    { kind: 'root', set: new Set() },
  ];
  const problems: string[] = [];
  const isSet = (name: string) => frames.some((f) => f.set.has(name));
  const read = (code: string) => {
    for (const m of code.matchAll(/(?<![.\w])([A-Za-z_]\w*)/g)) {
      const name = m[1]!;
      if (declared.has(name) && !isSet(name) && !problems.includes(name)) problems.push(name);
    }
  };
  for (const raw of body) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    if (/^(for|loop|switch|while)\b|else if/.test(line)) throw new Error(`unsupported flow: ${line}`);
    const ifMatch = /^if \((.*)\) \{$/.exec(line);
    if (ifMatch) {
      read(ifMatch[1]!);
      frames.push({ kind: 'if', set: new Set() });
    } else if (line === '} else {') {
      const done = frames.pop()!;
      frames.push({ kind: 'else', set: new Set(), ifSet: done.set });
    } else if (line === '}') {
      const done = frames.pop()!;
      if (frames.length === 0) break;
      if (done.kind === 'else') for (const n of done.set) if (done.ifSet!.has(n)) frames.at(-1)!.set.add(n);
    } else {
      const assign = /^(?:let\s+)?([A-Za-z_]\w*)((?:\.\w+|\[[^\]]*\])*)\s*=(?!=)\s*(.*)$/.exec(line);
      if (assign) {
        read(assign[3]!);
        frames.at(-1)!.set.add(assign[1]!);
        declared.add(assign[1]!);
      } else read(line);
    }
  }
  return problems;
}

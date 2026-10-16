interface PackFile {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

interface PackEntry {
  readonly id: string;
  readonly files: readonly PackFile[];
  readonly totalBytes: number;
}

interface PackManifest {
  readonly version: number;
  readonly packs: Readonly<Record<string, PackEntry>>;
  readonly fileIndex?: Readonly<
    Record<string, { readonly sha256: string; readonly bytes: number; readonly packId: string }>
  >;
}

export interface PackProgress {
  readonly loadedBytes: number;
  readonly totalBytes: number;
  readonly ratio: number;
  readonly file: string;
}

type ProgressCallback = (progress: PackProgress) => void;

const CONCURRENCY = 4;

function appUrl(path: string): string {
  if (/^https?:\/\//.test(path) || path.startsWith('data:') || path.startsWith('blob:')) return path;
  const clean = path.replace(/^\//, '');
  const base = import.meta.env.BASE_URL || '/';
  return `${base}${clean}`;
}

function stripQuery(path: string): string {
  const [clean] = path.split('?');
  return clean.replace(/^\//, '');
}

class PackLoader {
  private manifestPromise: Promise<PackManifest | null> | null = null;
  private manifest: PackManifest | null = null;
  private readonly resident = new Set<string>();
  private readonly inflight = new Map<string, Promise<void>>();

  loadManifest(): Promise<PackManifest | null> {
    this.manifestPromise ??= fetch(appUrl('packs/manifest.json'), { cache: 'no-cache' })
      .then((response) => (response.ok ? (response.json() as Promise<PackManifest>) : null))
      .then((manifest) => {
        this.manifest = manifest;
        return manifest;
      })
      .catch(() => null);
    return this.manifestPromise;
  }

  url(path: string): string {
    const clean = stripQuery(path);
    const hash = this.manifest?.fileIndex?.[clean]?.sha256 ?? this.findFile(clean)?.sha256;
    // Files outside the manifest still resolve against the app's base, so a sub-path deploy
    // (GitHub Pages serves the game under /copilot-isles/) finds them.
    if (!hash) return appUrl(path);
    return `${appUrl(clean)}?v=${hash}`;
  }

  /**
   * Loads a pack's files. `priority: 'low'` is for loads nothing waits on yet (the title's head start
   * on the island): over HTTP/2 the browser's high-priority requests are served first, and they starved
   * the music's stream (an `<audio>` element's request is low priority) for 40 s on Slow 4G.
   */
  async prefetch(
    packId: string,
    onProgress?: ProgressCallback,
    signal?: AbortSignal,
    priority: RequestPriority = 'auto',
  ): Promise<void> {
    if (this.resident.has(packId)) {
      const total = this.manifest?.packs[packId]?.totalBytes ?? 0;
      onProgress?.({ loadedBytes: total, totalBytes: total, ratio: 1, file: '' });
      return;
    }
    const existing = this.inflight.get(packId);
    if (existing) return existing;
    const task = this.prefetchInternal(packId, onProgress, signal, priority).finally(() =>
      this.inflight.delete(packId),
    );
    this.inflight.set(packId, task);
    return task;
  }

  streamZone(packId: string, onProgress?: ProgressCallback, signal?: AbortSignal): Promise<void> {
    return this.prefetch(packId, onProgress, signal);
  }

  isResident(packId: string): boolean {
    return this.resident.has(packId);
  }

  private async prefetchInternal(
    packId: string,
    onProgress: ProgressCallback | undefined,
    signal: AbortSignal | undefined,
    priority: RequestPriority,
  ): Promise<void> {
    const manifest = await this.loadManifest();
    const pack = manifest?.packs[packId];
    if (!pack) return;
    const totals = new Map(pack.files.map((file) => [file.path, 0]));
    const totalBytes = pack.totalBytes;
    let cursor = 0;
    const report = (file: string, loadedForFile: number) => {
      totals.set(file, loadedForFile);
      const loadedBytes = Array.from(totals.values()).reduce((sum, value) => sum + value, 0);
      onProgress?.({
        loadedBytes,
        totalBytes,
        ratio: totalBytes > 0 ? Math.min(1, loadedBytes / totalBytes) : 1,
        file,
      });
    };
    const worker = async () => {
      while (cursor < pack.files.length) {
        const file = pack.files[cursor++];
        await this.fetchFile(file, (loaded) => report(file.path, loaded), signal, priority);
        report(file.path, file.bytes);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pack.files.length) }, () => worker()));
    this.resident.add(packId);
  }

  private async fetchFile(
    file: PackFile,
    onFileProgress: (loaded: number) => void,
    signal: AbortSignal | undefined,
    priority: RequestPriority,
  ): Promise<void> {
    const response = await fetch(this.url(file.path), { signal, priority });
    if (!response.ok) throw new Error(`Pack file ${file.path} failed: HTTP ${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) {
      await response.arrayBuffer();
      return;
    }
    let loaded = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      loaded += value.byteLength;
      onFileProgress(Math.min(file.bytes, loaded));
    }
  }

  private findFile(path: string): PackFile | null {
    if (!this.manifest) return null;
    for (const pack of Object.values(this.manifest.packs)) {
      const found = pack.files.find((file) => file.path === path);
      if (found) return found;
    }
    return null;
  }
}

export const packs = new PackLoader();

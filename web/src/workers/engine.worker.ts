import { loadManifest } from '@/lib/data/loaders';
import { FetchTileSource } from '@/lib/engine/tiles.fetch';
import { handleEngineRequest, type EngineRequest } from '@/lib/engine/worker-handler';

const deps = { manifest: (base: string) => loadManifest(base), source: (base: string) => new FetchTileSource(base) };

self.onmessage = async (event: MessageEvent<EngineRequest>) => {
  const res = await handleEngineRequest(event.data, deps);
  if (res.type === 'mask') (self as unknown as Worker).postMessage(res, [res.mask.buffer]);
  else (self as unknown as Worker).postMessage(res);
};

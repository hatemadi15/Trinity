import { handleVersions, type VersionsRequest } from '@/lib/ensemble/handler';

self.onmessage = (event: MessageEvent<VersionsRequest>) => {
  (self as unknown as Worker).postMessage(handleVersions(event.data));
};

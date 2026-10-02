import { createShadowHandler, type ShadowRequest } from '@/lib/engine/shadow-handler';

const handle = createShadowHandler();

self.onmessage = (event: MessageEvent<ShadowRequest>) => {
  const res = handle(event.data);
  if (res.type === 'picture') (self as unknown as Worker).postMessage(res, [res.pixels.buffer]);
  else (self as unknown as Worker).postMessage(res);
};

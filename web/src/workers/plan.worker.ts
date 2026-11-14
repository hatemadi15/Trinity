import { createPlanHandler, type PlanRequest } from '@/lib/plan/search-handler';

const handle = createPlanHandler((res) => (self as unknown as Worker).postMessage(res));

self.onmessage = (event: MessageEvent<PlanRequest>) => {
  void handle(event.data);
};

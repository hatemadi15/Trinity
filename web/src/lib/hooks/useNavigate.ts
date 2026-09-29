import { useCallback, useContext } from 'react';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';

/**
 * Client-side navigation that keeps the store alive, through the same context `next/link` reads.
 * Unlike `useRouter`, a missing router (tests, static previews) does not throw: the fallback is a
 * plain location change.
 */
export function useNavigate(): (href: string) => void {
  const router = useContext(AppRouterContext);
  return useCallback(
    (href: string) => {
      if (router) router.push(href);
      else if (typeof window !== 'undefined') window.location.assign(href);
    },
    [router],
  );
}

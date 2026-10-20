'use client';
import { useEffect } from 'react';
import { AppFrame } from '@/components/AppFrame';

/**
 * What a crash in a page shows: the usual frame, two plain lines and a button. The error goes to the console and
 * never onto the page, because the message of a server error can name a host or a file. Next gives this page two
 * ways to recover. `retry` fetches the route again and then clears the error, which a failure on the server needs.
 * `reset` only clears the error and draws what the page already has.
 */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <AppFrame>
      <main className="wrap pb-16 pt-10">
        <h1 data-band-end="" className="display text-[40px] leading-tight">Something went wrong.</h1>
        <p className="mt-3 max-w-[46em] text-lg text-ink-2">Reload the page, or try again.</p>
        <button type="button" onClick={() => retry()} className="btn btn-primary mt-6">
          Try again
        </button>
      </main>
    </AppFrame>
  );
}

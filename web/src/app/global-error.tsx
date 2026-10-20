'use client';
import { useEffect } from 'react';
import { DEFAULT_THEME } from '@/lib/theme';
import './globals.css';

/**
 * The last resort, for a crash in the root layout itself. It replaces the whole document, so it carries its own html
 * and body, the stylesheet and the default theme, and no header: the header is part of what may have failed.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="en" data-theme={DEFAULT_THEME} className="h-full">
      <body className="min-h-full bg-page text-ink antialiased">
        {/* The layout's title is gone with the layout, so the page names itself. */}
        <title>Something went wrong · Earthrise</title>
        <main className="wrap pt-10">
          <h1 className="display text-[40px] leading-tight">Something went wrong.</h1>
          <p className="mt-3 max-w-[46em] text-lg text-ink-2">Reload the page, or try again.</p>
          <button type="button" onClick={() => retry()} className="btn btn-primary mt-6">
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}

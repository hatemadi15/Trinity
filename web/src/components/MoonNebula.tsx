'use client';
import { useSyncExternalStore, type ReactNode } from 'react';
import HalftoneNebula, { type NebulaParams } from '@/components/ui/halftone-nebula';
import { currentTheme, DEFAULT_THEME, subscribeTheme } from '@/lib/theme';

/**
 * The halftone nebula in Earthrise's colours (spec 23): black and white with moonstone blue on the dark page, black
 * ink on paper on the light one. It follows the theme switch while it runs.
 */
export function MoonNebula({
  height,
  params,
  interactive = true,
  scrim = 'bottom',
  preset,
  className = '',
  children,
}: {
  height: string;
  params?: Partial<NebulaParams>;
  interactive?: boolean;
  /** Where the page's colour fades in over the sky so the words on it stay easy to read. */
  scrim?: 'bottom' | 'left' | 'none';
  /** The sky's colours whatever the theme: the home page's end band is black in both. Left out, it follows the theme. */
  preset?: 'moonstone' | 'paper';
  className?: string;
  children?: ReactNode;
}) {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => DEFAULT_THEME);
  return (
    <HalftoneNebula height={height} preset={preset ?? (theme === 'light' ? 'paper' : 'moonstone')} params={params} interactive={interactive} className={className}>
      {scrim !== 'none' && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 ${scrim === 'bottom' ? 'bg-linear-to-t from-page/95 via-page/55 via-45% to-transparent to-75%' : 'bg-linear-to-r from-page/95 via-page/60 via-40% to-transparent to-75%'}`}
        />
      )}
      <div className="relative flex h-full w-full flex-col">{children}</div>
    </HalftoneNebula>
  );
}

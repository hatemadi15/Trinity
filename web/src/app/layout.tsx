import type { Metadata } from 'next';
import { Bricolage_Grotesque, IBM_Plex_Sans } from 'next/font/google';
import { DEFAULT_THEME, THEME_SCRIPT } from '@/lib/theme';
import './globals.css';

// The optical-size axis gives headlines their display cut; the width axis lets them be set at 87.5 % (class `display`).
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  axes: ['opsz', 'wdth'],
});
const plex = IBM_Plex_Sans({ subsets: ['latin'], variable: '--font-plex', weight: ['400', '500', '600'] });

export const metadata: Metadata = {
  title: 'Earthrise: sunlight and signal forecast for the Moon',
  description:
    'See when a Moon lander has sunlight and a signal. Pick a landing site near the lunar south pole and a date: hours of sunlight, hours of radio contact with Earth, and whether the battery survives the night. NASA Space Apps 2026, team Astroy/Ed.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme={DEFAULT_THEME} suppressHydrationWarning className={`${bricolage.variable} ${plex.variable} h-full`}>
      <head>
        {/* Sets data-theme while the HTML is parsed, before the first paint (Next guide: preventing flash before hydration). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full bg-page text-ink antialiased">{children}</body>
    </html>
  );
}

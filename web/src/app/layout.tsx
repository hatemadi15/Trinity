import type { Metadata } from 'next';
import { Bricolage_Grotesque, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  weight: ['500', '600', '700'],
});
const plex = IBM_Plex_Sans({ subsets: ['latin'], variable: '--font-plex', weight: ['400', '500', '600'] });

export const metadata: Metadata = {
  title: 'Earthrise — lunar landing site and date planner',
  description:
    'Compare lunar south-pole landing sites and dates: Sun and Earth above the terrain horizon, solar power potential, direct-to-Earth communication windows. NASA Space Apps 2026, team Astroy/Ed.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${plex.variable} h-full`}>
      <body className="min-h-full bg-canvas text-ink antialiased">{children}</body>
    </html>
  );
}

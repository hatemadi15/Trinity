import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { DEFAULT_THEME, THEME_SCRIPT } from '@/lib/theme';
import { LunaEngine } from '@/components/luna/LunaEngine';
import './globals.css';

/*
 * The two faces are files in the repository, so a build needs no network: the prepared offline laptop builds with the
 * Wi-Fi off. Each is Google Fonts' latin cut, the same bytes the build used to download from Google, declared as Google
 * declares them; the app's copy uses no letter outside it. Both are under the SIL Open Font License (the licences are
 * beside the files).
 * The display face is variable: its optical-size axis gives headlines their display cut, and its width range lets them
 * be set at 87.5 % (class `display`).
 */
const bricolage = localFont({
  src: './fonts/BricolageGrotesque-latin.woff2',
  variable: '--font-bricolage',
  weight: '200 800',
  display: 'swap',
  declarations: [{ prop: 'font-stretch', value: '75% 100%' }],
});
// One variable file, declared at the three weights the app uses, as Google Fonts serves it. Next reads these options
// at build time, so they are written out rather than worked out.
const plex = localFont({
  src: [
    { path: './fonts/IBMPlexSans-latin.woff2', weight: '400', style: 'normal' },
    { path: './fonts/IBMPlexSans-latin.woff2', weight: '500', style: 'normal' },
    { path: './fonts/IBMPlexSans-latin.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-plex',
  display: 'swap',
});

const TITLE = 'Earthrise: sunlight and signal forecast for the Moon';
const DESCRIPTION =
  'See when a Moon lander has sunlight and a signal. Pick a landing site near the lunar south pole and a date: hours of sunlight, hours of radio contact with Earth, and whether the battery survives the night. NASA Space Apps 2026, team Astroy/Ed.';
/** The address people open the site at, the origin docs/hosting.md lists for the data bucket's CORS. */
const PRODUCTION_URL = 'https://earthrise.vercel.app';

/**
 * The origin the share image's address is built on. A preview or a custom domain sets NEXT_PUBLIC_SITE_URL to its
 * own. A blank value, or one that is not an http or https address, reads as the production address, so a slip in a
 * hosting dashboard never fails the build.
 */
function siteUrl(): URL {
  const fallback = new URL(PRODUCTION_URL);
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SITE_URL?.trim() || PRODUCTION_URL);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : fallback;
  } catch {
    return fallback;
  }
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  // Each route's title goes into the template ("Accuracy · Earthrise"); the home page shows the default.
  title: { default: TITLE, template: '%s · Earthrise' },
  description: DESCRIPTION,
  // The share image is opengraph-image.jpg beside this file. Twitter takes its title, text and picture from Open Graph
  // when it sets none, so it only has to ask for the large card.
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: 'Earthrise', type: 'website' },
  twitter: { card: 'summary_large_image' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme={DEFAULT_THEME} suppressHydrationWarning className={`${bricolage.variable} ${plex.variable} h-full`}>
      <head>
        {/* Sets data-theme while the HTML is parsed, before the first paint (Next guide: preventing flash before hydration). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full bg-page text-ink antialiased">
        {/* Luna's engine (spec 22), once for the app, so she keeps listening from page to page while she is on. */}
        <LunaEngine />
        {children}
      </body>
    </html>
  );
}

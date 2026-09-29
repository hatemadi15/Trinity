import Link from 'next/link';
import { AppFrame } from '@/components/AppFrame';

export default function Home() {
  return (
    <AppFrame>
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-20">
        <h1 className="font-display text-6xl font-semibold tracking-tight">
          When is the Sun up, and can Earth hear you?
        </h1>
        <p className="max-w-prose text-lg text-ink-2">
          Earthrise compares lunar south-pole landing sites and dates. It draws the terrain skyline from
          NASA LOLA elevation data, moves the Sun and Earth with the JPL DE440 ephemeris, and tells you how
          many hours a site is lit and how many hours Earth is in view.
        </p>
        <Link
          href="/explore"
          className="w-fit rounded-md bg-sun px-4 py-2 font-medium text-night hover:bg-sun-bright"
        >
          Explore a site
        </Link>
      </main>
    </AppFrame>
  );
}

'use client';
import Link from 'next/link';
import { exploreStore } from '@/lib/store/explore';

/** Switches to Learn mode and opens Explore. */
export function LearnStart() {
  return (
    <Link
      href="/explore"
      onClick={() => exploreStore.getState().setAudience('learn')}
      className="w-fit rounded-md bg-sun px-4 py-2 font-medium text-night hover:bg-sun-bright"
    >
      Start in Learn mode
    </Link>
  );
}

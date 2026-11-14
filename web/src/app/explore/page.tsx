import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ExploreView } from '@/components/ExploreView';

export const metadata: Metadata = { title: 'The forecast' };

export default function ExplorePage() {
  return <Suspense fallback={<p className="wrap py-12">Loading NASA data…</p>}><ExploreView /></Suspense>;
}

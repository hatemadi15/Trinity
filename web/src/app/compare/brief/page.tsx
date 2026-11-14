import type { Metadata } from 'next';
import { ComparisonBrief } from '@/components/compare/ComparisonBrief';

export const metadata: Metadata = { title: 'The comparison brief' };

export default function ComparisonBriefPage() {
  return <ComparisonBrief />;
}

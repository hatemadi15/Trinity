import type { Metadata } from 'next';
import { BriefView } from '@/components/BriefView';

export const metadata: Metadata = { title: 'The brief' };

export default function BriefPage() {
  return <BriefView />;
}

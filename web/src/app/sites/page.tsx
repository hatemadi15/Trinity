import type { Metadata } from 'next';
import { SitesView } from '@/components/sites/SitesView';

export const metadata: Metadata = { title: 'Choose a landing site' };

export default function SitesPage() {
  return <SitesView />;
}

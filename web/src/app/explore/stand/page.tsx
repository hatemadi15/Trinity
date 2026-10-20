import type { Metadata } from 'next';
import { StandView } from '@/components/stand/StandView';

export const metadata: Metadata = { title: 'Stand on the Moon' };

export default function StandPage() {
  return <StandView />;
}

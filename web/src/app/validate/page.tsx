import type { Metadata } from 'next';
import { ValidateView } from '@/components/ValidateView';

export const metadata: Metadata = { title: 'Accuracy' };

export default function ValidatePage() {
  return <ValidateView />;
}

import type { Metadata } from 'next';
import { PlanningWorkbench } from '@/components/planner/PlanningWorkbench';

export const metadata: Metadata = {
  title: 'Compare landing scenarios',
  description: 'Compare original, delayed and alternative lunar landings with their complete power and visibility assumptions.',
};

export default function PlanPage() {
  return <PlanningWorkbench />;
}

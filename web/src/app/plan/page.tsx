import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PLAN_HREF } from '@/lib/links';

export const metadata: Metadata = { title: 'Plan a landing' };

/** The planner is a pane of Choose a site (15 November, owner review): the old address opens it there. */
export default function PlanPage() {
  redirect(PLAN_HREF);
}

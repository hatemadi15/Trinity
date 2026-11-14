import type { StoreApi } from 'zustand';
import type { PlannerAnswer } from '../ai/client';
import type { StateSummary } from '../ai/state-summary';
import type { AiMode } from '../store/explore';
import type { SpecField } from './spec';
import type { PlanState } from './store';

/** What each field is called when the assistant's reading is reported. */
const FIELD_NAMES: Record<SpecField, string> = {
  minPoweredH: 'power from landing',
  contactWithinH: 'Earth at landing',
  maxOutageH: 'longest time without Earth while powered',
  minPoweredContactH: 'Earth contact while powered',
  loadW: 'load',
  batteryWh: 'battery',
  areaM2: 'panel area',
  panel: 'panel',
  mastM: 'mast',
  earthClearanceDeg: 'Earth’s clearance',
  stayH: 'stay',
  fromUtc: 'landing window',
  toUtc: 'landing window',
  where: 'where',
  stepH: 'landing times tried',
  objective: 'ranked by',
  priorities: 'priorities',
  top: 'how many to show',
};

/**
 * The model's turn, after the local parser's: asked only when words were left over and a model may be used (not in demo
 * mode), with the whole specification as said. It may only fill fields through a plan_mission action, which the store
 * takes where the parser left a field unset and only with numbers found in the words. Returns a note for the page.
 */
export async function assistSpec(
  text: string,
  plan: StoreApi<PlanState>,
  ask: (prompt: string, state: StateSummary | null, mode: AiMode) => Promise<PlannerAnswer>,
  mode: AiMode,
): Promise<string | null> {
  if (mode === 'cached' || plan.getState().leftover.length === 0) return null;
  plan.getState().setAssistant('asking');
  let a: PlannerAnswer;
  try {
    a = await ask(`Plan a landing: ${text}`, null, mode);
  } catch {
    plan.getState().setAssistant('failed');
    return null;
  }
  const mission = a.actions.find((x) => x.type === 'plan_mission');
  if (!mission || mission.type !== 'plan_mission') {
    plan.getState().setAssistant('failed');
    return null;
  }
  const { fields } = plan.getState().takeAssistant(mission.spec, text);
  if (fields.length === 0) return null;
  const names = [...new Set(fields.map((f) => FIELD_NAMES[f]))];
  return `The assistant also read: ${names.join(', ').replace(/^./, (c) => c.toUpperCase())}.`;
}

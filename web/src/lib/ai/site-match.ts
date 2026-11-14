import type { Site } from '../data/loaders';

/*
 * Matching a phrase to a catalogue site, kept apart from the actions so that code running in a worker (the
 * planner's search reads site names through it) never pulls in the stores, which start workers of their own.
 */

// ---- site matching-----------------------------------------------------------------------

/** Words that appear in many catalogue names and count for half a match; connectives count for nothing. */
const GENERIC = new Set([
  'site', 'sites', 'region', 'landing', 'crater', 'rim', 'point', 'highest', 'artemis', 'iii', 'centre', 'center', 'reference', 'lunar',
  'south', 'pole', 'mission', 'km', 'ridge', 'plateau', 'peak', 'near', 'massif', 'plain', 'mare', 'high',
]);
const STOP = new Set(['the', 'a', 'an', 'to', 'and', 'with', 'on', 'in', 'for', 'of', 'me', 'please', 'at', 'from']);

/** Lower-case ASCII tokens with accents and punctuation stripped and letter/digit boundaries split ("IM-2" → im, 2). */
export function tokens(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const weightOf = (t: string) => (STOP.has(t) ? 0 : GENERIC.has(t) ? 0.5 : 1);

/** Other spellings of the catalogue's names, as people type them: the German "oe" for "ö", a single "a". */
const ALIASES: Record<string, string> = { schroedinger: 'schrodinger', shrodinger: 'schrodinger', chandrayan: 'chandrayaan' };

/**
 * Finds the catalogue site a phrase refers to: an exact id, or the site sharing the most (weighted)
 * words with the phrase, needing at least one distinctive word or two generic ones. Ties go to the
 * site whose name is covered best by the phrase, so "Shackleton crater" picks the crater centre over
 * its rim.
 */
export function siteByName(sites: Site[], text: string): Site | null {
  const phrase = text.trim().toLowerCase();
  if (!phrase) return null;
  const exact = sites.find((s) => s.id === phrase);
  if (exact) return exact;
  const query = Array.from(new Set(tokens(phrase).map((w) => ALIASES[w] ?? w)));
  let best: { site: Site; score: number; coverage: number; size: number } | null = null;
  for (const site of sites) {
    const own = new Set([...tokens(site.name), ...tokens(site.id)]);
    const hits = query.filter((t) => own.has(t));
    // A digit alone ("show me 2") names nothing; it counts fully only next to a matched word.
    const hasWord = hits.some((t) => /[a-z]/.test(t) && weightOf(t) === 1);
    const score = hits.reduce((sum, t) => sum + (/^\d+$/.test(t) && !hasWord ? 0.25 : weightOf(t)), 0);
    const matched = hits.length;
    if (score < 1) continue;
    const coverage = matched / own.size;
    if (!best || score > best.score || (score === best.score && (coverage > best.coverage || (coverage === best.coverage && own.size < best.size)))) {
      best = { site, score, coverage, size: own.size };
    }
  }
  return best?.site ?? null;
}

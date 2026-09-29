import { describe, expect, it } from 'vitest';
import catalogue from '../data/catalogue.json';
import { validateActions } from './actions';
import { cachedAnswer, normalizePrompt, TRANSCRIPTS } from './cache';

describe('normalizePrompt', () => {
  it('lower-cases, strips accents and punctuation and collapses spaces', () => {
    expect(normalizePrompt('  Show me   Nobile Rim 2!  ')).toBe('show me nobile rim 2');
    expect(normalizePrompt('Compare de Gerlache Rim 2 & Nobile Rim 2, please.')).toBe('compare de gerlache rim 2 nobile rim 2 please');
    expect(normalizePrompt('Café')).toBe('cafe');
  });
});

describe('cachedAnswer', () => {
  it('ships twelve rehearsed transcripts whose actions all validate against the catalogue', () => {
    expect(TRANSCRIPTS.length).toBe(12);
    const ids = new Set(catalogue.sites.map((s) => s.id));
    for (const t of TRANSCRIPTS) {
      expect(t.prompt.length).toBeGreaterThan(3);
      expect(t.reply.length).toBeGreaterThan(20);
      const v = validateActions(t.actions, ids);
      expect(v.dropped, `${t.id}: ${v.dropped.join('; ')}`).toEqual([]);
      expect(v.actions).toEqual(t.actions);
    }
    expect(new Set(TRANSCRIPTS.map((t) => normalizePrompt(t.prompt))).size).toBe(12);
  });

  it('answers a rehearsed prompt regardless of case, punctuation and filler words', () => {
    const exact = cachedAnswer('Show me Nobile Rim 2');
    expect(exact?.actions).toEqual([{ type: 'select_site', id: 'nobile_rim_2' }]);
    expect(cachedAnswer('show me nobile rim 2.')?.id).toBe(exact?.id);
    expect(cachedAnswer('Please show me Nobile Rim 2')?.id).toBe(exact?.id);
  });

  it('returns null for prompts far from every transcript', () => {
    expect(cachedAnswer('what is the meaning of life')).toBeNull();
    expect(cachedAnswer('')).toBeNull();
    expect(cachedAnswer('show me')).toBeNull();
  });
});

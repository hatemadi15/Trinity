import { describe, expect, it } from 'vitest';
import { ACTION_TYPES } from './actions';
import { extractJson, parseModelReply, systemPrompt, userPrompt } from './protocol';

describe('extractJson', () => {
  it('reads a fenced block', () => {
    expect(extractJson('Sure!\n```json\n{"actions": [], "reply": "ok"}\n```\nDone.')).toEqual({ actions: [], reply: 'ok' });
  });

  it('reads a bare object with prose around it, keeping braces inside strings', () => {
    expect(extractJson('Here you go: {"reply": "use {braces} freely", "actions": [{"type": "open_page", "page": "compare"}]} hope it helps')).toEqual({
      reply: 'use {braces} freely',
      actions: [{ type: 'open_page', page: 'compare' }],
    });
  });

  it('returns null for prose, broken JSON and non-objects', () => {
    expect(extractJson('I would select Nobile Rim 2 for you.')).toBeNull();
    expect(extractJson('{"reply": "unterminated')).toBeNull();
    expect(extractJson('[1, 2, 3]')).toBeNull();
    expect(extractJson('')).toBeNull();
  });
});

describe('parseModelReply', () => {
  it('normalises a reply object: actions default to an empty list, reply to an empty string', () => {
    expect(parseModelReply('{"reply": "hello"}')).toEqual({ actions: [], reply: 'hello' });
    expect(parseModelReply('{"actions": [{"type": "explain", "topic": "skyline"}]}')).toEqual({ actions: [{ type: 'explain', topic: 'skyline' }], reply: '' });
    expect(parseModelReply('just prose')).toBeNull();
    expect(parseModelReply('{"actions": "select nobile", "reply": 5}')).toEqual({ actions: [], reply: '' });
  });
});

describe('prompts', () => {
  const sites = [
    { id: 'nobile_rim_2', name: 'Nobile Rim 2 (Artemis III region)' },
    { id: 'haworth', name: 'Haworth (Artemis III region)' },
  ];

  it('lists every action type and every site id in the system prompt and forbids invented numbers', () => {
    const p = systemPrompt(sites);
    for (const t of ACTION_TYPES) expect(p).toContain(t);
    expect(p).toContain('nobile_rim_2');
    expect(p).toContain('Haworth (Artemis III region)');
    expect(p).toMatch(/JSON/);
    expect(p).toMatch(/never (compute|invent|guess)/i);
    expect(p.length).toBeLessThan(6000);
  });

  it('puts the state summary and the question in the user message', () => {
    const state = { site: { id: 'haworth', name: 'Haworth', lat: -86.84, lon: -22.59 } };
    const u = userPrompt('what is the longest night?', state as never);
    expect(u).toContain('"id": "haworth"');
    expect(u).toContain('what is the longest night?');
    expect(userPrompt('hi', null)).toMatch(/no site is selected/i);
  });
});

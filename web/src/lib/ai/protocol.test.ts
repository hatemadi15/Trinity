import { describe, expect, it } from 'vitest';
import { ACTION_TYPES } from './actions';
import { extractJson, extractJsonDetailed, parseModelReply, systemPrompt, userPrompt } from './protocol';

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
    expect(extractJson('{"reply": "unterminated')).toEqual({ reply: 'unterminated' }); // an unclosed string is repaired, see below
    expect(extractJson('{"reply": }')).toBeNull();
    expect(extractJson('[1, 2, 3]')).toBeNull();
    expect(extractJson('')).toBeNull();
  });
});

describe('parseModelReply', () => {
  it('normalises a reply object: actions default to an empty list, reply to an empty string', () => {
    expect(parseModelReply('{"reply": "hello"}')).toEqual({ actions: [], reply: 'hello' });
    expect(parseModelReply('{"actions": [{"type": "explain", "topic": "skyline"}]}')).toEqual({ actions: [{ type: 'explain', topic: 'skyline' }], reply: '' });
    expect(parseModelReply('just prose')).toBeNull();
    expect(parseModelReply('{"actions": "select nobile", "reply": 5}')).toBeNull(); // neither an actions list nor a reply string: not the envelope
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

  it('tells the model that an explain step brings its own paragraph, so the reply is one short sentence', () => {
    expect(systemPrompt(sites)).toMatch(/"explain".*one short sentence; the app adds the paragraph/);
  });

  it('puts the state summary and the question in the user message', () => {
    const state = { site: { id: 'haworth', name: 'Haworth', lat: -86.84, lon: -22.59 } };
    const u = userPrompt('what is the longest night?', state as never);
    expect(u).toContain('"id": "haworth"');
    expect(u).toContain('what is the longest night?');
    expect(userPrompt('hi', null)).toMatch(/no site is selected/i);
  });

  it('names the power flag for what it measures, power lasting the whole period, not survival: the figures count electrical energy only', () => {
    const state = { site: { id: 'haworth' }, power: { poweredHours: 336, survives: true }, compare: [{ id: 'malapert_massif', survives: false }] };
    const u = userPrompt('will it survive?', state as never);
    expect(u).toContain('"powerLastsWholePeriod": true');
    expect(u).toContain('"powerLastsWholePeriod": false');
    expect(u.replace('will it survive?', '')).not.toMatch(/surviv/i);
  });
});

describe('parseModelReply envelope', () => {
  it('rejects objects that are not the reply envelope: truncated output, a bare action object', () => {
    expect(parseModelReply('{"actions":[{"type":"select_site","id":"nobile_rim_2"}],"reply":"Nobile Rim 2 is on the rim and')).toEqual({
      actions: [{ type: 'select_site', id: 'nobile_rim_2' }],
      reply: '', // repaired: the unfinished sentence is dropped
    });
    expect(parseModelReply('{"type":"select_site","id":"nobile_rim_2"}')).toBeNull();
    expect(parseModelReply('{"reply":"hi"}')).toEqual({ actions: [], reply: 'hi' });
    expect(parseModelReply('{"actions":[]}')).toEqual({ actions: [], reply: '' });
  });
});

describe('extractJson repair', () => {
  it('closes an unfinished object, array or string and says so', () => {
    const missingBrace = '{"actions": [{"type": "open_page", "page": "compare"}], "reply": "Opening."';
    expect(extractJson(missingBrace)).toEqual({ actions: [{ type: 'open_page', page: 'compare' }], reply: 'Opening.' });
    expect(extractJsonDetailed(missingBrace)).toEqual({ value: { actions: [{ type: 'open_page', page: 'compare' }], reply: 'Opening.' }, repaired: true });
    expect(extractJsonDetailed('{"reply": "done"}')).toEqual({ value: { reply: 'done' }, repaired: false });
    expect(extractJson('{"actions": [{"type": "select_site", "id": "nobile_rim_2"')).toEqual({ actions: [{ type: 'select_site', id: 'nobile_rim_2' }] });
    expect(extractJson('{"actions": [], "reply": "Nobile Rim 2 is on the rim and')).toEqual({ actions: [], reply: 'Nobile Rim 2 is on the rim and' });
    expect(extractJson('{"actions": [], "rep')).toBeNull();
  });
});

describe('parseModelReply on repaired output', () => {
  it('keeps only the complete sentences of a truncated reply', () => {
    expect(parseModelReply('{"actions": [{"type": "select_site", "id": "nobile_rim_2"}], "reply": "Selected Nobile Rim 2. It sits on the rim and')).toEqual({
      actions: [{ type: 'select_site', id: 'nobile_rim_2' }],
      reply: 'Selected Nobile Rim 2.',
    });
    expect(parseModelReply('{"actions": [], "reply": "Nobile Rim 2 is on the rim and')).toEqual({ actions: [], reply: '' });
    expect(parseModelReply('{"actions": [], "reply": "Opening the comparison."')).toEqual({ actions: [], reply: 'Opening the comparison.' });
  });
});

describe('extractJson repair refuses a value cut mid-number', () => {
  it('returns null when the text ends inside a number outside a string', () => {
    expect(extractJson('{"actions": [{"type": "set_power", "patch": {"loadW": 200')).toBeNull();
    expect(extractJson('{"actions": [{"type": "set_params", "patch": {"mastM": 1')).toBeNull();
    expect(extractJson('{"actions": [{"type": "set_power", "patch": {"loadW": -')).toBeNull();
    expect(extractJson('{"actions": [{"type": "set_power", "patch": {"loadW": 200}')).toEqual({ actions: [{ type: 'set_power', patch: { loadW: 200 } }] });
  });
});

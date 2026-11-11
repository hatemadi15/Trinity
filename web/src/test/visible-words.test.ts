// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { hiddenAt, PHONE, visibleWords, WIDE } from './visible-words';

function html(markup: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = markup;
  return root;
}

describe('the words a page shows before a tap (spec 20.1)', () => {
  it('reads the width classes as the stylesheet does: the most specific one that applies wins', () => {
    expect(hiddenAt('max-md:hidden', PHONE)).toBe(true);
    expect(hiddenAt('max-md:hidden', WIDE)).toBe(false);
    expect(hiddenAt('md:hidden', PHONE)).toBe(false);
    expect(hiddenAt('md:hidden', WIDE)).toBe(true);
    expect(hiddenAt('hidden xl:inline', WIDE)).toBe(false);
    expect(hiddenAt('hidden xl:inline', 1024)).toBe(true);
    expect(hiddenAt('sr-only', WIDE)).toBe(true);
    expect(hiddenAt('max-sm:sr-only', PHONE)).toBe(true);
    expect(hiddenAt('max-sm:sr-only', WIDE)).toBe(false);
    // A state variant never applies to a still page, and other utilities are not about showing.
    expect(hiddenAt('hover:hidden text-lg', WIDE)).toBe(false);
  });

  it('counts the words that show, and not those in a hidden element, a class hidden at that width, or signs', () => {
    const root = html(
      '<p>Power for 3 days 4 hours ›</p><p hidden>The reasons stay one tap away.</p>' +
        '<p class="max-md:hidden">From 768 px only</p><p class="md:hidden">Phone only</p>' +
        '<p aria-hidden="true">Seen but not read</p><span class="sr-only">Read but not seen</span><p>Earthrise · Accuracy</p>',
    );
    expect(visibleWords(root, WIDE)).toEqual(['Power', 'for', '3', 'days', '4', 'hours', 'From', '768', 'px', 'only', 'Seen', 'but', 'not', 'read', 'Earthrise', 'Accuracy']);
    expect(visibleWords(root, PHONE)).toEqual(['Power', 'for', '3', 'days', '4', 'hours', 'Phone', 'only', 'Seen', 'but', 'not', 'read', 'Earthrise', 'Accuracy']);
  });

  it('keeps a number and its unit as written, a no-break space between them read as a plain one', () => {
    expect(visibleWords(html('<p>battery 100 %, 2.4° up</p>'), WIDE)).toEqual(['battery', '100', '%,', '2.4°', 'up']);
  });
});

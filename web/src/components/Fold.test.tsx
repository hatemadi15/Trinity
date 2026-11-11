// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PHONE, visibleWords, WIDE } from '@/test/visible-words';
import { Fold } from './Fold';

describe('Fold', () => {
  it('keeps its words in the page but out of the first screen until the button opens them (spec 20.1)', () => {
    const { container } = render(
      <Fold label="Why this happens">
        <p>The Sun sets behind the hills on 3 January.</p>
      </Fold>,
    );
    const button = screen.getByRole('button', { name: 'Why this happens' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    // Still in the page, in its reading order, so a search of the page finds it.
    expect(screen.getByText('The Sun sets behind the hills on 3 January.')).toBeTruthy();
    expect(visibleWords(container, WIDE)).toEqual(['Why', 'this', 'happens']);
    expect(visibleWords(container, PHONE)).toEqual(['Why', 'this', 'happens']);
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(button.getAttribute('aria-controls')!)!.hidden).toBe(false);
    expect(visibleWords(container, WIDE).join(' ')).toBe('Why this happens The Sun sets behind the hills on 3 January.');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
});

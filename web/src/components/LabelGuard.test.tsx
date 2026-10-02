// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LabelGuard } from './LabelGuard';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Lays the labels out from their data-box attribute ("left top width height"), as a browser would measure them. */
function measureFromDataBox() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const [left, top, width, height] = (this.dataset.box ?? '0 0 0 0').split(' ').map(Number);
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
  });
}

describe('LabelGuard', () => {
  it('hides the less important of two labels that overlap once laid out, and leaves the rest', () => {
    measureFromDataBox();
    render(
      <LabelGuard role="img" aria-label="chart">
        <span data-label="" data-priority="3" data-box="0 0 80 20">10° up</span>
        <span data-label="" data-priority="1" data-box="40 10 200 24">
          Night for 16 days
        </span>
        <span data-label="" data-priority="2" data-box="300 10 80 20">
          Sun sets 3 Jan
        </span>
      </LabelGuard>,
    );
    expect(screen.getByText('10° up').style.visibility).toBe('hidden');
    expect(screen.getByText('Night for 16 days').style.visibility).toBe('');
    expect(screen.getByText('Sun sets 3 Jan').style.visibility).toBe('');
    expect(screen.getByRole('img', { name: 'chart' })).toBeTruthy();
  });
});

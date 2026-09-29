// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SummaryTiles } from './SummaryTiles';

describe('SummaryTiles', () => {
  it('shows the five planner numbers and a table view', () => {
    render(
      <SummaryTiles
        summary={{
          hours: 720,
          illumFraction: 0.9068,
          meanSunFraction: 0.86,
          longestDarkH: 63,
          earthVisFraction: 0.4998,
          longestEarthGapH: 334,
          jointFraction: 0.454,
        }}
      />,
    );
    expect(screen.getByText('90.7 %')).toBeTruthy();
    expect(screen.getByText('63 h')).toBeTruthy();
    expect(screen.getByText('13 d 22 h')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show as table' }));
    expect(screen.getByRole('table')).toBeTruthy();
  });
});

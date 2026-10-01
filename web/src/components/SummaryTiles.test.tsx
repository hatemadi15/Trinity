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

  it('adds the battery rows and the verdict when a power budget is given', () => {
    render(
      <SummaryTiles
        summary={{ hours: 720, illumFraction: 0.5, meanSunFraction: 0.5, longestDarkH: 300, earthVisFraction: 0.5, longestEarthGapH: 300, jointFraction: 0.25 }}
        power={{ powerW: new Float64Array(720), energyWh: new Float64Array(720), powered: new Uint8Array(720), socMin: 0, brownoutHours: 290, firstBrownoutHour: 10, survives: false, meanPowerW: 50 }}
      />,
    );
    expect(screen.getByText('Lowest battery')).toBeTruthy();
    expect(screen.getByText('0.0 %')).toBeTruthy();
    expect(screen.queryByText('Hours without full power')).toBeNull(); // the verdict chip already carries the brownout hours
    expect(screen.getByText('Battery empties after 10 h')).toBeTruthy();
    expect(screen.getByText(/290 h without full power/)).toBeTruthy(); // the chip carries the brownout hours
  });

  it('in Learn mode keeps four tiles with plain-language help lines', () => {
    render(
      <SummaryTiles
        audience="learn"
        summary={{ hours: 720, illumFraction: 0.5, meanSunFraction: 0.5, longestDarkH: 300, earthVisFraction: 0.5, longestEarthGapH: 300, jointFraction: 0.25 }}
        power={{ powerW: new Float64Array(720), energyWh: new Float64Array(720), powered: new Uint8Array(720), socMin: 0, brownoutHours: 290, firstBrownoutHour: 10, survives: false, meanPowerW: 50 }}
      />,
    );
    expect(screen.getByText('Sun above the skyline')).toBeTruthy();
    expect(screen.getByText('Longest night')).toBeTruthy();
    expect(screen.queryByText('Both at once')).toBeNull();
    expect(screen.queryByText('Lowest battery')).toBeNull();
    expect(screen.queryByText('Hours without full power')).toBeNull();
    expect(screen.getByText(/the battery must last this long/)).toBeTruthy();
    expect(screen.getByText('Battery empties after 10 h')).toBeTruthy(); // the verdict stays
  });
});

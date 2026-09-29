// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { BackcastsDoc, HorizonsDoc, MazaricoDoc } from '@/lib/data/validation';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { ValidateView } from './ValidateView';

const docs = {
  horizons: readJson<HorizonsDoc>('data', 'validation', 'horizons.json'),
  mazarico: readJson<MazaricoDoc>('data', 'validation', 'mazarico.json'),
  backcasts: readJson<BackcastsDoc>('data', 'validation', 'backcasts.json'),
};

describe('ValidateView', () => {
  it('renders the three tables with their verdict lines', async () => {
    render(<ValidateView load={async () => docs} recheck={async () => ({ ok: false, message: 'offline' })} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Do we point where JPL points?' })).toBeTruthy());
    expect(screen.getByRole('heading', { name: 'Do we light what LOLA lights?' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Did the landers die when the Sun set?' })).toBeTruthy();
    expect(screen.getByText(/Worst difference over 300 rows/)).toBeTruthy();
    expect(screen.getAllByText(/not covered by the 85°S map/).length).toBeGreaterThan(0);
    expect(screen.getByText('+2.4 h')).toBeTruthy(); // Blue Ghost outlived the predicted sunset by 2.4 h
    expect(screen.getAllByRole('table').length).toBe(3);
    expect(screen.getByText(/ephemeris < 0\.01°/)).toBeTruthy();
  });

  it('shows the fallback message when the live re-check fails', async () => {
    render(<ValidateView load={async () => docs} recheck={async () => ({ ok: false, message: 'JPL unreachable' })} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Re-check with JPL now/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Re-check with JPL now/ }));
    await waitFor(() => expect(screen.getByText(/JPL unreachable; showing the stored comparison/)).toBeTruthy());
  });

  it('reports a successful re-check', async () => {
    render(<ValidateView load={async () => docs} recheck={async () => ({ ok: true, worstEl: 0.00003, worstAzCosEl: 0.000002, n: 8, ms: 1200 })} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Re-check with JPL now/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Re-check with JPL now/ }));
    await waitFor(() => expect(screen.getByText(/8 epochs, worst 3\.0e-5°/)).toBeTruthy());
  });

  it('shows the data-missing state when the tables cannot be loaded', async () => {
    render(
      <ValidateView
        load={async () => {
          throw new Error('could not load /data/validation/horizons.json (HTTP 404)');
        }}
        recheck={async () => ({ ok: false, message: 'offline' })}
      />,
    );
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/validate/));
  });
});

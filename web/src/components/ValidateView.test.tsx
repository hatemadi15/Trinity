// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BackcastsDoc, HorizonsDoc, MazaricoDoc } from '@/lib/data/validation';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { ValidateView } from './ValidateView';

const docs = {
  horizons: readJson<HorizonsDoc>('data', 'validation', 'horizons.json'),
  mazarico: readJson<MazaricoDoc>('data', 'validation', 'mazarico.json'),
  backcasts: readJson<BackcastsDoc>('data', 'validation', 'backcasts.json'),
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('ValidateView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches each table once with the default loaders (no refetch loop)', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/validation/horizons.json')) return jsonResponse(docs.horizons);
      if (url.endsWith('/validation/mazarico.json')) return jsonResponse(docs.mazarico);
      if (url.endsWith('/validation/backcasts.json')) return jsonResponse(docs.backcasts);
      return new Response('missing', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ValidateView />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Do we point where JPL points?' })).toBeTruthy());
    await new Promise((r) => setTimeout(r, 400));
    expect(fetchMock.mock.calls.length).toBe(4); // three tables and the test badge, once each
  });

  it('a re-check that throws shows the fallback and re-enables the button', async () => {
    render(
      <ValidateView
        load={async () => docs}
        recheck={async () => {
          throw new Error('could not load /data/ephemeris/x (HTTP 404)');
        }}
      />,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /Re-check with JPL now/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Re-check with JPL now/ }));
    await waitFor(() => expect(screen.getByText(/HTTP 404\); showing the stored comparison/)).toBeTruthy());
    expect((screen.getByRole('button', { name: /Re-check with JPL now/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('explains each backcast and gives the table a verdict line', async () => {
    render(<ValidateView load={async () => docs} recheck={async () => ({ ok: false, message: 'offline' })} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Did the landers die when the Sun set?' })).toBeTruthy());
    expect(screen.getByText(/died early for known reasons/)).toBeTruthy();
    expect(screen.getByText(/panels tilted away/)).toBeTruthy();
    expect(screen.getByText(/on its side in a crater/)).toBeTruthy();
  });

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

describe('ValidateView Mazarico verdict', () => {
  it('phrases the two large misses as a hypothesis about map resolution', async () => {
    render(<ValidateView load={async () => docs} recheck={async () => ({ ok: false, message: 'offline' })} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Do we light what LOLA lights?' })).toBeTruthy());
    expect(screen.getByText(/most likely the map’s 60 m sampling of 20 m peaks/)).toBeTruthy();
  });
});

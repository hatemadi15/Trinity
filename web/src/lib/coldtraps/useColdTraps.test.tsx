// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ColdOverlayDoc, ColdTrapDoc } from './coldtraps';
import { useColdOverlay, useColdTraps } from './useColdTraps';

function Probe({ load }: { load: () => Promise<ColdTrapDoc> }) {
  const doc = useColdTraps(load);
  return <p>{doc ? `${doc.sites.length} sites` : 'none'}</p>;
}

function OverlayProbe({ on, load }: { on: boolean; load: () => Promise<ColdOverlayDoc> }) {
  const doc = useColdOverlay(on, load);
  return <p>{doc ? `${doc.sites.length} layers` : 'no layer'}</p>;
}

describe('useColdTraps', () => {
  it('gives the layer once it has loaded', async () => {
    render(<Probe load={async () => ({ version: 1, sites: [{}, {}, {}] }) as unknown as ColdTrapDoc} />);
    expect(screen.getByText('none')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('3 sites')).toBeTruthy());
  });

  it('gives nothing when the layer cannot be loaded, so the page works without it', async () => {
    render(
      <Probe
        load={async () => {
          throw new Error('HTTP 404');
        }}
      />,
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText('none')).toBeTruthy();
  });
});

describe('useColdOverlay', () => {
  it('loads the shadow map’s layer only once it is switched on', async () => {
    const load = vi.fn(async () => ({ version: 1, cold_K: 110, sites: [{}] }) as unknown as ColdOverlayDoc);
    const { rerender } = render(<OverlayProbe on={false} load={load} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(load).not.toHaveBeenCalled();
    rerender(<OverlayProbe on load={load} />);
    await waitFor(() => expect(screen.getByText('1 layers')).toBeTruthy());
    expect(load).toHaveBeenCalledTimes(1);
  });
});

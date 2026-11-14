// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { UncertaintyDoc } from './budget';
import { useUncertainty } from './useUncertainty';

function Probe({ load }: { load: () => Promise<UncertaintyDoc> }) {
  const doc = useUncertainty(load);
  return <p>{doc ? `${doc.sites.length} sites` : 'none'}</p>;
}

describe('useUncertainty', () => {
  it('gives the budget once it has loaded', async () => {
    render(<Probe load={async () => ({ version: 1, sites: [{}, {}] }) as unknown as UncertaintyDoc} />);
    expect(screen.getByText('none')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('2 sites')).toBeTruthy());
  });

  it('gives nothing when the budget cannot be loaded, so the page works without it', async () => {
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

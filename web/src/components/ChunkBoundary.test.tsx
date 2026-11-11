// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChunkBoundary } from './ChunkBoundary';

function Broken(): never {
  throw new Error('Loading chunk 42 failed.');
}

describe('ChunkBoundary', () => {
  it('shows its fallback and says so when the part fails, and leaves the rest of the page as it was', () => {
    // React reports the caught error on the console; the test keeps that out of the run's output.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();
    render(
      <main>
        <h1>The answer</h1>
        <ChunkBoundary fallback={<p>The 3D view is not available on this device.</p>} onError={onError}>
          <Broken />
        </ChunkBoundary>
      </main>,
    );
    quiet.mockRestore();
    expect(screen.getByRole('heading', { name: 'The answer' })).toBeTruthy();
    expect(screen.getByText('The 3D view is not available on this device.')).toBeTruthy();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('shows the part itself when nothing fails', () => {
    render(
      <ChunkBoundary fallback={<p>fallback</p>}>
        <p>The view</p>
      </ChunkBoundary>,
    );
    expect(screen.getByText('The view')).toBeTruthy();
    expect(screen.queryByText('fallback')).toBeNull();
  });
});

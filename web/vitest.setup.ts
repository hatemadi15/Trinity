import { afterEach } from 'vitest';

// Unmount React trees between tests in jsdom files (vitest has no global afterEach for RTL's auto-cleanup).
afterEach(async () => {
  if (typeof document !== 'undefined') {
    const { cleanup } = await import('@testing-library/react');
    cleanup();
  }
});

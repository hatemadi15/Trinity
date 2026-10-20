// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataProblem } from './DataProblem';

const ERROR = 'could not load /data/sites.json (HTTP 404)';
const HINT = (
  <>
    Run <code>sync-local</code> and reload this page.
  </>
);
const lines = () => [...screen.getByRole('alert').querySelectorAll('p')].map((p) => p.textContent);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('DataProblem', () => {
  it('says in plain words that the data did not load and what a visitor can do, with nothing else to add', () => {
    render(<DataProblem error={null} />);
    expect(lines()).toEqual(['The data could not be loaded.', 'Reload the page, or try again in a minute.']);
    // The same look as the error blocks it replaces: a red rule on the left, quiet text.
    expect(screen.getByRole('alert').className).toMatch(/\bborder-bad\b/);
  });

  it('names the checks on the Accuracy page', () => {
    render(<DataProblem error={null} what="checks" />);
    expect(lines()).toEqual(['The checks could not be loaded.', 'Reload the page, or try again in a minute.']);
  });

  it('gives a developer the way out and the error itself outside production', () => {
    render(<DataProblem error={ERROR} hint={HINT} />);
    expect(lines()).toEqual(['The data could not be loaded.', 'Reload the page, or try again in a minute.', `Run sync-local and reload this page. (${ERROR})`]);
    expect(screen.getByRole('alert').querySelector('code')!.textContent).toBe('sync-local');
  });

  it('gives a developer the error alone when there is no way out to name', () => {
    render(<DataProblem error={ERROR} />);
    expect(lines()[2]).toBe(` (${ERROR})`);
  });

  it('keeps the way out and the error off a public page', () => {
    vi.stubEnv('NODE_ENV', 'production');
    render(<DataProblem error={ERROR} hint={HINT} />);
    expect(lines()).toEqual(['The data could not be loaded.', 'Reload the page, or try again in a minute.']);
    expect(screen.getByRole('alert').textContent).not.toMatch(/sync-local|HTTP 404/);
  });
});

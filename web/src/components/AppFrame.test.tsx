// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { exploreStore } from '@/lib/store/explore';
import { AppFrame } from './AppFrame';

describe('AppFrame', () => {
  it('renders the wordmark, navigation and children', () => {
    render(
      <AppFrame>
        <p>hello</p>
      </AppFrame>,
    );
    expect(screen.getByRole('link', { name: 'Earthrise' })).toHaveProperty('href', expect.stringContaining('/'));
    expect(screen.getByRole('link', { name: 'Explore' })).toBeTruthy();
    expect(screen.getByText('Compare')).toBeTruthy();
    expect(screen.getByText('hello')).toBeTruthy();
  });
});

describe('AppFrame demo gate', () => {
  it('reads ?demo=1 on any page and switches the shared store to rehearsed answers', () => {
    window.sessionStorage.clear();
    exploreStore.getState().setAiMode('live');
    window.history.pushState({}, '', '/?demo=1');
    render(
      <AppFrame>
        <p>x</p>
      </AppFrame>,
    );
    expect(exploreStore.getState().aiMode).toBe('cached');
    window.history.pushState({}, '', '/');
    window.sessionStorage.clear();
    exploreStore.getState().setAiMode('live');
  });
});

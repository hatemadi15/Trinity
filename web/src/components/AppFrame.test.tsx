// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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

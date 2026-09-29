// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GuidedStory, STORY_STEPS } from './GuidedStory';

describe('GuidedStory', () => {
  it('has five ordered steps and moves the current step with Next and Back', () => {
    render(<GuidedStory webgl={true} />);
    const list = screen.getByRole('list', { name: 'Guided story' });
    const items = within(list).getAllByRole('listitem');
    expect(items.length).toBe(5);
    expect(STORY_STEPS.length).toBe(5);
    expect(items[0].getAttribute('aria-current')).toBe('step');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(within(list).getAllByRole('listitem')[1].getAttribute('aria-current')).toBe('step');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(within(list).getAllByRole('listitem')[0].getAttribute('aria-current')).toBe('step');
    expect((screen.getByRole('button', { name: 'Back' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('says the terrain step needs WebGL when the 3D view is unavailable', () => {
    render(<GuidedStory webgl={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(/needs WebGL/)).toBeTruthy();
  });
});

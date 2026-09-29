// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WindowControls } from './WindowControls';

describe('WindowControls', () => {
  it('scrubber moves one hour per arrow key and reports window changes', () => {
    const onCursor = vi.fn();
    const onWindow = vi.fn();
    render(
      <WindowControls startUtc="2027-01-01T00:00:00" days={30} cursor={10} hours={720} onWindow={onWindow} onCursor={onCursor} />,
    );
    const slider = screen.getByRole('slider', { name: 'Time cursor' }) as HTMLInputElement;
    expect(slider.step).toBe('1');
    expect(slider.max).toBe('719');
    fireEvent.change(slider, { target: { value: '11' } });
    expect(onCursor).toHaveBeenCalledWith(11);
    fireEvent.click(screen.getByRole('radio', { name: '14 days' }));
    expect(onWindow).toHaveBeenCalledWith('2027-01-01T00:00:00', 14);
    fireEvent.change(screen.getByLabelText('Start date (UTC)'), { target: { value: '2027-03-05' } });
    expect(onWindow).toHaveBeenCalledWith('2027-03-05T00:00:00', 30);
    expect(screen.getByText('2027-01-01 10:00 UTC')).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TimeScrubber } from './TimeScrubber';

describe('TimeScrubber', () => {
  it('is a native 1-hour-step range input with a time label and play button', () => {
    const onCursor = vi.fn();
    render(<TimeScrubber startUtc="2027-01-01T00:00:00" cursor={10} hours={720} onCursor={onCursor} />);
    const slider = screen.getByRole('slider', { name: 'Time cursor' }) as HTMLInputElement;
    expect(slider.step).toBe('1');
    expect(slider.max).toBe('719');
    fireEvent.change(slider, { target: { value: '11' } });
    expect(onCursor).toHaveBeenCalledWith(11);
    expect(screen.getByText('2027-01-01 10:00 UTC')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  });
});

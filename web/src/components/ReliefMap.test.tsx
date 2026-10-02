// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HOME } from '@/lib/data/home';
import { ReliefMap, type MapPin } from './ReliefMap';

const pins: MapPin[] = [
  { id: 'a', u: 0.25, v: 0.5, label: 'Alpha Ridge', href: '/explore?site=a', tone: 'good' },
  { id: 'b', u: 0.9, v: 0.1, label: 'Beta Plain', href: '/explore?site=b', tone: 'plain' },
];

describe('ReliefMap', () => {
  it('places one link per site, named after the site', () => {
    render(<ReliefMap pins={pins} />);
    const a = screen.getByRole('link', { name: 'Alpha Ridge' });
    expect(a.getAttribute('href')).toBe('/explore?site=a');
    expect(a.style.left).toBe('25%');
    expect(a.style.top).toBe('50%');
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getByRole('img').getAttribute('alt')).toMatch(/south pole/);
  });

  it('writes every name on the map, and marks the active and the selected pin', () => {
    render(<ReliefMap pins={pins} activeId="a" selectedId="b" />);
    expect(screen.getByText('Alpha Ridge')).toBeTruthy();
    expect(screen.getByText('Beta Plain')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Alpha Ridge' }).getAttribute('data-active')).toBe('true');
    expect(screen.getByRole('link', { name: 'Beta Plain' }).getAttribute('aria-current')).toBe('true');
  });

  it('gives a 100 km scale', () => {
    const { container } = render(<ReliefMap pins={pins} />);
    const scale = container.querySelector<HTMLElement>('[data-part="scale"]')!;
    expect(scale.textContent).toBe('100 km');
    expect(scale.style.width).toBe(`${(100 / (2 * HOME.relief.half_km)) * 100}%`);
  });

  it('writes on the map every name that fits when asked to name the pins', () => {
    const { unmount } = render(<ReliefMap pins={pins} />);
    expect(screen.getByText('Alpha Ridge').className).toMatch(/\bhidden\b/);
    unmount();
    render(<ReliefMap pins={pins} nameAll />);
    expect(screen.getByText('Alpha Ridge').className).not.toMatch(/\bhidden\b/);
    expect(screen.getByText('Alpha Ridge').getAttribute('data-side')).toBe('below');
    // Beta Plain is near the right edge: its name goes to the left of its pin.
    expect(screen.getByText('Beta Plain').className).not.toMatch(/\bhidden\b/);
    expect(screen.getByText('Beta Plain').getAttribute('data-side')).toBe('left');
  });

  it('tells its owner which pin the pointer or the keyboard is on', () => {
    const onActive = vi.fn();
    render(<ReliefMap pins={pins} onActive={onActive} />);
    fireEvent.mouseEnter(screen.getByRole('link', { name: 'Beta Plain' }));
    expect(onActive).toHaveBeenLastCalledWith('b');
    fireEvent.mouseLeave(screen.getByRole('link', { name: 'Beta Plain' }));
    expect(onActive).toHaveBeenLastCalledWith(null);
    fireEvent.focus(screen.getByRole('link', { name: 'Alpha Ridge' }));
    expect(onActive).toHaveBeenLastCalledWith('a');
  });
});

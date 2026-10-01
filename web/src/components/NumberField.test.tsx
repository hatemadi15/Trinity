// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NumberField } from './NumberField';

describe('NumberField', () => {
  it('commits a valid value as it is typed and lets the user type through an invalid one', () => {
    const onChange = vi.fn();
    render(<NumberField label="Load (W)" value={200} min={10} max={2000} step={10} onChange={onChange} />);
    const input = screen.getByLabelText('Load (W)') as HTMLInputElement;
    expect(input.className).toMatch(/\bfield\b/);
    fireEvent.change(input, { target: { value: '5' } }); // on the way to 500
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('5');
    fireEvent.change(input, { target: { value: '500' } });
    expect(onChange).toHaveBeenLastCalledWith(500);
  });

  it('goes back to the last valid value when the field is left with an invalid draft', () => {
    render(<NumberField label="Load (W)" value={200} min={10} max={2000} step={10} onChange={() => {}} />);
    const input = screen.getByLabelText('Load (W)') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(input.value).toBe('200');
  });
});

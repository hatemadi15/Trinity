// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

function Host({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={opener} type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && (
        <Modal
          title="Settings"
          returnFocus={opener}
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        >
          <input aria-label="First" />
          <button type="button">Last</button>
        </Modal>
      )}
    </>
  );
}

describe('Modal', () => {
  it('is a named modal dialog that takes the focus and gives it back', () => {
    render(<Host onClose={() => {}} />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('closes on Escape and on a press outside, not on a press inside', () => {
    const onClose = vi.fn();
    render(<Host onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText('First'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('keeps Tab inside', () => {
    render(<Host onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const last = screen.getByRole('button', { name: 'Last' });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Close' }), { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});

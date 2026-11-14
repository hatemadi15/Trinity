'use client';
import { useMemo, useState, type RefObject } from 'react';
import { DOWNLOAD_NOTE, Downloads } from '@/components/Downloads';
import { Modal } from '@/components/Modal';
import type { ExportInput } from '@/lib/share/csv';
import { copyText, saveFile } from '@/lib/share/download';
import { collectProvenance } from '@/lib/share/provenance';
import type { AppVersion, DataVersions } from '@/lib/share/versions';

/**
 * Share and download: the link that opens the same figures, with a button that copies it, and the figures as files,
 * the three tables plain CSV and the settings, versions and sources behind them in a JSON file beside them.
 */
export function ShareDialog({
  input,
  link,
  versions,
  onClose,
  returnFocus,
  copy = copyText,
  save = saveFile,
}: {
  input: ExportInput;
  /** The full address of Explore on this site, period and settings. */
  link: string;
  versions: { app: AppVersion; data: DataVersions };
  onClose: () => void;
  returnFocus?: RefObject<HTMLElement | null>;
  /** Injected in tests; by default the clipboard and the browser's download. */
  copy?: (text: string) => Promise<void>;
  save?: (name: string, text: string, type: string) => void;
}) {
  const [said, setSaid] = useState('');
  const provenance = useMemo(() => collectProvenance(input, versions), [input, versions]);
  const onCopy = () => {
    copy(link).then(
      () => setSaid('Link copied.'),
      () => setSaid('The browser would not copy it: select the link above and copy it.'),
    );
  };
  return (
    <Modal title="Share and download" onClose={onClose} returnFocus={returnFocus} wide>
      <h3 className="mt-4 font-semibold">Link</h3>
      <p className="mt-1 text-[15px] text-ink-2">Opens this site, period, lander, mast and radio clearance on the same figures, in any browser.</p>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
        <input readOnly value={link} aria-label="Link to these figures" onFocus={(e) => e.currentTarget.select()} className="field min-w-0 flex-1 basis-64 text-[15px]" />
        <button type="button" onClick={onCopy} className="btn shrink-0">
          Copy link
        </button>
      </div>
      <p role="status" aria-live="polite" className="mt-1 min-h-[1.5em] text-[15px] text-ink-2">
        {said}
      </p>
      <h3 className="mt-3 font-semibold">Download the figures</h3>
      <p className="mt-1 mb-3 max-w-[52em] text-[15px] text-ink-2">{DOWNLOAD_NOTE}</p>
      <Downloads input={input} provenance={provenance} link={link} save={save} />
    </Modal>
  );
}

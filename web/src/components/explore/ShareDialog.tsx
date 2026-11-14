'use client';
import { useMemo, useState, type RefObject } from 'react';
import { Modal } from '@/components/Modal';
import { aboutJson, hourlyCsv, numbersCsv, windowsCsv, type CsvFile, type ExportInput, type RadioWindowRow } from '@/lib/share/csv';
import { copyText, saveFile } from '@/lib/share/download';
import { collectProvenance } from '@/lib/share/provenance';
import type { AppVersion, DataVersions } from '@/lib/share/versions';

const CSV = 'text/csv;charset=utf-8';
const JSON_TYPE = 'application/json';

/** Now, as the settings file stamps it: an ISO time in UTC, to the second. */
const nowUtc = () => `${new Date().toISOString().slice(0, 19)}Z`;

/**
 * Share and download: the link that opens the same figures, with a button that copies it, and the figures as files,
 * the three tables plain CSV and the settings, versions and sources behind them in a JSON file beside them.
 */
export function ShareDialog({
  input,
  link,
  versions,
  windows,
  onClose,
  returnFocus,
  copy = copyText,
  save = saveFile,
}: {
  input: ExportInput;
  /** The full address of Explore on this site, period and settings. */
  link: string;
  versions: { app: AppVersion; data: DataVersions };
  /** The radio windows to list; the engine's contact intervals when not given. */
  windows?: RadioWindowRow[];
  onClose: () => void;
  returnFocus?: RefObject<HTMLElement | null>;
  /** Injected in tests; by default the clipboard and the browser's download. */
  copy?: (text: string) => Promise<void>;
  save?: (name: string, text: string, type: string) => void;
}) {
  const [said, setSaid] = useState('');
  const provenance = useMemo(() => collectProvenance(input, versions), [input, versions]);
  const tables = (): CsvFile[] => [hourlyCsv(input), numbersCsv(input, provenance), windowsCsv(input, windows)];
  const files: { label: string; note: string; type: string; make: () => { name: string; text: string } }[] = [
    { label: 'Hour by hour (CSV)', note: `the Sun and Earth, the panel and the battery for each of the ${input.series.hours} hours`, type: CSV, make: () => tables()[0] },
    { label: 'All numbers (CSV)', note: 'every figure, with the settings behind it', type: CSV, make: () => tables()[1] },
    { label: 'Radio windows (CSV)', note: 'each time Earth is in view: when it opens and closes, and for how long', type: CSV, make: () => tables()[2] },
    { label: 'Settings and sources (JSON)', note: 'the settings, versions, data sources and assumptions behind the tables, each column described, and the link', type: JSON_TYPE, make: () => aboutJson(input, provenance, link, tables(), nowUtc()) },
  ];
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
      <p className="mt-1 max-w-[52em] text-[15px] text-ink-2">
        Times are in UTC. Each table is a plain CSV whose first row names the columns, so any spreadsheet opens it as it is; the settings, versions and data sources that made them are in the JSON file beside them, and on the printable brief.
      </p>
      <ul className="mt-3 grid gap-3">
        {files.map((f) => (
          <li key={f.label} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
            <button
              type="button"
              onClick={() => {
                const file = f.make();
                save(file.name, file.text, f.type);
              }}
              className="btn shrink-0 sm:w-[17rem]"
            >
              {f.label}
            </button>
            <span className="text-[15px] text-ink-2">{f.note}</span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

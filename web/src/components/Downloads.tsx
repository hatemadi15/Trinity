'use client';
import { aboutJson, hourlyCsv, numbersCsv, windowsCsv, type CsvFile, type ExportInput, type RadioWindowRow } from '@/lib/share/csv';
import { saveFile } from '@/lib/share/download';
import type { Provenance } from '@/lib/share/provenance';

const CSV = 'text/csv;charset=utf-8';
const JSON_TYPE = 'application/json';

/** Now, as the settings file stamps it: an ISO time in UTC, to the second. */
const nowUtc = () => `${new Date().toISOString().slice(0, 19)}Z`;

/** Why the tables are plain CSV, and where their settings went: said wherever they are offered. */
export const DOWNLOAD_NOTE =
  'Times are in UTC. Each table is a plain CSV whose first row names the columns, so any spreadsheet opens it as it is; the settings, versions and data sources that made them are in the JSON file beside them, and on the printable brief.';

/**
 * The figures as four files, each named for the site and period: three plain CSV tables (hour by hour, all numbers, the
 * radio windows) and the JSON file beside them with the settings, versions, sources and assumptions, and the link.
 */
export function Downloads({
  input,
  provenance,
  link,
  windows,
  save = saveFile,
}: {
  input: ExportInput;
  provenance: Provenance;
  /** The full address that opens the same figures, written into the JSON file. */
  link: string;
  /** The radio windows to list; the engine's contact intervals when not given. */
  windows?: RadioWindowRow[];
  /** Injected in tests; by default the browser's download. */
  save?: (name: string, text: string, type: string) => void;
}) {
  const tables = (): CsvFile[] => [hourlyCsv(input), numbersCsv(input, provenance), windowsCsv(input, windows)];
  const files: { label: string; note: string; type: string; make: () => { name: string; text: string } }[] = [
    { label: 'Hour by hour (CSV)', note: `the Sun and Earth, the panel and the battery for each of the ${input.series.hours} hours`, type: CSV, make: () => hourlyCsv(input) },
    { label: 'All numbers (CSV)', note: 'every figure, with the settings behind it', type: CSV, make: () => numbersCsv(input, provenance) },
    { label: 'Radio windows (CSV)', note: 'each time Earth is in view: when it opens and closes, and for how long', type: CSV, make: () => windowsCsv(input, windows) },
    { label: 'Settings and sources (JSON)', note: 'the settings, versions, data sources and assumptions behind the tables, each column described, and the link', type: JSON_TYPE, make: () => aboutJson(input, provenance, link, tables(), nowUtc()) },
  ];
  return (
    <ul className="grid gap-3">
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
  );
}

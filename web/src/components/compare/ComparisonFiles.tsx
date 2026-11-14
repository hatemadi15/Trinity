'use client';
import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import type { Requirements } from '@/lib/plan/requirements';
import { comparisonHref } from '@/lib/scenario/codec';
import { figureDifferences, figuresOf, fileName, readScenarioFile, scenarioFile, type FileColumn, type FileFigures } from '@/lib/scenario/file';
import { loadDataVersions, UNKNOWN_VERSIONS, type DataVersions } from '@/lib/scenario/versions';
import type { Scenario } from '@/lib/scenario/scenario';

const QUIET = 'inline-flex min-h-10 items-center font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink';

let versionsOnce: Promise<DataVersions> | null = null;
/** The data's versions, read once a page needs them; unknown ones stay unknown. */
export function useDataVersions(): DataVersions {
  const [v, setV] = useState<DataVersions>(UNKNOWN_VERSIONS);
  useEffect(() => {
    let live = true;
    versionsOnce ??= loadDataVersions().catch(() => UNKNOWN_VERSIONS);
    void versionsOnce.then((x) => live && setV(x));
    return () => {
      live = false;
    };
  }, []);
  return v;
}

/** A file's text: FileReader, which every browser has (and the test page too, where Blob.text is missing). */
function readText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

/** Hands the browser a file to save. */
export function saveFile(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A file's scenarios, ready to load, with the figures it was saved with for the check once they are worked out again. */
export interface Opened {
  scenarios: Scenario[];
  figures: (FileFigures | null)[];
  problem: string | null;
  /** The requirements saved with the file, as one set; absent when it holds none. */
  requirements?: Requirements;
}

/** Whether the figures worked out now are the file's, in one sentence. */
export function checkWords(opened: Opened, now: (FileColumn | null)[]): string | null {
  const pairs = opened.figures.map((f, i) => ({ f, c: now[i] }));
  if (pairs.some(({ c }) => !c?.outcome)) return null;
  const diffs = pairs.flatMap(({ f, c }, i) => (f && c?.outcome ? figureDifferences(f, figuresOf(c.outcome)).map((d) => `${opened.scenarios[i].label}, ${d}`) : []));
  if (opened.figures.every((f) => f === null)) return 'The file holds no figures to check against.';
  return diffs.length === 0 ? 'The figures worked out here match the ones saved in the file.' : `Some figures differ from the file’s, likely from other data or another version: ${diffs.join('; ')}.`;
}

/**
 * The comparison to share and keep: its link (the address carries every setting, and the requirements set), a file of
 * it, a file opened, and the printable comparison brief.
 */
export function ComparisonFiles({ cols, requirements = null, onOpen, check }: { cols: FileColumn[]; requirements?: Requirements | null; onOpen: (o: Opened) => void; check: string | null }) {
  const id = useId();
  const versions = useDataVersions();
  const [copied, setCopied] = useState<string | null>(null);
  const href = comparisonHref(cols.map((c) => c.scenario), '/compare', requirements);
  const copy = async () => {
    const url = `${window.location.origin}${href}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied('Link copied. It holds every setting of every scenario.');
    } catch {
      setCopied(`Copy this link: ${url}`);
    }
  };
  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-2">
      <h2 id={`${id}-h`} className="font-semibold text-ink">
        Share or keep this comparison
      </h2>
      <p className="flex flex-wrap items-center gap-x-6 gap-y-1">
        {cols.length > 0 && (
          <>
            <button type="button" onClick={() => void copy()} className={QUIET}>
              Copy the link
            </button>
            <button type="button" onClick={() => saveFile(fileName(cols), `${JSON.stringify(scenarioFile(cols, versions, new Date(), requirements), null, 2)}\n`)} className={QUIET}>
              Save as a file
            </button>
            <Link href={comparisonHref(cols.map((c) => c.scenario), '/compare/brief', requirements)} className={QUIET}>
              Printable comparison brief
            </Link>
          </>
        )}
        <label className={`${QUIET} cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-sun-ink`}>
          Open a scenario file
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              void readText(file).then((text) => {
                const r = readScenarioFile(text);
                onOpen({ scenarios: r.scenarios, figures: r.figures, problem: r.problem, ...(r.requirements ? { requirements: r.requirements } : {}) });
              });
            }}
          />
        </label>
      </p>
      {copied && (
        <p role="status" className="text-[15px] text-ink-2">
          {copied}
        </p>
      )}
      {check && (
        <p role="status" className="text-[15px] text-ink">
          {check}
        </p>
      )}
    </section>
  );
}

import fs from 'node:fs';
import path from 'node:path';

/** Repo root: vitest runs with cwd = web/. */
export const REPO_ROOT = path.resolve(process.cwd(), '..');
export const repoPath = (...parts: string[]): string => path.join(REPO_ROOT, ...parts);
export const hasFile = (...parts: string[]): boolean => fs.existsSync(repoPath(...parts));
export const readJson = <T>(...parts: string[]): T =>
  JSON.parse(fs.readFileSync(repoPath(...parts), 'utf8')) as T;
export const readBytes = (...parts: string[]): Uint8Array =>
  new Uint8Array(fs.readFileSync(repoPath(...parts)));

# Redesign part 1: themes, shell, home page

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Light and dark themes with a header switch, the new header and footer, shared control and panel classes, and the rebuilt home page with a pipeline-rendered shadow picture, while every existing page keeps working in both themes.

**Architecture:** Theme = `data-theme` on `<html>`, set before paint by an inline script and changed by a small client switch; colours are CSS custom properties mapped into Tailwind through `@theme inline`, with the old token names kept as aliases until part 4. The home page is a static server component that reads one generated JSON file (`web/src/lib/data/home.json`) and two generated images; all three are written by a new pipeline command, `home-assets`, whose shadow picture comes from a new reference module, `shadow.py` (one sweep along the Sun's direction, chained from coarse to fine grids).

**Tech Stack:** Next.js 16.3.6 (App Router), React 19, Tailwind 4, vitest 5 + Testing Library, Python 3.12 + numpy + rasterio (JPEG via GDAL), pytest.

**Spec:** `docs/superpowers/specs/2026-10-01-ui-redesign-design.md` (sections 4, 5, 6.1, 8.1). Read the Next guide `web/node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md` before Task 2.

## Global Constraints

- Light is the default theme; `localStorage` key `earthrise.theme`; `?theme=light|dark` wins for the visit (kept in `sessionStorage` key `earthrise.theme.visit`).
- Token values exactly as the table in spec section 4.1; the page colour token is named `--page` in code (Tailwind class `bg-page`), written `--bg` in the spec table.
- No text under 13 px rendered, including SVG text after scaling. Buttons, fields, selects and sliders at least 40 px tall.
- Primary copy never contains "LOLA", "DE440", "Horizons" or "CLPS"; those words are allowed in the footer and on `/validate`.
- No em-dashes in UI copy. Durations in sentences read "16 days 15 hours"; in cards "16 d 15 h".
- Tests first: every new function and component has a test that was seen failing.
- Web gates from `web/`: `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npm run build`. Pipeline gate from `pipeline/`: `uv run pytest -q`.
- React Compiler lint: no `setState` inside effects or during render; external state through `useSyncExternalStore`.
- Next 16: read the matching guide in `web/node_modules/next/dist/docs/` before using an API.
- Bash heredocs on this machine mangle backslashes: write files with the Write tool; run Python from files.
- Commits end with the session's attribution lines; one commit per task.

## Review Focus

1. `localStorage` or `sessionStorage` unavailable (private mode): the theme still applies for the page and the switch still works. Test in Task 2.
2. `?theme=banana` and other junk: ignored, falls through to storage and default. Test in Task 2.
3. Old pages in the light theme: stage pictures (sky dial, 3D overlays) must stay readable; the sky dial's labels are the known risk. Test in Task 3.
4. `home.json` drifting from the validation tables it summarises. Drift test in Task 7.
5. A Sun bearing that is exactly diagonal or exactly along an axis in the shadow sweep (both branches, both signs). Tests in Task 4.

---

### Task 1: Theme tokens, legacy aliases, control and panel classes

**Files:**
- Modify: `web/src/app/globals.css` (rewrite)
- Test: `web/src/app/globals.test.ts` (rewrite)

**Interfaces:**
- Produces: CSS custom properties `--page --surface --surface-2 --line --line-strong --ink --ink-2 --ink-3 --sun --sun-ink --sun-on --sun-hover --earth --earth-ink --good --good-bg --good-line --bad --bad-bg --bad-line --warn --stage --stage-ink --stage-ink-2 --stage-line --stage-sun --stage-earth --hill --hill-edge` in `:root` (light) and `:root[data-theme="dark"]`; legacy aliases `--canvas --panel --sky --night --sun-bright --terrain --terrain-edge`; Tailwind colours of the same names (`bg-page`, `text-ink-2`, `border-line-strong`, `bg-stage`, ...); component classes `.wrap .btn .btn-primary .btn-ink .btn-sm .field .panel .stage` and legacy `.glass .glass-bar`.

- [ ] **Step 1: Write the failing test** (replace the whole file)

```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = fs.readFileSync(path.resolve(process.cwd(), 'src/app/globals.css'), 'utf8');

/** Custom properties declared in the first block that starts with `selector {`. */
function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no block for ${selector}`);
  const body = css.slice(start + selector.length + 2, css.indexOf('\n}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const THEMED = ['--page', '--surface', '--surface-2', '--line', '--line-strong', '--ink', '--ink-2', '--ink-3', '--sun', '--sun-ink', '--sun-hover', '--earth', '--earth-ink', '--good', '--good-bg', '--good-line', '--bad', '--bad-bg', '--bad-line', '--warn'];
const FIXED = ['--sun-on', '--stage', '--stage-ink', '--stage-ink-2', '--stage-line', '--stage-sun', '--stage-earth', '--hill', '--hill-edge'];

describe('theme tokens', () => {
  const light = block(':root');
  const dark = block(':root[data-theme="dark"]');

  it('defines every themed token in both themes and the fixed stage tokens once', () => {
    for (const t of THEMED) {
      expect(light[t], `light ${t}`).toBeTruthy();
      expect(dark[t], `dark ${t}`).toBeTruthy();
    }
    for (const t of FIXED) expect(light[t], t).toBeTruthy();
  });

  it('matches the approved values for the page, ink and the two identity colours', () => {
    expect(light['--page']).toBe('#f3f2ee');
    expect(dark['--page']).toBe('#0b0d11');
    expect(light['--ink']).toBe('#15181d');
    expect(dark['--ink']).toBe('#f4f1ea');
    expect(light['--sun']).toBe('#f2b134');
    expect(dark['--earth']).toBe('#6aa9ff');
  });

  it('meets AA contrast for text in both themes and on the stage', () => {
    for (const [name, t] of [['light', light], ['dark', dark]] as const) {
      const pairs: [string, string][] = [
        ['--ink', '--page'], ['--ink', '--surface'], ['--ink-2', '--surface'], ['--ink-2', '--page'], ['--ink-3', '--surface'], ['--ink-3', '--page'],
        ['--sun-ink', '--surface'], ['--earth-ink', '--surface'], ['--good', '--surface'], ['--bad', '--surface'], ['--warn', '--surface'],
      ];
      for (const [fg, bg] of pairs) expect(contrast(t[fg], t[bg]), `${name} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(light['--sun-on'], t['--sun']), `${name} text on the Sun fill`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(light['--stage-ink'], light['--stage'])).toBeGreaterThanOrEqual(7);
    expect(contrast(light['--stage-ink-2'], light['--stage'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light['--stage-ink'], light['--hill'])).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the old token names as aliases until the last old component is gone', () => {
    expect(light['--canvas']).toBe('var(--page)');
    expect(light['--panel']).toBe('var(--surface)');
    expect(light['--sky']).toBe('var(--stage)');
  });
});

describe('globals.css layering', () => {
  it('declares the shared classes inside @layer components, so a Tailwind utility can still override them', () => {
    expect(css).not.toMatch(/@utility glass/);
    const joined = (css.match(/@layer components \{([\s\S]*?)\n\}/g) ?? []).join('\n');
    for (const cls of ['.wrap', '.btn', '.btn-primary', '.btn-ink', '.btn-sm', '.field', '.panel', '.stage', '.glass', '.glass-bar']) {
      expect(joined, cls).toMatch(new RegExp(`\\${cls} \\{`));
    }
  });

  it('gives buttons and fields the minimum sizes of the spec', () => {
    expect(css).toMatch(/\.btn \{[^}]*height: 48px/);
    expect(css).toMatch(/\.btn-sm \{[^}]*height: 44px/);
    expect(css).toMatch(/\.field \{[^}]*height: 52px/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/app/globals.test.ts` (from `web/`)
Expected: FAIL, first error "no block for :root[data-theme="dark"]" or a missing `--page`.

- [ ] **Step 3: Rewrite `globals.css`**

```css
@import "tailwindcss";

/* The locked cockpit layout of the old Explore needs room; short screens get the flowing page instead. Removed with it in part 2. */
@custom-variant tall (@media (min-height: 800px));

/*
 * Light is the default theme; data-theme="dark" on <html> swaps the values (set before paint by the
 * inline script in layout.tsx). Picture panels ("stages": charts on black, shadow map, 3D, relief
 * maps) keep the same dark colours in both themes.
 */
:root {
  --page: #f3f2ee;
  --surface: #ffffff;
  --surface-2: #efede7;
  --line: #dfdcd4;
  --line-strong: #c4c0b5;
  --ink: #15181d;
  --ink-2: #414752;
  --ink-3: #636b79;
  --sun: #f2b134;
  --sun-ink: #8a5a00;
  --sun-hover: #e3a323;
  --earth: #2f6fdd;
  --earth-ink: #1f57b8;
  --good: #11794f;
  --good-bg: rgba(17, 121, 79, 0.08);
  --good-line: rgba(17, 121, 79, 0.35);
  --bad: #bf3a2c;
  --bad-bg: rgba(191, 58, 44, 0.07);
  --bad-line: rgba(191, 58, 44, 0.35);
  --warn: #8a5a00;
  --sun-on: #1a1407;
  --stage: #050608;
  --stage-ink: #f4f1ea;
  --stage-ink-2: #c9c3b7;
  --stage-line: #2b3038;
  --stage-sun: #f5b63a;
  --stage-earth: #6aa9ff;
  --hill: #6d6962;
  --hill-edge: #e9e3d7;
  /* Old names, still used by the pages that parts 2 to 4 rebuild. */
  --canvas: var(--page);
  --panel: var(--surface);
  --sky: var(--stage);
  --night: #0a0b0d;
  --sun-bright: #ffc65c;
  --terrain: var(--hill);
  --terrain-edge: #a39e94;
  color-scheme: light;
}

:root[data-theme="dark"] {
  --page: #0b0d11;
  --surface: #14181e;
  --surface-2: #1c2129;
  --line: #272d37;
  --line-strong: #3b4350;
  --ink: #f4f1ea;
  --ink-2: #cbc5b9;
  --ink-3: #9e998f;
  --sun: #f5b63a;
  --sun-ink: #f5b63a;
  --sun-hover: #ffc65c;
  --earth: #6aa9ff;
  --earth-ink: #8dbdff;
  --good: #46c98b;
  --good-bg: rgba(70, 201, 139, 0.1);
  --good-line: rgba(70, 201, 139, 0.4);
  --bad: #ff7d72;
  --bad-bg: rgba(255, 125, 114, 0.09);
  --bad-line: rgba(255, 125, 114, 0.4);
  --warn: #f5b63a;
  color-scheme: dark;
}

@theme inline {
  --color-page: var(--page);
  --color-surface: var(--surface);
  --color-surface-2: var(--surface-2);
  --color-line: var(--line);
  --color-line-strong: var(--line-strong);
  --color-ink: var(--ink);
  --color-ink-2: var(--ink-2);
  --color-ink-3: var(--ink-3);
  --color-sun: var(--sun);
  --color-sun-ink: var(--sun-ink);
  --color-sun-on: var(--sun-on);
  --color-sun-hover: var(--sun-hover);
  --color-earth: var(--earth);
  --color-earth-ink: var(--earth-ink);
  --color-good: var(--good);
  --color-good-bg: var(--good-bg);
  --color-good-line: var(--good-line);
  --color-bad: var(--bad);
  --color-bad-bg: var(--bad-bg);
  --color-bad-line: var(--bad-line);
  --color-warn: var(--warn);
  --color-stage: var(--stage);
  --color-stage-ink: var(--stage-ink);
  --color-stage-ink-2: var(--stage-ink-2);
  --color-stage-line: var(--stage-line);
  --color-stage-sun: var(--stage-sun);
  --color-stage-earth: var(--stage-earth);
  --color-hill: var(--hill);
  --color-canvas: var(--canvas);
  --color-panel: var(--panel);
  --color-sky: var(--sky);
  --color-night: var(--night);
  --color-sun-bright: var(--sun-bright);
  --color-terrain: var(--terrain);
  --font-display: var(--font-bricolage), "Bricolage Grotesque", system-ui, sans-serif;
  --font-text: var(--font-plex), "IBM Plex Sans", system-ui, sans-serif;
}

html {
  background: var(--page);
  color: var(--ink);
  font-family: var(--font-text);
  font-variant-numeric: tabular-nums;
}

:focus-visible {
  outline: 2px solid var(--sun-ink);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  * {
    transition: none !important;
    animation: none !important;
  }
}

/* Shared pieces. They live in the components layer so that any Tailwind utility can still override them. */
@layer components {
  .wrap {
    max-width: 1280px;
    margin-inline: auto;
    padding-inline: 32px;
  }
  @media (max-width: 640px) {
    .wrap {
      padding-inline: 16px;
    }
  }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    height: 48px;
    padding: 0 20px;
    border-radius: 10px;
    border: 1px solid var(--line-strong);
    background: transparent;
    color: var(--ink);
    font-size: 16px;
    font-weight: 500;
    white-space: nowrap;
  }
  .btn:hover {
    background: var(--surface-2);
  }
  .btn:disabled {
    opacity: 0.5;
  }
  .btn-primary {
    background: var(--sun);
    border-color: var(--sun);
    color: var(--sun-on);
    font-weight: 600;
  }
  .btn-primary:hover {
    background: var(--sun-hover);
    border-color: var(--sun-hover);
  }
  .btn-ink {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--page);
    font-weight: 600;
  }
  .btn-ink:hover {
    background: var(--ink-2);
    border-color: var(--ink-2);
  }
  .btn-sm {
    height: 44px;
    padding: 0 16px;
    font-size: 15px;
  }
  .field {
    height: 52px;
    padding: 0 14px;
    border-radius: 10px;
    border: 1px solid var(--line-strong);
    background: var(--surface);
    color: var(--ink);
    font-size: 16px;
  }
  .panel {
    border-radius: 16px;
    border: 1px solid var(--line);
    background: var(--surface);
    padding: 20px 24px;
  }
  .stage {
    position: relative;
    overflow: hidden;
    border-radius: 12px;
    background: var(--stage);
    color: var(--stage-ink);
  }
  /* Old panels: solid surfaces now. Removed in part 4. */
  .glass {
    background: var(--surface);
    border: 1px solid var(--line);
  }
  .glass-bar {
    background: var(--page);
  }
}

/* Printable brief: always a light page (A4 portrait), whatever the theme. */
.brief {
  --page: #ffffff;
  --surface: #ffffff;
  --line: #c8c4bc;
  --ink: #111111;
  --ink-2: #3a3a3a;
  --ink-3: #6a6a6a;
  --good: #157a55;
  --bad: #b83c3c;
  --sun: #a06a00;
  background: var(--page);
  color: var(--ink);
}
@media print {
  .no-print {
    display: none !important;
  }
  @page {
    size: A4 portrait;
    margin: 12mm;
  }
  html,
  body {
    background: #ffffff;
    color: #111111;
  }
}
```

The landing hero keyframes and `.hero-frame*` rules are gone with the old hero (Task 7 removes their last user).

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/app/globals.test.ts`
Expected: PASS (all tests). If a contrast assertion fails, darken or lighten that one token until it passes and note the value in the commit message; do not weaken the assertion.

- [ ] **Step 5: Run the whole web suite and commit**

Run: `npx vitest run` then `npx tsc --noEmit`
Expected: the suite passes except `src/app/page.test.tsx` only if it asserted hero keyframes (it does not); any other failure is a real regression to fix now.

```bash
git add web/src/app/globals.css web/src/app/globals.test.ts
git commit -m "feat(web): light and dark theme tokens, shared control and panel classes"
```

---

### Task 2: Theme rule, inline script, header switch

**Files:**
- Create: `web/src/lib/theme.ts`, `web/src/lib/theme.test.ts`
- Create: `web/src/components/ThemeSwitch.tsx`, `web/src/components/ThemeSwitch.test.tsx`
- Modify: `web/src/app/layout.tsx`

**Interfaces:**
- Produces: `type Theme = 'light' | 'dark'`; `THEME_KEY = 'earthrise.theme'`; `THEME_VISIT_KEY = 'earthrise.theme.visit'`; `DEFAULT_THEME: Theme`; `parseTheme(x: unknown): Theme | null`; `resolveTheme(search: string, visit: string | null, stored: string | null): Theme`; `THEME_SCRIPT: string`; `currentTheme(): Theme`; `applyTheme(theme: Theme): void`; `subscribeTheme(cb: () => void): () => void`; component `ThemeSwitch()`.

- [ ] **Step 1: Write the failing tests**

`web/src/lib/theme.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, currentTheme, DEFAULT_THEME, parseTheme, resolveTheme, subscribeTheme, THEME_KEY, THEME_SCRIPT, THEME_VISIT_KEY } from './theme';

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  window.history.pushState({}, '', '/');
  vi.restoreAllMocks();
});

describe('resolveTheme', () => {
  it('prefers the URL, then the visit, then the stored choice, then light', () => {
    expect(DEFAULT_THEME).toBe('light');
    expect(resolveTheme('', null, null)).toBe('light');
    expect(resolveTheme('', null, 'dark')).toBe('dark');
    expect(resolveTheme('', 'light', 'dark')).toBe('light');
    expect(resolveTheme('?theme=dark', 'light', 'light')).toBe('dark');
  });

  it('ignores anything that is not light or dark', () => {
    expect(parseTheme('banana')).toBeNull();
    expect(parseTheme(null)).toBeNull();
    expect(resolveTheme('?theme=banana', 'purple', 'DARK')).toBe('light');
    expect(resolveTheme('?theme=banana', null, 'dark')).toBe('dark');
  });
});

describe('THEME_SCRIPT', () => {
  const run = () => new Function(THEME_SCRIPT)();

  it('sets data-theme by the same rule as resolveTheme', () => {
    const cases: [string, string | null, string | null][] = [
      ['/', null, null],
      ['/', null, 'dark'],
      ['/?theme=dark', null, 'light'],
      ['/?theme=banana', null, 'dark'],
      ['/', 'dark', 'light'],
    ];
    for (const [url, visit, stored] of cases) {
      window.localStorage.clear();
      window.sessionStorage.clear();
      if (stored) window.localStorage.setItem(THEME_KEY, stored);
      if (visit) window.sessionStorage.setItem(THEME_VISIT_KEY, visit);
      window.history.pushState({}, '', url);
      run();
      expect(document.documentElement.getAttribute('data-theme'), `${url} ${visit} ${stored}`).toBe(resolveTheme(window.location.search, visit, stored));
    }
  });

  it('remembers a theme from the URL for the rest of the visit', () => {
    window.history.pushState({}, '', '/?theme=dark');
    run();
    expect(window.sessionStorage.getItem(THEME_VISIT_KEY)).toBe('dark');
  });

  it('still sets the default when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    run();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});

describe('applyTheme', () => {
  it('sets the attribute, stores the choice, clears the visit override and tells subscribers', () => {
    window.sessionStorage.setItem(THEME_VISIT_KEY, 'light');
    const seen: string[] = [];
    const off = subscribeTheme(() => seen.push(currentTheme()));
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(window.sessionStorage.getItem(THEME_VISIT_KEY)).toBeNull();
    expect(seen).toEqual(['dark']);
    off();
    applyTheme('light');
    expect(seen).toEqual(['dark']);
  });

  it('still switches the page when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    applyTheme('dark');
    expect(currentTheme()).toBe('dark');
  });
});
```

`web/src/components/ThemeSwitch.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { THEME_KEY } from '@/lib/theme';
import { ThemeSwitch } from './ThemeSwitch';

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemeSwitch', () => {
  it('shows which theme is on and switches the page', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    render(<ThemeSwitch />);
    const group = screen.getByRole('group', { name: 'Theme' });
    const light = screen.getByRole('button', { name: 'Light' });
    const dark = screen.getByRole('button', { name: 'Dark' });
    expect(group.contains(light)).toBe(true);
    expect(light.getAttribute('aria-pressed')).toBe('true');
    expect(dark.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(dark);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(dark.getAttribute('aria-pressed')).toBe('true');
  });

  it('re-applies a stored theme after mount (React resets <html> attributes on the Strict Mode remount in development)', () => {
    window.localStorage.setItem(THEME_KEY, 'dark');
    render(<ThemeSwitch />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/theme.test.ts src/components/ThemeSwitch.test.tsx`
Expected: FAIL, "Cannot find module './theme'" and "./ThemeSwitch".

- [ ] **Step 3: Implement**

`web/src/lib/theme.ts`:

```ts
export type Theme = 'light' | 'dark';

/** The stored choice of the header switch. */
export const THEME_KEY = 'earthrise.theme';
/** A theme asked for in the URL (`?theme=dark`) lasts for the visit, so reloads and hard navigations keep it. */
export const THEME_VISIT_KEY = 'earthrise.theme.visit';
export const DEFAULT_THEME: Theme = 'light';

export function parseTheme(x: unknown): Theme | null {
  return x === 'light' || x === 'dark' ? x : null;
}

/** URL, then the visit, then the stored choice, then light. The system preference is not followed (spec 4.1). */
export function resolveTheme(search: string, visit: string | null, stored: string | null): Theme {
  const q = parseTheme(new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('theme'));
  return q ?? parseTheme(visit) ?? parseTheme(stored) ?? DEFAULT_THEME;
}

/**
 * The same rule as plain script text for <head>: it runs while the HTML is parsed, so the page is
 * never painted in the wrong theme. Kept in step with resolveTheme by theme.test.ts.
 */
export const THEME_SCRIPT =
  '(function(){var d=document.documentElement,ok=function(x){return x==="light"||x==="dark"?x:null},q=null,v=null,s=null;' +
  'try{q=ok(new URLSearchParams(location.search).get("theme"))}catch(e){}' +
  `try{if(q)sessionStorage.setItem("${THEME_VISIT_KEY}",q);v=ok(sessionStorage.getItem("${THEME_VISIT_KEY}"))}catch(e){}` +
  `try{s=ok(localStorage.getItem("${THEME_KEY}"))}catch(e){}` +
  `d.setAttribute("data-theme",q||v||s||"${DEFAULT_THEME}")})()`;

const listeners = new Set<() => void>();

export function subscribeTheme(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The theme the page is showing now (the attribute the script or the switch set). */
export function currentTheme(): Theme {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  return parseTheme(document.documentElement.getAttribute('data-theme')) ?? DEFAULT_THEME;
}

function read(storage: 'localStorage' | 'sessionStorage', key: string): string | null {
  try {
    return window[storage].getItem(key);
  } catch {
    return null;
  }
}

/** What the page should show, by the same rule as the inline script. */
export function storedTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  return resolveTheme(window.location.search, read('sessionStorage', THEME_VISIT_KEY), read('localStorage', THEME_KEY));
}

/** Switches the page and remembers the choice; storage may be unavailable (private mode), the page still switches. */
export function applyTheme(theme: Theme, remember = true): void {
  document.documentElement.setAttribute('data-theme', theme);
  if (remember) {
    try {
      window.localStorage.setItem(THEME_KEY, theme);
      window.sessionStorage.removeItem(THEME_VISIT_KEY);
    } catch {
      // the choice applies to this page only
    }
  }
  for (const cb of listeners) cb();
}
```

`web/src/components/ThemeSwitch.tsx`:

```tsx
'use client';
import { useLayoutEffect, useSyncExternalStore } from 'react';
import { applyTheme, currentTheme, DEFAULT_THEME, storedTheme, subscribeTheme, type Theme } from '@/lib/theme';

const OPTIONS: [Theme, string][] = [
  ['light', 'Light'],
  ['dark', 'Dark'],
];

/** Light or dark, in the header. The inline script in <head> sets the theme before paint; this shows and changes it. */
export function ThemeSwitch() {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => DEFAULT_THEME);
  // React clears attributes it does not manage on <html> when Strict Mode remounts in development: put the theme back before paint.
  useLayoutEffect(() => {
    const wanted = storedTheme();
    if (currentTheme() !== wanted || !document.documentElement.hasAttribute('data-theme')) applyTheme(wanted, false);
  }, []);
  return (
    <div role="group" aria-label="Theme" className="flex h-10 overflow-hidden rounded-[10px] border border-line-strong text-sm">
      {OPTIONS.map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={theme === value}
          onClick={() => applyTheme(value)}
          className={`px-3 ${theme === value ? 'bg-ink font-semibold text-page' : 'text-ink-2 hover:bg-surface-2'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
```

`web/src/app/layout.tsx`: add the script and the default attribute, and update the metadata.

```tsx
import type { Metadata } from 'next';
import { Bricolage_Grotesque, IBM_Plex_Sans } from 'next/font/google';
import { DEFAULT_THEME, THEME_SCRIPT } from '@/lib/theme';
import './globals.css';

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  weight: ['500', '600', '700'],
});
const plex = IBM_Plex_Sans({ subsets: ['latin'], variable: '--font-plex', weight: ['400', '500', '600'] });

export const metadata: Metadata = {
  title: 'Earthrise: sunlight and signal forecast for the Moon',
  description:
    'See when a Moon lander has sunlight and a signal. Pick a landing site near the lunar south pole and a date: hours of sunlight, hours of radio contact with Earth, and whether the battery survives the night. NASA Space Apps 2026, team Astroy/Ed.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme={DEFAULT_THEME} suppressHydrationWarning className={`${bricolage.variable} ${plex.variable} h-full`}>
      <head>
        {/* Sets data-theme while the HTML is parsed, before the first paint (Next guide: preventing flash before hydration). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full bg-page text-ink antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/theme.test.ts src/components/ThemeSwitch.test.tsx`
Expected: PASS, 9 tests.

- [ ] **Step 5: Type-check, lint, commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. (If the lint rule objects to `dangerouslySetInnerHTML`, it is the documented Next pattern: keep it and add the rule's disable comment with that reason.)

```bash
git add web/src/lib/theme.ts web/src/lib/theme.test.ts web/src/components/ThemeSwitch.tsx web/src/components/ThemeSwitch.test.tsx web/src/app/layout.tsx
git commit -m "feat(web): theme rule, no-flash script and header switch (light default)"
```

---

### Task 3: Header, footer, old pages readable in both themes

**Files:**
- Modify: `web/src/components/AppFrame.tsx` (rewrite), `web/src/components/AppFrame.test.tsx`
- Create: `web/src/components/BrandMark.tsx`
- Modify: `web/src/components/SkyDome.tsx` (stage colours), `web/src/components/SkyDome.test.tsx` (one assertion)
- Modify: `web/src/components/ExploreView.tsx` (header height in the locked layout: `calc(100vh-3rem)` becomes `calc(100vh-68px)`)

**Interfaces:**
- Consumes: `ThemeSwitch` (Task 2), classes from Task 1.
- Produces: `AppFrame({ children })` with `<header>` (wordmark link "Earthrise", nav "Sections" with links "Explore a site" (`/explore` in this part; part 2 points it to `/sites`), "Compare sites" (`/compare`), "How it works" (`/learn`), "Accuracy" (`/validate`), the theme switch), `<div>` content, `<footer>` with the credits line and the Space Apps line. `NAV` exported for tests. `BrandMark({ size? })`.

- [ ] **Step 1: Update the tests to the new shell (failing)**

Replace the first `describe` in `AppFrame.test.tsx` and keep the demo-gate one:

```tsx
describe('AppFrame', () => {
  it('renders the wordmark, the four sections in plain words, the theme switch and the footer credits', () => {
    render(
      <AppFrame>
        <p>hello</p>
      </AppFrame>,
    );
    expect(screen.getByRole('link', { name: /Earthrise/ }).getAttribute('href')).toBe('/');
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    const links = [...nav.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      ['Explore a site', '/explore'],
      ['Compare sites', '/compare'],
      ['How it works', '/learn'],
      ['Accuracy', '/validate'],
    ]);
    expect(screen.getByRole('group', { name: 'Theme' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Audience' })).toBeNull();
    const footer = screen.getByRole('contentinfo');
    expect(footer.textContent).toMatch(/NASA Lunar Reconnaissance Orbiter/);
    expect(footer.textContent).toMatch(/NASA Space Apps 2026/);
    expect(screen.getByText('hello')).toBeTruthy();
  });

  it('keeps instrument names out of the header', () => {
    render(
      <AppFrame>
        <p>x</p>
      </AppFrame>,
    );
    expect(screen.getByRole('banner').textContent).not.toMatch(/LOLA|DE440|CLPS|Horizons/);
  });
});
```

Add to `SkyDome.test.tsx` (inside its existing describe):

```tsx
  it('draws its labels and rings in stage colours, so the dial stays readable on a light page', () => {
    const { container } = render(<SkyDome mask={mask} series={series} cursor={0} />);
    const html = container.innerHTML;
    expect(html).toContain('var(--stage-ink-2)');
    expect(html).toContain('var(--stage-line)');
    expect(html).not.toContain('var(--ink-2)');
    expect(html).not.toContain('var(--line)');
  });
```

(Use the `mask` and `series` fixtures the file already builds; read the file first and reuse its helper names.)

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/components/AppFrame.test.tsx src/components/SkyDome.test.tsx`
Expected: FAIL: no link "Explore a site"; no `var(--stage-ink-2)`.

- [ ] **Step 3: Implement**

`web/src/components/BrandMark.tsx`:

```tsx
/** A blue disc above a curved horizon line: Earth over the lunar limb. */
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="23.5" cy="9" r="4.8" fill="var(--stage-earth)" />
      <path d="M2 27 C 9 16.5, 23 14.5, 30.5 20" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}
```

`web/src/components/AppFrame.tsx`:

```tsx
import Link from 'next/link';
import { BrandMark } from './BrandMark';
import { DemoModeGate } from './DemoModeGate';
import { ThemeSwitch } from './ThemeSwitch';

/** The four sections in plain words. "Explore a site" opens the site list once part 2 adds it. */
export const NAV = [
  { href: '/explore', label: 'Explore a site' },
  { href: '/compare', label: 'Compare sites' },
  { href: '/learn', label: 'How it works' },
  { href: '/validate', label: 'Accuracy' },
];

/** Header, page, footer. The header is 68 px tall and scrolls with the page; only Explore's time bar is pinned. */
export function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-page">
        <div className="wrap flex h-[68px] items-center gap-9">
          <Link href="/" className="flex items-center gap-2.5 font-display text-[21px] font-bold tracking-tight text-ink">
            <BrandMark />
            Earthrise
            <span className="ml-1.5 hidden whitespace-nowrap font-text text-sm font-normal tracking-normal text-ink-3 xl:inline">sunlight and signal forecast for the Moon</span>
          </Link>
          <nav aria-label="Sections" className="flex gap-7 text-[15px] font-medium">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="whitespace-nowrap text-ink-2 hover:text-ink">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <DemoModeGate />
            <ThemeSwitch />
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-line">
        <div className="wrap flex flex-wrap justify-between gap-x-8 gap-y-2 py-7 text-sm text-ink-3">
          <p>Terrain: NASA Lunar Reconnaissance Orbiter laser altimeter (LOLA). Sun and Earth positions: NASA JPL DE440. Cross-check: JPL Horizons.</p>
          <p>NASA Space Apps 2026, challenge "CLPS Lunar Mission Browser", team Astroy/Ed.</p>
        </div>
      </footer>
    </div>
  );
}
```

The wordmark link's accessible name is "Earthrise sunlight and signal forecast for the Moon" (the hidden span is still in the name), which is why the test matches `/Earthrise/`.

`SkyDome.tsx`: replace every `var(--ink-2)` with `var(--stage-ink-2)`, `var(--line)` with `var(--stage-line)`, `var(--earth)` with `var(--stage-earth)`, `var(--sun-bright)` and `var(--sun)` with `var(--stage-sun)`. `ExploreView.tsx`: `lg:tall:h-[calc(100vh-3rem)]` becomes `lg:tall:h-[calc(100vh-68px)]`.

- [ ] **Step 4: Run the tests, then the suite**

Run: `npx vitest run src/components/AppFrame.test.tsx src/components/SkyDome.test.tsx` then `npx vitest run`
Expected: PASS. Other component tests that looked for the nav labels "Explore" or "Compare" by exact name, or for the Audience group in the header, fail now: update those assertions to the new labels in the same commit and list each in the commit body. `AudienceToggle.tsx` stays in the tree (Learn mode is still reachable from `/learn` until part 2).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/AppFrame.tsx web/src/components/AppFrame.test.tsx web/src/components/BrandMark.tsx web/src/components/SkyDome.tsx web/src/components/SkyDome.test.tsx web/src/components/ExploreView.tsx
git commit -m "feat(web): header with plain section names and theme switch, footer credits; sky dial in stage colours"
```

---

### Task 4: Shadow sweep reference (pipeline)

**Files:**
- Create: `pipeline/lunar_pipeline/shadow.py`
- Test: `pipeline/tests/test_shadow.py`

**Interfaces:**
- Produces:
  - `grid_xy(shape: tuple[int, int], px_m: float, site_col: float, site_row: float) -> tuple[np.ndarray, np.ndarray]` map metres of every pixel centre, x to the right, y up, site at the origin.
  - `tangent_heights(heights_m, x_m, y_m, r_moon_m=config.R_MOON_M) -> np.ndarray` (heights minus r²/2R).
  - `sweep(z_t, x_m, y_m, bearing_deg, el_deg, seed=None) -> tuple[np.ndarray, np.ndarray, np.ndarray]` returning `(lit, m_before, margin)`: `lit` bool, `m_before` the highest sight-line intercept strictly sunward of each pixel on its line (−inf at the sunward edge without a seed), `margin = m_before − g` in metres (positive in shadow). `seed(x, y) -> array` gives the starting value of a line that enters the grid at map position (x, y).
  - `Level` dataclass `(heights_m, px_m, site_col, site_row)`; `seed_from(level_xy_m_before...)` is internal.
  - `cast(levels: list[Level], bearing_deg, el_deg) -> tuple[np.ndarray, np.ndarray]`: sweeps the levels coarse to fine, each seeded from the one before, and returns `(lit, margin)` of the finest.
  - `shade(heights_m, px_m, margin_m, bearing_deg, el_deg, soft_m=6.0) -> np.ndarray` uint8 picture (north-up).
  - `sun_bearing_deg(lon_deg: float, sun_az_deg: float) -> float` = `(lon + az) % 360`: on the south polar stereographic grids true north at longitude λ points along (sin λ, cos λ), so a direction of azimuth A has map bearing λ + A clockwise from map-up.

- [ ] **Step 1: Write the failing tests**

```python
import numpy as np
import pytest

from lunar_pipeline import config
from lunar_pipeline.shadow import Level, cast, grid_xy, shade, sun_bearing_deg, sweep, tangent_heights


def flat(h=64, w=80, px=20.0):
    z = np.zeros((h, w))
    x, y = grid_xy(z.shape, px, (w - 1) / 2, (h - 1) / 2)
    return z, x, y, px


def test_grid_xy_puts_the_site_at_the_origin_with_y_up():
    x, y = grid_xy((3, 5), 10.0, 2.0, 1.0)
    assert x[1, 2] == 0.0 and y[1, 2] == 0.0
    assert x[0, 4] == 20.0 and y[0, 4] == 10.0  # right and up
    assert y[2, 0] == -10.0


def test_flat_ground_is_lit_when_the_sun_is_up_and_dark_when_it_is_down():
    z, x, y, _ = flat()
    for bearing in (0.0, 45.0, 90.0, 135.0, 180.0, 225.0, 270.0, 315.0, 12.5, 298.0):
        lit, _, _ = sweep(z, x, y, bearing, 3.0)
        assert lit.all(), bearing
        dark, _, _ = sweep(z, x, y, bearing, -3.0)
        # every pixel with ground further towards the Sun on its line is in shadow
        assert dark.mean() < 0.06, bearing


def test_every_pixel_is_decided_exactly_once_for_any_bearing():
    z, x, y, _ = flat(37, 53)
    for bearing in np.arange(0.0, 360.0, 7.5):
        _, m_before, _ = sweep(z, x, y, float(bearing), 2.0)
        assert np.isfinite(m_before).sum() + np.isneginf(m_before).sum() == z.size
        assert not np.isnan(m_before).any()


@pytest.mark.parametrize("bearing,axis,sign", [(90.0, 1, -1), (270.0, 1, 1), (0.0, 0, 1), (180.0, 0, -1)])
def test_a_wall_casts_a_shadow_of_height_over_tan_elevation(bearing, axis, sign):
    z, x, y, px = flat(121, 121)
    wall = 60
    if axis == 1:
        z[:, wall] = 100.0
    else:
        z[wall, :] = 100.0
    lit, _, _ = sweep(z, x, y, bearing, 5.0)
    length_px = 100.0 / np.tan(np.radians(5.0)) / px  # 57.2 px
    line = lit[60, :] if axis == 1 else lit[:, 60]
    inside = wall + sign * int(length_px - 3)
    outside = wall + sign * int(length_px + 3)
    assert not line[inside], "just inside the shadow"
    assert line[outside], "just beyond the shadow"
    assert line[wall], "the wall top is lit"
    assert line[wall - sign * 5], "the sunward side is lit"


def test_diagonal_sun_casts_along_the_diagonal():
    z, x, y, px = flat(121, 121)
    z[60, 60] = 200.0  # a spike
    lit, _, _ = sweep(z, x, y, 45.0, 5.0)  # Sun to the upper right: shadow to the lower left
    assert not lit[60 + 20, 60 - 20]
    assert lit[60 - 20, 60 + 20]
    assert lit[60 + 20, 60 + 20]


def test_seed_carries_terrain_from_outside_the_grid():
    z, x, y, px = flat(41, 81)
    el = 5.0
    # A 100 m wall 400 m beyond the right edge (the Sun is to the right): its sight-line intercept.
    edge_x = x[0, -1]
    wall_x = edge_x + 400.0
    g_wall = 100.0 - wall_x * np.tan(np.radians(el))
    lit, _, _ = sweep(z, x, y, 90.0, el, seed=lambda xs, ys: np.full(xs.shape, g_wall))
    reach = 100.0 / np.tan(np.radians(el))  # shadow ends this far left of the wall
    end_x = wall_x - reach
    col_end = int(round((end_x - x[0, 0]) / px))
    assert not lit[20, col_end + 3]
    assert lit[20, col_end - 3]


def test_cast_chains_a_coarse_level_into_a_fine_one():
    px_c, px_f = 80.0, 20.0
    coarse = np.zeros((101, 101))
    coarse[:, 80] = 300.0  # a ridge 2.4 km to the right of the site, outside the fine window
    fine = np.zeros((101, 101))  # 2 km across
    levels = [Level(coarse, px_c, 50.0, 50.0), Level(fine, px_f, 50.0, 50.0)]
    lit, margin = cast(levels, 90.0, 4.0)
    # shadow of the ridge reaches 300 / tan(4 deg) = 4290 m to the left: the whole fine window (x from -1000 to +1000) is in it
    assert not lit.any()
    lit_high, _ = cast(levels, 90.0, 12.0)  # reach 1411 m: ends at x = 2400 - 1411 = 989 m, the fine window's right edge
    assert lit_high[:, :95].all()
    assert margin.shape == fine.shape


def test_curvature_hides_the_sun_behind_the_bulge_of_the_moon():
    # 400 km of flat (constant radius) ground: with the Sun 0.5 deg up at the site, ground 300 km towards the Sun is below the sight line,
    # so it does not shadow the site; with the Sun 0.5 deg below the horizon the site is dark.
    z = np.zeros((1, 801))
    x, y = grid_xy(z.shape, 500.0, 400.0, 0.0)
    zt = tangent_heights(z, x, y)
    assert zt[0, 400] == 0.0 and zt[0, 800] == pytest.approx(-(200_000.0**2) / (2 * config.R_MOON_M))
    lit, _, _ = sweep(zt, x, y, 90.0, 0.5)
    assert lit[0, 400]
    dark, _, _ = sweep(zt, x, y, 90.0, -0.5)
    assert not dark[0, 400]


def test_sun_bearing_adds_the_longitude_on_the_south_polar_grid():
    assert sun_bearing_deg(0.0, 90.0) == 90.0
    assert sun_bearing_deg(-64.31, 312.18) == pytest.approx(247.87)
    assert sun_bearing_deg(170.0, 200.0) == pytest.approx(10.0)


def test_shade_is_bright_on_sunward_slopes_and_keeps_shape_in_shadow():
    h, w, px = 64, 64, 20.0
    cols = np.arange(w)
    z = np.tile(np.where(cols < 32, cols * 8.0, (63 - cols) * 8.0), (h, 1)).astype(float)  # a ridge running up-down
    x, y = grid_xy(z.shape, px, 31.5, 31.5)
    lit, _, margin = sweep(z, x, y, 90.0, 10.0)
    img = shade(z, px, margin, 90.0, 10.0)
    assert img.dtype == np.uint8 and img.shape == z.shape
    assert img[32, 45] > img[32, 15] + 60  # the slope facing the Sun is much brighter than the one facing away
    assert img[32, 15] > 5  # shadowed ground is not pure black
```

- [ ] **Step 2: Run to see them fail**

Run: `uv run pytest tests/test_shadow.py -q` (from `pipeline/`)
Expected: FAIL at import: "No module named 'lunar_pipeline.shadow'".

- [ ] **Step 3: Implement `shadow.py`**

```python
"""Exact Sun shadows on a height grid, by one sweep along the Sun's direction.

A pixel is lit when no terrain further towards the Sun on its line rises above the line from that
pixel to the Sun. With heights lowered by r^2/2R (r from the site) sight lines over the curved Moon
are straight, so along a line towards the Sun the test is a running maximum of

    g = tangent height - (distance towards the Sun) * tan(elevation).

Grids are north-up rasters of the south polar stereographic maps (row 0 at the top, map-up is the
longitude 0 direction). Lines follow the Sun's bearing with one pixel per step along the major axis;
every pixel belongs to exactly one line. Levels are chained from coarse to fine: a fine line starts
from the coarse level's running maximum where it enters the fine window, so hills outside the window
still cast their shadows into it. The browser engine mirrors this module (web/src/lib/engine/shadow.ts
from part 3 of the redesign).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import numpy as np

from . import config

Seed = Callable[[np.ndarray, np.ndarray], np.ndarray]


@dataclass(frozen=True)
class Level:
    """One height grid: heights in metres, pixel size, and the site as a fractional pixel."""

    heights_m: np.ndarray
    px_m: float
    site_col: float
    site_row: float


def sun_bearing_deg(lon_deg: float, sun_az_deg: float) -> float:
    """Map bearing of the Sun, clockwise from map-up, for a site at this longitude.

    On the south polar grids x = rho sin(lon), y = rho cos(lon): true north at longitude L points
    along (sin L, cos L) and true east along (cos L, -sin L), so azimuth A maps to bearing L + A.
    """
    return float((lon_deg + sun_az_deg) % 360.0)


def grid_xy(shape: tuple[int, int], px_m: float, site_col: float, site_row: float) -> tuple[np.ndarray, np.ndarray]:
    """Map metres of every pixel centre: x to the right, y up, the site at the origin."""
    rows, cols = np.indices(shape, dtype=np.float64)
    return (cols - site_col) * px_m, (site_row - rows) * px_m


def tangent_heights(heights_m: np.ndarray, x_m: np.ndarray, y_m: np.ndarray, r_moon_m: float = config.R_MOON_M) -> np.ndarray:
    """Heights in the site's tangent plane: lowered by r^2/2R so that straight lines are sight lines."""
    return np.asarray(heights_m, dtype=np.float64) - (x_m * x_m + y_m * y_m) / (2.0 * r_moon_m)


def sweep(
    z_t: np.ndarray, x_m: np.ndarray, y_m: np.ndarray, bearing_deg: float, el_deg: float, seed: Seed | None = None
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Lit mask, the running maximum before each pixel, and the shadow margin (m) for one grid.

    `seed(x, y)` gives the starting maximum of the lines that enter the grid at those map positions
    (their first pixel on the sunward side); without it lines start at -inf.
    """
    h, w = z_t.shape
    b = np.radians(bearing_deg)
    sx, sy = float(np.sin(b)), float(np.cos(b))  # towards the Sun in map x (right) and y (up)
    g = z_t - (x_m * sx + y_m * sy) * np.tan(np.radians(el_deg))
    m_before = np.full((h, w), -np.inf)
    ux, uy = sx, -sy  # the same direction in grid steps: columns to the right, rows downwards

    if abs(ux) >= abs(uy):
        slope = uy / ux  # rows per column
        start = w - 1 if ux > 0 else 0
        order = range(w - 1, -1, -1) if ux > 0 else range(w)
        span = int(np.ceil(abs(slope) * (w - 1))) + 1
        m = np.full(h + 2 * span, -np.inf)
        entered = np.zeros(h + 2 * span, dtype=bool)
        for c in order:
            lo = span - int(np.floor(slope * (c - start) + 0.5))  # line index of row 0 in this column
            view = slice(lo, lo + h)
            if seed is not None:
                new = ~entered[view]
                if new.any():
                    m[view][new] = seed(x_m[new, c], y_m[new, c])
            entered[view] = True
            gc = g[:, c]
            m_before[:, c] = m[view]
            m[view] = np.maximum(m[view], gc)
    else:
        slope = ux / uy  # columns per row
        start = h - 1 if uy > 0 else 0
        order = range(h - 1, -1, -1) if uy > 0 else range(h)
        span = int(np.ceil(abs(slope) * (h - 1))) + 1
        m = np.full(w + 2 * span, -np.inf)
        entered = np.zeros(w + 2 * span, dtype=bool)
        for r in order:
            lo = span - int(np.floor(slope * (r - start) + 0.5))
            view = slice(lo, lo + w)
            if seed is not None:
                new = ~entered[view]
                if new.any():
                    m[view][new] = seed(x_m[r, new], y_m[r, new])
            entered[view] = True
            gr = g[r, :]
            m_before[r, :] = m[view]
            m[view] = np.maximum(m[view], gr)

    margin = m_before - g
    return margin <= 0.0, m_before, margin


def _seed_from(level: Level, m_before: np.ndarray) -> Seed:
    """Starting maxima for a finer grid: the coarse running maximum at the coarse pixel under each entry point."""
    h, w = m_before.shape

    def seed(x: np.ndarray, y: np.ndarray) -> np.ndarray:
        col = np.floor(x / level.px_m + level.site_col + 0.5).astype(np.int64)
        row = np.floor(level.site_row - y / level.px_m + 0.5).astype(np.int64)
        ok = (col >= 0) & (col < w) & (row >= 0) & (row < h)
        out = np.full(x.shape, -np.inf)
        out[ok] = m_before[row[ok], col[ok]]
        return out

    return seed


def cast(levels: list[Level], bearing_deg: float, el_deg: float) -> tuple[np.ndarray, np.ndarray]:
    """Sweeps the levels from coarse to fine, each seeded from the one before; returns (lit, margin) of the finest."""
    if not levels:
        raise ValueError("cast needs at least one level")
    seed: Seed | None = None
    lit = margin = None
    for level in levels:
        x, y = grid_xy(level.heights_m.shape, level.px_m, level.site_col, level.site_row)
        z_t = tangent_heights(level.heights_m, x, y)
        lit, m_before, margin = sweep(z_t, x, y, bearing_deg, el_deg, seed)
        seed = _seed_from(level, m_before)
    return lit, margin


def shade(heights_m: np.ndarray, px_m: float, margin_m: np.ndarray, bearing_deg: float, el_deg: float, soft_m: float = 6.0) -> np.ndarray:
    """A north-up 8-bit picture: sunlit slopes by the angle to the Sun, shadows with a faint fixed fill so shape survives."""
    z = np.asarray(heights_m, dtype=np.float64)
    gy, gx = np.gradient(z, px_m)  # gy along rows (downwards), gx along columns
    nx, ny, nz = -gx, gy, np.ones_like(z)  # map x right, y up
    norm = np.sqrt(nx * nx + ny * ny + nz * nz)
    b, el = np.radians(bearing_deg), np.radians(el_deg)
    lx, ly, lz = np.sin(b) * np.cos(el), np.cos(b) * np.cos(el), np.sin(el)
    direct = np.clip((nx * lx + ny * ly + nz * lz) / norm, 0.0, None)
    lit = np.clip(0.5 - margin_m / soft_m, 0.0, 1.0)  # soft edge over a few metres of margin
    fill_b = np.radians(40.0)
    fill = np.clip((nx * np.sin(fill_b) * 0.5 + ny * np.cos(fill_b) * 0.5 + nz * 0.866) / norm, 0.0, 1.0)
    sunlit = direct[lit > 0.5]
    k = 1.0 / max(float(np.percentile(sunlit, 92)), 1e-3) if sunlit.size else 1.0
    tone = 1.0 - np.exp(-1.9 * np.clip(direct * k, 0.0, 1.6) * lit)
    return np.clip(255.0 * (0.035 + 0.085 * fill + 0.9 * tone), 0, 255).astype(np.uint8)
```

Note on `m[view][new] = ...`: `m[view]` is a basic slice (a view), so the masked assignment writes into `m`.

- [ ] **Step 4: Run the tests**

Run: `uv run pytest tests/test_shadow.py -q`
Expected: PASS, 13 tests (four from the parametrised wall test). If the wall test is off by more than the ±3 px tolerance, the bug is in the sweep direction or the sign of `uy`; fix the code, not the tolerance.

- [ ] **Step 5: Lint and commit**

Run: `uv run ruff check lunar_pipeline/shadow.py tests/test_shadow.py`
Expected: clean.

```bash
git add pipeline/lunar_pipeline/shadow.py pipeline/tests/test_shadow.py
git commit -m "feat(pipeline): exact Sun shadows on a height grid by one sweep, chained coarse to fine"
```

---

### Task 5: `home-assets` command: hero picture, relief map, home facts

**Files:**
- Create: `pipeline/lunar_pipeline/home_assets.py`
- Test: `pipeline/tests/test_home_assets.py`
- Modify: `pipeline/lunar_pipeline/cli.py` (new subcommand `home-assets`), `pipeline/tests/test_cli.py` (expects it)
- Generated and committed: `web/public/hero/de-gerlache-rim-2.jpg`, `web/public/maps/south-pole-relief.jpg`, `web/src/lib/data/home.json`

**Interfaces:**
- Consumes: `shadow.Level`, `shadow.cast`, `shadow.shade`, `shadow.sun_bearing_deg` (Task 4); `terrain3d.window_heights`; `masks.load_grids`, `masks.load_mask`; `ephemeris.load_table`; `geometry.azel_from_body_vectors`; `horizon.mask_at_azimuth`; `illumination.disk_fraction`, `sun_radius_deg`.
- Produces:
  - `HERO_SITE = "de_gerlache_rim_2"`, `HERO_RIM = "de_gerlache_center_rim_high"`, `HERO_START = "2027-01-01T00:00:00"`, `HERO_HOURS = 720`, `HERO_FRAME_HOUR = 30`.
  - `sky_series(site, mask, table, header, start_utc, hours) -> dict` with float lists `sun_az`, `sun_el`, `hill_el` (skyline at the Sun's azimuth), `lit` (0/1), plus `sunlit_pct`.
  - `night(lit) -> dict | None` the longest run of unlit hours: `{"sunset_hour", "sunrise_hour", "hours"}` (`sunrise_hour` is the first lit hour after it, or the series length).
  - `distance_km(lat1, lon1, lat2, lon2) -> float` on the Moon's sphere.
  - `facts(horizons: dict, mazarico: dict, backcasts: dict) -> dict` with `horizons_worst_el_deg`, `horizons_rows`, `sun_disc_ratio`, `mazarico_median_points`, `mazarico_sites`, `mazarico_within5`, `mazarico_worst_points`, `blue_ghost_end_minus_sunset_h`.
  - `relief_image(grid: LolaGrid, half_km: float, block: int) -> np.ndarray` uint8 hillshade; `relief_pins(sites, half_km) -> list[dict]` with `id`, `u`, `v` in 0..1 (u to the right, v down).
  - `hero_levels(site, grids) -> list[Level]` (240 m, 80 m, 20 m windows of 1024 px, coarse to fine); `hero_image(site, grids, sun_az_deg, sun_el_deg) -> tuple[np.ndarray, dict]`.
  - `write_jpeg(path, image_u8, quality=86) -> Path`.
  - `write_all(web_dir: Path = config.REPO_ROOT / "web") -> list[Path]`.
- `home.json` shape (consumed by Task 6 and Task 7):

```json
{
  "generated_utc": "2026-10-01T12:00:00+00:00",
  "hero": {"site_id": "de_gerlache_rim_2", "name": "de Gerlache Rim 2", "image": "/hero/de-gerlache-rim-2.jpg", "frame_utc": "2027-01-02T06:00:00", "window_km": 20.48, "sun_bearing_deg": 247.9, "lit_fraction": 0.55},
  "sky": {"start_utc": "2027-01-01T00:00:00", "hours": 720, "sun_az": [], "sun_el": [], "hill_el": [], "lit": [], "sunlit_pct": 44.6, "night": {"sunset_hour": 67, "sunrise_hour": 466, "hours": 399}},
  "pair": {"site_sun_pct": 44.6, "rim_site_id": "de_gerlache_center_rim_high", "rim_sun_pct": 100.0, "distance_km": 12.1},
  "facts": {"horizons_worst_el_deg": 2.7e-05, "horizons_rows": 300, "sun_disc_ratio": 19741, "mazarico_median_points": 2.63, "mazarico_sites": 15, "mazarico_within5": 11, "mazarico_worst_points": 10.81, "blue_ghost_end_minus_sunset_h": 2.4},
  "relief": {"image": "/maps/south-pole-relief.jpg", "half_km": 250.0, "sites": [{"id": "south_pole", "u": 0.5, "v": 0.5}]}
}
```

- [ ] **Step 1: Write the failing tests**

```python
import json

import numpy as np
import pytest

from lunar_pipeline import home_assets
from lunar_pipeline.cli import build_parser
from lunar_pipeline.home_assets import distance_km, facts, night, relief_pins, write_jpeg
from lunar_pipeline.sites import Site
from tests.conftest import needs_lola


def test_night_finds_the_longest_unlit_run_and_the_sunrise_after_it():
    lit = [1, 1, 0, 0, 0, 1, 0, 1, 1]
    assert night(lit) == {"sunset_hour": 2, "sunrise_hour": 5, "hours": 3}
    assert night([1, 1, 1]) is None
    assert night([1, 0, 0]) == {"sunset_hour": 1, "sunrise_hour": 3, "hours": 2}


def test_distance_on_the_moon_between_the_hero_site_and_the_crater_rim():
    assert distance_km(-88.28, -64.31, -88.66401, -68.40606) == pytest.approx(12.1, abs=0.2)
    assert distance_km(-90.0, 0.0, -89.0, 123.0) == pytest.approx(30.32, abs=0.05)


def test_facts_summarise_the_three_validation_tables():
    horizons = {"n_rows": 300, "max_abs_delta_el_deg": 2.7e-5}
    mazarico = {"rows": [
        {"site_id": "a", "covered": True, "delta_points": 1.0},
        {"site_id": "b", "covered": True, "delta_points": -4.0},
        {"site_id": "c", "covered": True, "delta_points": 10.8},
        {"site_id": "d", "covered": False},
    ]}
    backcasts = {"rows": [{"site_id": "im2_athena", "end_minus_sunset_h": -299.0}, {"site_id": "blue_ghost_m1", "end_minus_sunset_h": 2.41}]}
    f = facts(horizons, mazarico, backcasts)
    assert f["horizons_worst_el_deg"] == 2.7e-5 and f["horizons_rows"] == 300
    assert f["sun_disc_ratio"] == pytest.approx(0.533 / 2.7e-5, rel=0.01)
    assert f["mazarico_sites"] == 3 and f["mazarico_within5"] == 2
    assert f["mazarico_median_points"] == 4.0 and f["mazarico_worst_points"] == 10.8
    assert f["blue_ghost_end_minus_sunset_h"] == 2.4


def test_relief_pins_place_the_pole_at_the_centre_and_east_longitudes_to_the_right():
    sites = [
        Site("south_pole", "Pole", -90.0, 0.0, "reference", True, "x"),
        Site("east", "East", -88.0, 90.0, "classic", True, "x"),
        Site("zero", "Zero", -88.0, 0.0, "classic", True, "x"),
        Site("far", "Far", 18.0, 61.0, "clps_landed", False, "x"),
    ]
    pins = {p["id"]: p for p in relief_pins(sites, 250.0)}
    assert pins["south_pole"]["u"] == 0.5 and pins["south_pole"]["v"] == 0.5
    assert pins["east"]["u"] > 0.6 and pins["east"]["v"] == pytest.approx(0.5, abs=1e-6)
    assert pins["zero"]["v"] < 0.4 and pins["zero"]["u"] == pytest.approx(0.5, abs=1e-6)  # longitude 0 is up
    assert "far" not in pins


def test_write_jpeg_writes_a_grayscale_jpeg(tmp_path):
    img = (np.arange(64 * 48) % 256).astype(np.uint8).reshape(48, 64)
    path = write_jpeg(tmp_path / "x.jpg", img)
    data = path.read_bytes()
    assert data[:2] == b"\xff\xd8" and len(data) > 200
    assert not (tmp_path / "x.jpg.aux.xml").exists()


def test_cli_lists_the_home_assets_command():
    args = build_parser().parse_args(["home-assets"])
    assert args.cmd == "home-assets"


@pytest.mark.data
@needs_lola
def test_write_all_produces_the_picture_the_map_and_the_facts(tmp_path):
    (tmp_path / "public").mkdir()
    (tmp_path / "src" / "lib" / "data").mkdir(parents=True)
    paths = home_assets.write_all(tmp_path)
    names = sorted(p.name for p in paths)
    assert names == ["de-gerlache-rim-2.jpg", "home.json", "south-pole-relief.jpg"]
    doc = json.loads((tmp_path / "src" / "lib" / "data" / "home.json").read_text(encoding="utf-8"))
    sky = doc["sky"]
    assert sky["hours"] == 720 and len(sky["sun_el"]) == 720 and len(sky["hill_el"]) == 720 and len(sky["lit"]) == 720
    assert sky["sunlit_pct"] == pytest.approx(44.6, abs=0.2)
    assert sky["night"]["hours"] == 399 and sky["night"]["sunset_hour"] == 67 and sky["night"]["sunrise_hour"] == 466
    assert doc["pair"]["rim_sun_pct"] == 100.0 and doc["pair"]["distance_km"] == pytest.approx(12.1, abs=0.2)
    assert 0.3 < doc["hero"]["lit_fraction"] < 0.8
    assert doc["hero"]["frame_utc"] == "2027-01-02T06:00:00"
    ids = {s["id"] for s in doc["relief"]["sites"]}
    assert {"south_pole", "de_gerlache_rim_2", "malapert_massif"} <= ids and "blue_ghost_m1" not in ids
    assert doc["facts"]["horizons_rows"] == 300
```

(Read `tests/conftest.py` for the exact name and meaning of `needs_lola` before writing; if the hero also needs the ephemeris table and masks, those are committed under `data/` and need no marker.)

- [ ] **Step 2: Run to see them fail**

Run: `uv run pytest tests/test_home_assets.py -q`
Expected: FAIL at import: "cannot import name 'home_assets'".

- [ ] **Step 3: Implement `home_assets.py`, add the CLI command**

```python
"""Pictures and numbers for the web home page and the site list: written once, committed with the web app.

- web/public/hero/de-gerlache-rim-2.jpg: the shadow map of the hero site at one hour (shadow.py).
- web/public/maps/south-pole-relief.jpg: a relief map of the south pole, 500 km across.
- web/src/lib/data/home.json: the hero site's month of Sun heights, the validation headline figures,
  the pin positions on the relief map.
"""

from __future__ import annotations

import json
import statistics
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from . import config
from .ephemeris import load_table
from .geometry import azel_from_body_vectors, ps_south_xy_m
from .horizon import mask_at_azimuth
from .illumination import disk_fraction, sun_radius_deg
from .lola import LolaGrid
from .masks import load_grids, load_mask
from .shadow import Level, cast, shade, sun_bearing_deg
from .sites import Site, all_sites
from .terrain3d import window_heights

HERO_SITE = "de_gerlache_rim_2"
HERO_RIM = "de_gerlache_center_rim_high"
HERO_START = "2027-01-01T00:00:00"
HERO_HOURS = 720
HERO_FRAME_HOUR = 30
HERO_PX = 1024
RELIEF_HALF_KM = 250.0
SUN_DIAMETER_DEG = 0.533  # the Sun's mean angular width from the Moon


def _utc(text: str) -> datetime:
    return datetime.fromisoformat(text).replace(tzinfo=timezone.utc)


def sky_series(site: Site, mask: np.ndarray, table: np.ndarray, header: dict, start_utc: str, hours: int) -> dict:
    """Hourly Sun direction and the height of the hills in that direction, on the ephemeris grid."""
    i0 = int(round((_utc(start_utc) - _utc(header["t0_utc"])).total_seconds() / header["step_s"]))
    if i0 < 0 or i0 + hours > header["n"]:
        raise ValueError("requested span is outside the ephemeris table")
    rows = table[i0 : i0 + hours].astype(np.float64)
    sun_az, sun_el = azel_from_body_vectors(rows[:, 0, :], site.lat, site.lon, 0.0)
    hill = mask_at_azimuth(mask, sun_az)
    frac = disk_fraction(sun_el - hill, sun_radius_deg(np.linalg.norm(rows[:, 0, :], axis=1)))
    lit = frac > 0.0
    r2 = lambda a: [round(float(v), 2) for v in a]  # noqa: E731
    return {"sun_az": r2(sun_az), "sun_el": r2(sun_el), "hill_el": r2(hill), "lit": [int(v) for v in lit], "sunlit_pct": round(100.0 * float(lit.mean()), 1)}


def night(lit) -> dict | None:
    """The longest run of unlit hours: where it starts, the first lit hour after it, its length."""
    best: tuple[int, int] | None = None
    start = -1
    flags = [bool(v) for v in lit] + [True]
    for h, v in enumerate(flags):
        if not v and start < 0:
            start = h
        if v and start >= 0:
            if best is None or h - start > best[1] - best[0]:
                best = (start, h)
            start = -1
    if best is None:
        return None
    return {"sunset_hour": best[0], "sunrise_hour": best[1], "hours": best[1] - best[0]}


def distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance on the Moon's reference sphere."""
    p1, p2, dl = np.radians(lat1), np.radians(lat2), np.radians(lon2 - lon1)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return float(2 * config.R_MOON_M / 1000.0 * np.arcsin(np.sqrt(a)))


def facts(horizons: dict, mazarico: dict, backcasts: dict) -> dict:
    """The three headline figures of the Accuracy page, for the home page."""
    covered = [abs(r["delta_points"]) for r in mazarico["rows"] if r.get("covered") and r.get("delta_points") is not None]
    ghost = next(r for r in backcasts["rows"] if r["site_id"] == "blue_ghost_m1")
    worst = float(horizons["max_abs_delta_el_deg"])
    return {
        "horizons_worst_el_deg": worst,
        "horizons_rows": int(horizons["n_rows"]),
        "sun_disc_ratio": int(round(SUN_DIAMETER_DEG / worst)),
        "mazarico_median_points": round(float(statistics.median(covered)), 2),
        "mazarico_sites": len(covered),
        "mazarico_within5": sum(1 for d in covered if d <= 5.0),
        "mazarico_worst_points": round(max(covered), 2),
        "blue_ghost_end_minus_sunset_h": round(float(ghost["end_minus_sunset_h"]), 1),
    }


def relief_pins(sites: list[Site], half_km: float = RELIEF_HALF_KM) -> list[dict]:
    """Sites inside the map as fractions of its width (u, to the right) and height (v, downwards)."""
    out = []
    for s in sites:
        if not s.polar:
            continue
        x, y = ps_south_xy_m(s.lat, s.lon)
        u = 0.5 + (float(x) / 1000.0) / (2 * half_km)
        v = 0.5 - (float(y) / 1000.0) / (2 * half_km)
        if 0.02 < u < 0.98 and 0.02 < v < 0.98:
            out.append({"id": s.id, "u": round(u, 4), "v": round(v, 4)})
    return out


def relief_image(grid: LolaGrid, half_km: float = RELIEF_HALF_KM, block: int = 6) -> np.ndarray:
    """Hillshade of the cap around the pole: map lighting from the upper left, not the real Sun."""
    lab = grid.label
    half_px = int(round(half_km * 1000.0 / lab.map_scale_m))
    r0 = int(round(lab.line_offset_px)) - half_px
    c0 = int(round(lab.sample_offset_px)) - half_px
    n = (2 * half_px // block) * block
    win = np.asarray(grid.data[r0 : r0 + n, c0 : c0 + n], dtype=np.float32) * lab.scaling_factor
    z = win.reshape(n // block, block, n // block, block).mean(axis=(1, 3))
    gy, gx = np.gradient(z, lab.map_scale_m * block)
    exag = 2.2
    az, alt = np.radians(315.0), np.radians(32.0)
    lx, ly, lz = np.sin(az) * np.cos(alt), np.cos(az) * np.cos(alt), np.sin(alt)
    nx, ny, nz = -gx * exag, gy * exag, np.ones_like(z)
    shade_ = np.clip((nx * lx + ny * ly + nz * lz) / np.sqrt(nx * nx + ny * ny + nz * nz), 0.0, 1.0)
    lo, hi = np.percentile(z, 2), np.percentile(z, 98)
    tone = 0.62 * shade_ + 0.38 * np.clip((z - lo) / (hi - lo), 0.0, 1.0)
    return np.clip(255.0 * (0.10 + 0.86 * tone**0.9), 0, 255).astype(np.uint8)


def hero_levels(site: Site, grids: dict[str, LolaGrid], size: int = HERO_PX) -> list[Level]:
    """Three windows centred on the site, coarse to fine: 240 m, 80 m, 20 m, each `size` pixels across."""
    levels = []
    for name, fill in (("L2", None), ("L1", "L2"), ("L0", "L1")):
        grid = grids[name]
        col, row = grid.pixel_from_latlon(site.lat, site.lon)
        row0 = int(round(float(row))) - size // 2
        col0 = int(round(float(col))) - size // 2
        heights, _ = window_heights(grid, row0, col0, size, grids[fill] if fill else None)
        heights = np.where(np.isnan(heights), np.nanmin(heights), heights)
        levels.append(Level(heights, float(grid.label.map_scale_m), float(col) - col0, float(row) - row0))
    return levels


def hero_image(site: Site, grids: dict[str, LolaGrid], sun_az_deg: float, sun_el_deg: float) -> tuple[np.ndarray, dict]:
    levels = hero_levels(site, grids)
    bearing = sun_bearing_deg(site.lon, sun_az_deg)
    lit, margin = cast(levels, bearing, sun_el_deg)
    fine = levels[-1]
    image = shade(fine.heights_m, fine.px_m, margin, bearing, sun_el_deg)
    meta = {"window_km": round(fine.heights_m.shape[1] * fine.px_m / 1000.0, 2), "sun_bearing_deg": round(bearing, 1), "lit_fraction": round(float(lit.mean()), 3)}
    return image, meta


def write_jpeg(path: Path, image_u8: np.ndarray, quality: int = 86) -> Path:
    """Grayscale JPEG through GDAL (rasterio); removes the sidecar GDAL writes next to it."""
    import warnings

    import rasterio

    path.parent.mkdir(parents=True, exist_ok=True)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # "Dataset has no geotransform": a picture, not a map product
        with rasterio.open(path, "w", driver="JPEG", width=image_u8.shape[1], height=image_u8.shape[0], count=1, dtype="uint8", QUALITY=quality) as dst:
            dst.write(image_u8.astype(np.uint8), 1)
    aux = Path(str(path) + ".aux.xml")
    if aux.exists():
        aux.unlink()
    return path


def write_all(web_dir: Path = config.REPO_ROOT / "web") -> list[Path]:
    sites = {s.id: s for s in all_sites()}
    site, rim = sites[HERO_SITE], sites[HERO_RIM]
    table, header = load_table()
    grids = load_grids()
    sky = sky_series(site, load_mask(site.id), table, header, HERO_START, HERO_HOURS)
    rim_sky = sky_series(rim, load_mask(rim.id), table, header, HERO_START, HERO_HOURS)
    image, meta = hero_image(site, grids, sky["sun_az"][HERO_FRAME_HOUR], sky["sun_el"][HERO_FRAME_HOUR])
    hero_path = write_jpeg(web_dir / "public" / "hero" / "de-gerlache-rim-2.jpg", image)
    relief_path = write_jpeg(web_dir / "public" / "maps" / "south-pole-relief.jpg", relief_image(grids["L1"]))
    val = config.DATA_DIR / "validation"
    read = lambda name: json.loads((val / name).read_text(encoding="utf-8"))  # noqa: E731
    doc = {
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "hero": {
            "site_id": site.id,
            "name": site.name.replace(" (Artemis III region)", ""),
            "image": "/hero/de-gerlache-rim-2.jpg",
            "frame_utc": (_utc(HERO_START) + timedelta(hours=HERO_FRAME_HOUR)).strftime("%Y-%m-%dT%H:%M:%S"),
            **meta,
        },
        "sky": {"start_utc": HERO_START, "hours": HERO_HOURS, **sky, "night": night(sky["lit"])},
        "pair": {
            "site_sun_pct": sky["sunlit_pct"],
            "rim_site_id": rim.id,
            "rim_sun_pct": rim_sky["sunlit_pct"],
            "distance_km": round(distance_km(site.lat, site.lon, rim.lat, rim.lon), 1),
        },
        "facts": facts(read("horizons.json"), read("mazarico.json"), read("backcasts.json")),
        "relief": {"image": "/maps/south-pole-relief.jpg", "half_km": RELIEF_HALF_KM, "sites": relief_pins(list(sites.values()))},
    }
    json_path = web_dir / "src" / "lib" / "data" / "home.json"
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(doc, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")
    return [hero_path, relief_path, json_path]
```

`cli.py`: add `sub.add_parser("home-assets", help="render the home page picture, the relief map and home.json into web/")` next to `sync-local`, and in `main`:

```python
    elif args.cmd == "home-assets":
        from .home_assets import write_all

        for path in write_all():
            print(path)
```

`tests/test_cli.py`: add `"home-assets"` to the list `test_cli_has_all_subcommands` checks (read the test first; it enumerates the choices).

- [ ] **Step 4: Run the tests**

Run: `uv run pytest tests/test_home_assets.py tests/test_cli.py -q`
Expected: PASS (7 in the new file with the raw LOLA grids present; the data test is skipped without them).

- [ ] **Step 5: Generate the real assets and look at them**

Run: `uv run python -m lunar_pipeline.cli home-assets`
Expected: three paths printed. Open both JPEGs with the Read tool: the hero must show cratered ground with long shadows (about half lit), the relief map the recognisable south-pole craters. Sizes about 150 to 350 KB each.

- [ ] **Step 6: Full pipeline suite, lint, commit**

Run: `uv run pytest -q && uv run ruff check lunar_pipeline tests`
Expected: all pass (82 before plus the new ones), ruff clean.

```bash
git add pipeline/lunar_pipeline/home_assets.py pipeline/lunar_pipeline/cli.py pipeline/tests/test_home_assets.py pipeline/tests/test_cli.py web/public/hero/de-gerlache-rim-2.jpg web/public/maps/south-pole-relief.jpg web/src/lib/data/home.json
git commit -m "feat(pipeline): home-assets command renders the hero shadow picture, the relief map and home.json"
```

---

### Task 6: Sky row geometry and the static chart

**Files:**
- Create: `web/src/lib/viz/skyrow.ts`, `web/src/lib/viz/skyrow.test.ts`
- Modify: `web/src/lib/viz/format.ts` (two duration formatters and a short date), `web/src/lib/viz/format.test.ts` (create if absent)
- Create: `web/src/components/SkyRow.tsx`, `web/src/components/SkyRow.test.tsx`

**Interfaces:**
- Produces in `format.ts`: `spanWords(hours: number): string` ("16 days 15 hours", "1 day 1 hour", "7 hours"), `spanShort(hours: number): string` ("16 d 15 h", "7 h"), `dayMonth(startUtc: string, hour: number): string` ("3 Jan").
- Produces in `skyrow.ts`:
  - `interface Box { x: number; y: number; w: number; h: number }`, `interface Range { min: number; max: number }`
  - `rowRange(el: ArrayLike<number>, hill: ArrayLike<number>, opts?: { headroom?: number; floor?: number }): Range`: from 1° below the lowest of the body and the hills in view up to `headroom` (default 6°) above the body's highest point, so tall hills run off the top instead of flattening the body's line.
  - `rowGeometry(el, hill, visible, box, range): { hillArea: string; hillEdge: string; runs: { visible: boolean; points: string }[]; events: { hour: number; kind: 'set' | 'rise' }[]; x: (hour: number) => number; y: (deg: number) => number }`; `x(h)` is the centre of hour `h`; a run starts with the last point of the run before it, so the line has no gaps.
  - `compassTicks(az: ArrayLike<number>): { hour: number; label: string }[]` where the body crosses one of the eight compass directions ("north", "north-east", ...).
  - `plateWidth(text: string, fontSize: number): number` (0.56 em per character plus 12).
- Produces `SkyRow(props)`: a static SVG of one row, for the home page: `{ el, hill, visible, az?, startUtc, body: 'sun' | 'earth', width?: number, height?: number, caption: string }`.

- [ ] **Step 1: Write the failing tests**

`web/src/lib/viz/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dayMonth, spanShort, spanWords } from './format';

describe('durations', () => {
  it('writes days and hours in words for sentences', () => {
    expect(spanWords(399)).toBe('16 days 15 hours');
    expect(spanWords(25)).toBe('1 day 1 hour');
    expect(spanWords(7)).toBe('7 hours');
    expect(spanWords(48)).toBe('2 days');
    expect(spanWords(0)).toBe('0 hours');
  });

  it('writes the short form for cards', () => {
    expect(spanShort(399)).toBe('16 d 15 h');
    expect(spanShort(7)).toBe('7 h');
    expect(spanShort(48)).toBe('2 d');
  });

  it('writes a short UTC date', () => {
    expect(dayMonth('2027-01-01T00:00:00', 67)).toBe('3 Jan');
    expect(dayMonth('2027-01-01T00:00:00', 466)).toBe('20 Jan');
    expect(dayMonth('2025-03-06T00:00:00', 0)).toBe('6 Mar');
  });
});
```

`web/src/lib/viz/skyrow.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { compassTicks, plateWidth, rowGeometry, rowRange } from './skyrow';

const box = { x: 100, y: 10, w: 800, h: 100 };

describe('rowRange', () => {
  it('leaves headroom above the body and lets tall hills run off the top', () => {
    const r = rowRange([0, 1, 2.5, 1], [-2, 0, 15, 14]);
    expect(r.min).toBeCloseTo(-3, 5);
    expect(r.max).toBeCloseTo(8.5, 5);
  });

  it('never collapses when everything is flat', () => {
    const r = rowRange([0, 0], [0, 0]);
    expect(r.max - r.min).toBeGreaterThanOrEqual(6);
  });
});

describe('rowGeometry', () => {
  const el = [2, 2, 1, 1, 1, 2];
  const hill = [0, 0, 3, 3, 0, 0];
  const visible = [1, 1, 0, 0, 1, 1];
  const g = rowGeometry(el, hill, visible, box, { min: -2, max: 6 });

  it('places hour centres across the box and degrees up the box', () => {
    expect(g.x(0)).toBeCloseTo(100 + 800 / 12, 5);
    expect(g.x(5)).toBeCloseTo(900 - 800 / 12, 5);
    expect(g.y(-2)).toBeCloseTo(110, 5);
    expect(g.y(6)).toBeCloseTo(10, 5);
    expect(g.y(99)).toBeCloseTo(10, 5); // clamped
  });

  it('splits the body line into visible and hidden runs that share their end points', () => {
    expect(g.runs.map((r) => r.visible)).toEqual([true, false, true]);
    const first = g.runs[0].points.split(' ');
    const second = g.runs[1].points.split(' ');
    expect(second[0]).toBe(first[first.length - 1]);
  });

  it('reports where the body sets and rises', () => {
    expect(g.events).toEqual([
      { hour: 2, kind: 'set' },
      { hour: 4, kind: 'rise' },
    ]);
  });

  it('closes the hill shape along the bottom of the box', () => {
    expect(g.hillArea.startsWith('M100 ')).toBe(true);
    expect(g.hillArea.endsWith('Z')).toBe(true);
    expect(g.hillEdge.startsWith('M')).toBe(true);
  });
});

describe('compassTicks', () => {
  it('names the compass direction where the azimuth crosses it, including the wrap through north', () => {
    const az = [100, 95, 88, 50, 44, 10, 2, 358, 300];
    expect(compassTicks(az)).toEqual([
      { hour: 2, label: 'east' },
      { hour: 4, label: 'north-east' },
      { hour: 7, label: 'north' },
      { hour: 8, label: 'north-west' },
    ]);
  });
});

describe('plateWidth', () => {
  it('grows with the text', () => {
    expect(plateWidth('Sun sets 3 Jan', 15)).toBeGreaterThan(plateWidth('Sun', 15));
    expect(plateWidth('', 15)).toBe(12);
  });
});
```

`web/src/components/SkyRow.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SkyRow } from './SkyRow';

const hours = 720;
const el = Array.from({ length: hours }, () => 1.5);
const lit = Array.from({ length: hours }, (_, h) => (h >= 67 && h < 466 ? 0 : 1));
const hill = Array.from({ length: hours }, (_, h) => (lit[h] ? -1 : 12));
const az = Array.from({ length: hours }, (_, h) => (327 - h * 0.5 + 720) % 360);

describe('SkyRow', () => {
  it('describes the night in words and labels sunset and sunrise with their dates', () => {
    const { container } = render(<SkyRow el={el} hill={hill} visible={lit} az={az} startUtc="2027-01-01T00:00:00" body="sun" caption="The Sun at de Gerlache Rim 2, January 2027" />);
    const svg = screen.getByRole('img');
    expect(svg.getAttribute('aria-label')).toMatch(/The Sun at de Gerlache Rim 2, January 2027/);
    expect(svg.getAttribute('aria-label')).toMatch(/hidden from 3 Jan to 20 Jan, 16 days 15 hours/);
    expect(container.textContent).toMatch(/Sun sets 3 Jan/);
    expect(container.textContent).toMatch(/Sun rises 20 Jan/);
    expect(container.textContent).toMatch(/1 Jan/);
  });

  it('draws the hidden stretch dotted and the visible stretch solid, on a stage', () => {
    const { container } = render(<SkyRow el={el} hill={hill} visible={lit} startUtc="2027-01-01T00:00:00" body="sun" caption="c" />);
    const lines = [...container.querySelectorAll('polyline')];
    expect(lines.some((l) => l.getAttribute('stroke-dasharray'))).toBe(true);
    expect(lines.some((l) => !l.getAttribute('stroke-dasharray'))).toBe(true);
    expect(container.innerHTML).toContain('var(--stage)');
    expect(container.innerHTML).toContain('var(--stage-sun)');
  });

  it('uses no text smaller than 13 px at its design width', () => {
    const { container } = render(<SkyRow el={el} hill={hill} visible={lit} az={az} startUtc="2027-01-01T00:00:00" body="sun" caption="c" />);
    for (const t of container.querySelectorAll('text')) expect(Number(t.getAttribute('font-size'))).toBeGreaterThanOrEqual(13.5);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/lib/viz/format.test.ts src/lib/viz/skyrow.test.ts src/components/SkyRow.test.tsx`
Expected: FAIL: `spanWords` is not exported; cannot find `./skyrow`, `./SkyRow`.

- [ ] **Step 3: Implement**

Append to `web/src/lib/viz/format.ts`:

```ts
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A span of hours in words, for sentences: "16 days 15 hours", "1 day 1 hour", "7 hours". */
export function spanWords(hours: number): string {
  const h = Math.max(0, Math.round(hours));
  const d = Math.floor(h / 24);
  const r = h % 24;
  if (d === 0) return plural(r, 'hour');
  return r === 0 ? plural(d, 'day') : `${plural(d, 'day')} ${plural(r, 'hour')}`;
}

/** The same span for cards and tables: "16 d 15 h", "7 h". */
export function spanShort(hours: number): string {
  const h = Math.max(0, Math.round(hours));
  const d = Math.floor(h / 24);
  const r = h % 24;
  if (d === 0) return `${r} h`;
  return r === 0 ? `${d} d` : `${d} d ${r} h`;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The UTC date `hour` hours after the start, as "3 Jan". */
export function dayMonth(startUtc: string, hour: number): string {
  const start = new Date(startUtc.endsWith('Z') ? startUtc : `${startUtc}Z`);
  const d = new Date(start.getTime() + hour * 3_600_000);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}
```

`web/src/lib/viz/skyrow.ts`:

```ts
/** Geometry of one row of the time chart: a body's height against the hills in its direction, hour by hour. */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Range {
  min: number;
  max: number;
}

export interface RowGeometry {
  /** The hills as a closed shape down to the bottom of the box. */
  hillArea: string;
  /** The top edge of the hills. */
  hillEdge: string;
  /** The body's line, split where it goes behind the hills; each run starts at the last point of the run before. */
  runs: { visible: boolean; points: string }[];
  /** Hours at which the body disappears ('set') or comes back ('rise'). */
  events: { hour: number; kind: 'set' | 'rise' }[];
  /** Centre of an hour. */
  x: (hour: number) => number;
  /** Height in degrees, clamped to the range. */
  y: (deg: number) => number;
}

const f1 = (v: number) => (Math.round(v * 10) / 10).toString();

/** From 1° under the lowest thing in view up to `headroom` above the body's highest point; tall hills run off the top. */
export function rowRange(el: ArrayLike<number>, hill: ArrayLike<number>, opts: { headroom?: number; floor?: number } = {}): Range {
  const headroom = opts.headroom ?? 6;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < el.length; i++) {
    lo = Math.min(lo, el[i], hill[i]);
    hi = Math.max(hi, el[i]);
  }
  if (!Number.isFinite(lo)) return { min: -3, max: 6 };
  const min = Math.max(opts.floor ?? -90, lo - 1);
  return { min, max: Math.max(hi + headroom, min + 6) };
}

export function rowGeometry(el: ArrayLike<number>, hill: ArrayLike<number>, visible: ArrayLike<number | boolean>, box: Box, range: Range): RowGeometry {
  const n = el.length;
  const x = (hour: number) => box.x + ((hour + 0.5) / n) * box.w;
  const y = (deg: number) => box.y + (1 - (Math.min(Math.max(deg, range.min), range.max) - range.min) / (range.max - range.min)) * box.h;
  let edge = '';
  for (let i = 0; i < n; i++) edge += `${i === 0 ? 'M' : 'L'}${f1(x(i))} ${f1(y(hill[i]))}`;
  const bottom = f1(box.y + box.h);
  const hillArea = `M${f1(box.x)} ${bottom}L${f1(box.x)} ${f1(y(hill[0]))}${edge.slice(edge.indexOf('L') < 0 ? edge.length : edge.indexOf('L'))}L${f1(box.x + box.w)} ${f1(y(hill[n - 1]))}L${f1(box.x + box.w)} ${bottom}Z`;
  const runs: { visible: boolean; points: string }[] = [];
  const events: { hour: number; kind: 'set' | 'rise' }[] = [];
  let pts: string[] = [];
  let state: boolean | null = null;
  for (let i = 0; i < n; i++) {
    const v = Boolean(visible[i]);
    const p = `${f1(x(i))},${f1(y(el[i]))}`;
    if (state === null) {
      state = v;
    } else if (v !== state) {
      runs.push({ visible: state, points: pts.join(' ') });
      events.push({ hour: i, kind: v ? 'rise' : 'set' });
      pts = [pts[pts.length - 1]];
      state = v;
    }
    pts.push(p);
  }
  if (state !== null) runs.push({ visible: state, points: pts.join(' ') });
  return { hillArea, hillEdge: edge, runs, events, x, y };
}

const DIRECTIONS: [number, string][] = [
  [0, 'north'],
  [45, 'north-east'],
  [90, 'east'],
  [135, 'south-east'],
  [180, 'south'],
  [225, 'south-west'],
  [270, 'west'],
  [315, 'north-west'],
];

/** Hours at which the azimuth crosses one of the eight compass directions (either way round, including the wrap through north). */
export function compassTicks(az: ArrayLike<number>): { hour: number; label: string }[] {
  const out: { hour: number; label: string }[] = [];
  for (let i = 1; i < az.length; i++) {
    const a0 = az[i - 1];
    const a1 = az[i];
    const wrapped = Math.abs(a1 - a0) > 180;
    for (const [deg, label] of DIRECTIONS) {
      const hit = deg === 0 ? wrapped : !wrapped && (a0 - deg) * (a1 - deg) <= 0 && a0 !== a1 && a0 !== deg;
      if (hit) out.push({ hour: i, label });
    }
  }
  return out;
}

/** Width of the backing plate behind a chart label: about 0.56 em per character plus padding. */
export function plateWidth(text: string, fontSize: number): number {
  return Math.round(text.length * fontSize * 0.56) + 12;
}
```

(The `hillArea` expression above is clumsy; write it as: start at the bottom-left corner, go up to the first hill point at the box's left edge, follow the edge points, extend to the right edge at the last hill height, drop to the bottom-right corner, close. Keep the test's two assertions: starts with `M100 `, ends with `Z`.)

`web/src/components/SkyRow.tsx`: a server-safe component (no hooks, no `'use client'`).

```tsx
import { dayMonth, spanWords } from '@/lib/viz/format';
import { compassTicks, plateWidth, rowGeometry, rowRange } from '@/lib/viz/skyrow';

const FONT = 'var(--font-plex), "IBM Plex Sans", system-ui, sans-serif';

/** A label on the picture with a solid plate behind it (outlined text read as smudged in the blind test). */
export function Plate({ x, y, text, anchor = 'middle', color = 'var(--stage-ink)', size = 15, weight = 600 }: { x: number; y: number; text: string; anchor?: 'start' | 'middle' | 'end'; color?: string; size?: number; weight?: number }) {
  const w = plateWidth(text, size);
  const left = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w + 6 : x - 6;
  return (
    <g>
      <rect x={left} y={y - size + 1} width={w} height={size + 8} rx={5} fill="var(--stage)" fillOpacity={0.82} />
      <text x={x} y={y + 2} textAnchor={anchor} fill={color} fontSize={size} fontWeight={weight} fontFamily={FONT}>
        {text}
      </text>
    </g>
  );
}

/**
 * One row of the time chart as a static picture: the body's height (solid while visible, dotted while
 * hidden) against the hills in its direction, with the days along the bottom and, when `az` is given,
 * the compass direction of the body along the top.
 */
export function SkyRow({
  el,
  hill,
  visible,
  az,
  startUtc,
  body,
  caption,
  width = 1216,
  height = 150,
}: {
  el: ArrayLike<number>;
  hill: ArrayLike<number>;
  visible: ArrayLike<number | boolean>;
  az?: ArrayLike<number>;
  startUtc: string;
  body: 'sun' | 'earth';
  caption: string;
  width?: number;
  height?: number;
}) {
  const hours = el.length;
  const top = az ? 26 : 6;
  const box = { x: 0, y: top, w: width, h: height };
  const g = rowGeometry(el, hill, visible, box, rowRange(el, hill));
  const color = body === 'sun' ? 'var(--stage-sun)' : 'var(--stage-earth)';
  const name = body === 'sun' ? 'Sun' : 'Earth';
  const total = top + height + 28;
  // The longest hidden stretch, for the words on the picture and the description.
  let dark: { from: number; to: number } | null = null;
  for (let i = 0; i < g.events.length; i++) {
    if (g.events[i].kind !== 'set') continue;
    const to = g.events[i + 1]?.hour ?? hours;
    if (!dark || to - g.events[i].hour > dark.to - dark.from) dark = { from: g.events[i].hour, to };
  }
  const label = dark
    ? `${caption}. ${name === 'Sun' ? 'The Sun' : 'Earth'} is hidden from ${dayMonth(startUtc, dark.from)} to ${dayMonth(startUtc, dark.to)}, ${spanWords(dark.to - dark.from)}.`
    : `${caption}. ${name === 'Sun' ? 'The Sun' : 'Earth'} stays in view.`;
  const days = Math.round(hours / 24);
  const every = days > 45 ? 10 : 5;
  let lastTick = -Infinity;
  return (
    <svg viewBox={`0 0 ${width} ${total}`} width="100%" role="img" aria-label={label} className="block">
      <rect x={0} y={0} width={width} height={total} fill="var(--stage)" />
      {az &&
        compassTicks(az).map((t) => {
          const x = g.x(t.hour);
          if (x - lastTick < 96 || x < 60 || x > width - 60) return null;
          lastTick = x;
          return (
            <text key={t.hour} x={x} y={17} textAnchor="middle" fill="var(--stage-ink-2)" fontSize={14} fontFamily={FONT}>
              {t.label}
            </text>
          );
        })}
      <path d={g.hillArea} fill="var(--hill)" />
      <path d={g.hillEdge} fill="none" stroke="var(--hill-edge)" strokeWidth={1.4} strokeLinejoin="round" />
      {g.runs.map((r, i) => (
        <polyline key={i} points={r.points} fill="none" stroke={color} strokeWidth={r.visible ? 3.4 : 2} strokeDasharray={r.visible ? undefined : '2 7'} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {dark && (
        <>
          <Plate x={g.x((dark.from + dark.to) / 2)} y={top + 26} text={`Night: the hills stand higher than the ${name} for ${spanWords(dark.to - dark.from)}`} size={16} />
          <Plate x={g.x(dark.from) + 12} y={g.y(el[dark.from]) + 28} text={`${name} sets ${dayMonth(startUtc, dark.from)}`} anchor="start" color={color} />
          {dark.to < hours && <Plate x={g.x(dark.to) - 12} y={g.y(el[dark.to]) + 28} text={`${name} rises ${dayMonth(startUtc, dark.to)}`} anchor="end" color={color} />}
        </>
      )}
      {Array.from({ length: Math.floor(days / every) + 1 }, (_, k) => k * every).map((d) => (
        <text key={d} x={d === 0 ? 4 : Math.min(g.x(d * 24) - width / hours / 2, width - 4)} y={total - 8} textAnchor={d === 0 ? 'start' : d * 24 >= hours ? 'end' : 'middle'} fill="var(--stage-ink-2)" fontSize={14} fontFamily={FONT}>
          {dayMonth(startUtc, d * 24)}
        </text>
      ))}
    </svg>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/viz/format.test.ts src/lib/viz/skyrow.test.ts src/components/SkyRow.test.tsx`
Expected: PASS (5 + 8 + 3).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/viz/format.ts web/src/lib/viz/format.test.ts web/src/lib/viz/skyrow.ts web/src/lib/viz/skyrow.test.ts web/src/components/SkyRow.tsx web/src/components/SkyRow.test.tsx
git commit -m "feat(web): sky row geometry (body against the hills in its direction) and a static chart of it"
```

---

### Task 7: Home page

**Files:**
- Create: `web/src/lib/data/home.ts`, `web/src/lib/data/home.test.ts`
- Create: `web/src/components/home/WhyDrawings.tsx`
- Modify: `web/src/app/page.tsx` (rewrite), `web/src/app/page.test.tsx` (rewrite)
- Delete: `web/public/hero/shackleton-rim-1.jpg`, `shackleton-rim-2.jpg`, `shackleton-rim-3.jpg`

**Interfaces:**
- Consumes: `home.json` (Task 5), `SkyRow` (Task 6), `AppFrame` (Task 3), classes (Task 1).
- Produces in `home.ts`: `interface HomeDoc` (the JSON's shape), `HOME: HomeDoc` (the imported JSON, typed), `degreesText(deg: number): string` ("0.00003°"), `thousandsText(n: number): string` ("20,000": rounded to the nearest thousand with a comma), `MISSIONS: { title: string; outcome: string; tone: 'good' | 'bad' | 'plain'; body: string; href: string }[]`.

- [ ] **Step 1: Write the failing tests**

`web/src/lib/data/home.test.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { degreesText, HOME, MISSIONS, thousandsText } from './home';

const validation = (name: string) => JSON.parse(fs.readFileSync(path.resolve(process.cwd(), '../data/validation', name), 'utf8'));

describe('home facts', () => {
  it('formats the tiny angle and the ratio for a sentence', () => {
    expect(degreesText(2.7e-5)).toBe('0.00003°');
    expect(thousandsText(19741)).toBe('20,000');
    expect(thousandsText(1499)).toBe('1,000');
  });

  it('has not drifted from the validation tables it summarises', () => {
    const horizons = validation('horizons.json');
    const mazarico = validation('mazarico.json');
    const backcasts = validation('backcasts.json');
    expect(HOME.facts.horizons_worst_el_deg).toBe(horizons.max_abs_delta_el_deg);
    expect(HOME.facts.horizons_rows).toBe(horizons.n_rows);
    const covered: number[] = mazarico.rows.filter((r: { covered: boolean; delta_points?: number }) => r.covered && r.delta_points !== undefined).map((r: { delta_points: number }) => Math.abs(r.delta_points)).sort((a: number, b: number) => a - b);
    const median = covered.length % 2 ? covered[(covered.length - 1) / 2] : (covered[covered.length / 2 - 1] + covered[covered.length / 2]) / 2;
    expect(HOME.facts.mazarico_sites).toBe(covered.length);
    expect(HOME.facts.mazarico_median_points).toBeCloseTo(median, 1);
    const ghost = backcasts.rows.find((r: { site_id: string }) => r.site_id === 'blue_ghost_m1');
    expect(HOME.facts.blue_ghost_end_minus_sunset_h).toBeCloseTo(ghost.end_minus_sunset_h, 1);
  });

  it('carries a full month of the hero site and its night', () => {
    expect(HOME.sky.hours).toBe(720);
    expect(HOME.sky.sun_el.length).toBe(720);
    expect(HOME.sky.night).toEqual({ sunset_hour: 67, sunrise_hour: 466, hours: 399 });
    expect(HOME.pair.rim_sun_pct).toBe(100);
  });

  it('opens each mission on its site and date', () => {
    expect(MISSIONS.map((m) => m.href)).toEqual(['/explore?site=im2_athena&start=2025-03-06', '/explore?site=blue_ghost_m1&start=2025-03-02', '/explore?site=de_gerlache_rim_2']);
  });
});
```

`web/src/app/page.test.tsx` (replace):

```tsx
// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HOME } from '@/lib/data/home';
import Home from './page';

describe('home page', () => {
  it('says what the product does in the headline and offers one gold action', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('See when a Moon lander has sunlight and a signal.');
    const cta = screen.getByRole('link', { name: 'Explore a landing site' });
    expect(cta.getAttribute('href')).toBe('/explore');
    expect(cta.className).toMatch(/btn-primary/);
    expect(document.querySelectorAll('main .btn-primary').length).toBe(1);
  });

  it('shows the computed shadow picture with its two labels and says what it is', () => {
    render(<Home />);
    const img = screen.getByRole('img', { name: /shadows/i });
    expect(img.getAttribute('src')).toMatch(/de-gerlache-rim-2/);
    expect(screen.getByText('in shadow')).toBeTruthy();
    expect(screen.getByText('in sunlight')).toBeTruthy();
    expect(screen.getByText(/computed from NASA elevation data/)).toBeTruthy();
  });

  it('explains why the south pole is hard in three steps, with the real pair of sites', () => {
    render(<Home />);
    const why = screen.getByRole('region', { name: 'Why the south pole is hard' });
    expect(within(why).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['The Sun never climbs', 'The hills decide', 'Earth sets too']);
    expect(why.textContent).toContain(`${Math.round(HOME.pair.distance_km)} km away`);
    expect(why.textContent).toContain(`${Math.round(HOME.pair.site_sun_pct)} %`);
  });

  it('shows the real month at the site as a chart with the night in words', () => {
    render(<Home />);
    const real = screen.getByRole('region', { name: 'See it at a real site' });
    expect(within(real).getByRole('img').getAttribute('aria-label')).toMatch(/hidden from 3 Jan to 20 Jan, 16 days 15 hours/);
    expect(within(real).getByRole('link', { name: /play the month/ }).getAttribute('href')).toBe('/explore?site=de_gerlache_rim_2');
  });

  it('opens three real missions with their outcomes', () => {
    render(<Home />);
    const cards = screen.getByRole('region', { name: 'Start from a real mission' });
    expect(within(cards).getByText('Ended after one day')).toBeTruthy();
    expect(within(cards).getByText('Worked all 14 days')).toBeTruthy();
    expect(within(cards).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/explore?site=im2_athena&start=2025-03-06', '/explore?site=blue_ghost_m1&start=2025-03-02', '/explore?site=de_gerlache_rim_2']);
  });

  it('gives three checks against NASA with a yardstick, from the validation figures', () => {
    render(<Home />);
    const proof = screen.getByRole('region', { name: 'Checked against NASA' });
    expect(proof.textContent).toContain('0.00003°');
    expect(proof.textContent).toContain('20,000 times wider');
    expect(proof.textContent).toContain(`${HOME.facts.mazarico_median_points.toFixed(1)} points`);
    expect(proof.textContent).toContain(`${HOME.facts.blue_ghost_end_minus_sunset_h.toFixed(1)} hours`);
    expect(within(proof).getByRole('link', { name: /See every check/ }).getAttribute('href')).toBe('/validate');
  });

  it('keeps instrument and programme names out of the main copy', () => {
    render(<Home />);
    expect(screen.getByRole('main').textContent).not.toMatch(/LOLA|DE440|CLPS|Horizons|ephemeris|skyline/);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/lib/data/home.test.ts src/app/page.test.tsx`
Expected: FAIL: cannot find `./home`; the headline is the old one.

- [ ] **Step 3: Implement**

`web/src/lib/data/home.ts`:

```ts
import doc from './home.json';

/** Written by `uv run python -m lunar_pipeline.cli home-assets` (pipeline/lunar_pipeline/home_assets.py). */
export interface HomeDoc {
  generated_utc: string;
  hero: { site_id: string; name: string; image: string; frame_utc: string; window_km: number; sun_bearing_deg: number; lit_fraction: number };
  sky: { start_utc: string; hours: number; sun_az: number[]; sun_el: number[]; hill_el: number[]; lit: number[]; sunlit_pct: number; night: { sunset_hour: number; sunrise_hour: number; hours: number } | null };
  pair: { site_sun_pct: number; rim_site_id: string; rim_sun_pct: number; distance_km: number };
  facts: {
    horizons_worst_el_deg: number;
    horizons_rows: number;
    sun_disc_ratio: number;
    mazarico_median_points: number;
    mazarico_sites: number;
    mazarico_within5: number;
    mazarico_worst_points: number;
    blue_ghost_end_minus_sunset_h: number;
  };
  relief: { image: string; half_km: number; sites: { id: string; u: number; v: number }[] };
}

export const HOME = doc as HomeDoc;

/** A tiny angle with five decimals: 2.7e-5 reads "0.00003°". */
export function degreesText(deg: number): string {
  return `${deg.toFixed(5)}°`;
}

/** A large count rounded to the nearest thousand, with a comma: 19741 reads "20,000". */
export function thousandsText(n: number): string {
  const k = Math.max(1, Math.round(n / 1000));
  return `${k.toLocaleString('en-US')},000`;
}

/** Three real stories; each opens Explore on the site and date where it happened. */
export const MISSIONS: { title: string; outcome: string; tone: 'good' | 'bad' | 'plain'; body: string; href: string }[] = [
  {
    title: 'IM-2 Athena, March 2025',
    outcome: 'Ended after one day',
    tone: 'bad',
    body: 'Landed near a mountain called Mons Mouton and came to rest on its side in a crater. Replay the sky it saw and how little light reached it.',
    href: '/explore?site=im2_athena&start=2025-03-06',
  },
  {
    title: 'Blue Ghost Mission 1, March 2025',
    outcome: 'Worked all 14 days',
    tone: 'good',
    body: 'A site far from the pole: two weeks of sunlight, Earth always in view. Our predicted sunset is within hours of its last signal.',
    href: '/explore?site=blue_ghost_m1&start=2025-03-02',
  },
  {
    title: 'de Gerlache Rim 2',
    outcome: 'Shortlisted for a crewed landing',
    tone: 'plain',
    body: 'One of nine regions NASA shortlisted in 2024 for a crewed Artemis landing. Long days, long nights, and a rim that changes everything.',
    href: '/explore?site=de_gerlache_rim_2',
  },
];
```

`web/src/components/home/WhyDrawings.tsx`: three small SVGs on the stage colours, exported as `SunNeverClimbs()`, `HillsDecide({ rimPct, sitePct, km })`, `EarthSetsToo()`. Each is `viewBox="0 0 380 190"`, `aria-hidden="true"`, `className="block w-full rounded-xl"`, background rect `var(--stage)`, terrain `var(--hill)`, Sun `var(--stage-sun)`, Earth `var(--stage-earth)`, labels 14 to 15 px in `var(--stage-ink)`. Shapes as in the approved mockup (`docs/design/redesign-2026-10/design-home-light.jpg`): (1) a low dotted ellipse over a ridge with the Sun on it, label "The Sun's path over one month" and "a low circle around the horizon"; (2) a peak with a lit point on top labelled "crater rim: sunlight all month" (when `rimPct` is 100, otherwise "crater rim: N %") and a point in its shadow labelled "`km` km away: `sitePct` %", a dotted ray from the Sun to the peak; (3) Earth above a ridge with a dotted outline below it and a double arrow, label "Earth stays in one direction" and "and bobs above and below the hills".

`web/src/app/page.tsx`:

```tsx
import Image from 'next/image';
import Link from 'next/link';
import { AppFrame } from '@/components/AppFrame';
import { EarthSetsToo, HillsDecide, SunNeverClimbs } from '@/components/home/WhyDrawings';
import { SkyRow } from '@/components/SkyRow';
import { degreesText, HOME, MISSIONS, thousandsText } from '@/lib/data/home';

const TONE = {
  good: 'border-good-line bg-good-bg text-good',
  bad: 'border-bad-line bg-bad-bg text-bad',
  plain: 'border-line-strong text-ink-2',
} as const;

function Check() {
  return (
    <svg viewBox="0 0 24 24" width={30} height={30} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-good" aria-hidden="true">
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  );
}

export default function Home() {
  const { hero, sky, pair, facts } = HOME;
  const siteLink = `/explore?site=${hero.site_id}`;
  return (
    <AppFrame>
      <main>
        <section className="border-b border-stage-line bg-[#07080b] text-stage-ink">
          <div className="wrap grid items-center gap-14 py-14 lg:grid-cols-[1fr_500px]">
            <div>
              <h1 className="max-w-[11em] font-display text-[44px] font-semibold leading-[1.04] tracking-[-0.025em] md:text-[58px]">See when a Moon lander has sunlight and a signal.</h1>
              <p className="mt-6 max-w-[30em] text-xl leading-relaxed text-stage-ink-2">
                At the Moon&apos;s south pole the Sun and Earth never climb high. They skim the horizon, and one hill can hide them for weeks. Pick a landing site and a
                date: Earthrise shows the hours of sunlight, the hours of radio contact with Earth, and whether the battery survives the night.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/explore" className="btn btn-primary h-[52px] text-[17px]">
                  Explore a landing site
                </Link>
                <a href="#why" className="btn h-[52px] border-[#3b4350] text-[17px] text-stage-ink hover:bg-white/10">
                  See how it works
                </a>
              </div>
              <p className="mt-5 text-sm text-[#9e998f]">Built on NASA&apos;s elevation map of the Moon and NASA&apos;s positions of the Sun and Earth. Free to use.</p>
            </div>
            <figure>
              <div className="relative aspect-[50/41] overflow-hidden rounded-2xl border border-stage-line bg-black">
                <Image src={hero.image} alt="The ground around a possible landing site seen from above, with long black shadows" fill priority sizes="(min-width: 1024px) 500px, 100vw" className="object-cover sepia-[0.18] saturate-[0.9]" />
                <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-full flex-col items-center">
                  <b className="whitespace-nowrap rounded-md border border-stage-sun/60 bg-stage/80 px-2.5 py-1 text-sm font-semibold">A possible landing site</b>
                  <i className="h-6 w-0.5 bg-stage-sun" />
                  <u className="h-3.5 w-3.5 translate-y-1.5 rounded-full border-[3px] border-stage-sun bg-stage/60 no-underline" />
                </div>
                <span className="absolute left-[83%] top-[52%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-stage/70 px-2 py-0.5 text-[13px]">in shadow</span>
                <span className="absolute left-[60%] top-[86%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-[#f4f1ea]/85 px-2 py-0.5 text-[13px] text-[#15181d]">in sunlight</span>
              </div>
              <figcaption className="mt-3 text-sm leading-snug text-[#9e998f]">
                A ridge NASA shortlisted for a future crewed landing, seen from above on 2 January 2027. The black areas are shadow: ground the Sun cannot reach.{' '}
                {Math.round(hero.window_km)} km across, computed from NASA elevation data.
              </figcaption>
            </figure>
          </div>
        </section>

        <section id="why" aria-labelledby="h-why" className="wrap pt-16">
          <h2 id="h-why" className="font-display text-[34px] font-semibold leading-tight tracking-[-0.02em]">
            Why the south pole is hard
          </h2>
          <p className="mt-2.5 max-w-[46em] text-lg text-ink-2">The Moon&apos;s water ice is there, and so is its hardest lighting. Three facts decide whether a lander lives.</p>
          <div className="mt-7 grid gap-6 md:grid-cols-3">
            <div>
              <SunNeverClimbs />
              <h3 className="mt-4 font-display text-[22px] font-semibold">The Sun never climbs</h3>
              <p className="mt-2 text-ink-2">Near the pole the Sun circles the horizon once a month instead of rising overhead. It is never more than a few degrees up.</p>
            </div>
            <div>
              <HillsDecide rimPct={pair.rim_sun_pct} sitePct={Math.round(pair.site_sun_pct)} km={Math.round(pair.distance_km)} />
              <h3 className="mt-4 font-display text-[22px] font-semibold">The hills decide</h3>
              <p className="mt-2 text-ink-2">
                A ridge can hide the Sun for weeks while a peak nearby stays lit. In January 2027 the rim of one crater has sunlight {pair.rim_sun_pct >= 99.95 ? 'all month' : `${Math.round(pair.rim_sun_pct)} % of the time`}; a point{' '}
                {Math.round(pair.distance_km)} km away has it {Math.round(pair.site_sun_pct)} % of the time.
              </p>
            </div>
            <div>
              <EarthSetsToo />
              <h3 className="mt-4 font-display text-[22px] font-semibold">Earth sets too</h3>
              <p className="mt-2 text-ink-2">Earth hangs near one compass direction and drifts a few degrees up and down each month. When it dips behind the hills, the lander cannot talk to Earth directly.</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="h-real" className="wrap pt-16">
          <h2 id="h-real" className="font-display text-[34px] font-semibold leading-tight tracking-[-0.02em]">
            See it at a real site
          </h2>
          <p className="mt-2.5 max-w-[46em] text-lg text-ink-2">
            The gold line is the Sun&apos;s height at that ridge through January 2027, read from left to right. The grey shape is the height of the hills in the Sun&apos;s direction. Where the grey stands above the line, it is night.
          </p>
          <div className="stage mt-6">
            <SkyRow el={sky.sun_el} hill={sky.hill_el} visible={sky.lit} az={sky.sun_az} startUtc={sky.start_utc} body="sun" caption={`The Sun at ${hero.name}, January 2027`} />
          </div>
          <p className="mt-6">
            <Link href={siteLink} className="font-semibold text-sun-ink">
              Open this site and play the month
            </Link>
          </p>
        </section>

        <section aria-labelledby="h-missions" className="wrap pt-16">
          <h2 id="h-missions" className="font-display text-[34px] font-semibold leading-tight tracking-[-0.02em]">
            Start from a real mission
          </h2>
          <p className="mt-2.5 max-w-[46em] text-lg text-ink-2">Two commercial landers reached the Moon in March 2025. Light and line of sight explain how each one ended.</p>
          <ul className="mt-7 grid gap-6 md:grid-cols-3">
            {MISSIONS.map((m) => (
              <li key={m.href} className="panel flex flex-col gap-2.5 p-6">
                <span className={`w-fit rounded-full border px-3 py-1 text-sm font-semibold ${TONE[m.tone]}`}>{m.outcome}</span>
                <h3 className="mt-1 font-display text-[23px] font-semibold leading-tight">{m.title}</h3>
                <p className="text-ink-2">{m.body}</p>
                <Link href={m.href} aria-label={`Open this forecast: ${m.title}`} className="mt-auto pt-2.5 font-semibold text-sun-ink">
                  Open this forecast
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="h-proof" className="wrap pb-16 pt-16">
          <h2 id="h-proof" className="font-display text-[34px] font-semibold leading-tight tracking-[-0.02em]">
            Checked against NASA
          </h2>
          <p className="mt-2.5 max-w-[46em] text-lg text-ink-2">Each step is compared with an independent NASA source.</p>
          <div className="mt-7 grid gap-6 md:grid-cols-3">
            <div className="border-t-2 border-ink pt-4">
              <p className="flex items-center gap-3 font-display text-[44px] font-semibold leading-none tracking-[-0.02em]">
                <Check />
                {degreesText(facts.horizons_worst_el_deg)}
              </p>
              <h3 className="mt-3 text-[17px] font-semibold">Where the Sun and Earth are</h3>
              <p className="mt-1.5 max-w-[23em] text-ink-2">
                Largest gap between our positions and NASA&apos;s own calculator over {facts.horizons_rows} test cases. The Sun&apos;s disc is {thousandsText(facts.sun_disc_ratio)} times wider than that.
              </p>
            </div>
            <div className="border-t-2 border-ink pt-4">
              <p className="flex items-center gap-3 font-display text-[44px] font-semibold leading-none tracking-[-0.02em]">
                <Check />
                {facts.mazarico_median_points.toFixed(1)} points
              </p>
              <h3 className="mt-3 text-[17px] font-semibold">How much sunlight a site gets</h3>
              <p className="mt-1.5 max-w-[23em] text-ink-2">
                Typical gap between our 13-year sunlight percentages and NASA&apos;s own sunlight map, across {facts.mazarico_sites} sites. The largest gaps are narrow peaks that the coarser NASA map blurs.
              </p>
            </div>
            <div className="border-t-2 border-ink pt-4">
              <p className="flex items-center gap-3 font-display text-[44px] font-semibold leading-none tracking-[-0.02em]">
                <Check />
                {Math.abs(facts.blue_ghost_end_minus_sunset_h).toFixed(1)} hours
              </p>
              <h3 className="mt-3 text-[17px] font-semibold">When night falls on a real mission</h3>
              <p className="mt-1.5 max-w-[23em] text-ink-2">How close our predicted sunset came to the real end of the Blue Ghost mission in March 2025.</p>
            </div>
          </div>
          <p className="mt-7">
            <Link href="/validate" className="font-semibold text-sun-ink">
              See every check and rerun one live
            </Link>
          </p>
        </section>
      </main>
    </AppFrame>
  );
}
```

The page test finds sections by `role="region"` with a name: a `<section>` with `aria-labelledby` has that role. The mission links carry `aria-label` "Open this forecast: TITLE"; the test reads `href` only.

Delete the three old hero JPEGs: `git rm web/public/hero/shackleton-rim-1.jpg web/public/hero/shackleton-rim-2.jpg web/public/hero/shackleton-rim-3.jpg`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/data/home.test.ts src/app/page.test.tsx`
Expected: PASS (4 + 7).

- [ ] **Step 5: Look at it**

Start the dev server if it is not running (`npm run dev -- --port 3000` from `web/`), open `/`, `/?theme=dark`, then `/explore`, `/compare`, `/validate`, `/learn` in both themes with Playwright at 1440 by 900 and at 1024 by 768; save screenshots under `.playwright-mcp/part1-*`. Check: no horizontal scroll, no clipped label, hero picture sharp, the chart's labels do not collide, old pages readable in light and dark. Measure the first screen of `/`: share of text under 14 px at most 15 %, none under 13 px. Fix what is off before committing.

- [ ] **Step 6: Gates and commit**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build` (stop the dev server before the build)
Expected: all green.

```bash
git add -A web/src/app/page.tsx web/src/app/page.test.tsx web/src/lib/data/home.ts web/src/lib/data/home.test.ts web/src/components/home web/public/hero
git commit -m "feat(web): home page says what the product does, with a computed shadow picture, the real month and three checks"
```

---

### Task 8: Test badge and notes

**Files:**
- Modify: `web/public/validation/tests.json` (regenerated), `web/README.md` (a short "Themes" paragraph and the `home-assets` command), `docs/data-credits.md` only if a new source was used (none: same LOLA grids).

- [ ] **Step 1: Regenerate the badge**

Run: `npm run validation:tests` (from `web/`; it runs both suites)
Expected: the new counts printed; `web/public/validation/tests.json` updated.

- [ ] **Step 2: Document**

Add to `web/README.md`, under the commands: the theme rule (light default, header switch, `?theme=dark`), and that `uv run python -m lunar_pipeline.cli home-assets` (from `pipeline/`) regenerates `public/hero/de-gerlache-rim-2.jpg`, `public/maps/south-pole-relief.jpg` and `src/lib/data/home.json` after the validation tables or the catalogue change.

- [ ] **Step 3: Commit**

```bash
git add web/public/validation/tests.json web/README.md
git commit -m "chore(web): test badge and notes on themes and home assets"
```

---

### Task 9: Design-lead pass on the tokens, the chart and the home page

Added on 1 October 2026 after the first blind read of the built home page and the user's request to run the frontend-design process ("use the front end design command and continue your work on the parts"). Spec: sections 4.1 to 4.5 and 6.1 as amended, and section 15 (reasoning, wireframe). A rendered mock of this task was shown to the user before the build (`.playwright-mcp/design-pass-home-light.png`, `-dark.png`).

**Files:**
- Modify: `web/src/app/globals.css`, `web/src/app/globals.test.ts`, `web/src/app/layout.tsx`, `web/src/lib/viz/skyrow.ts`, `web/src/lib/viz/skyrow.test.ts`, `web/src/components/SkyRow.tsx`, `web/src/components/SkyRow.test.tsx`, `web/src/components/home/WhyDrawings.tsx`, `web/src/components/home/WhyDrawings.test.tsx`, `web/src/lib/data/home.ts`, `web/src/lib/data/home.test.ts`, `web/src/app/page.tsx`, `web/src/app/page.test.tsx`, `web/src/components/AppFrame.tsx`, `web/src/components/ThemeSwitch.tsx`, `web/public/validation/tests.json`, `web/README.md`

**Interfaces:**
- Produces (part 2 builds on these):
  - Tokens with the values of spec 4.1 (page `#dedcd6` / `#171716`, ink `#000000` / `#f3f2ee`, stage `#000000`); radii: `.stage` 6 px with a 1 px `--stage-line` edge, `.panel` `.btn` `.field` 8 px.
  - `.display`: display family at 87.5 % width, weight 700, tight leading. Sizes come from utilities.
  - `.reveal-line` and `.reveal-after`: the one page-load motion (wipe left to right, then fade in); off under reduced motion.
  - `rowGeometry(...)`: `hillEdge` leaves out the stretches where the hills are above the range (they run off the top); `RowGeometry.clipped: boolean` says whether any hill does.
  - `scaleLabelSide(hidden: { fromPct: number; toPct: number; set: LabelSide; rise: LabelSide } | null, need?: number): 'left' | 'right' | null`: the side of the chart where the height-line words do not collide with the night, sunset or sunrise labels; `null` when both sides are busy.
  - `SkyRow` props: `el, hill, visible, az?, startUtc, body, caption, height = 200, ticks = true, reveal = false`. Edge labels sit `var(--chart-inset, 10px)` from the sides, so a full-bleed chart can align them with the page gutter. Two dotted height lines with the words "5° up" and "level ground". Hills that run off the top fade out.
  - `SkyRowKey({ body, compass? })`: a list of the three marks ("height of the Sun", "Sun hidden", "hills in the Sun's direction"), plus the compass sentence when `compass`. Inherits its text colour.
  - `PLACES` in `web/src/lib/data/home.ts` (replaces `MISSIONS`): de Gerlache Rim 2 first, then the Athena lander (IM-2), then the Blue Ghost lander.

- [ ] **Step 1: Tokens and classes, test first** (`globals.test.ts`: the new approved values; the stage is true black and the dark page is lighter than it; status and identity text colours also pass AA on the page; `.display`, `.reveal-line`, `.reveal-after` exist; radii of `.stage`, `.panel`, `.btn`, `.field`). `layout.tsx` loads the display face with `axes: ['opsz', 'wdth']`.
- [ ] **Step 2: Chart geometry, test first** (`skyrow.test.ts`: clipped stretches leave the edge; `clipped` flag; `scaleLabelSide` cases: no night, night on the left, night on the right, labels outside a short night, both sides busy).
- [ ] **Step 3: `SkyRow` and `SkyRowKey`, test first** (two height lines with words; no words when both sides are busy; `ticks={false}`; fade only when hills are clipped; `reveal` classes; key wording for the Sun and for Earth; every label at least 15 px).
- [ ] **Step 4: Drawings, test first** (middle drawing: its own title line with the distance, "rim: sunlit all month", "sunlit 45 % of the month").
- [ ] **Step 5: Home page, test first** (hero holds the forecast with title, key, note and link; no "See it at a real site" section; "Start from a real place" with the picture and the three places in list order; "Checked against NASA" as a table with four column heads and three rows; audience line; one gold action).
- [ ] **Step 6: Look at it** at 1440 by 900, 1280, 1024, 820 and 390 px in both themes: no sideways scroll, no label collisions, first screen holds the whole forecast at 1440 by 900; measure text sizes and control heights; old pages still readable.
- [ ] **Step 7: Gates, badge, README, commit.**

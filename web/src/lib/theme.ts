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

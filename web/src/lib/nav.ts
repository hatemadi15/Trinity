/**
 * The sections in plain words, for the header (AppFrame) and the stand view's links to How it works and
 * Accuracy (19.3), which has no header. "Choose a site" opens the site list, as its heading says.
 */
export const NAV = [
  { href: '/sites', label: 'Choose a site' },
  { href: '/compare', label: 'Compare sites' },
  { href: '/learn', label: 'How it works' },
  { href: '/validate', label: 'Accuracy' },
  { href: '/plan', label: 'Plan a landing' },
] as const;

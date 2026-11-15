/**
 * The header's three choices, in the words of the home page's first screen: a known site, a place of the visitor's
 * own, or sites side by side. Nothing else stands in the header's row.
 */
export const CHOICES = [
  { href: '/sites', label: 'Known sites' },
  { href: '/explore?own=1', label: 'Your own site' },
  { href: '/compare', label: 'Compare' },
] as const;

/** The two pages about the app itself: quiet links in the header's About menu and in the footer of every page. */
export const ABOUT = [
  { href: '/learn', label: 'How it works' },
  { href: '/validate', label: 'Accuracy' },
] as const;

/** Every section, for the stand view's links to How it works and Accuracy (19.3), which has no header. */
export const NAV = [...CHOICES, ...ABOUT] as const;

/** What a column is called on the page: the first is the visitor's own landing, the others are numbered. */
export const landingTitle = (index: number) => (index === 0 ? 'Your landing' : `Landing ${index + 1}`);

/** A landing's own colour (globals.css: --landing-1 to --landing-4), on its card, its bars and its strip. */
export const landingColor = (index: number) => `var(--landing-${(index % 4) + 1})`;

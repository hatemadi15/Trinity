import { describe, expect, it, vi } from 'vitest';
import { metadata as brief } from './brief/page';
import { metadata as compare } from './compare/page';
import { metadata as compareBrief } from './compare/brief/page';
import { metadata as explore } from './explore/page';
import { metadata as stand } from './explore/stand/page';
import { metadata as learn } from './learn/page';
import { metadata as sites } from './sites/page';
import { metadata as validate } from './validate/page';

// A page hands one view to Next and sets its title. Only the title is read here, so the views (charts, three.js) stay unloaded.
vi.mock('@/components/BriefView', () => ({ BriefView: () => null }));
vi.mock('@/components/CompareView', () => ({ CompareView: () => null }));
vi.mock('@/components/compare/ComparisonBrief', () => ({ ComparisonBrief: () => null }));
vi.mock('@/components/ExploreView', () => ({ ExploreView: () => null }));
vi.mock('@/components/stand/StandView', () => ({ StandView: () => null }));
vi.mock('@/components/sites/SitesView', () => ({ SitesView: () => null }));
vi.mock('@/components/ValidateView', () => ({ ValidateView: () => null }));

// Plain strings, so the layout's template adds " · Earthrise" to each. The names follow the header's sections and each page's own heading.
const ROUTES = [
  { route: '/sites', metadata: sites, title: 'Choose a landing site' },
  { route: '/explore', metadata: explore, title: 'The forecast' },
  { route: '/compare', metadata: compare, title: 'Compare sites' },
  { route: '/validate', metadata: validate, title: 'Accuracy' },
  { route: '/learn', metadata: learn, title: 'How it works' },
  { route: '/brief', metadata: brief, title: 'The brief' },
  { route: '/compare/brief', metadata: compareBrief, title: 'The comparison brief' },
  { route: '/explore/stand', metadata: stand, title: 'Stand on the Moon' },
];

describe('route titles', () => {
  it.each(ROUTES)('$route is titled "$title"', ({ metadata, title }) => {
    expect(metadata.title).toBe(title);
  });
});

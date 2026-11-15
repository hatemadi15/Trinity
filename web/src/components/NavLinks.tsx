'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CHOICES } from '@/lib/nav';

/**
 * The header's three choices, the same three as the home page's first screen: the page's own is underlined and marked
 * as current; the others underline from the left on hover. They stand in one row at every width.
 */
export function NavLinks() {
  const path = usePathname() ?? '';
  return (
    <>
      {CHOICES.map((item) => {
        // "Your own site" is one state of Explore, not a page: it is never marked as the current page.
        const here = !item.href.includes('?') && (path === item.href || path.startsWith(`${item.href}/`));
        return (
          <Link key={item.href} href={item.href} aria-current={here ? 'page' : undefined} className={`link-line whitespace-nowrap pb-0.5 ${here ? 'text-ink' : 'text-ink-2 hover:text-ink'}`}>
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

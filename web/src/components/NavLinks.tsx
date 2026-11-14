'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV } from '@/lib/nav';

/** The four sections, the page's own underlined and marked as current; the others underline from the left on hover. */
export function NavLinks() {
  const path = usePathname() ?? '';
  return (
    <>
      {NAV.map((item) => {
        const here = path === item.href || path.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href} aria-current={here ? 'page' : undefined} className={`link-line whitespace-nowrap pb-0.5 ${here ? 'text-ink' : 'text-ink-2 hover:text-ink'}`}>
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

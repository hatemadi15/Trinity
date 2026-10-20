import Link from 'next/link';
import { AppFrame } from '@/components/AppFrame';

const LINK = 'font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink';

/** What a wrong address shows: the usual frame, one plain sentence, and the three places a visitor most likely wanted. */
export default function NotFound() {
  return (
    <AppFrame>
      <main className="wrap pb-16 pt-10">
        <h1 data-band-end="" className="display text-[40px] leading-tight">There is no page at this address.</h1>
        <p className="mt-3 max-w-[46em] text-lg text-ink-2">
          Go to{' '}
          <Link href="/" className={LINK}>
            the home page
          </Link>
          , open{' '}
          <Link href="/sites" className={LINK}>
            Choose a landing site
          </Link>
          , or see{' '}
          <Link href="/explore" className={LINK}>
            the forecast
          </Link>
          .
        </p>
      </main>
    </AppFrame>
  );
}

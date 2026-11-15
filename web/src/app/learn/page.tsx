import type { Metadata } from 'next';
import Link from 'next/link';
import { AppFrame } from '@/components/AppFrame';
import { Fold } from '@/components/Fold';
import { WhySection } from '@/components/home/WhySection';
import { SCIENCE, STORY_STEPS } from '@/lib/learn/story';
import { COLD_TRAPS } from '@/lib/learn/coldtraps';

export const metadata: Metadata = { title: 'How it works' };

/** How it works: why the pole is hard (the three facts as charts), the science behind it, then five steps through the pages, then the way in. */
export default function LearnPage() {
  return (
    <AppFrame>
      <main className="pb-16">
        <div className="wrap pt-10">
          <h1 data-band-end="" className="display text-[44px] leading-tight sm:text-[56px]">How it works</h1>
          <p className="mt-3 max-w-[42em] text-lg leading-relaxed text-ink-2">
            Earthrise works out, hour by hour, where the Sun and Earth are as seen from one spot on the Moon, whether they have set behind the hills, and what that means for a
            solar lander and its radio.
          </p>
          {/* The teacher's tip stays, one tap away (spec 15.1, 20.1): the toggle is its question. */}
          <Fold label="Showing it to a class?" className="mt-3 max-w-[42em] text-lg leading-relaxed text-ink-2">
            <p>On a projector, zoom the page to 150 % (Ctrl and +, or ⌘ and + on a Mac): the words, the charts and the views all grow, and nothing runs off the side.</p>
          </Fold>
        </div>
        <WhySection />
        <section aria-labelledby="h-science" className="wrap pt-16">
          <h2 id="h-science" className="display text-[34px] sm:text-[40px]">
            The science behind the three facts
          </h2>
          <div className="mt-7 grid gap-x-10 gap-y-7 md:grid-cols-2">
            {SCIENCE.map((x) => (
              <div key={x.title} className="max-w-[38em]">
                <h3 className="display text-[23px] font-semibold leading-tight">{x.title}</h3>
                <p className="mt-2 leading-relaxed text-ink-2">{x.body}</p>
              </div>
            ))}
          </div>
        </section>
        {/* Where Explore's "What a cold trap is" lands: why cold traps matter and what the modelled layer does not establish. */}
        <section id="cold-traps" aria-labelledby="h-cold-traps" className="wrap pt-16">
          <h2 id="h-cold-traps" className="display text-[34px] sm:text-[40px]">
            Cold traps: where ice could last
          </h2>
          <div className="mt-7 grid gap-x-10 gap-y-7 md:grid-cols-2">
            {COLD_TRAPS.map((x) => (
              <div key={x.title} className="max-w-[38em]">
                <h3 className="display text-[23px] font-semibold leading-tight">{x.title}</h3>
                <p className="mt-2 leading-relaxed text-ink-2">{x.body}</p>
              </div>
            ))}
          </div>
        </section>
        {/* Where the home page's "run it offline" lands: what a laptop needs, in a reader's words; the commands stay in the README. */}
        <section id="offline" aria-labelledby="h-offline" className="wrap pt-16">
          <h2 id="h-offline" className="display text-[34px] sm:text-[40px]">
            Running it offline
          </h2>
          <p className="mt-5 max-w-[42em] leading-relaxed text-ink-2">
            Everything is computed in the browser from NASA data, so once the app and its data files are on a laptop it runs with the Wi-Fi off: in a classroom, at a venue, or
            anywhere a connection cannot be counted on. The steps to build it that way are in the project&apos;s{' '}
            <a href="https://github.com/hatemadi15/Trinity#readme" className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
              README
            </a>
            . The live re-check against JPL Horizons on the Accuracy page is the one thing that needs a connection.
          </p>
        </section>
        <section aria-labelledby="h-steps" className="wrap pt-16">
          <h2 id="h-steps" className="display text-[34px] sm:text-[40px]">
            Five steps through the pages
          </h2>
          <ol aria-label="Five steps" className="mt-7 grid gap-5 lg:grid-cols-2">
            {STORY_STEPS.map((step, i) => (
              <li key={step.title} className="panel flex gap-5">
                <span aria-hidden="true" className="display w-8 shrink-0 text-[34px] leading-none text-ink-2">
                  {i + 1}
                </span>
                <div>
                  <h3 className="display text-[23px] font-semibold leading-tight">{step.title}</h3>
                  <p className="mt-2 leading-relaxed text-ink-2">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <Link href="/sites" className="btn btn-primary mt-8 h-[52px] px-[22px] text-[17px]">
            Choose a landing site
          </Link>
        </section>
      </main>
    </AppFrame>
  );
}

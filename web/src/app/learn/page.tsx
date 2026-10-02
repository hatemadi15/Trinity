import Link from 'next/link';
import { AppFrame } from '@/components/AppFrame';
import { WhySection } from '@/components/home/WhySection';
import { STORY_STEPS } from '@/lib/learn/story';

/** How it works: why the pole is hard (the home page's three drawings), then five steps through the pages, then the way in. */
export default function LearnPage() {
  return (
    <AppFrame>
      <main className="pb-16">
        <div className="wrap pt-10">
          <h1 className="display text-[44px] leading-tight sm:text-[56px]">How it works</h1>
          <p className="mt-3 max-w-[42em] text-lg leading-relaxed text-ink-2">
            Earthrise works out, hour by hour, where the Sun and Earth are as seen from one spot on the Moon, whether the hills hide them, and what that means for a
            solar lander and its radio. Everything comes from NASA data: the shape of the ground, and where the Sun and Earth are at every hour.
          </p>
        </div>
        <WhySection teaching={false} />
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

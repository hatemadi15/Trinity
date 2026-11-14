/*
 * Spoken numbers and dates as the app writes them, for Luna and for the planner's specification parser. Kept apart from
 * Luna's commands so that code running in the planner's worker never pulls in the assistant, its actions or the
 * stores, which start workers of their own.
 */

const UNITS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TEENS: Record<string, number> = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const ORD_UNITS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9 };
const ORD_TEENS: Record<string, number> = { tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19 };
const ORD_TENS: Record<string, number> = { twentieth: 20, thirtieth: 30 };

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/**
 * Spoken numbers written as the app writes them: "rim two" → "rim 2", "fourteen days" → "14 days", "the twentieth of
 * January" → "the 20th of January", and a year said in two pairs ("twenty twenty seven") or with "thousand" → 2027.
 */
export function spokenToDigits(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  const at = (j: number) => words[j]?.toLowerCase() ?? '';
  // One number from word j: its value, whether it is an ordinal, and the word after it.
  const chunk = (j: number): { v: number; ord: boolean; next: number } | null => {
    const w = at(j);
    if (w in TENS) {
      const n = at(j + 1);
      if (n in UNITS && UNITS[n] > 0) return { v: TENS[w] + UNITS[n], ord: false, next: j + 2 };
      if (n in ORD_UNITS) return { v: TENS[w] + ORD_UNITS[n], ord: true, next: j + 2 };
      return { v: TENS[w], ord: false, next: j + 1 };
    }
    if (w in TEENS) return { v: TEENS[w], ord: false, next: j + 1 };
    if (w in UNITS) return { v: UNITS[w], ord: false, next: j + 1 };
    if (w in ORD_TENS) return { v: ORD_TENS[w], ord: true, next: j + 1 };
    if (w in ORD_TEENS) return { v: ORD_TEENS[w], ord: true, next: j + 1 };
    if (w in ORD_UNITS) return { v: ORD_UNITS[w], ord: true, next: j + 1 };
    return null;
  };
  const out: string[] = [];
  for (let i = 0; i < words.length; ) {
    const c = chunk(i);
    if (!c) {
      out.push(words[i]);
      i++;
      continue;
    }
    // "two thousand (and) twenty seven".
    if (!c.ord && at(c.next) === 'thousand') {
      let v = c.v * 1000, j = c.next + 1;
      if (at(j) === 'and') j++;
      const r = chunk(j);
      if (r && !r.ord) {
        v += r.v;
        j = r.next;
      }
      out.push(String(v));
      i = j;
      continue;
    }
    // "twenty twenty seven": a year said in two pairs.
    if (!c.ord && (c.v === 19 || c.v === 20)) {
      const r = chunk(c.next);
      if (r && !r.ord && r.v >= 10) {
        out.push(String(c.v * 100 + r.v));
        i = r.next;
        continue;
      }
    }
    out.push(c.ord ? ordinal(c.v) : String(c.v));
    i = c.next;
  }
  return out.join(' ');
}

/** "the 20th of January" and "January the 20th", as the planner's dates read: "20th January", "January 20th". */
export function tidyDates(t: string): string {
  return t.replace(/\b(?:the )?(\d{1,2}(?:st|nd|rd|th)) of ([a-z]+)/g, '$1 $2').replace(/\b([a-z]+) the (\d{1,2}(?:st|nd|rd|th))\b/g, '$1 $2');
}

# Earthrise: 2-Minute Pitch Script

- **Team:** As-Troy\Ed
- **Event:** 2026 NASA Space Apps Challenge: Lunar Landing Site Navigator (confirm the official title: see the notes)
- **Tone:** professional, with a playful streak
- **Cast:** A, B, C, D (all four appear on camera)
- **Props:** a flashlight (the Sun), a tennis ball (the Moon), a sticky note that says "+5 DAYS", a laptop
  running a local build with `?demo=1`, offline

## 0:00–0:15 | Cold open (live, all four)

*Dark room. A holds the ball, B holds the flashlight low and sideways, C and D lean in.*

**A:** Quick question. You've landed at the Moon's south pole. How long do you have power?

**B** *(sweeps the flashlight along the ball)*: Depends. Which hill is the Sun hiding behind?

**C:** And is Earth even in the sky?

**D** *(slaps the "+5 DAYS" note on the ball)*: Oh, and your launch just slipped five days.

*Title card: EARTHRISE. "See when a Moon lander has sunlight and a signal."*

## 0:15–0:28 | The problem (voiceover over the south pole fly-in)

**B (V.O.):** Near the south pole, the Sun never climbs. It skims the horizon, so hills decide who
gets light.

**C (V.O.):** Earth sets too, and that cuts the radio link. And when a date slips, planners redo it
all in tools built for specialists.

*On screen: a cluttered spreadsheet gets a "NOPE" stamp.*

## 0:28–0:38 | Meet Earthrise (live, D to camera, then screen recording)

**D:** Earthrise compares landing sites and dates, hour by hour. When does the Sun clear the hills?
When is Earth in view? How long does a solar lander keep power?

*Screen: "Fly to the south pole": the Moon turns and comes closer, down to the pole and the ridge.*

## 0:38–1:28 | Demo: the five-day slip (screen recording, with reaction cutaways)

**A (V.O.):** Pick a site: Apollo landings, Artemis III candidate regions, and landers from CLPS and
other countries. We land at de Gerlache Rim 2 on 1 January 2027.

**A (V.O.):** The answer comes first: power for 3 days 4 hours, then night. With the time left
until sunset, and every radio window.

*Screen: the answer, the countdown to sunset, the list of radio windows.*

**B (V.O.):** Now the slip. One click: five days later.

*Screen: Compare, with the original landing and the delayed one side by side, each change from the
original in signed numbers.*

**B (V.O.):** [Read the change off the screen, for example: "We lose a day of power, and the radio
gap grows."]

**C (V.O.):** So find a nearby alternative. Earthrise checks the spots around us against our
requirements and ranks them.

**C (V.O.):** [Read the winner off the screen, for example: "This spot keeps power longer, and Earth
is in view when we land."]

*Cutaway: A and B high-five.*

**D (V.O.):** Then stand on the Moon. Watch the lander come down and touch down in a puff of dust,
under the real Sun and stars for that hour.

*Cutaway: D "floats" in front of the screen in slow motion.*

**B (V.O.):** Or just ask Luna: "Find the best landing date for 14 days."

## 1:28–1:48 | Why trust it (live, quick cuts, one line each)

**C:** The Sun and Earth directions are checked against NASA JPL's Horizons.

**A:** Sunlight is compared with NASA's LOLA illumination maps, like for like.

**B:** Every sunset time comes with its error bars.

**A:** And one check misses: our shadows against 20 pictures from orbit, where 17 meet the mark.

**D:** And it never oversells: Earth in view is a line of sight, not a booked antenna. It all runs
in your browser, even with the Wi-Fi off.

*Gag: B dramatically unplugs the router.*

## 1:48–2:00 | Close (live, all four, ball on the desk)

**All:** Earthrise. Know your light before you land.

*End card: Earthrise logo, "2026 NASA Space Apps Challenge: Lunar Landing Site Navigator",
As-Troy\Ed, repo link.*

*Stinger: A drops the Moon ball, "+5 DAYS" note and all, and it rolls out of frame.*

## Production notes

- **Length:** about 300 spoken words with the two read-off lines, which fits two minutes at a lively
  pace. If you run over, cut the Luna line first, then the stand-on-the-Moon line.
- **Live vs. screen:** the cold open, the intro, the trust section and the close are live (about
  55 seconds). The demo is screen recording with voiceover.
- **What changed from the last draft:**
  - The demo now follows the five-day-slip story: the original landing, the same site five days
    later, a nearby alternative, and the trade-offs in sunlight, powered time and Earth contact.
  - "19 real places" is out of date: the catalogue adds Apollo sites, other countries' landers and
    coming CLPS missions. Say a count only after checking the Sites page.
  - The trust lines no longer say "all three checks pass" or that sunsets were checked against how
    missions ended. The technical review called both overstatements: mission end times are context,
    not a check, and each check now says what it shows and what it does not.
  - "Ask in plain words" is now Luna, the voice assistant.
- **Record after these land.** They are being built today, and each is pushed as soon as it is
  done: the five-day slip in Compare, the nearby alternatives with requirements, the countdown and
  radio windows, the error bars on times, the landing animation, and the new sites. Button names
  may differ slightly from the lines above: use what the final build shows.
- **Recording setup:** a local production build with the full data (`npm run build`, then
  `npm start`), at http://localhost:3000/?demo=1. Set the period from 1 January 2027 for 30 days
  and the small lander, as in the demo checklist.
- **Luna and the router gag:** Chrome's and Edge's speech recognition needs the internet, so record
  Luna's line before unplugging the router, or type to her (typing works offline). Everything else
  runs offline from the prepared laptop build.
- **Read these from the final build, not from this script:** the "3 days 4 hours" result, the
  changes after the five-day slip, which nearby alternative wins and why, and how the error bars
  read. The bracketed lines are placeholders for them.
- **Challenge name:** still unconfirmed. A web search found neither "Lunar Landing Site Navigator"
  nor the README's "CLPS Lunar Mission Browser". Check the official challenge listing, and make the
  end card and the README say the same name.

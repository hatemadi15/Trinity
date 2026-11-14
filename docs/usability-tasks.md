# Usability tasks: planners, educators and the public

Repeatable tasks for testing Earthrise with real people. The browser journeys (`web/e2e`, `npm run e2e`) show that the app works when driven by a script. They do not show that people can use it. These tasks are for that.

**Status: pending. None of these tasks has been run with real people yet.** The results table at the end is empty on purpose. Until sessions are run and recorded there, the app must not claim that it is easy to use, that people can complete a task quickly, or that it has been tested with users.

## How to run a session

- **Who:** one person at a time, in one of three groups. A mission planner works in or studies lunar mission design (power, communications, landing-site selection). An educator teaches science to ages 12 to 18 or runs outreach. A member of the public is curious and has no space background. Aim for three people per group. Five is better.
- **Setup:** a laptop with Chrome or Edge at 100 % zoom and the production build (`npm run build`, then `npm start`) or the live URL. Use a fresh tab without `?demo=1`. For the phone task, use a phone, or Chrome's device toolbar at 390 × 844. Before each person, set the period to 1 January 2027 for 30 days and the lander to the small one, and empty Compare.
- **Script:** read the goal aloud, in the words below, and say nothing else about the app. Ask the person to think aloud. Give help only when they are stuck for two minutes, and note the help.
- **Record:** the time from the first click to success (or to giving up), whether they succeeded without help, the help given, and every wrong turn: a page they opened by mistake, a control they tried that did nothing, or a word they misread. At the end, ask "What did the page tell you?" and write down the answer in their words. Then ask them to rate how easy the task was from 1 (very hard) to 5 (very easy).
- **Success:** each task names what success looks like. A task counts as a success only if the person reaches it and can say the answer back correctly.

## Mission planner

### P1. Read the forecast for a site and date

- **Goal, in their words:** "We plan to land at de Gerlache Rim 2 on 1 January 2027 with a small lander. How long will it have power, and will it be able to talk to Earth while it does?"
- **Start:** the home page (`/`).
- **Success:** they reach Explore for de Gerlache Rim 2 from 1 January 2027 and give both answers in their own words: the hours or days with power, and whether there is radio contact while the lander has power.
- **Time and note:** the time to the answer; the route they took (Choose a site, the home page's buttons, or the address bar); whether they found "Why this happens" without help.

### P2. The landing slips by five days

- **Goal, in their words:** "Our landing slipped by five days. Show what changed at the original site, which nearby alternative works better, and the sunlight, powered-time and Earth-contact trade-offs behind that recommendation."
- **Start:** Explore at de Gerlache Rim 2, 1 January 2027, 30 days, small lander.
- **Success:** they change the date to 6 January 2027, say what changed at the original site, name the nearby site the app advises, and compare the two sites side by side (in Compare, or with the scenario comparison once it is in the app). They can then state one trade-off in each of sunlight, time with power and Earth contact.
- **Time and note:** the time to each of the four parts; whether they used the nearby advice or searched on their own; whether the trade-offs read as a recommendation or only as numbers.

### P3. Change the lander and keep a record

- **Goal, in their words:** "Our lander has an 8 m² panel, uses 400 W and has a 20 kWh battery. Redo the forecast for it and print one page for the team."
- **Start:** Explore, as left at the end of P2.
- **Success:** they choose the medium lander (or enter the numbers under Custom), see that the figures change, and open the printable brief. The brief shows the right site, period and lander.
- **Time and note:** whether they found the lander control; whether they trusted the ready-made lander or entered the numbers themselves; what they expected the brief to contain that it did not.

## Educator

### E1. Show a class why the south pole is hard

- **Goal, in their words:** "I teach 14-year-olds. I want to show in two minutes why the Sun at the Moon's south pole never gets high, and why that matters for a lander."
- **Start:** the home page.
- **Success:** they find "See why the pole is hard" or How it works, and can explain the low Sun and the long shadows in their own words, using a picture from the app.
- **Time and note:** the time to the first picture they would show; whether they would use the flight ("Fly to the south pole") in class; any word they say their pupils would not understand.

### E2. Stand at the site and watch a month go by

- **Goal, in their words:** "Let the class stand where the lander stands and see when the Sun sets and when Earth rises."
- **Start:** Explore at de Gerlache Rim 2, 1 January 2027.
- **Success:** they open the view from the site, press Play (or step with Next), and point out the sunset and Earth rising, with their dates.
- **Time and note:** the time to the first key moment; whether they found Play, Next and the moments' dots; whether the words over the view helped or got in the way. With reduced motion turned on in the system, note whether they understood why Play was off.

### E3. Is the forecast right?

- **Goal, in their words:** "A pupil asks how we know these numbers are right. Find the answer."
- **Start:** any page.
- **Success:** they reach Accuracy and say back, in plain words, what one check compares and how close it came.
- **Time and note:** the route they took; which check they chose and why; whether "Show the numbers" helped.

## Member of the public

### G1. What is this app for?

- **Goal, in their words:** "A friend sent me this link. What does it do?"
- **Start:** the home page, on a phone (390 px wide).
- **Success:** within the first screen or two, they can say that the app forecasts sunlight and contact with Earth for Moon landing sites.
- **Time and note:** the time until they can say it; how far they scrolled; whether the flight played and whether they liked it.

### G2. Find a place that keeps its power

- **Goal, in their words:** "Find a place near the south pole where a lander would keep its power through January 2027."
- **Start:** the home page, on a phone.
- **Success:** they open Choose a site (or follow the nearby advice in Explore) and name a site that keeps power for the 30 days from 1 January 2027.
- **Time and note:** whether they read the list or the map; every tap that did nothing; whether they scrubbed the time bar with a finger, and whether it did what they expected.

### G3. Ask in plain words

- **Goal, in their words:** "Ask the app, in your own words, when Earth rises at de Gerlache Rim 2 in January 2027."
- **Start:** Explore at de Gerlache Rim 2.
- **Success:** they find "Or ask in plain words" and get an answer that names a date, which they can check against the time bar.
- **Time and note:** what they typed; whether the reply answered the question; whether they noticed the line saying who wrote the reply.

## Results

Pending: no session has been run. Fill in one row per person and task, and keep the notes from each session beside this file.

| Date | Group | Person (code) | Task | Device | Success without help | Time | Help given | Wrong turns | Ease (1–5) | Notes |
| ---- | ----- | ------------- | ---- | ------ | -------------------- | ---- | ---------- | ----------- | ---------- | ----- |
| pending | | | | | | | | | | |

### Summary per task

| Task | People | Succeeded without help | Median time | Median ease | Main problem seen |
| ---- | ------ | ---------------------- | ----------- | ----------- | ----------------- |
| P1 | pending | | | | |
| P2 | pending | | | | |
| P3 | pending | | | | |
| E1 | pending | | | | |
| E2 | pending | | | | |
| E3 | pending | | | | |
| G1 | pending | | | | |
| G2 | pending | | | | |
| G3 | pending | | | | |

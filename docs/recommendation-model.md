# The ranking rule

Earthrise ranks every recommendation with one rule, in `web/src/lib/plan/rank.ts`: the better landing time in a
period and the better place nearby on Explore (and every option under "Options"), the 12-month search, the
nearby alternative in Compare, and the sites and landing times the planner at `/plan` finds.

1. **The mission's requirements first.** A choice that meets every requirement the planner set ranks above any
   choice that fails one; among those that fail, fewer failures rank first. The requirements are the planner's
   own four: power for at least so long, Earth in view at landing or within so many hours of it, the longest time
   without Earth while powered at most so long, and Earth contact while powered at least so long
   (`web/src/lib/plan/requirements.ts`).
2. **Then the objective the user picks.** By default, the longest continuous time with power from landing, with
   ties going to more Earth contact while powered. The planner also offers the most Earth contact while powered
   and the earliest landing. Or the user weighs three measures by priority, with the rule below.
3. **Ties** go to the earlier time or the nearer place, and the page says the two tie.

The rule in use is stated wherever recommendations appear: in Explore's Options fold, in the 12-month search's
note, in the planner's read-back and its "Ranking and dates", and, when priorities are chosen, in Compare's note on
the nearby alternative it finds. Explore's addresses carry the ranking (`rank=balanced`, `power`, `contact`, `gap`,
or three weights such as `rank=1,7,3`), so a shared link opens with the same order.

## Weighed by priorities

The user picks priorities for three measures, each from 0 to 100 with at least one above 0: balanced (1, 1, 1),
mostly power (5, 1, 1), mostly Earth in view (1, 5, 1), mostly shorter gaps (1, 1, 5), or weights of their own.
For a landing with a stay of S hours:

| Measure | Share x of the stay |
|---|---|
| Power | hours with power in a row from landing, to the first hour the battery cannot cover, over S |
| Earth in view | hours with Earth in view while the lander has power, before that first power cut, over S |
| Shorter gaps | one minus the longest stretch of the stay without Earth in view, over S |

Each share counts as f(x) = 0.55x + 0.30√x + 0.15x². f runs from 0 (none of the stay) to 1 (all of it), rises
with x, gives most for the first hours (the square root) and still rewards the last ones (the square). The score is

    score = 100 × (w_power f(x_power) + w_earth f(x_earth) + w_gap f(x_gap)) / (w_power + w_earth + w_gap)

so 100 means power and Earth contact for the whole stay and Earth never out of view, and 0 means none of the three.
Each measure's part of the score is its own term of that sum; the options show the score and the three parts, and
"why it ranks above the next" gives both scores and their parts. The gap counts over the whole stay, not only while
the lander has power: counted only while powered, a lander that lost power early would score well on gaps for being
off.

The score is a preference between choices under the stated priorities. It is not a probability that a landing
works, and it knows only these three measures: not the terrain's hazards, the science at a site, the cold of the
night, the radio link itself or a ground station's schedule. The engine's figures behind it (the time with power,
the Earth contact, the longest gap) are what the forecast is; the rule only orders choices by them.

The weights and the curve are a stated choice, not a fitted or validated one: they came with the mission planning
work on Maroun's branch, and anyone can change them in `rank.ts`. The tests (`rank.test.ts`) hold the rule to its
statement: 100 at the best and 0 at none, never lower when one measure improves and the others stay, the order
changing with the priorities, requirements still deciding first, ties within a billionth, and priorities outside
0 to 100 or all zero refused.

## Why there is no trained model

Maroun's branch also trained a model for this ranking: a pairwise logistic ranker, nine nonnegative weights over
x, √x and x² of the three shares, fitted on 3,888 simulated forecasts (18 polar sites, a landing on the first of
every month, stays of 14, 30 and 90 days, three ready-made landers, 2027 and 2028). There are no expert-rated
mission preferences and no flight outcomes to learn from, so its labels were made by this very rule: for each pair
of forecasts, the sigmoid of eight times the difference of their scores. It then agreed with the rule on 100 % of
the pairs it was tested on: 18,000 in training, 3,000 at five sites held out, and 5,000 in the year 2028 held out.

That is what a model learns from labels a formula wrote in its own terms: the formula back. It would add a
training step, a 38,900-line data file and a second source of truth that could only drift from the rule, and it
would lend a trained model's authority to what is a stated choice. So the app uses the rule directly, says what it
is, and never calls it AI, machine learning or a trained recommendation. The model, its training data and its
scripts are kept only in the history of Maroun's branch (commit `b91ba4f`).

## What would justify a learned ranker later

- Preferences that do not come from a formula: real candidate landings that mission planners compared, with the
  choice made and the reason, collected before any model is fitted.
- A held-out set that stays untouched until the end: other planners, other missions or other years than the ones
  trained on.
- A measured gain: the model must order the held-out choices better than this rule and better than a plain
  weighted sum of the three shares. Without that, the rule stays.
- Measures a rule cannot weigh well, with data behind them, such as terrain hazards, thermal limits or
  ground-station time, which these three shares leave out.

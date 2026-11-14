# Mission recommendation model

The Plan page now ranks saved scenarios using three metrics: continuous powered hours,
powered hours with Earth in view, and the longest Earth-hidden gap. A user chooses a mission
priority or adjusts the three weights. Must-have requirements remain separate.

## How to use it

1. Open `/plan`, save the original arrival and alternatives, and select the lander settings.
2. Set the minimum powered hours, minimum powered Earth-visible hours and maximum Earth-hidden gap.
3. Choose balanced priorities, powered operation, Earth-visible time, shorter gaps, or custom weights.
4. Read the recommendation, score contributions and exclusion reasons. Open the recommended forecast
   to see the physical explanation. Shared links and local storage retain the priorities.

Only complete polar-terrain forecasts of the same duration as the first saved scenario are ranked.
Every candidate must pass the must-have requirements. A pending forecast prevents a final recommendation;
an unavailable forecast is listed as excluded. The system can return no eligible plan or joint top choices.
It recommends among saved plans, not every possible coordinate/date combination.

## What is trained

This is a small supervised pairwise logistic ranking model, not an LLM and not a manually assigned
score presented as a trained model. Nine nonnegative coefficients are fitted by minimizing pairwise
cross-entropy with Adam and projected nonnegative updates. Inference runs locally in the browser.
There are no new runtime dependencies, API keys or model downloads.

For each metric, three increasing features are used: x, sqrt(x), and x². Here x is the powered
fraction of the forecast, the powered Earth-view fraction, or one minus the Earth-hidden gap fraction.
Each feature is multiplied by that metric's normalized user priority. Nonnegative learned weights
ensure that improving a metric cannot lower a score when other inputs are fixed. Scores are normalized
against an ideal feature vector for the same priorities, rather than against the candidates present.
The 0–100 score is preference utility, **not a probability of success**.

## Training data and its limits

`data/recommendation/metrics.json` contains 3,888 engine-generated forecasts: 18 polar catalogue
points, 12 monthly arrivals, three durations, three illustrative landers and two years (2027–2028).
They use the committed DE440 ephemeris and LOLA terrain masks, a 2 m mast and zero Earth-clearance margin.
They are simulations, not measured mission outcomes.

No expert-rated recommendation dataset is supplied. Pairwise preference labels therefore come from
an explicitly declared bootstrap policy: for each normalized benefit x, use
0.55x + 0.30sqrt(x) + 0.15x², weighted by the user's priorities. Soft pairwise labels use
sigmoid(8 × utility difference). Balanced, single-priority and random custom priorities are sampled.
Pairs whose utility difference is below 0.02 are omitted from training/evaluation.

Training uses 1,404 forecasts from 13 catalogue points in 2027. Five other catalogue points supply
540 validation forecasts in 2027. All 1,944 forecasts from 2028 are held out as a temporal test.
Pairs never cross the train/validation/test split and compare equal forecast durations. The training
seed is fixed; the exported artifact records the input SHA-256, weights, policy, split sizes and results.

The evaluation checks agreement with this synthetic policy, not agreement with engineers or flight
outcomes. Because the teacher policy uses the same feature family, very high agreement is expected.
It does not show that ML improves on implementing that policy directly, nor that the policy represents
every mission. Other dates, hardware, mast heights and custom points are outside the training configurations.
Features remain bounded and eligibility checks still apply, but no expert accuracy is established there.

## Reproduce and inspect

From `web/`, run:

```sh
npm run recommendation:train
npm test -- src/lib/planner/recommendation.test.ts src/components/planner
```

The TypeScript generator uses the production physics functions without the expensive landing-date
search. The Python trainer uses only the standard library. It writes
`web/src/lib/planner/model/ranker.json` (browser artifact) and
`data/recommendation/evaluation.json` (report). Repeating training with unchanged inputs and code
produces the same artifact. Unit and integration tests separately exercise hard exclusions, priority
changes, monotonicity, tied choices, pending results, invalid inputs and shared-plan restoration.

The next useful improvement is a separate expert-reviewed dataset of mission priorities and candidate
preferences, with a truly untouched evaluation set. The interface already keeps physical forecasts,
must-have checks and learned preferences separate so those labels can replace the bootstrap policy.
Science value, landing hazards, thermal survival and actual radio-link performance are not model inputs.

"""Train a monotone pairwise preference ranker. Labels are synthetic policy, NOT expert/flight truth.

Run from web/: npm run recommendation:train
No external Python packages, API keys, or model downloads are required.
"""
import hashlib
import json
import math
from pathlib import Path
import random

ROOT = Path(__file__).resolve().parents[2]
INPUT = ROOT / 'data/recommendation/metrics.json'
data = json.loads(INPUT.read_text())
rng = random.Random(20261114)
def features(row, priorities):
    horizon = row['days'] * 24
    benefit = [row['poweredHours'] / horizon, row['contactHours'] / horizon, 1 - row['longestEarthGapHours'] / horizon]
    total = sum(priorities)
    return [basis * weight / total for value, weight in zip(benefit, priorities) for basis in (value, math.sqrt(value), value * value)]

def target(x):
    # Declared bootstrap preference policy: smooth, monotone benefits with diminishing returns.
    return sum(x[i] * coefficient for i, coefficient in enumerate([.55, .30, .15] * 3))

def sigmoid(x):
    return 1 / (1 + math.exp(-max(-50, min(50, x))))

def pairs(split, count):
    groups = {}
    for row in data['rows']:
        if row['split'] == split:
            groups.setdefault(row['days'], []).append(row)
    output = []
    profiles = [[1, 1, 1], [5, 1, 1], [1, 5, 1], [1, 1, 5]]
    while len(output) < count:
        group = rng.choice(list(groups.values()))
        a, b = rng.sample(group, 2)
        priority = rng.choice(profiles) if rng.random() < .7 else [rng.uniform(.1, 5) for _ in range(3)]
        x, y = features(a, priority), features(b, priority)
        difference = target(x) - target(y)
        if abs(difference) < .02:
            continue
        output.append(([u - v for u, v in zip(x, y)], sigmoid(8 * difference), difference))
    return output

train, validation, test = pairs('train', 18000), pairs('site_validation', 3000), pairs('temporal_test', 5000)
weights, m, v = [.2] * 9, [0.] * 9, [0.] * 9
step = 0
for epoch in range(28):
    rng.shuffle(train)
    for begin in range(0, len(train), 128):
        batch = train[begin:begin + 128]
        gradient = [0.] * 9
        for x, label, _ in batch:
            error = sigmoid(sum(w * value for w, value in zip(weights, x))) - label
            for j in range(9):
                gradient[j] += error * x[j] / len(batch)
        step += 1
        for j in range(9):
            m[j] = .9 * m[j] + .1 * gradient[j]
            v[j] = .999 * v[j] + .001 * gradient[j] ** 2
            weights[j] = max(0., weights[j] - .025 * (m[j] / (1 - .9 ** step)) / (math.sqrt(v[j] / (1 - .999 ** step)) + 1e-8))

def evaluate(rows):
    correct = loss = 0
    for x, label, difference in rows:
        logit = sum(w * value for w, value in zip(weights, x))
        correct += (logit > 0) == (difference > 0)
        predicted = max(1e-12, min(1 - 1e-12, sigmoid(logit)))
        loss -= label * math.log(predicted) + (1 - label) * math.log(1 - predicted)
    return {'pairs': len(rows), 'synthetic_policy_agreement': correct / len(rows), 'cross_entropy': loss / len(rows)}

report = {split: evaluate(rows) for split, rows in [('train', train), ('held_out_sites_2027', validation), ('held_out_year_2028', test)]}
assert report['held_out_year_2028']['synthetic_policy_agreement'] > .95, 'Ranker failed its bootstrap-policy acceptance test.'
artifact = {'version': 1, 'id': 'earthrise-pairwise-v1', 'algorithm': 'Nonnegative pairwise logistic ranker; 9 nonlinear metric features',
    'weights': [round(w, 12) for w in weights], 'seed': 20261114,
    'provenance': 'DE440/LOLA engine simulations with synthetic, rule-generated preference labels. No expert-rated or flight-outcome labels.',
    'policy': 'priority-weighted sum of 0.55*x + 0.30*sqrt(x) + 0.15*x^2 for power fraction, powered Earth-view fraction and 1-Earth-gap fraction',
    'data_sha256': hashlib.sha256(INPUT.read_bytes()).hexdigest(), 'scenario_count': len(data['rows']),
    'scenario_splits': {split: sum(row['split'] == split for row in data['rows']) for split in ['train', 'site_validation', 'temporal_test']},
    'training_year': 2027, 'temporal_test_year': 2028,
    'validation': report, 'score_meaning': 'Relative mission preference utility, not a probability of mission success.'}
destination = ROOT / 'web/src/lib/planner/model'
destination.mkdir(parents=True, exist_ok=True)
(destination / 'ranker.json').write_text(json.dumps(artifact, indent=2) + '\n')
(ROOT / 'data/recommendation/evaluation.json').write_text(json.dumps(artifact, indent=2) + '\n')
print(json.dumps(report, indent=2))

# Target

A Mathler-style puzzle: find the hidden equation that equals the target number.
Runs entirely in the browser from a local file — nothing is sent anywhere.

## Play

Open `index.html` in a browser. Type with the on-screen keypad or the keyboard
(`x` or `*` for ×, `/` or `:` for ÷).

## Rules

- Every guess must be a valid equation of the right length **and** equal the target.
  A guess that misses the target is rejected and does not cost a turn.
- Standard order of operations (× ÷ before + −, left to right). No parentheses.
  Numbers may not start with 0. Intermediate values may be fractions (`7/2*4 = 14`).
- Tiles: green = right symbol in the right slot, yellow = symbol appears elsewhere,
  gray = not in the equation (Wordle multiplicity rules for repeated symbols).
- Structure badge (✓/✗): does the guess have the same digit/operator *shape* as the hidden equation?
- A rearrangement of the hidden equation's symbols that still hits the target counts as a win
  and is shown in canonical (hidden) form.
- Tiers: Easy 5 slots / 1 operator · Medium 6 / 2 · Hard 8 / 2–3. Six guesses.
- Daily: seeded from the date, identical for everyone. Random: fresh puzzle on demand.

## Files

- `engine.js` — tokenizer, exact-rational evaluator, scoring, win check, seeded puzzle generator.
  Loads in the browser (`window.TargetEngine`) and in Node.
- `index.html` — the UI; loads `engine.js`. State and stats live in `localStorage`.
- `test.js` — engine tests: `node test.js`

## Generator constraints

Targets are integers in 10–999; every ÷ in a hidden equation divides exactly; no `×1`, `÷1`,
`a÷a`, `a−a`; Medium/Hard always include at least one × or ÷ and never repeat a single operator.
Puzzle #1 is 2026-09-14 (`EPOCH` in `engine.js`).

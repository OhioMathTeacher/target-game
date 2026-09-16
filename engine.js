/* Target Value Optimization — game engine.
 * Plain JS, works in the browser (window.TargetEngine) and in Node (module.exports).
 * No floating point anywhere: all arithmetic is exact rational arithmetic.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TargetEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const OPS = '+-*/';
  const MAX_GUESSES = 6;
  const EPOCH = '2026-09-14'; // puzzle #1

  // Tiers: slot count, how many operators the hidden equation has, largest allowed target.
  const TIERS = {
    easy:   { label: 'Easy',   length: 5, ops: [1],    max: 999 },
    medium: { label: 'Medium', length: 6, ops: [2],    max: 999 },
    hard:   { label: 'Hard',   length: 8, ops: [2, 3], max: 999 },
  };

  // ---------- exact rational arithmetic ----------
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; }
  function frac(n, d) {
    if (d < 0) { n = -n; d = -d; }
    const g = gcd(n, d) || 1;
    return { n: n / g, d: d / g };
  }
  const F = {
    of:    (i) => ({ n: i, d: 1 }),
    add:   (a, b) => frac(a.n * b.d + b.n * a.d, a.d * b.d),
    sub:   (a, b) => frac(a.n * b.d - b.n * a.d, a.d * b.d),
    mul:   (a, b) => frac(a.n * b.n, a.d * b.d),
    div:   (a, b) => frac(a.n * b.d, a.d * b.n),
    isInt: (a) => a.d === 1,
  };

  // ---------- tokenizer ----------
  // "12+3*4" -> [{type:'num',value:'12'}, {type:'op',value:'+'}, ...]
  function tokenize(expr) {
    const tokens = [];
    let i = 0;
    while (i < expr.length) {
      const c = expr[i];
      if (OPS.includes(c)) { tokens.push({ type: 'op', value: c }); i++; }
      else if (c >= '0' && c <= '9') {
        let j = i;
        while (j < expr.length && expr[j] >= '0' && expr[j] <= '9') j++;
        const s = expr.slice(i, j);
        if (s.length > 1 && s[0] === '0') return { ok: false, error: "Numbers can't start with 0" };
        tokens.push({ type: 'num', value: s });
        i = j;
      } else return { ok: false, error: `Unexpected character "${c}"` };
    }
    if (!tokens.length) return { ok: false, error: 'Empty equation' };
    if (tokens[0].type === 'op') return { ok: false, error: "Can't start with an operator" };
    if (tokens[tokens.length - 1].type === 'op') return { ok: false, error: "Can't end with an operator" };
    for (let k = 1; k < tokens.length; k++) {
      if (tokens[k].type === 'op' && tokens[k - 1].type === 'op') return { ok: false, error: 'Two operators in a row' };
    }
    if (tokens.length < 3) return { ok: false, error: 'Needs at least one operator' };
    return { ok: true, tokens };
  }

  // ---------- evaluator ----------
  // Standard order of operations: * and / first (left to right), then + and - (left to right).
  // opts.exactDivision: fail if any division step produces a non-integer (used when generating).
  function evaluate(expr, opts = {}) {
    const t = tokenize(expr);
    if (!t.ok) return t;
    const toks = t.tokens;
    const terms = [];
    let idx = 0, sign = 1;
    while (idx < toks.length) {
      let val = F.of(parseInt(toks[idx].value, 10)); idx++;
      while (idx < toks.length && (toks[idx].value === '*' || toks[idx].value === '/')) {
        const op = toks[idx].value;
        const rhs = F.of(parseInt(toks[idx + 1].value, 10));
        idx += 2;
        if (op === '*') val = F.mul(val, rhs);
        else {
          if (rhs.n === 0) return { ok: false, error: 'Division by zero' };
          val = F.div(val, rhs);
          if (opts.exactDivision && !F.isInt(val)) return { ok: false, error: 'Division not exact' };
        }
      }
      terms.push({ sign, value: val });
      if (idx < toks.length) { sign = toks[idx].value === '-' ? -1 : 1; idx++; }
    }
    let total = F.of(0);
    for (const term of terms) total = term.sign > 0 ? F.add(total, term.value) : F.sub(total, term.value);
    return { ok: true, value: total, tokens: toks };
  }

  // Digit/operator pattern, e.g. "12+3*4" -> "DDoDoD"
  function shape(expr) {
    return expr.replace(/[0-9]/g, 'D').replace(/[+\-*/]/g, 'o');
  }

  function formatValue(v) {
    return F.isInt(v) ? String(v.n) : `${v.n}/${v.d}`;
  }

  // Is this a legal guess for the puzzle? Doesn't consume a turn if not.
  function validateGuess(guess, target, length) {
    if (guess.length !== length) return { ok: false, error: `Equation must be ${length} characters` };
    const ev = evaluate(guess);
    if (!ev.ok) return ev;
    if (!F.isInt(ev.value) || ev.value.n !== target) {
      return { ok: false, error: `That equals ${formatValue(ev.value)}, not ${target}` };
    }
    return { ok: true, tokens: ev.tokens };
  }

  // Wordle-style per-slot marks with correct handling of repeated symbols.
  function score(guess, hidden) {
    const marks = new Array(guess.length).fill('absent');
    const remaining = {};
    for (let i = 0; i < hidden.length; i++) {
      if (guess[i] === hidden[i]) marks[i] = 'correct';
      else remaining[hidden[i]] = (remaining[hidden[i]] || 0) + 1;
    }
    for (let i = 0; i < guess.length; i++) {
      if (marks[i] === 'correct') continue;
      const c = guess[i];
      if (remaining[c] > 0) { marks[i] = 'present'; remaining[c]--; }
    }
    return marks;
  }

  // A guess wins if it is the hidden string, or a rearrangement of the same symbols
  // that also hits the target (caller has already validated the target).
  function checkWin(guess, hidden) {
    if (guess === hidden) return { win: true, exact: true };
    const sorted = (s) => s.split('').sort().join('');
    if (sorted(guess) === sorted(hidden)) return { win: true, exact: false };
    return { win: false, exact: false };
  }

  // ---------- puzzle generation ----------
  // Enumerate number-length sequences, e.g. length 6 with 2 ops -> [1,1,2],[1,2,1],[2,1,1]
  function shapesFor(length, opCounts, maxNumLen = 3) {
    const out = [];
    for (const k of opCounts) {
      const n = k + 1;
      (function rec(parts, left) {
        if (parts.length === n) { if (left === 0) out.push(parts.slice()); return; }
        const stillNeeded = n - parts.length - 1;
        for (let l = 1; l <= maxNumLen && left - l >= stillNeeded; l++) {
          parts.push(l); rec(parts, left - l); parts.pop();
        }
      })([], length - k);
    }
    return out;
  }

  // Reject equations that are trivially padded: operand 1 next to * or /.
  const TRIVIAL = /(^|[+\-*/])1[*/]|[*/]1($|[+\-*/])/;

  // Reject a/a (=1) and a-a (=0) anywhere in the token stream.
  function hasSelfCancel(tokens) {
    for (let i = 1; i < tokens.length - 1; i += 2) {
      const op = tokens[i].value;
      if ((op === '/' || op === '-') && tokens[i - 1].value === tokens[i + 1].value) return true;
    }
    return false;
  }

  function generatePuzzle(rng, tierKey) {
    const tier = TIERS[tierKey];
    if (!tier) throw new Error(`Unknown tier ${tierKey}`);
    const shapes = shapesFor(tier.length, tier.ops);
    // Choose the operator pattern first, then retry digits many times for that pattern.
    // Retrying digits (rather than resampling operators) keeps the +,-,*,/ mix balanced,
    // since * and / fail the target/exactness checks far more often than + and -.
    for (let outer = 0; outer < 1000; outer++) {
      const lens = shapes[Math.floor(rng() * shapes.length)];
      const ops = [];
      for (let i = 1; i < lens.length; i++) ops.push(OPS[Math.floor(rng() * 4)]);
      if (ops.length > 1 && ops.every((o) => o === ops[0])) continue;      // "1+2+3" is dull
      if (ops.length > 1 && !ops.some((o) => o === '*' || o === '/')) continue; // order of operations should matter
      for (let inner = 0; inner < 400; inner++) {
        let expr = '';
        for (let i = 0; i < lens.length; i++) {
          if (i) expr += ops[i - 1];
          for (let j = 0; j < lens[i]; j++) {
            expr += String(j === 0 ? 1 + Math.floor(rng() * 9) : Math.floor(rng() * 10));
          }
        }
        if (TRIVIAL.test(expr)) continue;
        const ev = evaluate(expr, { exactDivision: true });
        if (!ev.ok || !F.isInt(ev.value)) continue;
        if (hasSelfCancel(ev.tokens)) continue;
        const target = ev.value.n;
        if (target < 10 || target > tier.max) continue;
        return { equation: expr, target, shape: shape(expr), tier: tierKey, length: tier.length };
      }
    }
    throw new Error('Could not generate a puzzle');
  }

  // ---------- seeded randomness (so a daily puzzle is the same for everyone) ----------
  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function seededRng(seed) {
    let a = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function localDateString(d = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function puzzleNumber(dateStr) {
    const days = Math.round((Date.parse(dateStr) - Date.parse(EPOCH)) / 86400000);
    return days + 1;
  }
  function dailyPuzzle(dateStr, tierKey) {
    const p = generatePuzzle(seededRng(`${dateStr}|${tierKey}`), tierKey);
    p.number = puzzleNumber(dateStr);
    p.date = dateStr;
    return p;
  }
  function randomPuzzle(tierKey) {
    const seed = (Math.random() * 4294967296) >>> 0;
    const p = generatePuzzle(seededRng(seed), tierKey);
    p.seed = seed;
    return p;
  }

  return {
    OPS, TIERS, MAX_GUESSES, EPOCH,
    tokenize, evaluate, shape, formatValue, validateGuess, score, checkWin,
    shapesFor, generatePuzzle, seededRng, localDateString, puzzleNumber, dailyPuzzle, randomPuzzle,
  };
});

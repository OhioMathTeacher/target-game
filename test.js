// Run with: node test.js
const assert = require('node:assert/strict');
const E = require('./engine.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error(`FAIL ${name}\n  ${e.message}`); process.exitCode = 1; }
}
const val = (expr) => { const r = E.evaluate(expr); assert.ok(r.ok, r.error); return E.formatValue(r.value); };

// ---- evaluator ----
test('order of operations', () => {
  assert.equal(val('2+3*4'), '14');
  assert.equal(val('20-3*4'), '8');
  assert.equal(val('12/3*4'), '16');   // left to right within a term
  assert.equal(val('7/2*4'), '14');    // exact rational intermediate
  assert.equal(val('1-2-3'), '-4');    // left to right, not 1-(2-3)
  assert.equal(val('100/8'), '25/2');
});
test('tokenizer rejects malformed guesses', () => {
  for (const [expr, msg] of [
    ['+12*3', 'start'], ['12*3+', 'end'], ['12*+3', 'row'], ['01+23', 'start with 0'],
    ['12345', 'operator'], ['12a45', 'Unexpected'],
  ]) {
    const r = E.evaluate(expr);
    assert.equal(r.ok, false, expr);
    assert.match(r.error, new RegExp(msg), expr);
  }
  assert.equal(E.evaluate('12/0+3').error, 'Division by zero');
  assert.equal(E.evaluate('0+3*4').ok, true); // a lone 0 is fine
});
test('exactDivision flag', () => {
  assert.equal(E.evaluate('7/2*4', { exactDivision: true }).ok, false);
  assert.equal(E.evaluate('8/2*4', { exactDivision: true }).ok, true);
});

// ---- guess validation ----
test('validateGuess', () => {
  assert.equal(E.validateGuess('12+3*4', 24, 6).ok, true);
  assert.match(E.validateGuess('12+3*4', 25, 6).error, /equals 24, not 25/);
  assert.match(E.validateGuess('12+34', 24, 6).error, /6 characters/);
  assert.match(E.validateGuess('100/8', 12, 5).error, /equals 25\/2/);
});

// ---- scoring ----
test('score marks with repeated symbols', () => {
  assert.deepEqual(E.score('12+3*4', '12+3*4'), Array(6).fill('correct'));
  // hidden has one '1'; guess has two -> only one may be present
  // hidden's only '1' is matched in place by slot 1, so the extra '1' in slot 0 is absent
  assert.deepEqual(E.score('11+2*3', '21+3*4'),
    ['absent', 'correct', 'correct', 'present', 'correct', 'present']);
  assert.deepEqual(E.score('9*8-7', '7-8*9'),
    ['present', 'present', 'correct', 'present', 'present']);
});
test('shape', () => {
  assert.equal(E.shape('12+3*4'), 'DDoDoD');
  assert.equal(E.shape('1+23*4'), 'DoDDoD');
});

// ---- win logic ----
test('checkWin exact and commutative', () => {
  assert.deepEqual(E.checkWin('12+3*4', '12+3*4'), { win: true, exact: true });
  assert.deepEqual(E.checkWin('3*4+12', '12+3*4'), { win: true, exact: false });
  assert.deepEqual(E.checkWin('4*3+12', '12+3*4'), { win: true, exact: false });
  assert.deepEqual(E.checkWin('6*4+12', '12+3*4'), { win: false, exact: false }); // same target? no, but different symbols
});

// ---- generation ----
test('shapesFor enumerates compositions', () => {
  assert.deepEqual(E.shapesFor(6, [2]).sort(), [[1,1,2],[1,2,1],[2,1,1]].sort());
  assert.deepEqual(E.shapesFor(5, [1]).sort(), [[1,3],[2,2],[3,1]].sort());
});
test('generated puzzles are valid for every tier, deterministic per seed', () => {
  for (const tier of Object.keys(E.TIERS)) {
    const t = E.TIERS[tier];
    for (let s = 0; s < 300; s++) {
      const p = E.generatePuzzle(E.seededRng(s), tier);
      assert.equal(p.equation.length, t.length, p.equation);
      const ops = p.equation.replace(/[0-9]/g, '').length;
      assert.ok(t.ops.includes(ops), `${p.equation} has ${ops} ops`);
      assert.ok(p.target >= 10 && p.target <= t.max, `${p.equation}=${p.target}`);
      assert.equal(E.validateGuess(p.equation, p.target, t.length).ok, true, p.equation);
      assert.deepEqual(E.generatePuzzle(E.seededRng(s), tier).equation, p.equation);
    }
  }
});
test('no trivial *1 or /1 in generated puzzles', () => {
  for (let s = 0; s < 500; s++) {
    const p = E.generatePuzzle(E.seededRng(s), 'hard');
    assert.doesNotMatch(p.equation, /(^|[+\-*/])1[*/]|[*/]1($|[+\-*/])/, p.equation);
  }
});
test('daily puzzle number and determinism', () => {
  assert.equal(E.puzzleNumber(E.EPOCH), 1);
  assert.equal(E.puzzleNumber('2026-09-24'), 11);
  assert.equal(E.dailyPuzzle('2026-09-14', 'medium').equation, E.dailyPuzzle('2026-09-14', 'medium').equation);
  assert.notEqual(E.dailyPuzzle('2026-09-14', 'medium').equation, E.dailyPuzzle('2026-09-15', 'medium').equation);
});

console.log(`${passed} test groups passed${process.exitCode ? ', with failures' : ''}`);

const test = require('node:test');
const assert = require('node:assert');

const {
  RULESETS,
  evaluateRulesetForTrick,
  getAvailableRulesets,
  readRootRulesets
} = require('../rulesets');
const { compileRuleset } = require('../engine/evaluator');

test('extracts default base rulesets from root room_rulesets.txt', () => {
  const rootRules = readRootRulesets();

  assert.deepStrictEqual(
    rootRules.map((ruleset) => ruleset.label),
    ['King of Hearts', 'Queens', 'Diamonds', '10 of Clubs', 'Whist']
  );
  assert.strictEqual(RULESETS.kingOfHearts.code.includes('add(-100)'), true);
  assert.strictEqual(RULESETS.tenOfClubs.code.includes('add(100)'), true);
});

test('scores base default rules from the extracted registry', () => {
  const common = {
    playerCount: 4,
    initialPoints: 0,
    nonDiscardedCards: []
  };

  assert.strictEqual(evaluateRulesetForTrick({
    ...common,
    rulesetId: 'kingOfHearts',
    handCards: ['K-H']
  }).delta, -100);

  assert.strictEqual(evaluateRulesetForTrick({
    ...common,
    rulesetId: 'diamonds',
    handCards: ['A-D', 'Q-D']
  }).delta, -30);

  assert.strictEqual(evaluateRulesetForTrick({
    ...common,
    rulesetId: 'queens',
    handCards: ['Q-H', 'Q-S']
  }).delta, -60);

  assert.strictEqual(evaluateRulesetForTrick({
    ...common,
    rulesetId: 'tenOfClubs',
    handCards: ['10-C']
  }).delta, 100);

  assert.strictEqual(evaluateRulesetForTrick({
    ...common,
    rulesetId: 'whist',
    handCards: ['A-S']
  }).delta, 10);
});

test('scores Levate and Total compiled rulesets deterministically', () => {
  const common = {
    playerCount: 4,
    initialPoints: 0,
    handCards: ['K-H', '10-C', 'Q-D', 'A-D'],
    nonDiscardedCards: []
  };

  assert.strictEqual(evaluateRulesetForTrick({
    ...common,
    rulesetId: 'levate'
  }).delta, -10);

  const totalPlus = evaluateRulesetForTrick({
    ...common,
    rulesetId: 'totalPlus'
  });
  assert.strictEqual(totalPlus.delta, 270);
  assert.strictEqual(totalPlus.gameEnded, false);
  assert.ok(RULESETS.totalPlus.compiled);
  assert.strictEqual(getAvailableRulesets().find((ruleset) => ruleset.id === 'totalPlus').code.includes('add(100, HEART_KING)'), true);

  const totalMinus = evaluateRulesetForTrick({
    ...common,
    rulesetId: 'totalMinus'
  });
  assert.strictEqual(totalMinus.delta, -270);
  assert.strictEqual(totalMinus.gameEnded, false);
  assert.ok(RULESETS.totalMinus.compiled);
  assert.strictEqual(getAvailableRulesets().find((ruleset) => ruleset.id === 'totalMinus').code.includes('add(-100, HEART_KING)'), true);
});

test('includes room-scoped custom rulesets in availability and scoring', () => {
  const customRulesets = [{
    id: 'room_custom_hearts',
    label: 'Heart Tax',
    abbreviation: 'HT',
    type: 'per_round',
    source: 'room',
    enabledByDefault: true,
    code: 'add(-7 * HEART_NR, HEART_NR > 0)',
    compiled: compileRuleset('add(-7 * HEART_NR, HEART_NR > 0)', 'per_round')
  }];

  assert.strictEqual(
    getAvailableRulesets(customRulesets).some((ruleset) => ruleset.id === 'room_custom_hearts'),
    true
  );
  assert.strictEqual(evaluateRulesetForTrick({
    rulesetId: 'room_custom_hearts',
    playerCount: 4,
    initialPoints: 0,
    handCards: ['2-H', 'K-H', 'A-S'],
    nonDiscardedCards: [],
    customRulesets
  }).delta, -14);
});

const assert = require('node:assert');
const {
  buildRuleSnapshot,
  compileRuleset,
  evaluateIsolatedHands,
  evaluateRuleWithSnapshot
} = require('../engine/evaluator');

test('builds snapshot variables for hand cards and non-discarded cards', () => {
  const snapshot = buildRuleSnapshot({
    playerCount: 4,
    initialPoints: 12,
    handCards: ['K-H', 'A-S', '10-S'],
    nonDiscardedCards: ['K-H', 'A-S', '10-S', 'Q-D', '2-C']
  });

  assert.strictEqual(snapshot.PLAYER_COUNT, 4);
  assert.strictEqual(snapshot.INITIAL_POINTS, 12);
  assert.strictEqual(snapshot.CARD_NR, 3);
  assert.strictEqual(snapshot.HEART_NR, 1);
  assert.strictEqual(snapshot.SPADE_NR, 2);
  assert.strictEqual(snapshot.TOTAL_SPADE_NR, 2);
  assert.strictEqual(snapshot.K_NR, 1);
  assert.strictEqual(snapshot.TOTAL_Q_NR, 1);
  assert.strictEqual(snapshot.HEART_K, true);
  assert.strictEqual(snapshot.DIAMOND_Q, false);
});

test('evaluates add with snapshot variables', () => {
  const ruleset = compileRuleset('add(5, SPADE_NR >= 2)', 'per_round');
  const result = evaluateRuleWithSnapshot(
    ruleset,
    buildRuleSnapshot({
      playerCount: 4,
      initialPoints: 10,
      handCards: ['A-S', '10-S'],
      nonDiscardedCards: ['A-S', '10-S', 'K-H']
    })
  );

  assert.strictEqual(result.POINTS, 15);
  assert.strictEqual(result.TOTAL_POINTS, 0);
  assert.strictEqual(result.gameEnded, false);
});

test('supports if / elif / else blocks and game_end', () => {
  const code = `
    if(HEART_KING)
      add(-100)
      game_end()
    elif(CARD_NR == 2 and SPADE_NR > 0)
      add(10)
    else
      set_to(0)
    endif
  `;

  const ruleset = compileRuleset(code, 'per_round');

  const heartKingResult = evaluateRuleWithSnapshot(
    ruleset,
    buildRuleSnapshot({
      playerCount: 4,
      initialPoints: 0,
      handCards: ['K-H'],
      nonDiscardedCards: ['K-H', 'A-S']
    })
  );

  const elifResult = evaluateRuleWithSnapshot(
    ruleset,
    buildRuleSnapshot({
      playerCount: 4,
      initialPoints: 20,
      handCards: ['A-S', '9-H'],
      nonDiscardedCards: ['A-S', '9-H', 'Q-D']
    })
  );

  const elseResult = evaluateRuleWithSnapshot(
    ruleset,
    buildRuleSnapshot({
      playerCount: 4,
      initialPoints: 20,
      handCards: ['Q-D', '9-H', '2-C'],
      nonDiscardedCards: ['Q-D', '9-H', '2-C', 'A-S']
    })
  );

  assert.strictEqual(heartKingResult.POINTS, -100);
  assert.strictEqual(heartKingResult.gameEnded, true);
  assert.strictEqual(elifResult.POINTS, 30);
  assert.strictEqual(elifResult.gameEnded, false);
  assert.strictEqual(elseResult.POINTS, 0);
});

test('reset_to changes only TOTAL_POINTS', () => {
  const code = `
    if(HEART_KING)
      reset_to(1000)
    endif
  `;
  const result = evaluateRuleWithSnapshot(
    compileRuleset(code, 'end_game'),
    buildRuleSnapshot({
      playerCount: 4,
      initialPoints: 50,
      handCards: ['K-H'],
      nonDiscardedCards: ['K-H', 'Q-D']
    })
  );

  assert.strictEqual(result.POINTS, 50);
  assert.strictEqual(result.TOTAL_POINTS, 1000);
});

test('evaluates isolated hands from the same ruleset without state bleed', () => {
  const code = `
    add(5, HEART_NR >= 1)
    set_to(100, SPADE_A)
  `;

  const result = evaluateIsolatedHands({
    code,
    type: 'per_round',
    evaluations: [
      {
        playerCount: 4,
        initialPoints: 10,
        handCards: ['A-S', 'K-H'],
        nonDiscardedCards: ['A-S', 'K-H', 'Q-D', '2-C']
      },
      {
        playerCount: 4,
        initialPoints: 10,
        handCards: ['Q-D'],
        nonDiscardedCards: ['A-S', 'K-H', 'Q-D', '2-C']
      }
    ]
  });

  assert.strictEqual(result.results.length, 2);
  assert.deepStrictEqual(result.results[0], {
    POINTS: 100,
    TOTAL_POINTS: 0,
    gameEnded: false
  });
  assert.deepStrictEqual(result.results[1], {
    POINTS: 10,
    TOTAL_POINTS: 0,
    gameEnded: false
  });
});

test('end_game add updates TOTAL_POINTS for final scoring', () => {
  const result = evaluateRuleWithSnapshot(
    compileRuleset('add(25)', 'end_game'),
    buildRuleSnapshot({
      playerCount: 4,
      initialPoints: 50,
      handCards: ['K-H'],
      nonDiscardedCards: []
    })
  );

  assert.strictEqual(result.POINTS, 75);
  assert.strictEqual(result.TOTAL_POINTS, 75);
});

test('rejects ruleset commands that do not match the ruleset type', () => {
  assert.throws(
    () => compileRuleset('reset_to(100)', 'per_round'),
    /reset_to is only allowed in end_game rulesets/
  );

  assert.throws(
    () => compileRuleset('game_end()', 'end_game'),
    /game_end is only allowed in per_round rulesets/
  );
});

test('rejects invalid no-op and malformed numeric statements', () => {
  assert.throws(
    () => compileRuleset('HEART_KING', 'per_round'),
    /Standalone expressions are not allowed/
  );

  assert.throws(
    () => compileRuleset('add(1..2)', 'per_round'),
    /Invalid numeric literal/
  );
});

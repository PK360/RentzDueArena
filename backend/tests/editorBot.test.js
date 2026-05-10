const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CATEGORY_DEFINITIONS,
  buildFallbackEditorBotReview,
  buildEditorBotPromptPayload,
  buildRulesetJudgeMetrics,
  buildSafeRulesetPayload,
  clampEditorBotScore,
  reviewRulesetWithEditorBot,
  sanitizeEditorBotReview
} = require('../src/lib/editorBot');
const { compileRuleset } = require('../engine/evaluator');

test('clampEditorBotScore keeps ratings inside 0-10 with one decimal', () => {
  assert.equal(clampEditorBotScore(10.72), 10);
  assert.equal(clampEditorBotScore(-4), 0);
  assert.equal(clampEditorBotScore(7.26), 7.3);
  assert.equal(clampEditorBotScore('nope', 6.44), 6.4);
});

test('buildFallbackEditorBotReview returns every required rating section', () => {
  const code = 'if(HEART_KING)\n  add(-100)\n  game_end()\nendif';
  const ast = compileRuleset(code, 'per_round');
  const review = buildFallbackEditorBotReview({
    title: 'King Pressure',
    type: 'per_round',
    code,
    ast
  });

  assert.equal(typeof review.overallScore, 'number');
  assert.equal(review.rulesetSummary.length > 0, true);
  assert.equal(review.constructiveReview.length > 0, true);
  assert.equal(Array.isArray(review.recommendations), true);
  assert.equal(Array.isArray(review.warnings), true);

  for (const category of CATEGORY_DEFINITIONS) {
    assert.equal(typeof review.categoryRatings[category.key]?.score, 'number');
    assert.equal(typeof review.categoryRatings[category.key]?.explanation, 'string');
    assert.equal(review.categoryRatings[category.key].score >= 0 && review.categoryRatings[category.key].score <= 10, true);
  }
});

test('sanitizeEditorBotReview clamps invalid AI output and fills missing categories from fallback', () => {
  const fallback = buildFallbackEditorBotReview({
    title: 'Fallback Rule',
    type: 'per_round',
    code: 'add(-10, HEART_NR > 0)',
    ast: compileRuleset('add(-10, HEART_NR > 0)', 'per_round')
  });
  const sanitized = sanitizeEditorBotReview({
    overallScore: 11.4,
    categoryRatings: {
      fairness: { score: -3, explanation: '' }
    },
    rulesetSummary: '',
    constructiveReview: '  Great base idea but it needs a bit more tuning.  ',
    recommendations: ['  tighten the swing  ', '', null],
    warnings: ['']
  }, fallback);

  assert.equal(sanitized.overallScore, 10);
  assert.equal(sanitized.categoryRatings.fairness.score, 0);
  assert.equal(sanitized.categoryRatings.fairness.explanation, fallback.categoryRatings.fairness.explanation);
  assert.equal(sanitized.categoryRatings.scoringBalance.score, fallback.categoryRatings.scoringBalance.score);
  assert.equal(sanitized.rulesetSummary, fallback.rulesetSummary);
  assert.equal(sanitized.constructiveReview, 'Great base idea but it needs a bit more tuning.');
  assert.deepEqual(sanitized.recommendations, ['tighten the swing']);
  assert.deepEqual(sanitized.warnings, fallback.warnings);
});

test('sanitizeEditorBotReview accepts model outputs where warnings are a single string', () => {
  const fallback = buildFallbackEditorBotReview({
    title: 'Fallback Rule',
    type: 'per_round',
    code: 'add(-10, HEART_NR > 0)',
    ast: compileRuleset('add(-10, HEART_NR > 0)', 'per_round')
  });
  const sanitized = sanitizeEditorBotReview({
    rulesetSummary: 'Solid core idea',
    constructiveReview: 'Easy to teach',
    recommendations: ['Add positive incentive', 'Check ending trigger frequency'],
    warnings: 'Interesting but potentially routine if not balanced.'
  }, fallback);

  assert.deepEqual(sanitized.recommendations, ['Add positive incentive', 'Check ending trigger frequency']);
  assert.deepEqual(sanitized.warnings, ['Interesting but potentially routine if not balanced.']);
});

test('sanitizeEditorBotReview preserves heuristic reviewSource when AI text was not actually used', () => {
  const fallback = buildFallbackEditorBotReview({
    title: 'Fallback Rule',
    type: 'per_round',
    code: 'add(-10, HEART_NR > 0)',
    ast: compileRuleset('add(-10, HEART_NR > 0)', 'per_round')
  });
  const sanitized = sanitizeEditorBotReview({
    reviewSource: 'heuristic',
    rulesetSummary: fallback.rulesetSummary,
    constructiveReview: fallback.constructiveReview
  }, fallback);

  assert.equal(sanitized.reviewSource, 'heuristic');
});

test('buildEditorBotPromptPayload trims retry payloads for lean requests', () => {
  const baseRuleBlock = [
    'if(HEART_K)',
    '  add(-20)',
    'endif',
    'if(DIAMOND_Q)',
    '  add(-10)',
    'endif',
    'if(CLUB_10)',
    '  add(12)',
    'endif',
    'if(SPADE_A)',
    '  add(-6)',
    'endif',
    'if(HEART_NR > 2)',
    '  add(-4)',
    'endif',
    'if(DIAMOND_NR > 1)',
    '  add(3)',
    'endif',
    'if(CLUB_NR > 0)',
    '  add(2)',
    'endif',
    'if(SPADE_NR > 0)',
    '  add(1)',
    'endif',
    'if(POINTS < 0)',
    '  add(5)',
    'endif',
    'if(TOTAL_POINTS > 40)',
    '  add(-3)',
    'endif',
    'if(TOTAL_A_NR > 0)',
    '  add(2)',
    'endif',
    'if(TOTAL_K_NR > 0)',
    '  add(-2)',
    'endif'
  ].join('\n');
  const repeatedRule = Array.from({ length: 12 }, () => baseRuleBlock).join('\n');
  const ast = compileRuleset(repeatedRule, 'per_round');
  const metrics = buildRulesetJudgeMetrics({
    code: repeatedRule,
    type: 'per_round',
    ast
  });

  const fullPayload = buildEditorBotPromptPayload({
    title: 'Long Rule',
    shortName: 'LONG',
    type: 'per_round',
    code: repeatedRule,
    compiler: {
      status: 'compiled',
      message: 'ok',
      errors: ['first', 'second', 'third', 'fourth'],
      warnings: ['warn-a', 'warn-b', 'warn-c', 'warn-d']
    },
    metrics,
    lean: false
  });
  const leanPayload = buildEditorBotPromptPayload({
    title: 'Long Rule',
    shortName: 'LONG',
    type: 'per_round',
    code: repeatedRule,
    compiler: {
      status: 'compiled',
      message: 'ok',
      errors: ['first', 'second', 'third', 'fourth'],
      warnings: ['warn-a', 'warn-b', 'warn-c', 'warn-d']
    },
    metrics,
    lean: true
  });

  assert.equal(fullPayload.ruleset.code.length > leanPayload.ruleset.code.length, true);
  assert.equal(leanPayload.ruleset.codeTruncated, true);
  assert.equal(fullPayload.heuristics.identifiers.length > leanPayload.heuristics.identifiers.length, true);
  assert.deepEqual(Object.keys(leanPayload.compiler), ['status', 'message']);
  assert.equal(fullPayload.compiler.errors.length, 3);
  assert.equal(fullPayload.compiler.warnings.length, 3);
});

test('reviewRulesetWithEditorBot falls back cleanly when Ollama is unavailable', async () => {
  const code = 'add(-7 * HEART_NR, HEART_NR > 0)';
  const review = await reviewRulesetWithEditorBot({
    ruleset: {
      longName: 'Heart Tax',
      shortName: 'HT',
      type: 'per_round',
      code
    },
    ast: compileRuleset(code, 'per_round'),
    compiler: {
      status: 'compiled',
      message: 'Ruleset compiled successfully.',
      errors: [],
      warnings: []
    },
    baseUrl: 'http://127.0.0.1:1',
    timeoutMs: 25
  });

  assert.equal(review.reviewSource, 'fallback');
  assert.equal(review.warnings.some((warning) => /fallback/i.test(warning)), true);
  assert.equal(review.overallScore >= 0 && review.overallScore <= 10, true);
  assert.equal(Array.isArray(review.diagnostics), true);
  assert.equal(review.diagnostics.length > 0, true);
});

test('buildSafeRulesetPayload rejects an empty ruleset with a clear validation message', () => {
  assert.throws(
    () => buildSafeRulesetPayload({
      longName: 'Empty',
      shortName: 'EMP',
      type: 'per_round',
      code: '   '
    }),
    /Write a ruleset before asking the Editor Bot to judge it\./
  );
});

test('compileRuleset still blocks uncompilable rulesets before any design review runs', () => {
  const payload = buildSafeRulesetPayload({
    longName: 'Broken Rule',
    shortName: 'BROK',
    type: 'per_round',
    code: 'if(HEART_KING)\n  add(-100)\n'
  });

  assert.throws(
    () => compileRuleset(payload.code, payload.type),
    /endif|Unexpected end|Expected/i
  );
});

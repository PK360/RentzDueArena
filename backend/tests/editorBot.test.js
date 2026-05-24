const assert = require('node:assert/strict');
const {
  CATEGORY_DEFINITIONS,
  buildFallbackEditorBotReview,
  buildHybridEditorBotReviewFromScoreMap,
  buildEditorBotPromptPayload,
  buildRulesetJudgeMetrics,
  buildSalvagedEditorBotReview,
  buildSafeRulesetPayload,
  clampEditorBotScore,
  reviewRulesetWithEditorBot,
  sanitizeEditorBotReview,
  warmEditorBotModel
} = require('../src/lib/editorBot');
const { compileRuleset } = require('../engine/evaluator');
const { RULESETS } = require('../rulesets');

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
    categories: {
      fairness: { score: 9.5, explanation: 'Legacy category that should be ignored.' },
      comebackPotential: { score: -3, explanation: '' }
    },
    rulesetSummary: '',
    constructiveReview: '  Great base idea but it needs a bit more tuning.  ',
    recommendations: ['  tighten the swing  ', '', null],
    warnings: ['']
  }, fallback);
  const expectedOverallScore = Number((
    CATEGORY_DEFINITIONS.reduce((sum, category) => sum + sanitized.categoryRatings[category.key].score, 0)
    / CATEGORY_DEFINITIONS.length
  ).toFixed(1));

  assert.equal(sanitized.overallScore, expectedOverallScore);
  assert.equal(sanitized.categoryRatings.fairness, undefined);
  assert.equal(sanitized.categoryRatings.comebackPotential.score, 0);
  assert.equal(sanitized.categoryRatings.comebackPotential.explanation, fallback.categoryRatings.comebackPotential.explanation);
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

test('sanitizeEditorBotReview strips category prefixes and repeated score text from explanations', () => {
  const fallback = buildFallbackEditorBotReview({
    title: 'Fallback Rule',
    type: 'per_round',
    code: 'add(-10, HEART_NR > 0)',
    ast: compileRuleset('add(-10, HEART_NR > 0)', 'per_round')
  });
  const sanitized = sanitizeEditorBotReview({
    categories: {
      playerAgency: {
        score: 6,
        explanation: 'PlayerAgency: Players can steer around the danger card, but some turns still become forced. Score 6.0.'
      },
      claritySimplicity: {
        score: 9,
        explanation: 'Clarity / simplicity: Very easy to explain and remember. 9.0/10'
      }
    }
  }, fallback);

  assert.equal(sanitized.categoryRatings.playerAgency.explanation, 'Players can steer around the danger card, but some turns still become forced.');
  assert.equal(sanitized.categoryRatings.claritySimplicity.explanation, 'Very easy to explain and remember.');
});

test('sanitizeEditorBotReview strips score boilerplate but preserves meaningful rule values', () => {
  const fallback = buildFallbackEditorBotReview({
    title: 'Fallback Rule',
    type: 'per_round',
    code: 'add(-100, HEART_KING)',
    ast: compileRuleset('add(-100, HEART_KING)', 'per_round')
  });
  const sanitized = sanitizeEditorBotReview({
    categories: {
      playerAgency: {
        score: 6,
        explanation: 'PlayerAgency: Players can avoid the King of Hearts. Score maybe 6.0.'
      },
      scoringBalance: {
        score: 8,
        explanation: 'ScoringBalance: Penalty of -100 is large, but readable. Score 8.0.'
      }
    }
  }, fallback);

  assert.equal(sanitized.categoryRatings.playerAgency.explanation, 'Players can avoid the King of Hearts.');
  assert.equal(sanitized.categoryRatings.scoringBalance.explanation, 'Penalty of -100 is large, but readable.');
});

test('sanitizeEditorBotReview cleans the exact label-and-score regressions from category explanations', () => {
  const fallback = buildFallbackEditorBotReview({
    title: 'Fallback Rule',
    type: 'per_round',
    code: 'add(-100, HEART_KING)',
    ast: compileRuleset('add(-100, HEART_KING)', 'per_round')
  });
  const sanitized = sanitizeEditorBotReview({
    categories: {
      claritySimplicity: {
        score: 10,
        explanation: 'Clarity/simplicity: Very clear: avoid King of Hearts, else -100 and end. So high, 9.0.'
      },
      comebackPotential: {
        score: 7,
        explanation: 'Comeback potential — 7.0: Swing is visible but harsh.'
      },
      playerAgency: {
        score: 6,
        explanation: 'PlayerAgency: Players can decide when to dump the card. Score maybe 6.0.'
      },
      scoringBalance: {
        score: 8,
        explanation: 'ScoringBalance: Penalty of -100 is large, but readable. Likely okay. Score 8.0.'
      }
    }
  }, fallback);

  assert.equal(sanitized.categoryRatings.claritySimplicity.explanation, 'Very clear: avoid King of Hearts, else -100 and end.');
  assert.equal(sanitized.categoryRatings.comebackPotential.explanation, 'Swing is visible but harsh.');
  assert.equal(sanitized.categoryRatings.playerAgency.explanation, 'Players can decide when to dump the card.');
  assert.equal(sanitized.categoryRatings.scoringBalance.explanation, 'Penalty of -100 is large, but readable. Likely okay.');
});

test('sanitizeEditorBotReview removes alternate clarity label variants and rating suffixes', () => {
  const fallback = buildFallbackEditorBotReview({
    title: 'Fallback Rule',
    type: 'per_round',
    code: 'add(-100, HEART_KING)',
    ast: compileRuleset('add(-100, HEART_KING)', 'per_round')
  });
  const sanitized = sanitizeEditorBotReview({
    categories: {
      claritySimplicity: {
        score: 9,
        explanation: 'ClaritySimplicity: Very clear. Rating: 9.0/10.'
      }
    }
  }, fallback);

  assert.equal(sanitized.categoryRatings.claritySimplicity.explanation, 'Very clear.');
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

test('buildHybridEditorBotReviewFromScoreMap keeps AI scores while marking the review as hybrid', () => {
  const fallback = buildFallbackEditorBotReview({
    title: 'Fallback Rule',
    type: 'per_round',
    code: 'add(-10, HEART_NR > 0)',
    ast: compileRuleset('add(-10, HEART_NR > 0)', 'per_round')
  });
  const hybrid = buildHybridEditorBotReviewFromScoreMap({
    comebackPotential: 8,
    playerAgency: 6,
    claritySimplicity: 9,
    scoringBalance: 7
  }, fallback);

  assert.equal(hybrid.reviewSource, 'hybrid');
  assert.equal(hybrid.categories.comebackPotential.score > 0, true);
  assert.equal(hybrid.categories.playerAgency.score > 0, true);
  assert.equal(hybrid.categories.claritySimplicity.score > 0, true);
  assert.equal(hybrid.categories.scoringBalance.score > 0, true);
  assert.deepEqual(hybrid.warnings, []);
});

test('buildHybridEditorBotReviewFromScoreMap blends extreme AI deviations back toward the Rentz baseline', () => {
  const fallback = buildFallbackEditorBotReview({
    title: 'Fallback Rule',
    type: 'per_round',
    code: 'if(HEART_KING)\n  add(-20)\n  end()\nendif',
    ast: compileRuleset('if(HEART_KING)\n  add(-20)\n  end()\nendif', 'per_round')
  });
  const hybrid = buildHybridEditorBotReviewFromScoreMap({
    comebackPotential: 2.5,
    playerAgency: 3,
    claritySimplicity: 4,
    scoringBalance: 3.5
  }, fallback);

  assert.equal(hybrid.categories.comebackPotential.score > 2.5, true);
  assert.equal(hybrid.categories.playerAgency.score > 3, true);
  assert.equal(hybrid.categories.claritySimplicity.score > 4, true);
  assert.equal(hybrid.categories.scoringBalance.score > 3.5, true);
  assert.deepEqual(hybrid.warnings, []);
});

test('buildSalvagedEditorBotReview rejects score-only category maps for real reviews', () => {
  const fallback = buildFallbackEditorBotReview({
    title: 'Fallback Rule',
    type: 'per_round',
    code: 'add(-10, HEART_NR > 0)',
    ast: compileRuleset('add(-10, HEART_NR > 0)', 'per_round')
  });
  const salvaged = buildSalvagedEditorBotReview(
    '{"comebackPotential":"6","playerAgency":"8","claritySimplicity":"9","scoringBalance":"7"}',
    fallback
  );

  assert.equal(salvaged, null);
});

test('buildSalvagedEditorBotReview can still accept score-only maps when explicitly allowed for warmup', () => {
  const fallback = buildFallbackEditorBotReview({
    title: 'Fallback Rule',
    type: 'per_round',
    code: 'add(-10, HEART_NR > 0)',
    ast: compileRuleset('add(-10, HEART_NR > 0)', 'per_round')
  });
  const salvaged = buildSalvagedEditorBotReview(
    '{"comebackPotential":"6","playerAgency":"8","claritySimplicity":"9","scoringBalance":"7"}',
    fallback,
    { allowScoreOnly: true }
  );

  assert.equal(salvaged.categories.comebackPotential.score, 6);
  assert.equal(salvaged.categories.playerAgency.score, 8);
  assert.equal(salvaged.categories.claritySimplicity.score, 9);
  assert.equal(salvaged.categories.scoringBalance.score, 7);
});

test('buildSalvagedEditorBotReview rejects repeated category tokens with a shared score for real reviews', () => {
  const fallback = buildFallbackEditorBotReview({
    title: 'Fallback Rule',
    type: 'per_round',
    code: 'add(-10, HEART_NR > 0)',
    ast: compileRuleset('add(-10, HEART_NR > 0)', 'per_round')
  });
  const salvaged = buildSalvagedEditorBotReview(
    '{"score":0,"category":"comebackPotential","reason":"","category":"playerAgency","reason":"","category":"claritySimplicity","reason":"","category":"scoringBalance","reason":""}',
    fallback
  );

  assert.equal(salvaged, null);
});

test('buildSalvagedEditorBotReview accepts repeated category tokens with a shared score for warmup readiness', () => {
  const fallback = buildFallbackEditorBotReview({
    title: 'Fallback Rule',
    type: 'per_round',
    code: 'add(-10, HEART_NR > 0)',
    ast: compileRuleset('add(-10, HEART_NR > 0)', 'per_round')
  });
  const salvaged = buildSalvagedEditorBotReview(
    '{"score":0,"category":"comebackPotential","reason":"","category":"playerAgency","reason":"","category":"claritySimplicity","reason":"","category":"scoringBalance","reason":""}',
    fallback,
    { allowScoreOnly: true }
  );

  assert.equal(salvaged.categories.comebackPotential.score, 0);
  assert.equal(salvaged.categories.playerAgency.score, 0);
  assert.equal(salvaged.categories.claritySimplicity.score, 0);
  assert.equal(salvaged.categories.scoringBalance.score, 0);
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
  assert.equal(fullPayload.parsedSummary.identifiers.length > leanPayload.parsedSummary.identifiers.length, true);
  assert.equal(Array.isArray(fullPayload.calibration.anchors), true);
  assert.equal(fullPayload.calibration.anchors.length > leanPayload.calibration.anchors.length, true);
  assert.equal(Array.isArray(fullPayload.criteria), true);
  assert.equal(fullPayload.criteria.length, 4);
  assert.equal(typeof fullPayload.responseShape.categories.comebackPotential.explanation, 'string');
  assert.equal(fullPayload.compiler.errors.length, 2);
  assert.equal(fullPayload.compiler.warnings.length, 2);
});

test('buildFallbackEditorBotReview keeps default-style Rentz contracts in a strong range', () => {
  const expectations = [
    { id: 'kingOfHearts', minScore: 8, pattern: /danger card|king of hearts/i },
    { id: 'diamonds', minScore: 8, pattern: /suit pressure|diamond/i },
    { id: 'queens', minScore: 8, pattern: /queen|danger card/i },
    { id: 'tenOfClubs', minScore: 8, pattern: /high-stakes|ten of clubs|focal card/i },
    { id: 'whist', minScore: 8, pattern: /trick-taking|win tricks/i },
    { id: 'levate', minScore: 8, pattern: /trick avoidance|avoid tricks/i }
  ];

  for (const expectation of expectations) {
    const ruleset = RULESETS[expectation.id];
    const review = buildFallbackEditorBotReview({
      title: ruleset.label,
      type: ruleset.type,
      code: ruleset.code,
      ast: ruleset.compiled
    });
    const combinedText = `${review.rulesetSummary} ${review.constructiveReview}`;

    assert.equal(review.overallScore >= expectation.minScore, true, `${expectation.id} should score at least ${expectation.minScore}`);
    assert.equal(typeof review.representativeEmoji, 'string');
    assert.equal(review.representativeEmoji.length > 0, true);
    assert.match(combinedText, expectation.pattern);
  }
});

test('reviewRulesetWithEditorBot prefers a full AI-written structured judgment when the cloud response succeeds', async () => {
  const code = 'if(CLUB_TEN)\n  add(100)\n  game_end()\nendif';
  const requests = [];
  const originalFetch = global.fetch;

  global.fetch = async (url, options = {}) => {
    requests.push({
      url,
      body: JSON.parse(options.body)
    });

    if (requests.length === 1) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          model: 'gpt-oss:120b-cloud',
          response: '{"ok":true}',
          thinking: '',
          done: true,
          done_reason: 'stop'
        })
      };
    }

    return {
      ok: true,
      status: 200,
      body: null,
      json: async () => ({
        response: JSON.stringify({
          overallScore: 8.7,
          representativeEmoji: '🔥',
          categories: {
            comebackPotential: {
              score: 8.4,
              explanation: 'The stakes are high, but the danger is visible from the first trick.'
            },
            playerAgency: {
              score: 8.2,
              explanation: 'Players can time when to shed or protect clubs around the focal card.'
            },
            claritySimplicity: {
              score: 9.3,
              explanation: 'One focal card keeps the round easy to teach and remember.'
            },
            scoringBalance: {
              score: 8.6,
              explanation: 'The payoff is sharp but still readable because everyone knows the target.'
            }
          },
          rulesetSummary: 'This contract turns the ten of clubs into a single high-stakes focal card during the round.',
          constructiveReview: 'It feels like a strong Rentz contract because the table can track the risk immediately and play around it.',
          recommendations: ['Only trim the payout if playtests show the card decides too many rounds.'],
          warnings: []
        })
      })
    };
  };

  try {
    const review = await reviewRulesetWithEditorBot({
      ruleset: {
        longName: 'Club Spike',
        shortName: 'CS',
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
      modelName: 'gpt-oss:120b-cloud-success-test',
      baseUrl: 'https://ollama.com/api',
      timeoutMs: 2000
    });

    assert.equal(requests[0].url, 'https://ollama.com/api/generate');
    assert.equal(requests[1].body.options.num_predict, 900);
    assert.equal(requests[1].body.options.think, false);
    assert.equal(requests[1].body.options.reasoning, false);
    assert.equal(review.reviewSource, 'cloud');
    assert.equal(review.usedFallback, false);
    assert.equal(typeof review.requestId, 'string');
    assert.equal(typeof review.rulesetHash, 'string');
    assert.equal(review.rulesetSummary.includes('high-stakes focal card'), true);
    assert.equal(review.constructiveReview.includes('track the risk immediately'), true);
    assert.deepEqual(review.recommendations, ['Only trim the payout if playtests show the card decides too many rounds.']);
    assert.equal(review.categoryRatings.claritySimplicity.explanation.includes('easy to teach'), true);
    assert.equal(review.representativeEmoji, '🔥');
    assert.equal(review.overallScore, 8.6);
  } finally {
    global.fetch = originalFetch;
  }
});

test('reviewRulesetWithEditorBot salvages fenced JSON and schema aliases from cloud output', async () => {
  const code = 'if(DIAMOND_NR > 0)\n  add(-15 * DIAMOND_NR)\nendif';
  const originalFetch = global.fetch;
  let fetchCount = 0;

  global.fetch = async () => {
    fetchCount += 1;

    if (fetchCount === 1) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          response: '{"ok":true}',
          thinking: '',
          done_reason: 'stop'
        })
      };
    }

    return {
      ok: true,
      status: 200,
      body: null,
      json: async () => ({
        response: [
          'Some brief wrapper text.',
          '```json',
          JSON.stringify({
            score: 8.4,
            emoji: '⚠️',
            categoryRatings: {
              comeback: { rating: 8.1, reason: 'The swing is visible and understandable.' },
              agency: { value: 8.4, text: 'Players can manage suits and timing around the diamond pressure.' },
              clarity: { rating: 9.1, reason: 'The contract is easy to explain and remember.' },
              scoring: { value: 8.0, text: 'The penalty matches the pressure and stays readable.' }
            },
            summary: 'This ruleset creates clear suit pressure around collecting diamonds.',
            review: 'It feels like a clean classic Rentz avoidance contract with readable stakes.',
            rec: ['Only reduce the penalty if playtests show diamonds decide rounds too hard.'],
            w: []
          }, null, 2),
          '```',
          'Trailing note.'
        ].join('\n')
      })
    };
  };

  try {
    const review = await reviewRulesetWithEditorBot({
      ruleset: {
        longName: 'Diamond Tax',
        shortName: 'DT',
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
      modelName: 'gpt-oss:120b-cloud-salvage-test',
      baseUrl: 'https://ollama.com/api',
      timeoutMs: 2000
    });

    assert.equal(review.reviewSource, 'cloud');
    assert.equal(review.overallScore, 8.4);
    assert.equal(review.categoryRatings.comebackPotential.score, 8.1);
    assert.equal(review.categoryRatings.playerAgency.score, 8.4);
    assert.equal(review.categoryRatings.claritySimplicity.score, 9.1);
    assert.equal(review.categoryRatings.scoringBalance.score, 8);
    assert.equal(review.representativeEmoji, '⚠️');
    assert.equal(review.constructiveReview.includes('classic Rentz avoidance contract'), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('reviewRulesetWithEditorBot uses one repair pass before fallback when cloud output is malformed but recoverable', async () => {
  const code = 'if(HEART_KING)\n  add(-100)\n  game_end()\nendif';
  const originalFetch = global.fetch;
  let fetchCount = 0;

  global.fetch = async () => {
    fetchCount += 1;

    if (fetchCount === 1) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          response: '{"ok":true}',
          thinking: '',
          done_reason: 'stop'
        })
      };
    }

    if (fetchCount === 2) {
      return {
        ok: true,
        status: 200,
        body: null,
        json: async () => ({
          response: 'Comeback 8.2, agency 8.0, clarity 9.4, scoring 8.1. Summary: one danger card drives the round.'
        })
      };
    }

    return {
      ok: true,
      status: 200,
      body: null,
      json: async () => ({
        response: JSON.stringify({
          overallScore: 8.4,
          categories: {
            comebackPotential: { score: 8.2, explanation: 'The danger is large but visible.' },
            playerAgency: { score: 8.0, explanation: 'Players can time when to hold or dump hearts.' },
            claritySimplicity: { score: 9.4, explanation: 'One danger card keeps the round very easy to teach.' },
            scoringBalance: { score: 8.1, explanation: 'The penalty is sharp but fits the iconic threat.' }
          },
          rulesetSummary: 'This contract makes the king of hearts the main danger card of the round.',
          constructiveReview: 'It works because everyone understands the focal threat immediately.',
          recommendations: [],
          warnings: []
        })
      })
    };
  };

  try {
    const review = await reviewRulesetWithEditorBot({
      ruleset: {
        longName: 'Heart Crown',
        shortName: 'HC',
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
      modelName: 'gpt-oss:120b-cloud-repair-test',
      baseUrl: 'https://ollama.com/api',
      timeoutMs: 2000
    });

    assert.equal(fetchCount, 3);
    assert.equal(review.reviewSource, 'cloud-repaired');
    assert.equal(review.overallScore, 8.4);
    assert.equal(review.rulesetSummary.includes('king of hearts'), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('reviewRulesetWithEditorBot retries once when cloud returns only thinking and no final response', async () => {
  const code = 'if(HEART_KING)\n  add(-100)\n  game_end()\nendif';
  const originalFetch = global.fetch;
  const requests = [];

  global.fetch = async (_url, options = {}) => {
    const body = JSON.parse(options.body);
    requests.push(body);

    if (requests.length === 1) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          response: '{"ok":true}',
          thinking: '',
          done_reason: 'stop'
        })
      };
    }

    if (requests.length === 2) {
      return {
        ok: true,
        status: 200,
        body: null,
        json: async () => ({
          model: 'gpt-oss:120b-cloud',
          response: '',
          thinking: 'We need to output final JSON, compute scores, and format the categories.',
          done: true,
          done_reason: 'length',
          eval_count: 320
        })
      };
    }

    return {
      ok: true,
      status: 200,
      body: null,
      json: async () => ({
        response: JSON.stringify({
          overallScore: 7.8,
          representativeEmoji: '👍',
          categories: {
            comebackPotential: { score: 6.5, explanation: 'The swing is sharp, but the danger is visible.' },
            playerAgency: { score: 7.0, explanation: 'Players can still try to dodge the king with timing.' },
            claritySimplicity: { score: 9.5, explanation: 'The contract is immediate and easy to remember.' },
            scoringBalance: { score: 8.0, explanation: 'The penalty is harsh but legible at the table.' }
          },
          rulesetSummary: 'This contract ends the round when the king of hearts triggers a -100 penalty.',
          constructiveReview: 'It is blunt but readable, which makes it feel like a recognizable Rentz danger round.',
          recommendations: [],
          warnings: []
        })
      })
    };
  };

  try {
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
      modelName: 'gpt-oss:120b-cloud-retry-test',
      baseUrl: 'https://ollama.com/api',
      timeoutMs: 60000
    });

    assert.equal(requests.length, 3);
    assert.equal(requests[1].options.num_predict, 900);
    assert.equal(requests[2].options.num_predict >= 1800, true);
    assert.equal(requests[2].options.think, false);
    assert.equal(requests[2].options.reasoning, false);
    assert.match(requests[2].prompt, /Return ONLY the final JSON object now/i);
    assert.equal(review.reviewSource, 'cloud');
    assert.equal(review.usedFallback, false);
    assert.equal(review.constructiveReview.includes('recognizable Rentz danger round'), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('warmEditorBotModel falls back from strict JSON probe to a minimal plain probe for cloud warmup', async () => {
  const originalFetch = global.fetch;
  const requests = [];

  global.fetch = async (_url, options = {}) => {
    const body = JSON.parse(options.body);
    requests.push(body);

    if (requests.length === 1) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          model: body.model,
          response: '',
          thinking: 'I should return the requested JSON.',
          done: true,
          done_reason: 'length'
        })
      };
    }

    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        model: body.model,
        response: 'OK',
        thinking: '',
        done: true,
        done_reason: 'stop'
      })
    };
  };

  try {
    const result = await warmEditorBotModel({
      modelName: 'gpt-oss:120b-cloud-warmup-test',
      baseUrl: 'https://ollama.com/api',
      timeoutMs: 1500
    });

    assert.equal(result.success, true);
    assert.equal(result.stage, 'complete');
    assert.equal(requests.length, 2);
    assert.match(requests[0].prompt, /\/no_think Return exactly this JSON/i);
    assert.match(requests[1].prompt, /\/no_think Reply with exactly OK/i);
    assert.equal(requests[0].stream, false);
    assert.equal(requests[1].stream, false);
  } finally {
    global.fetch = originalFetch;
  }
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
  assert.equal(review.usedFallback, true);
  assert.equal(typeof review.requestId, 'string');
  assert.equal(typeof review.rulesetHash, 'string');
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

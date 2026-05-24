const fs = require('fs');
const path = require('path');

const {
  BACKEND_ROOT,
  REPO_ROOT,
  buildProviderResult,
  createJsonFetchResponse,
  createSequencedFetch,
  createWarmupEnvelope,
  getPromptfooEnv,
  getSafeEvalConfigForLogs,
  loadEditorBotLib,
  nowMs,
  withMockedFetch
} = require('../shared/eval-utils');
const {
  buildRulesetPayload,
  buildRulesetSourceHash,
  compileRulesetPayload
} = require('../shared/rentz-fixtures');

const DEBUG_LOG_PATH = path.join(REPO_ROOT, '.promptfoo/logs/editor-bot-eval-debug.ndjson');

function buildScenarioReview(scenario) {
  const reviews = {
    'simple-good-cloud': {
      overallScore: 8.7,
      representativeEmoji: '👍',
      categories: {
        comebackPotential: {
          score: 8.1,
          explanation: 'The danger is focused, visible, and swingy without making the whole match feel hopeless.'
        },
        playerAgency: {
          score: 8.2,
          explanation: 'Players can time when to protect or dump hearts around the one iconic threat.'
        },
        claritySimplicity: {
          score: 9.4,
          explanation: 'One danger card makes the contract very easy to teach and track at the table.'
        },
        scoringBalance: {
          score: 8.9,
          explanation: 'The penalty is sharp but still readable because everyone knows exactly what matters.'
        }
      },
      rulesetSummary: 'This ruleset turns the king of hearts into a single danger card without ending the whole round instantly.',
      constructiveReview: 'It feels like a clean Rentz pressure contract because the table always knows where the main risk lives.',
      recommendations: ['Only trim the penalty if playtests show the card decides too many rounds on its own.'],
      warnings: []
    },
    'king-end-cloud': {
      overallScore: 7.4,
      representativeEmoji: '⚠️',
      categories: {
        comebackPotential: {
          score: 6.6,
          explanation: 'The swing is easy to understand, but the instant ending makes recovery paths much thinner.'
        },
        playerAgency: {
          score: 6.9,
          explanation: 'There is still tension around the king, yet some rounds can end before the table gets many decisions.'
        },
        claritySimplicity: {
          score: 9.3,
          explanation: 'The contract is immediate and memorable because one card ends the round on the spot.'
        },
        scoringBalance: {
          score: 6.8,
          explanation: 'The penalty is readable, but the abrupt finish can feel harsher than the surrounding contracts.'
        }
      },
      rulesetSummary: 'This version keeps the king of hearts as the focal threat and ends the round as soon as it appears.',
      constructiveReview: 'The idea is extremely clear, but the sudden ending narrows the round and can make the punishment feel harsh.',
      recommendations: ['Consider testing a version that keeps the penalty but lets the round continue.'],
      warnings: ['The abrupt ending can feel harsh when the king appears early.']
    },
    'diamonds-cloud': {
      overallScore: 8.5,
      representativeEmoji: '💎',
      categories: {
        comebackPotential: {
          score: 8.0,
          explanation: 'The pressure is steady and visible without creating a single irreversible spike.'
        },
        playerAgency: {
          score: 8.5,
          explanation: 'Suit management and timing both matter because players can steer around diamond pressure.'
        },
        claritySimplicity: {
          score: 9.0,
          explanation: 'Suit-based pressure is easy to explain and simple to track during fast tricks.'
        },
        scoringBalance: {
          score: 8.4,
          explanation: 'The penalty matches the contract well because every extra diamond cleanly adds visible cost.'
        }
      },
      rulesetSummary: 'This contract applies straightforward suit pressure by punishing collected diamonds.',
      constructiveReview: 'It works well as a classic avoidance round because the diamond tension stays visible on every trick.',
      recommendations: ['Keep the per-diamond penalty stable unless playtests show the suit dominates too hard.'],
      warnings: []
    },
    'whist-cloud': {
      overallScore: 8.3,
      representativeEmoji: '🎯',
      categories: {
        comebackPotential: {
          score: 7.9,
          explanation: 'Positive trick-taking gives the rotation a cleaner tempo change without making the wider match collapse.'
        },
        playerAgency: {
          score: 8.4,
          explanation: 'Players get real timing choices because winning and conceding tricks both matter for setup.'
        },
        claritySimplicity: {
          score: 8.7,
          explanation: 'Rewarding won tricks is easy to teach and clearly contrasts with avoidance contracts.'
        },
        scoringBalance: {
          score: 8.2,
          explanation: 'The positive reward is readable and gives clear incentive to win tricks on purpose.'
        }
      },
      rulesetSummary: 'This ruleset rewards taking tricks, giving the match a clear positive-scoring contract.',
      constructiveReview: 'It succeeds because it teaches players to pursue tricks instead of dodging them, which keeps the rotation varied.',
      recommendations: ['Only rebalance the reward if winning one extra trick swings rounds too sharply.'],
      warnings: []
    },
    'complex-bad-cloud': {
      overallScore: 4.8,
      representativeEmoji: '🧩',
      categories: {
        comebackPotential: {
          score: 5.1,
          explanation: 'There is some swing, but the round risks feeling arbitrary because too many effects stack together.'
        },
        playerAgency: {
          score: 5.4,
          explanation: 'Players still have decisions, yet the branching effects make it harder to read which choices matter most.'
        },
        claritySimplicity: {
          score: 3.4,
          explanation: 'Tracking the overlapping triggers, resets, and suit rules would slow the table down noticeably.'
        },
        scoringBalance: {
          score: 5.2,
          explanation: 'Several score replacements and mixed incentives make the payoff feel harder to read than it should be.'
        }
      },
      rulesetSummary: 'This ruleset piles several familiar Rentz pressures together, but the combined tracking cost is very high.',
      constructiveReview: 'The core issue is not creativity but readability, because too many layered triggers make the round harder to teach and pace.',
      recommendations: ['Trim the number of conditional effects before tuning the exact numbers.'],
      warnings: ['Tracking the contract would be difficult mid-round.', 'The pacing could suffer because players must remember too many branches.', 'Scoring readability is weaker than the underlying idea.']
    },
    'contaminated-cloud': {
      overallScore: 8.0,
      representativeEmoji: '👍',
      categories: {
        comebackPotential: {
          score: 7.0,
          explanation: 'Comeback potential - 7.0: The swing is visible but still manageable.'
        },
        playerAgency: {
          score: 7.8,
          explanation: 'PlayerAgency: Players can decide when to dump the danger card. Score maybe 7.8.'
        },
        claritySimplicity: {
          score: 9.2,
          explanation: 'Clarity/simplicity: Very clear: avoid King of Hearts, else -100 and end. So high, 9.0.'
        },
        scoringBalance: {
          score: 8.1,
          explanation: 'ScoringBalance: Penalty of -100 is large, but readable. Score 8.1.'
        }
      },
      rulesetSummary: 'This contract makes the king of hearts the main danger card of the round.',
      constructiveReview: 'It is blunt but readable, which gives the table a clear focal threat to play around.',
      recommendations: ['Watch whether the instant ending feels too severe in short-player tables.'],
      warnings: []
    }
  };

  return reviews[scenario];
}

function ensureDebugLogDir() {
  fs.mkdirSync(path.dirname(DEBUG_LOG_PATH), { recursive: true });
}

function appendDebugLog(entry) {
  ensureDebugLogDir();
  fs.appendFileSync(DEBUG_LOG_PATH, `${JSON.stringify(entry)}\n`);
}

function previewText(value, maxLength = 120) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value;
  }

  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [trimmed];
    }
  }

  return [trimmed];
}

function buildCompilerPayload(vars, ruleset) {
  const compilerErrors = normalizeList(vars.compilerErrors);
  const compilerWarnings = normalizeList(vars.compilerWarnings);
  const explicitStatus = String(vars.compilerStatus || '').trim();
  const isCompilerError = explicitStatus === 'error'
    || vars.mockScenario === 'broken-compiler'
    || compilerErrors.length > 0
    || Boolean(vars.compilerMessage && explicitStatus === 'invalid');

  if (isCompilerError) {
    const message = String(
      vars.compilerMessage
      || compilerErrors[0]
      || 'Unexpected end of ruleset: missing endif.'
    ).trim();

    return {
      ast: null,
      compiler: {
        status: 'error',
        message,
        errors: compilerErrors.length > 0 ? compilerErrors : [message],
        warnings: compilerWarnings
      }
    };
  }

  return {
    ast: compileRulesetPayload(ruleset),
    compiler: {
      status: explicitStatus || 'compiled',
      message: String(vars.compilerMessage || 'Ruleset compiled successfully.').trim(),
      errors: compilerErrors,
      warnings: compilerWarnings
    }
  };
}

function buildCompilerFailureReview(editorBot, ruleset, compiler) {
  const compilerMessage = compiler?.message || 'Ruleset failed to compile.';
  const blockedCategory = {
    score: 0,
    explanation: 'A reliable judgment is blocked until the ruleset compiles successfully.'
  };

  return editorBot.sanitizeEditorBotReview({
    overallScore: 0,
    representativeEmoji: '⚠️',
    categories: {
      comebackPotential: blockedCategory,
      playerAgency: blockedCategory,
      claritySimplicity: blockedCategory,
      scoringBalance: blockedCategory
    },
    rulesetSummary: 'The ruleset could not be judged as a valid contract because it did not compile.',
    constructiveReview: `Fix the compiler error first, then rerun the judge: ${compilerMessage}`,
    recommendations: ['Resolve the syntax/compiler error before evaluating balance or clarity.', 'Check the control flow for missing terminators such as endif.'],
    warnings: [`Compiler error: ${compilerMessage}`],
    reviewSource: 'error',
    usedFallback: true,
    usedCache: false,
    errorCode: 'compiler-error'
  }, editorBot.buildFallbackEditorBotReview({
    title: ruleset.longName,
    type: ruleset.type,
    code: ruleset.code,
    ast: null,
    fallbackWarning: `Compiler blocked this ruleset: ${compilerMessage}`
  }));
}

function buildCloudConfigFailureReview(editorBot, ruleset, missingFields = []) {
  const missingLabel = missingFields.join(', ') || 'cloud configuration';
  const fallbackReview = editorBot.buildFallbackEditorBotReview({
    title: ruleset.longName,
    type: ruleset.type,
    code: ruleset.code,
    ast: null,
    fallbackWarning: `Editor Bot cloud config is missing: ${missingLabel}`
  });

  return {
    ...fallbackReview,
    reviewSource: 'fallback',
    usedFallback: true,
    usedCache: false,
    errorCode: 'cloud_config_missing',
    warnings: Array.from(new Set([
      `Cloud config missing: ${missingLabel}`,
      ...(Array.isArray(fallbackReview.warnings) ? fallbackReview.warnings : [])
    ]))
  };
}

async function runMockedEditorReview(editorBot, vars, ruleset, ast, compiler) {
  const modelName = `promptfoo-${vars.mockScenario || 'editor'}`;
  const cloudReview = buildScenarioReview(vars.mockScenario);

  if (vars.mockScenario === 'empty-thinking-fallback') {
    return withMockedFetch(
      createSequencedFetch([
        createWarmupEnvelope(modelName),
        createJsonFetchResponse({
          model: modelName,
          response: '',
          thinking: 'We need to finish the JSON after more hidden reasoning.',
          done: true,
          done_reason: 'length'
        }),
        createJsonFetchResponse({
          model: modelName,
          response: '',
          thinking: 'Thinking about the final format again.',
          done: true,
          done_reason: 'length'
        })
      ]),
      () => editorBot.reviewRulesetWithEditorBot({
        ruleset,
        ast,
        compiler,
        modelName,
        baseUrl: 'https://ollama.com/api',
        timeoutMs: 2000
      })
    );
  }

  if (!cloudReview) {
    return editorBot.reviewRulesetWithEditorBot({
      ruleset,
      ast,
      compiler,
      modelName,
      baseUrl: 'http://127.0.0.1:1',
      timeoutMs: 25
    });
  }

  return withMockedFetch(
    createSequencedFetch([
      createWarmupEnvelope(modelName),
      createJsonFetchResponse({
        response: JSON.stringify(cloudReview)
      })
    ]),
    () => editorBot.reviewRulesetWithEditorBot({
      ruleset,
      ast,
      compiler,
      modelName,
      baseUrl: 'https://ollama.com/api',
      timeoutMs: 2000
    })
  );
}

function resolveExecutionMode(vars, env) {
  const configured = String(vars.executionMode || '').trim();
  if (configured) {
    return configured;
  }

  if (vars.mockScenario === 'broken-compiler') {
    return 'compiler-error';
  }

  if (env.useRealCloud) {
    return 'cloud';
  }

  return 'mock-cloud';
}

function summarizeFallbackReason(judgment, compiler) {
  if (judgment?.reviewSource === 'error') {
    return compiler?.message || judgment?.warnings?.[0] || 'compiler error';
  }

  if (judgment?.usedFallback) {
    return judgment?.warnings?.find((entry) => /fallback|could not finish|unavailable/i.test(String(entry || '')))
      || judgment?.errorCode
      || 'fallback used';
  }

  return '';
}

function buildEnvelope({
  caseId,
  caseDescription,
  executionMode,
  providerMode,
  runtimeMode,
  env,
  ruleset,
  sourceHash,
  compiler,
  judgment,
  elapsedMs,
  cloudAttempted
}) {
  const reviewSource = String(judgment?.reviewSource || '').trim() || 'unknown';
  const success = reviewSource === 'cloud' || reviewSource === 'cloud-repaired';
  const summaryPreview = previewText(judgment?.rulesetSummary);
  const reviewPreview = previewText(judgment?.constructiveReview);
  const fallbackReason = summarizeFallbackReason(judgment, compiler);
  const narrativeSignature = buildRulesetSourceHash([
    judgment?.rulesetSummary || '',
    judgment?.constructiveReview || '',
    ...(judgment?.warnings || []),
    ...(judgment?.recommendations || []),
    judgment?.categories?.comebackPotential?.explanation || '',
    judgment?.categories?.playerAgency?.explanation || '',
    judgment?.categories?.claritySimplicity?.explanation || '',
    judgment?.categories?.scoringBalance?.explanation || ''
  ].join('\n'));

  return {
    caseId,
    caseDescription,
    providerMode,
    runtimeMode,
    executionMode,
    useRealCloud: env.useRealCloud,
    cloudAttempted,
    success,
    reviewSource,
    usedFallback: judgment?.usedFallback === true,
    usedCache: judgment?.usedCache === true,
    errorCode: String(judgment?.errorCode || '').trim(),
    fallbackReason,
    overallScore: Number.isFinite(Number(judgment?.overallScore)) ? Number(judgment.overallScore) : null,
    representativeEmoji: String(judgment?.representativeEmoji || '').trim(),
    warningsCount: Array.isArray(judgment?.warnings) ? judgment.warnings.length : 0,
    summaryPreview,
    reviewPreview,
    narrativeSignature,
    elapsedMs,
    ruleset: {
      title: ruleset.longName,
      shortName: ruleset.shortName,
      type: ruleset.type,
      sourceLength: String(ruleset.code || '').length,
      sourceHash,
      sourcePreview: previewText(ruleset.code, 120),
      compilerStatus: compiler?.status || 'compiled',
      compilerMessage: compiler?.message || 'Ruleset compiled successfully.',
      compilerErrors: Array.isArray(compiler?.errors) ? compiler.errors : [],
      compilerWarnings: Array.isArray(compiler?.warnings) ? compiler.warnings : []
    },
    judgment
  };
}

function buildDisplayPayload(envelope) {
  return {
    caseId: envelope.caseId,
    rulesetTitle: envelope.ruleset.title,
    elapsedMs: envelope.elapsedMs,
    source: envelope.reviewSource,
    mode: envelope.runtimeMode || envelope.providerMode,
    success: envelope.success,
    fallback: envelope.usedFallback,
    errorCode: envelope.errorCode,
    fallbackReason: previewText(envelope.fallbackReason, 100),
    compilerStatus: envelope.ruleset.compilerStatus,
    sourceHash: envelope.ruleset.sourceHash,
    overallScore: envelope.overallScore,
    emoji: envelope.representativeEmoji,
    summaryPreview: envelope.summaryPreview,
    warnings: envelope.warningsCount
  };
}

async function executeEditorCase({
  editorBot,
  vars,
  env,
  ruleset,
  ast,
  compiler,
  executionMode
}) {
  if (executionMode === 'compiler-error') {
    return {
      judgment: buildCompilerFailureReview(editorBot, ruleset, compiler),
      providerMode: 'compiler-error',
      cloudAttempted: false
    };
  }

  if (executionMode === 'synthetic-fallback' || executionMode === 'synthetic-cloud-fixture') {
    return {
      judgment: await runMockedEditorReview(editorBot, vars, ruleset, ast, compiler),
      providerMode: executionMode,
      cloudAttempted: false
    };
  }

  if (env.useRealCloud) {
    const missingFields = [
      env.editorBaseUrl ? '' : 'OLLAMA_EDITOR_BOT_BASE_URL',
      env.editorModel ? '' : 'OLLAMA_EDITOR_BOT_MODEL',
      env.editorAuthTokenPresent ? '' : 'OLLAMA_EDITOR_BOT_AUTH_TOKEN'
    ].filter(Boolean);

    if (missingFields.length > 0) {
      return {
        judgment: buildCloudConfigFailureReview(editorBot, ruleset, missingFields),
        providerMode: 'real-cloud',
        cloudAttempted: false
      };
    }

    return {
      judgment: await editorBot.reviewRulesetWithEditorBot({
        ruleset,
        ast,
        compiler,
        modelName: env.editorModel,
        baseUrl: env.editorBaseUrl,
        timeoutMs: Number(
          vars.timeoutMs
          || (env.editorMode === 'deep' ? env.editorTimeoutDeepMs : env.editorTimeoutFastMs)
          || 60000
        )
      }),
      providerMode: 'real-cloud',
      cloudAttempted: true
    };
  }

  return {
    judgment: await runMockedEditorReview(editorBot, vars, ruleset, ast, compiler),
    providerMode: 'mock-cloud',
    cloudAttempted: false
  };
}

class EditorBotProvider {
  constructor(options = {}) {
    this.providerId = options.label || options.id || 'editor-bot';
    this.config = options.config || {};
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context = {}) {
    const startedAt = nowMs();
    const vars = context.vars || {};
    const env = getPromptfooEnv();
    const editorBot = loadEditorBotLib({
      useRealCloud: env.useRealCloud
    });
    const ruleset = buildRulesetPayload(vars);
    const sourceHash = buildRulesetSourceHash(ruleset.code);
    const { ast, compiler } = buildCompilerPayload(vars, ruleset);
    const caseId = String(vars.caseId || ruleset.shortName || 'editor-case').trim();
    const caseDescription = String(context.test?.description || vars.description || caseId).trim();
    const executionMode = resolveExecutionMode(vars, env);

    const result = await executeEditorCase({
      editorBot,
      vars,
      env,
      ruleset,
      ast,
      compiler,
      executionMode
    });

    const judgment = {
      ...result.judgment,
      compiler
    };
    const envelope = buildEnvelope({
      caseId,
      caseDescription,
      executionMode,
      providerMode: result.providerMode,
      runtimeMode: env.editorMode,
      env,
      ruleset,
      sourceHash,
      compiler,
      judgment,
      elapsedMs: nowMs() - startedAt,
      cloudAttempted: result.cloudAttempted
    });

    appendDebugLog({
      timestamp: new Date().toISOString(),
      caseId: envelope.caseId,
      caseDescription: envelope.caseDescription,
      rulesetName: envelope.ruleset.title,
      shortName: envelope.ruleset.shortName,
      rulesetType: envelope.ruleset.type,
      sourceLength: envelope.ruleset.sourceLength,
      sourceHash: envelope.ruleset.sourceHash,
      compilerStatus: envelope.ruleset.compilerStatus,
      compilerErrors: envelope.ruleset.compilerErrors,
      useRealCloud: envelope.useRealCloud,
      providerMode: envelope.providerMode,
      runtimeMode: envelope.runtimeMode,
      executionMode: envelope.executionMode,
      cloudAttempted: envelope.cloudAttempted,
      resultSource: envelope.reviewSource,
      success: envelope.success,
      usedFallback: envelope.usedFallback,
      errorCode: envelope.errorCode,
      fallbackReason: envelope.fallbackReason,
      overallScore: envelope.overallScore,
      summaryPreview: envelope.summaryPreview,
      reviewPreview: envelope.reviewPreview
    });

    return buildProviderResult(buildDisplayPayload(envelope), {
      elapsedMs: nowMs() - startedAt,
      promptPreview: String(prompt || '').slice(0, 140),
      mode: env.editorMode,
      scenario: vars.mockScenario || 'default',
      timeoutMs: Number(
        vars.timeoutMs
        || (env.editorMode === 'deep' ? env.editorTimeoutDeepMs : env.editorTimeoutFastMs)
        || 60000
      ),
      model: env.editorModel,
      numPredict: Number(env.editorMode === 'deep' ? env.editorNumPredictDeep : env.editorNumPredictFast),
      promptfooEnv: getSafeEvalConfigForLogs(),
      fullResult: envelope,
      debugLogPath: DEBUG_LOG_PATH,
      backendRoot: BACKEND_ROOT
    });
  }
}

module.exports = EditorBotProvider;

const DEFAULT_EDITOR_BOT_OLLAMA_MODEL = process.env.OLLAMA_EDITOR_BOT_MODEL
  || process.env.RENTZ_EDITOR_BOT_OLLAMA_MODEL
  || process.env.RENTZ_BOT_OLLAMA_MODEL
  || 'llama3.2:3b';
const DEFAULT_EDITOR_BOT_FULL_OLLAMA_MODEL = process.env.OLLAMA_EDITOR_BOT_FULL_MODEL
  || process.env.RENTZ_EDITOR_BOT_FULL_OLLAMA_MODEL
  || DEFAULT_EDITOR_BOT_OLLAMA_MODEL;
const DEFAULT_EDITOR_BOT_LEAN_OLLAMA_MODEL = process.env.OLLAMA_EDITOR_BOT_LEAN_MODEL
  || process.env.RENTZ_EDITOR_BOT_LEAN_OLLAMA_MODEL
  || DEFAULT_EDITOR_BOT_OLLAMA_MODEL;
const DEFAULT_EDITOR_BOT_OLLAMA_BASE_URL = process.env.OLLAMA_EDITOR_BOT_BASE_URL
  || process.env.RENTZ_EDITOR_BOT_OLLAMA_BASE_URL
  || process.env.RENTZ_BOT_OLLAMA_BASE_URL
  || 'http://127.0.0.1:11434';
const EDITOR_BOT_TIMEOUT_MS = Math.max(
  1800,
  Number(process.env.OLLAMA_EDITOR_BOT_TIMEOUT_MS || process.env.RENTZ_EDITOR_BOT_TIMEOUT_MS || 7000)
);
const EDITOR_BOT_NUM_PREDICT = Math.max(160, Number(process.env.RENTZ_EDITOR_BOT_NUM_PREDICT || 320));
const LEAN_EDITOR_BOT_NUM_PREDICT = Math.max(120, Number(process.env.RENTZ_EDITOR_BOT_LEAN_NUM_PREDICT || 220));
const EDITOR_BOT_KEEP_ALIVE = process.env.OLLAMA_EDITOR_BOT_KEEP_ALIVE
  || process.env.RENTZ_EDITOR_BOT_KEEP_ALIVE
  || '15m';
const MAX_RULESET_SOURCE_LENGTH = 12000;
const MAX_RULESET_NAME_LENGTH = 120;
const MAX_RULESET_SHORT_NAME_LENGTH = 24;
const FULL_PROMPT_CODE_LIMIT = 1500;
const LEAN_PROMPT_CODE_LIMIT = 720;
const SCORE_MAP_PROMPT_CODE_LIMIT = 140;
const FULL_PROMPT_IDENTIFIER_LIMIT = 8;
const LEAN_PROMPT_IDENTIFIER_LIMIT = 4;
const SCORE_MAP_TIMEOUT_CAP_MS = Math.max(4000, Number(process.env.RENTZ_EDITOR_BOT_SCORE_MAP_TIMEOUT_CAP_MS || 25000));
const SCORE_MAP_NUM_PREDICT = Math.max(16, Number(process.env.RENTZ_EDITOR_BOT_SCORE_MAP_NUM_PREDICT || 32));
const SCORE_MAP_WARMUP_NUM_PREDICT = Math.max(16, Number(process.env.RENTZ_EDITOR_BOT_SCORE_MAP_WARMUP_NUM_PREDICT || 32));
const EDITOR_BOT_MODEL_WARMUP_TIMEOUT_MS = Math.max(
  3500,
  Number(process.env.RENTZ_EDITOR_BOT_MODEL_WARMUP_TIMEOUT_MS || 25000)
);
const EDITOR_BOT_MODEL_WARM_CACHE_MS = Math.max(
  60000,
  Number(process.env.RENTZ_EDITOR_BOT_MODEL_WARM_CACHE_MS || 480000)
);

const CATEGORY_DEFINITIONS = Object.freeze([
  { key: 'comebackPotential', label: 'Comeback potential' },
  { key: 'playerAgency', label: 'Player agency' },
  { key: 'claritySimplicity', label: 'Clarity / simplicity' },
  { key: 'scoringBalance', label: 'Scoring balance' }
]);
const CATEGORY_KEYS = Object.freeze(CATEGORY_DEFINITIONS.map((entry) => entry.key));
const EDITOR_BOT_CALIBRATION_GUIDANCE = Object.freeze([
  'A Rentz match rotates through several short contracts, so judge this as one mini-game inside that rotation.',
  'Simple focused contracts can score very high if they are clear, quick, and tactically useful.',
  'Default anchors like King of Hearts, Diamonds, Queens, 10 of Clubs, and Whist are good because each creates one clean pressure point.',
  'Total Plus and Total Minus can still score well when the swing is intentional and easy to understand.',
  'Do not require a ruleset to solve comeback pacing, deep strategy, or whole-match balance by itself.'
]);
const EDITOR_BOT_CRITERIA_GUIDANCE = Object.freeze({
  comebackPotential: 'Judge whether the contract keeps the overall match from feeling hopeless too early. Swingy rounds can still score well if the swings are understandable and fit Rentz rotation.',
  playerAgency: 'Judge whether players can influence the outcome through timing, suit-following, taking or avoiding tricks, preserving cards, baiting, or reading the table. Deep strategy is not required.',
  claritySimplicity: 'Judge how easy the contract is to explain, remember, and play quickly. Simple focused rules should usually score high here.',
  scoringBalance: 'Judge whether the point values feel matched to the difficulty and importance of the objective. Swingy scoring is acceptable if it is readable and intentional.'
});
let cachedEditorBotRuntime = null;
const warmedEditorBotModels = new Map();

async function loadEditorBotRuntime() {
  if (cachedEditorBotRuntime) {
    return cachedEditorBotRuntime;
  }

  const { z } = await import('zod');
  cachedEditorBotRuntime = { z };
  return cachedEditorBotRuntime;
}

function withTimeout(promise, timeoutMs, errorMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(errorMessage));
      }, timeoutMs);
      timeoutId.unref?.();
    })
  ]);
}

function normalizeEditorBotBaseUrl(baseUrl) {
  return String(baseUrl || DEFAULT_EDITOR_BOT_OLLAMA_BASE_URL).replace(/\/+$/, '');
}

function getEditorBotWarmModelCacheKey(modelName, baseUrl) {
  return `${normalizeEditorBotBaseUrl(baseUrl)}::${sanitizeText(modelName, DEFAULT_EDITOR_BOT_OLLAMA_MODEL, 120)}`;
}

async function postJsonWithTimeout(url, payload, timeoutMs, errorMessage) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  timeoutId.unref?.();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    }).catch((error) => {
      if (error?.name === 'AbortError') {
        throw new Error(errorMessage);
      }
      throw error;
    });

    return {
      response,
      controller,
      clearTimeout: () => clearTimeout(timeoutId)
    };
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function readEditorBotGenerateResponse({
  response,
  controller,
  clearTimeout,
  schema,
  attemptLabel,
  errorMessage,
  salvageParser = null
}) {
  const finalize = () => {
    clearTimeout?.();
  };

  try {
    if (!response.body) {
      const data = await response.json().catch(() => null);
      const rawText = String(data?.response || '').trim();
      const parsedJson = parseJsonObject(rawText);
      const parsed = schema.safeParse(parsedJson);

      if (!parsed.success) {
        const salvagedData = typeof salvageParser === 'function' ? salvageParser(rawText) : null;
        const salvagedParsed = salvagedData ? schema.safeParse(salvagedData) : null;
        if (salvagedParsed?.success) {
          return {
            success: true,
            data: salvagedParsed.data,
            attemptLabel
          };
        }

        return {
          success: false,
          error: 'invalid-structured-output',
          stage: parsedJson ? 'validation' : 'json-parse',
          rawPreview: buildEditorBotDiagnosticPreview(rawText),
          attemptLabel
        };
      }

      return {
        success: true,
        data: parsed.data,
        attemptLabel
      };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let rawText = '';

    while (true) {
      const { value, done } = await reader.read().catch((error) => {
        if (error?.name === 'AbortError') {
          throw new Error(errorMessage);
        }
        throw error;
      });

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) {
          continue;
        }

        let payload;
        try {
          payload = JSON.parse(trimmedLine);
        } catch {
          continue;
        }

        rawText += String(payload?.response || '');
        const parsedJson = parseJsonObject(rawText);
        const parsed = schema.safeParse(parsedJson);

        if (parsed.success) {
          controller?.abort?.();
          reader.cancel?.().catch(() => {});
          return {
            success: true,
            data: parsed.data,
            attemptLabel
          };
        }

        const salvagedData = typeof salvageParser === 'function' ? salvageParser(rawText) : null;
        const salvagedParsed = salvagedData ? schema.safeParse(salvagedData) : null;
        if (salvagedParsed?.success) {
          controller?.abort?.();
          reader.cancel?.().catch(() => {});
          return {
            success: true,
            data: salvagedParsed.data,
            attemptLabel
          };
        }
      }
    }

    rawText += decoder.decode();
    const parsedJson = parseJsonObject(rawText);
    const parsed = schema.safeParse(parsedJson);

    if (!parsed.success) {
      const salvagedData = typeof salvageParser === 'function' ? salvageParser(rawText) : null;
      const salvagedParsed = salvagedData ? schema.safeParse(salvagedData) : null;
      if (salvagedParsed?.success) {
        return {
          success: true,
          data: salvagedParsed.data,
          attemptLabel
        };
      }

      return {
        success: false,
        error: 'invalid-structured-output',
        stage: parsedJson ? 'validation' : 'json-parse',
        rawPreview: buildEditorBotDiagnosticPreview(rawText),
        attemptLabel
      };
    }

    return {
      success: true,
      data: parsed.data,
      attemptLabel
    };
  } catch (error) {
    if (String(error?.message || '') === errorMessage) {
      throw error;
    }

    if (error?.name === 'AbortError') {
      throw new Error(errorMessage);
    }

    throw error;
  } finally {
    finalize();
  }
}

function normalizeEditorBotRawScore(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? clampEditorBotScore(numericValue, 0) : null;
}

function extractAlternativeCategoryScoresFromObject(rawObject) {
  if (!rawObject || typeof rawObject !== 'object') {
    return {};
  }

  const sources = [
    rawObject,
    rawObject.categories,
    rawObject.categoryRatings
  ].filter((value) => value && typeof value === 'object');
  const extracted = {};

  for (const source of sources) {
    for (const categoryKey of CATEGORY_KEYS) {
      if (Object.prototype.hasOwnProperty.call(extracted, categoryKey)) {
        continue;
      }

      const entry = source[categoryKey];
      if (entry == null) {
        continue;
      }

      if (typeof entry === 'object') {
        const score = normalizeEditorBotRawScore(entry.score ?? entry.s ?? entry.value);
        if (score != null) {
          extracted[categoryKey] = {
            score,
            explanation: sanitizeText(entry.explanation ?? entry.e, '', 220)
          };
        }
        continue;
      }

      const score = normalizeEditorBotRawScore(entry);
      if (score != null) {
        extracted[categoryKey] = {
          score,
          explanation: ''
        };
      }
    }
  }

  return extracted;
}

function extractSequentialCategoryScoresFromText(text) {
  const rawText = String(text || '');
  const categories = Array.from(
    rawText.matchAll(/"category"\s*:\s*"(comebackPotential|playerAgency|claritySimplicity|scoringBalance)"/g)
  ).map((match) => match[1]);
  const uniqueCategories = Array.from(new Set(categories));
  const sharedScore = normalizeEditorBotRawScore(rawText.match(/"score"\s*:\s*(-?\d+(?:\.\d+)?)/)?.[1]);

  if (uniqueCategories.length < 3 || sharedScore == null) {
    return {};
  }

  return uniqueCategories.reduce((acc, categoryKey) => {
    acc[categoryKey] = {
      score: sharedScore,
      explanation: ''
    };
    return acc;
  }, {});
}

function buildSalvagedEditorBotReview(rawText, fallbackReview, options = {}) {
  const {
    allowScoreOnly = false
  } = options || {};
  const parsedJson = parseJsonObject(rawText);
  const extractedCategories = {
    ...extractSequentialCategoryScoresFromText(rawText),
    ...extractAlternativeCategoryScoresFromObject(parsedJson)
  };
  const extractedCategoryKeys = CATEGORY_KEYS.filter((categoryKey) => extractedCategories[categoryKey]);

  if (extractedCategoryKeys.length < 3) {
    return null;
  }

  const baseReview = fallbackReview && typeof fallbackReview === 'object'
    ? fallbackReview
    : buildFallbackEditorBotReview();
  const categories = CATEGORY_KEYS.reduce((acc, categoryKey) => {
    const fallbackCategory = baseReview.categoryRatings?.[categoryKey] || {
      score: 7,
      explanation: 'No extra detail was available for this category.'
    };
    const extractedCategory = extractedCategories[categoryKey];
    acc[categoryKey] = {
      score: clampEditorBotScore(extractedCategory?.score, fallbackCategory.score),
      explanation: sanitizeText(extractedCategory?.explanation, fallbackCategory.explanation, 220)
    };
    return acc;
  }, {});
  const averageScore = CATEGORY_KEYS
    .map((categoryKey) => categories[categoryKey].score)
    .reduce((sum, score) => sum + score, 0) / CATEGORY_KEYS.length;
  const hasCategoryExplanations = CATEGORY_KEYS.some((categoryKey) => {
    const explanation = sanitizeText(extractedCategories[categoryKey]?.explanation, '', 220);
    return explanation.length > 0;
  });
  const hasNarrativeText = Boolean(
    sanitizeText(parsedJson?.rulesetSummary ?? parsedJson?.summary ?? parsedJson?.rs, '', 320)
    || sanitizeText(parsedJson?.constructiveReview ?? parsedJson?.review ?? parsedJson?.cr, '', 360)
  );

  if (!allowScoreOnly && !hasCategoryExplanations && !hasNarrativeText) {
    return null;
  }

  return {
    overallScore: clampEditorBotScore(
      parsedJson?.overallScore ?? parsedJson?.score ?? averageScore,
      averageScore
    ),
    categories,
    rulesetSummary: sanitizeText(
      parsedJson?.rulesetSummary ?? parsedJson?.summary ?? parsedJson?.rs,
      baseReview.rulesetSummary,
      320
    ),
    constructiveReview: sanitizeText(
      parsedJson?.constructiveReview ?? parsedJson?.review ?? parsedJson?.cr,
      baseReview.constructiveReview,
      360
    ),
    recommendations: sanitizeTextList(
      parsedJson?.recommendations ?? parsedJson?.rec,
      baseReview.recommendations,
      160,
      4
    ),
    warnings: sanitizeTextList(
      parsedJson?.warnings ?? parsedJson?.w,
      baseReview.warnings,
      180,
      4
    )
  };
}

function parseJsonObject(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function buildEditorBotDiagnosticPreview(value, maxLength = 260) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function clampEditorBotScore(value, fallback = 5) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return clampEditorBotScore(fallback, 5);
  }

  return Math.max(0, Math.min(10, Math.round(numericValue * 10) / 10));
}

function sanitizeText(value, fallback = '', maxLength = 320) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return fallback;
  }

  return text.slice(0, maxLength);
}

function sanitizeTextList(values, fallback = [], maxLength = 160, maxItems = 4) {
  const list = Array.isArray(values)
    ? values
    : typeof values === 'string'
      ? [values]
      : [];
  const sanitized = list
    .map((value) => sanitizeText(value, '', maxLength))
    .filter(Boolean);

  return sanitized.length > 0 ? sanitized.slice(0, maxItems) : fallback;
}

function buildSafeRulesetPayload(input = {}) {
  const title = sanitizeText(input.longName || input.title, 'Untitled Ruleset', MAX_RULESET_NAME_LENGTH);
  const shortName = sanitizeText(input.shortName || input.abbreviation, '', MAX_RULESET_SHORT_NAME_LENGTH);
  const type = input.type === 'end_game' ? 'end_game' : 'per_round';
  const code = String(input.code || '');

  if (!code.trim()) {
    const error = new Error('Write a ruleset before asking the Editor Bot to judge it.');
    error.statusCode = 400;
    throw error;
  }

  if (code.length > MAX_RULESET_SOURCE_LENGTH) {
    const error = new Error(`Ruleset code is too large to judge right now. Keep it under ${MAX_RULESET_SOURCE_LENGTH} characters.`);
    error.statusCode = 400;
    throw error;
  }

  return {
    title,
    shortName,
    type,
    code
  };
}

function buildPromptCodeExcerpt(code, maxLength) {
  const normalized = String(code || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();

  if (!normalized) {
    return {
      text: '',
      truncated: false
    };
  }

  if (normalized.length <= maxLength) {
    return {
      text: normalized,
      truncated: false
    };
  }

  return {
    text: `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`,
    truncated: true
  };
}

function samplePromptIdentifiers(identifiers = [], limit = FULL_PROMPT_IDENTIFIER_LIMIT) {
  const safeIdentifiers = Array.isArray(identifiers)
    ? identifiers
      .filter(Boolean)
      .map((identifier) => sanitizeText(identifier, '', 80))
      .filter(Boolean)
    : [];

  return {
    values: safeIdentifiers.slice(0, limit),
    truncated: safeIdentifiers.length > limit
  };
}

function resolveEditorBotNumPredict(target) {
  const numericTarget = Number(target);
  if (!Number.isFinite(numericTarget)) {
    return EDITOR_BOT_NUM_PREDICT;
  }

  return Math.max(80, Math.min(Math.round(numericTarget), 480));
}

function createEmptyMetrics(type = 'per_round') {
  return {
    type,
    charCount: 0,
    lineCount: 0,
    nonEmptyLineCount: 0,
    statementCount: 0,
    ifCount: 0,
    maxBranchDepth: 0,
    conditionCount: 0,
    callCounts: {
      add: 0,
      set_to: 0,
      reset_to: 0,
      end: 0,
      game_end: 0
    },
    identifierCounts: {},
    identifiers: [],
    estimatedMaxSwing: 0,
    totalEstimatedSwing: 0,
    scoringDirections: {
      positive: 0,
      negative: 0,
      neutral: 0
    }
  };
}

function bumpCounter(map, key) {
  map[key] = (map[key] || 0) + 1;
}

function estimateIdentifierMagnitude(name) {
  const normalized = String(name || '').toUpperCase();
  if (!normalized) {
    return 1;
  }

  if (normalized === 'PLAYER_COUNT') {
    return 6;
  }

  if (normalized === 'CARD_NR') {
    return 4;
  }

  if (normalized === 'POINTS' || normalized === 'INITIAL_POINTS' || normalized === 'TOTAL_POINTS') {
    return 120;
  }

  if (normalized.startsWith('TOTAL_') && normalized.endsWith('_NR')) {
    return 13;
  }

  if (normalized.endsWith('_NR')) {
    return 13;
  }

  return 1;
}

function estimateExpressionMagnitude(expression) {
  if (!expression || typeof expression !== 'object') {
    return 0;
  }

  switch (expression.type) {
    case 'Literal':
      return Math.abs(Number(expression.value) || 0);
    case 'Identifier':
      return estimateIdentifierMagnitude(expression.name);
    case 'UnaryExpression':
      return estimateExpressionMagnitude(expression.argument);
    case 'BinaryExpression': {
      const left = estimateExpressionMagnitude(expression.left);
      const right = estimateExpressionMagnitude(expression.right);

      if (expression.operator === '*') {
        return Math.min(400, left * right);
      }

      if (expression.operator === '/') {
        return Math.min(400, left / Math.max(1, right));
      }

      return Math.min(400, left + right);
    }
    case 'CallExpression':
      return 0;
    default:
      return 0;
  }
}

function inferScoreDirection(expression) {
  if (!expression || typeof expression !== 'object') {
    return 'neutral';
  }

  if (expression.type === 'Literal') {
    const value = Number(expression.value || 0);
    if (value > 0) {
      return 'positive';
    }
    if (value < 0) {
      return 'negative';
    }
    return 'neutral';
  }

  if (expression.type === 'UnaryExpression' && expression.operator === '-') {
    const argumentDirection = inferScoreDirection(expression.argument);
    if (argumentDirection === 'positive') {
      return 'negative';
    }
    if (argumentDirection === 'negative') {
      return 'positive';
    }
  }

  return 'neutral';
}

function collectExpressionMetrics(expression, metrics) {
  if (!expression || typeof expression !== 'object') {
    return;
  }

  if (expression.type === 'Identifier' && expression.name) {
    bumpCounter(metrics.identifierCounts, String(expression.name).toUpperCase());
  }

  if (expression.type === 'UnaryExpression') {
    collectExpressionMetrics(expression.argument, metrics);
    return;
  }

  if (expression.type === 'BinaryExpression' || expression.type === 'LogicalExpression') {
    collectExpressionMetrics(expression.left, metrics);
    collectExpressionMetrics(expression.right, metrics);
    return;
  }

  if (expression.type === 'CallExpression') {
    for (const argument of expression.arguments || []) {
      collectExpressionMetrics(argument, metrics);
    }
  }
}

function collectStatementMetrics(statement, metrics, depth = 1) {
  if (!statement || typeof statement !== 'object') {
    return;
  }

  metrics.statementCount += 1;
  metrics.maxBranchDepth = Math.max(metrics.maxBranchDepth, depth);

  if (statement.type === 'ExpressionStatement' && statement.expression?.type === 'CallExpression') {
    const call = statement.expression;
    if (Object.prototype.hasOwnProperty.call(metrics.callCounts, call.callee)) {
      metrics.callCounts[call.callee] += 1;
    }

    (call.arguments || []).forEach((argument) => collectExpressionMetrics(argument, metrics));

    if (['add', 'set_to', 'reset_to'].includes(call.callee) && call.arguments?.[0]) {
      const swingEstimate = estimateExpressionMagnitude(call.arguments[0]);
      metrics.estimatedMaxSwing = Math.max(metrics.estimatedMaxSwing, swingEstimate);
      metrics.totalEstimatedSwing += swingEstimate;
      metrics.scoringDirections[inferScoreDirection(call.arguments[0])] += 1;
    }

    return;
  }

  if (statement.type === 'IfStatement') {
    metrics.ifCount += 1;
    for (const branch of statement.branches || []) {
      metrics.conditionCount += 1;
      collectExpressionMetrics(branch.condition, metrics);
      for (const child of branch.body || []) {
        collectStatementMetrics(child, metrics, depth + 1);
      }
    }

    for (const child of statement.elseBody || []) {
      collectStatementMetrics(child, metrics, depth + 1);
    }
  }
}

function buildRulesetJudgeMetrics({ code = '', type = 'per_round', ast = null } = {}) {
  const metrics = createEmptyMetrics(type);
  metrics.charCount = String(code || '').length;
  metrics.lineCount = String(code || '').split('\n').length;
  metrics.nonEmptyLineCount = String(code || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .length;

  if (!ast?.body?.length) {
    return metrics;
  }

  for (const statement of ast.body) {
    collectStatementMetrics(statement, metrics, 1);
  }

  metrics.identifiers = Object.keys(metrics.identifierCounts).sort();
  return metrics;
}

function hasIdentifier(metrics, pattern) {
  return metrics.identifiers.some((identifier) => pattern.test(identifier));
}

function buildObjectiveFragments(metrics) {
  const fragments = [];

  if (hasIdentifier(metrics, /HEART/) && hasIdentifier(metrics, /(KING|_K$)/)) {
    fragments.push('avoid or contest the king of hearts');
  } else if (hasIdentifier(metrics, /HEART/)) {
    fragments.push('manage heart captures');
  }

  if (hasIdentifier(metrics, /DIAMOND/)) {
    fragments.push('avoid or pressure diamond tricks');
  }

  if (hasIdentifier(metrics, /(QUEEN|_Q$)/)) {
    fragments.push('track queen danger cards');
  }

  if (hasIdentifier(metrics, /CLUB/) && hasIdentifier(metrics, /(^10_|_10$|TEN)/)) {
    fragments.push('play around the ten of clubs');
  }

  if (metrics.callCounts.game_end > 0 || metrics.callCounts.end > 0) {
    fragments.push('watch the ending trigger');
  }

  if (hasIdentifier(metrics, /POINTS|TOTAL_POINTS|INITIAL_POINTS/)) {
    fragments.push('react to score-state checks');
  }

  return Array.from(new Set(fragments)).slice(0, 3);
}

function buildRulesetSummary({ title, type, metrics }) {
  const fragments = buildObjectiveFragments(metrics);
  const objectiveText = fragments.length > 0
    ? fragments.join(', ')
    : 'play around the scripted scoring target';
  const swingText = metrics.callCounts.set_to + metrics.callCounts.reset_to > 0
    ? 'It uses direct score rewrites, so the payoff is dramatic but heavier to balance.'
    : metrics.estimatedMaxSwing >= 140
      ? 'It has a deliberately swingy payoff, so table clarity matters.'
      : 'Its payoff looks readable enough for a quick table round.';
  const typeText = type === 'end_game'
    ? 'It behaves more like a closer that shapes the end of the full match.'
    : 'It behaves like a rotating per-round contract rather than a whole game system.';

  return `${title} is a focused Rentz contract where players mainly try to ${objectiveText}. ${swingText} ${typeText}`;
}

function pushUnique(list, message) {
  const text = sanitizeText(message, '', 220);
  if (text && !list.includes(text)) {
    list.push(text);
  }
}

function buildFallbackCategoryRatings(metrics) {
  const simpleStructureBonus = metrics.nonEmptyLineCount <= 6 ? 0.8 : metrics.nonEmptyLineCount <= 10 ? 0.4 : 0;
  const focusedContractBonus = buildObjectiveFragments(metrics).length <= 2 ? 0.5 : 0.2;
  const moderateChoiceBonus = metrics.ifCount >= 1 && metrics.ifCount <= 2 ? 0.5 : metrics.ifCount === 0 ? 0.1 : 0;
  const mixedDirectionBonus = metrics.scoringDirections.negative > 0 && metrics.scoringDirections.positive > 0 ? 0.4 : 0;
  const complexityPenalty = metrics.nonEmptyLineCount > 18
    ? 1.9
    : metrics.nonEmptyLineCount > 12
      ? 1
      : metrics.nonEmptyLineCount > 8
        ? 0.4
        : 0;
  const branchPenalty = metrics.ifCount > 4 ? 1.2 : metrics.ifCount > 2 ? 0.5 : 0;
  const scoreRewritePenalty = metrics.callCounts.set_to + metrics.callCounts.reset_to > 0 ? 1.2 : 0;
  const earlyEndPenalty = metrics.callCounts.game_end + metrics.callCounts.end > 0 ? 0.7 : 0;
  const scoreStatePenalty = hasIdentifier(metrics, /POINTS|TOTAL_POINTS|INITIAL_POINTS/) ? 0.6 : 0;
  const exactCardHeavyPenalty = metrics.identifiers.filter((identifier) => /_(A|K|Q|J|10|9|8|7|6|5|4|3|2)$/.test(identifier)).length >= 5 ? 0.6 : 0;
  const swingPenalty = metrics.estimatedMaxSwing >= 220
    ? 2
    : metrics.estimatedMaxSwing >= 150
      ? 1.1
      : metrics.estimatedMaxSwing >= 110
        ? 0.5
        : 0;
  const totalSwingPenalty = metrics.totalEstimatedSwing >= 320
    ? 1.2
    : metrics.totalEstimatedSwing >= 220
      ? 0.6
      : 0;
  const oneWayPenalty = metrics.scoringDirections.negative > 0 && metrics.scoringDirections.positive === 0 ? 0.2 : 0;

  const ratings = {
    comebackPotential: clampEditorBotScore(
      7.5 + focusedContractBonus - swingPenalty - totalSwingPenalty - scoreRewritePenalty - earlyEndPenalty - scoreStatePenalty,
      7.1
    ),
    playerAgency: clampEditorBotScore(
      7.1 + simpleStructureBonus * 0.3 + moderateChoiceBonus + mixedDirectionBonus - exactCardHeavyPenalty - oneWayPenalty,
      7
    ),
    claritySimplicity: clampEditorBotScore(
      8.5 + simpleStructureBonus + focusedContractBonus - complexityPenalty - branchPenalty - scoreStatePenalty * 0.5 - scoreRewritePenalty * 0.3,
      7.8
    ),
    scoringBalance: clampEditorBotScore(
      7.8 + focusedContractBonus * 0.4 + mixedDirectionBonus - swingPenalty - totalSwingPenalty * 0.8 - scoreRewritePenalty * 0.8,
      7.2
    )
  };

  return {
    comebackPotential: {
      score: ratings.comebackPotential,
      explanation: swingPenalty >= 1.1 || earlyEndPenalty > 0 || scoreRewritePenalty > 0
        ? 'The contract is exciting, but big resets or abrupt endings can make a round feel decided too early.'
        : 'It is focused without obviously making the wider Rentz match feel hopeless too early.'
    },
    playerAgency: {
      score: ratings.playerAgency,
      explanation: exactCardHeavyPenalty > 0
        ? 'Players still have choices, but exact-card dependence can make outcomes feel a bit draw-led.'
        : 'Players should have readable choices around timing, suit pressure, and when to take or dodge tricks.'
    },
    claritySimplicity: {
      score: ratings.claritySimplicity,
      explanation: complexityPenalty > 0 || branchPenalty > 0
        ? 'The idea is understandable, but the extra conditions will slow teaching and table speed.'
        : 'The objective is compact and easy to remember, which is a real strength for Rentz rotation.'
    },
    scoringBalance: {
      score: ratings.scoringBalance,
      explanation: scoreRewritePenalty > 0
        ? 'The scoring is dramatic enough to be interesting, but direct rewrites need extra care to stay readable.'
        : swingPenalty >= 1.1
          ? 'The swing is intentionally high-stakes, so it works best when players can see the danger clearly.'
          : 'The point values look reasonably matched to the contract and easy to track at the table.'
    }
  };
}

function buildConstructiveReview({ title, type, metrics, ratings }) {
  const roleText = type === 'end_game' ? 'match closer' : 'rotating mini-game';
  const strengths = [];
  const concerns = [];

  if (ratings.claritySimplicity.score >= 8.3) {
    strengths.push('It is easy to teach and should resolve quickly.');
  }

  if (ratings.playerAgency.score >= 7.4) {
    strengths.push('Players should still feel they can influence the result with timing and table reads.');
  }

  if (ratings.scoringBalance.score >= 7.6) {
    strengths.push('The payoff feels pointed without being needlessly messy.');
  }

  if (metrics.callCounts.set_to + metrics.callCounts.reset_to > 0) {
    concerns.push('Direct score replacement is the main risk because it can overpower the rest of the round.');
  }

  if (metrics.estimatedMaxSwing >= 180) {
    concerns.push('The biggest swing may be a little too decisive unless the danger is obvious from the start.');
  }

  if (metrics.nonEmptyLineCount > 14 || metrics.ifCount > 3) {
    concerns.push('The extra conditions may slow the table down more than the idea itself needs.');
  }

  const opening = `${title} reads like a solid ${roleText} rather than a ruleset trying to carry the whole match by itself.`;
  const strengthText = strengths[0] || 'Its main value is that the contract has a clear tactical target.';
  const concernText = concerns[0] || 'The main question is whether repeated playtests keep the pressure interesting without adding more text.';

  return `${opening} ${strengthText} ${concernText}`;
}

function buildRecommendations(metrics, ratings) {
  const recommendations = [];

  if (metrics.estimatedMaxSwing >= 180) {
    pushUnique(recommendations, 'Consider trimming the largest swing a little so one trick does not erase too much of the round.');
  }

  if (metrics.nonEmptyLineCount > 14 || metrics.ifCount > 3) {
    pushUnique(recommendations, 'Collapse one or two conditions so players can remember the contract without re-reading it mid-round.');
  }

  if (metrics.callCounts.set_to + metrics.callCounts.reset_to > 0) {
    pushUnique(recommendations, 'Only keep score rewrites if the drama they create is worth the extra balance risk.');
  }

  if (ratings.playerAgency.score < 6.8) {
    pushUnique(recommendations, 'Add one clearer timing or suit-pressure decision so players feel less locked into automatic play.');
  }

  return recommendations.slice(0, 3);
}

function buildWarnings(metrics, fallbackWarning = '') {
  const warnings = [];

  if (fallbackWarning) {
    pushUnique(warnings, fallbackWarning);
  }

  if (metrics.estimatedMaxSwing >= 240) {
    pushUnique(warnings, 'Very high single-event swings can overshadow the rest of the round.');
  }

  if (metrics.callCounts.set_to + metrics.callCounts.reset_to > 0) {
    pushUnique(warnings, 'Direct score replacement needs extra playtesting because it changes normal Rentz pacing.');
  }

  if (metrics.nonEmptyLineCount > 18) {
    pushUnique(warnings, 'This script is long enough that table speed may suffer unless the group already knows it well.');
  }

  return warnings.slice(0, 3);
}

function buildFallbackEditorBotReview({
  title = 'Untitled Ruleset',
  type = 'per_round',
  code = '',
  ast = null,
  fallbackWarning = ''
} = {}) {
  const metrics = buildRulesetJudgeMetrics({ code, type, ast });
  const categoryRatings = buildFallbackCategoryRatings(metrics);
  const overallAverage = CATEGORY_KEYS
    .map((key) => categoryRatings[key].score)
    .reduce((sum, score) => sum + score, 0) / CATEGORY_KEYS.length;
  const overallScore = clampEditorBotScore(overallAverage, 7.3);
  const constructiveReview = buildConstructiveReview({
    title,
    type,
    metrics,
    ratings: categoryRatings
  });
  const recommendations = buildRecommendations(metrics, categoryRatings);
  const warnings = buildWarnings(metrics, fallbackWarning);

  return {
    overallScore,
    categories: categoryRatings,
    categoryRatings,
    rulesetSummary: buildRulesetSummary({ title, type, metrics }),
    constructiveReview,
    recommendations,
    warnings,
    reviewSource: fallbackWarning ? 'fallback' : 'heuristic'
  };
}

function buildReviewSchema(z) {
  const flexibleStringListSchema = z.preprocess((value) => {
    if (typeof value === 'string') {
      return [value];
    }

    return value;
  }, z.array(z.string().min(1).max(160)).max(4).optional());
  const categorySchema = z.object({
    score: z.number().min(0).max(10),
    explanation: z.string().min(1).max(220)
  });

  return z.object({
    overallScore: z.number().min(0).max(10),
    categories: z.object(
      CATEGORY_DEFINITIONS.reduce((shape, entry) => {
        shape[entry.key] = categorySchema;
        return shape;
      }, {})
    ),
    rulesetSummary: z.string().min(1).max(320),
    constructiveReview: z.string().min(1).max(360),
    recommendations: flexibleStringListSchema,
    warnings: flexibleStringListSchema
  });
}

function buildScoreMapSchema(z) {
  const scoreSchema = z.preprocess((value) => {
    if (typeof value === 'string' && value.trim()) {
      return Number(value);
    }

    return value;
  }, z.number().min(0).max(10));

  return z.object({
    comebackPotential: scoreSchema,
    playerAgency: scoreSchema,
    claritySimplicity: scoreSchema,
    scoringBalance: scoreSchema
  });
}

function buildEditorBotRawPrompt(systemPrompt, humanPrompt) {
  return [
    systemPrompt,
    '',
    'Payload:',
    humanPrompt,
    '',
    'Return JSON only.'
  ].join('\n');
}

async function invokeEditorBotModel({
  modelName = DEFAULT_EDITOR_BOT_OLLAMA_MODEL,
  baseUrl = DEFAULT_EDITOR_BOT_OLLAMA_BASE_URL,
  jsonMode = true,
  numPredict = EDITOR_BOT_NUM_PREDICT
} = {}) {
  return {
    modelName: sanitizeText(modelName, DEFAULT_EDITOR_BOT_OLLAMA_MODEL, 120),
    baseUrl: normalizeEditorBotBaseUrl(baseUrl),
    jsonMode,
    numPredict: resolveEditorBotNumPredict(numPredict)
  };
}

async function queryStructuredEditorBotResponse({
  schema,
  systemPrompt,
  humanPrompt,
  modelName = DEFAULT_EDITOR_BOT_OLLAMA_MODEL,
  baseUrl = DEFAULT_EDITOR_BOT_OLLAMA_BASE_URL,
  timeoutMs = EDITOR_BOT_TIMEOUT_MS,
  attemptLabel = 'full-json',
  numPredict = EDITOR_BOT_NUM_PREDICT,
  jsonMode = true,
  salvageParser = null
} = {}) {
  const request = await invokeEditorBotModel({
    modelName,
    baseUrl,
    jsonMode,
    numPredict
  });
  const errorMessage = `Editor Bot request timed out after ${timeoutMs}ms`;
  const { response, controller, clearTimeout } = await postJsonWithTimeout(
    `${request.baseUrl}/api/generate`,
    {
      model: request.modelName,
      prompt: buildEditorBotRawPrompt(systemPrompt, humanPrompt),
      stream: true,
      keep_alive: EDITOR_BOT_KEEP_ALIVE,
      options: {
        temperature: 0.1,
        num_predict: request.numPredict,
        num_ctx: 1536
      },
      ...(request.jsonMode ? { format: 'json' } : {})
    },
    timeoutMs,
    errorMessage
  );

  if (!response.ok) {
    clearTimeout?.();
    throw new Error(`Editor Bot Ollama request failed with HTTP ${response.status}`);
  }

  return readEditorBotGenerateResponse({
    response,
    controller,
    clearTimeout,
    schema,
    attemptLabel,
    errorMessage,
    salvageParser
  });
}

function isRetryableEditorBotError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('timed out')
    || message.includes('failed to fetch')
    || message.includes('fetch failed')
    || message.includes('network')
    || message.includes('connect')
    || message.includes('socket');
}

function buildPromptScoringProfile(metrics) {
  if (metrics.scoringDirections.positive > 0 && metrics.scoringDirections.negative > 0) {
    return 'mixed rewards and penalties';
  }

  if (metrics.scoringDirections.positive > 0) {
    return 'reward-focused scoring';
  }

  if (metrics.scoringDirections.negative > 0) {
    return 'penalty-focused scoring';
  }

  return 'special-condition scoring';
}

function buildPromptFocusSummary(metrics, type) {
  const fragments = buildObjectiveFragments(metrics);
  if (fragments.length > 0) {
    return fragments.join(', ');
  }

  return type === 'end_game'
    ? 'shape the final standings with a scripted trigger'
    : 'create a compact trick-by-trick scoring target';
}

function buildEditorBotPromptPayload({ title, shortName, type, code, compiler, metrics, lean = false }) {
  const codeExcerpt = buildPromptCodeExcerpt(
    code,
    lean ? LEAN_PROMPT_CODE_LIMIT : FULL_PROMPT_CODE_LIMIT
  );
  const identifierSample = samplePromptIdentifiers(
    metrics.identifiers,
    lean ? LEAN_PROMPT_IDENTIFIER_LIMIT : FULL_PROMPT_IDENTIFIER_LIMIT
  );

  return {
    ruleset: {
      title,
      shortName,
      type,
      code: codeExcerpt.text,
      codeTruncated: codeExcerpt.truncated
    },
    compiler: {
      status: compiler?.status || 'compiled',
      message: sanitizeText(compiler?.message, 'Ruleset compiled successfully.', 180),
      errors: Array.isArray(compiler?.errors) ? compiler.errors.slice(0, lean ? 1 : 2) : [],
      warnings: Array.isArray(compiler?.warnings) ? compiler.warnings.slice(0, lean ? 1 : 2) : []
    },
    parsedSummary: {
      role: type === 'end_game' ? 'match closer' : 'rotating contract',
      focus: buildPromptFocusSummary(metrics, type),
      scoringProfile: buildPromptScoringProfile(metrics),
      largestSingleSwing: metrics.estimatedMaxSwing,
      totalDeclaredSwing: metrics.totalEstimatedSwing,
      nonEmptyLines: metrics.nonEmptyLineCount,
      branchCount: metrics.ifCount,
      maxBranchDepth: metrics.maxBranchDepth,
      identifiers: identifierSample.values,
      identifiersTruncated: identifierSample.truncated
    },
    calibration: {
      matchContext: 'Judge this as one ruleset inside a larger Rentz match rotation.',
      anchors: lean
        ? EDITOR_BOT_CALIBRATION_GUIDANCE.slice(0, 3)
        : EDITOR_BOT_CALIBRATION_GUIDANCE
    },
    criteria: EDITOR_BOT_CRITERIA_GUIDANCE,
    responseNotes: [
      'Keep each category explanation short.',
      'Keep the summary and review concise.',
      'Only recommend changes that would materially help.',
      'Return the exact nested categories object, not a flat score map.'
    ]
  };
}

function buildEditorBotSystemPrompt() {
  return [
    'You are Editor Bot for Rentz custom rulesets.',
    'Judge each ruleset as one rotating Rentz mini-game or contract inside a larger match, not as the entire game.',
    'Simple focused contracts can score very high.',
    'Some swinginess is good when it is clear, readable, and intentional.',
    'Default-style anchors like King of Hearts, Diamonds, Queens, 10 of Clubs, and Whist are good because they are clear, fast, and tactically focused.',
    'Total Plus and Total Minus can still score well when their larger swings stay understandable.',
    'Do not punish a ruleset just for being simple, narrow, or not carrying comeback mechanics by itself.',
    'Use only these four categories: comebackPotential, playerAgency, claritySimplicity, scoringBalance.',
    'Do not return category names at the top level by themselves.',
    'Put every category inside categories.{categoryKey}.{score,explanation}.',
    'Keep the feedback practical, brief, and not harsh.',
    'Return JSON only using the requested schema.'
  ].join(' ');
}

function buildEditorBotScoreMapPrompt() {
  return [
    'You are Editor Bot for Rentz custom rulesets.',
    'Judge this as one rotating Rentz mini-game inside a larger match.',
    'Return JSON only.',
    'Use exactly this shape:',
    '{"comebackPotential":number,"playerAgency":number,"claritySimplicity":number,"scoringBalance":number}',
    'No explanations. No extra keys. One decimal allowed.',
    'Simple focused default-style contracts can score high.',
    'Judge only the four scores and stop.',
    'Use the short summary below instead of doing a deep simulation.',
    'Use the provided baseline scores as your starting point.',
    'Only move a score far away from the baseline if the ruleset summary gives a strong reason.'
  ].join(' ');
}

function buildEditorBotScoreMapPayload({ title, shortName, type, code, compiler, metrics, heuristicReview }) {
  return {
    t: sanitizeText(title, 'Untitled Ruleset', 80),
    s: sanitizeText(shortName, '', 24),
    y: type === 'end_game' ? 'end_game' : 'per_round',
    role: type === 'end_game' ? 'match closer' : 'rotating contract',
    focus: buildPromptFocusSummary(metrics, type),
    scoring: buildPromptScoringProfile(metrics),
    swing: Math.max(0, Number(metrics?.estimatedMaxSwing) || 0),
    totalSwing: Math.max(0, Number(metrics?.totalEstimatedSwing) || 0),
    lines: Math.max(0, Number(metrics?.nonEmptyLineCount) || 0),
    branches: Math.max(0, Number(metrics?.ifCount) || 0),
    compile: compiler?.status || 'compiled',
    msg: sanitizeText(compiler?.message, 'Ruleset compiled successfully.', 120),
    baseline: heuristicReview ? {
      comebackPotential: clampEditorBotScore(heuristicReview.categoryRatings?.comebackPotential?.score, 7),
      playerAgency: clampEditorBotScore(heuristicReview.categoryRatings?.playerAgency?.score, 7),
      claritySimplicity: clampEditorBotScore(heuristicReview.categoryRatings?.claritySimplicity?.score, 8),
      scoringBalance: clampEditorBotScore(heuristicReview.categoryRatings?.scoringBalance?.score, 7)
    } : undefined,
    anchors: [
      'Simple focused contracts can score high.',
      'Do not judge this like a whole standalone game.',
      'Swingy scoring can be fine when it is clear.',
      'King of Hearts style clarity should usually score high.'
    ]
  };
}

async function requestEditorBotAttempt({
  schema,
  systemPrompt,
  humanPrompt,
  modelName,
  baseUrl,
  timeoutMs,
  attemptLabel,
  numPredict,
  jsonMode,
  salvageParser
} = {}) {
  const startedAt = Date.now();

  try {
    const result = await queryStructuredEditorBotResponse({
      schema,
      systemPrompt,
      humanPrompt,
      modelName,
      baseUrl,
      timeoutMs,
      attemptLabel,
      numPredict,
      jsonMode,
      salvageParser
    });

    return {
      ...result,
      diagnostic: {
        attempt: attemptLabel,
        elapsedMs: Date.now() - startedAt,
        success: result.success,
        stage: result.success ? 'complete' : result.stage || 'unknown',
        error: result.success ? '' : result.error || 'unknown-error',
        rawPreview: buildEditorBotDiagnosticPreview(
          [result.rawPreview, `model: ${modelName}`].filter(Boolean).join(' | ')
        )
      }
    };
  } catch (error) {
    error.editorBotDiagnostic = {
      attempt: attemptLabel,
      elapsedMs: Date.now() - startedAt,
      success: false,
      stage: 'model',
      error: sanitizeText(error.message, 'unknown-error', 220),
      rawPreview: buildEditorBotDiagnosticPreview(`model: ${modelName}`)
    };
    throw error;
  }
}

async function requestEditorBotReviewVariant({
  safeRuleset,
  compiler,
  metrics,
  fallbackReview,
  schema,
  modelName,
  baseUrl,
  timeoutMs,
  lean = false
} = {}) {
  const systemPrompt = buildEditorBotSystemPrompt();
  const humanPrompt = JSON.stringify(buildEditorBotPromptPayload({
    ...safeRuleset,
    compiler,
    metrics,
    lean
  }));
  const salvageParser = (rawText) => buildSalvagedEditorBotReview(rawText, fallbackReview, {
    allowScoreOnly: false
  });
  const diagnostics = [];

  try {
    const jsonResult = await requestEditorBotAttempt({
      schema,
      systemPrompt,
      humanPrompt,
      modelName,
      baseUrl,
      timeoutMs,
      attemptLabel: lean ? 'lean-json' : 'full-json',
      numPredict: lean ? LEAN_EDITOR_BOT_NUM_PREDICT : EDITOR_BOT_NUM_PREDICT,
      jsonMode: true,
      salvageParser
    });
    diagnostics.push(jsonResult.diagnostic);

    if (jsonResult.success) {
      return {
        success: true,
        data: jsonResult.data,
        diagnostics
      };
    }

    if (jsonResult.error === 'invalid-structured-output' && jsonResult.stage === 'validation') {
      return {
        success: false,
        error: jsonResult.error,
        stage: jsonResult.stage,
        diagnostics
      };
    }

    const plainResult = await requestEditorBotAttempt({
      schema,
      systemPrompt,
      humanPrompt,
      modelName,
      baseUrl,
      timeoutMs: Math.max(2500, Math.round(timeoutMs * 0.9)),
      attemptLabel: lean ? 'lean-plain' : 'full-plain',
      numPredict: lean ? LEAN_EDITOR_BOT_NUM_PREDICT : EDITOR_BOT_NUM_PREDICT,
      jsonMode: false,
      salvageParser
    });
    diagnostics.push(plainResult.diagnostic);

    if (plainResult.success) {
      return {
        success: true,
        data: plainResult.data,
        diagnostics
      };
    }

    return {
      success: false,
      error: plainResult.error || jsonResult.error || 'invalid-structured-output',
      stage: plainResult.stage || jsonResult.stage || 'validation',
      diagnostics
    };
  } catch (error) {
    if (error.editorBotDiagnostic) {
      diagnostics.push(error.editorBotDiagnostic);
    }
    error.editorBotDiagnostics = diagnostics;
    throw error;
  }
}

async function requestEditorBotScoreMap({
  safeRuleset,
  compiler,
  metrics,
  heuristicReview,
  schema,
  modelName,
  baseUrl,
  timeoutMs
} = {}) {
  const systemPrompt = buildEditorBotScoreMapPrompt();
  const humanPrompt = JSON.stringify(buildEditorBotScoreMapPayload({
    ...safeRuleset,
    compiler,
    metrics,
    heuristicReview
  }));
  const diagnostics = [];

  try {
    let jsonResult;

    try {
      jsonResult = await requestEditorBotAttempt({
        schema,
        systemPrompt,
        humanPrompt,
        modelName,
        baseUrl,
        timeoutMs,
        attemptLabel: 'score-map-json',
        numPredict: SCORE_MAP_NUM_PREDICT,
        jsonMode: true
      });
      diagnostics.push(jsonResult.diagnostic);

      if (jsonResult.success) {
        return {
          success: true,
          data: jsonResult.data,
          diagnostics
        };
      }
    } catch (error) {
      if (error.editorBotDiagnostic) {
        diagnostics.push(error.editorBotDiagnostic);
      }

      if (!isRetryableEditorBotError(error)) {
        error.editorBotDiagnostics = diagnostics;
        throw error;
      }
    }

    const plainResult = await requestEditorBotAttempt({
      schema,
      systemPrompt,
      humanPrompt,
      modelName,
      baseUrl,
      timeoutMs: Math.max(2500, Math.round(timeoutMs * 0.8)),
      attemptLabel: 'score-map-plain',
      numPredict: SCORE_MAP_NUM_PREDICT,
      jsonMode: false
    });
    diagnostics.push(plainResult.diagnostic);

    if (plainResult.success) {
      return {
        success: true,
        data: plainResult.data,
        diagnostics
      };
    }

    return {
      success: false,
      error: plainResult.error || jsonResult?.error || 'invalid-structured-output',
      stage: plainResult.stage || jsonResult?.stage || 'validation',
      diagnostics
    };
  } catch (error) {
    if (error.editorBotDiagnostic) {
      diagnostics.push(error.editorBotDiagnostic);
    }
    error.editorBotDiagnostics = diagnostics;
    throw error;
  }
}

function pickLeanEditorBotModel(preferredModelName) {
  const explicitLeanModel = sanitizeText(DEFAULT_EDITOR_BOT_LEAN_OLLAMA_MODEL, '', 120);
  if (explicitLeanModel) {
    return explicitLeanModel;
  }

  return sanitizeText(preferredModelName, DEFAULT_EDITOR_BOT_OLLAMA_MODEL, 120);
}

function buildWarmupPayload() {
  return {
    ruleset: {
      title: 'Warmup Contract',
      shortName: 'WU',
      type: 'per_round',
      code: 'if(DIAMOND_NR > 0)\n  add(-15 * DIAMOND_NR)\nendif'
    },
    compiler: {
      status: 'compiled',
      message: 'Warmup sample compiled successfully.'
    },
    parsedSummary: {
      role: 'rotating contract',
      focus: 'avoid or pressure diamond tricks',
      scoringProfile: 'penalty-focused scoring',
      largestSingleSwing: 15,
      totalDeclaredSwing: 15,
      nonEmptyLines: 3,
      branchCount: 1,
      identifiers: ['DIAMOND_NR']
    },
    anchors: [
      'Readiness check only.',
      'Return only the four score keys.',
      'Simple focused contracts can score high.'
    ]
  };
}

async function warmEditorBotModel({
  modelName = DEFAULT_EDITOR_BOT_OLLAMA_MODEL,
  baseUrl = DEFAULT_EDITOR_BOT_OLLAMA_BASE_URL,
  timeoutMs = EDITOR_BOT_MODEL_WARMUP_TIMEOUT_MS
} = {}) {
  const startedAt = Date.now();
  const cacheKey = getEditorBotWarmModelCacheKey(modelName, baseUrl);
  const warmedAt = warmedEditorBotModels.get(cacheKey);

  if (warmedAt && (Date.now() - warmedAt) < EDITOR_BOT_MODEL_WARM_CACHE_MS) {
    return {
      attempt: 'model-warmup',
      elapsedMs: 0,
      success: true,
      stage: 'cached',
      error: '',
      rawPreview: buildEditorBotDiagnosticPreview(`model: ${modelName}`)
    };
  }

  try {
    const { z } = await loadEditorBotRuntime();
    const result = await queryStructuredEditorBotResponse({
      schema: buildScoreMapSchema(z),
      systemPrompt: buildEditorBotScoreMapPrompt(),
      humanPrompt: JSON.stringify(buildWarmupPayload()),
      modelName,
      baseUrl,
      timeoutMs,
      attemptLabel: 'model-warmup',
      numPredict: SCORE_MAP_WARMUP_NUM_PREDICT,
      jsonMode: true
    });

    if (!result.success) {
      throw new Error(`Editor Bot warm-up returned ${result.error || 'invalid output'}`);
    }

    warmedEditorBotModels.set(cacheKey, Date.now());

    return {
      attempt: 'model-warmup',
      elapsedMs: Date.now() - startedAt,
      success: true,
      stage: 'complete',
      error: '',
      rawPreview: buildEditorBotDiagnosticPreview(`model: ${modelName}`)
    };
  } catch (error) {
    error.editorBotDiagnostic = {
      attempt: 'model-warmup',
      elapsedMs: Date.now() - startedAt,
      success: false,
      stage: 'warmup',
      error: sanitizeText(error.message, 'unavailable', 220),
      rawPreview: buildEditorBotDiagnosticPreview(`model: ${modelName}`)
    };
    throw error;
  }
}

async function warmEditorBotOnStartup({
  baseUrl = DEFAULT_EDITOR_BOT_OLLAMA_BASE_URL,
  timeoutMs = EDITOR_BOT_MODEL_WARMUP_TIMEOUT_MS
} = {}) {
  const requestedModels = [
    sanitizeText(DEFAULT_EDITOR_BOT_FULL_OLLAMA_MODEL, '', 120),
    sanitizeText(DEFAULT_EDITOR_BOT_LEAN_OLLAMA_MODEL, '', 120),
    sanitizeText(DEFAULT_EDITOR_BOT_OLLAMA_MODEL, '', 120)
  ].filter(Boolean);
  const uniqueModels = Array.from(new Set(requestedModels));
  const results = [];

  for (const modelName of uniqueModels) {
    try {
      const result = await warmEditorBotModel({
        modelName,
        baseUrl,
        timeoutMs
      });
      results.push(result);
    } catch (error) {
      if (error.editorBotDiagnostic) {
        results.push(error.editorBotDiagnostic);
        continue;
      }

      throw error;
    }
  }

  return results;
}

function normalizeRawCategories(rawReview = {}) {
  if (rawReview.categories && typeof rawReview.categories === 'object') {
    return rawReview.categories;
  }

  if (rawReview.categoryRatings && typeof rawReview.categoryRatings === 'object') {
    return rawReview.categoryRatings;
  }

  return {};
}

function sanitizeEditorBotReview(rawReview, fallbackReview) {
  const safeReview = rawReview && typeof rawReview === 'object' ? rawReview : {};
  const rawCategories = normalizeRawCategories(safeReview);
  const categories = CATEGORY_DEFINITIONS.reduce((acc, entry) => {
    const fallbackCategory = fallbackReview.categoryRatings[entry.key];
    const rawCategory = rawCategories[entry.key] || {};
    acc[entry.key] = {
      score: clampEditorBotScore(rawCategory.score, fallbackCategory.score),
      explanation: sanitizeText(rawCategory.explanation, fallbackCategory.explanation, 220)
    };
    return acc;
  }, {});
  const categoryAverage = CATEGORY_KEYS
    .map((key) => categories[key].score)
    .reduce((sum, score) => sum + score, 0) / CATEGORY_KEYS.length;

  return {
    overallScore: clampEditorBotScore(safeReview.overallScore, categoryAverage),
    categories,
    categoryRatings: categories,
    rulesetSummary: sanitizeText(safeReview.rulesetSummary, fallbackReview.rulesetSummary, 320),
    constructiveReview: sanitizeText(safeReview.constructiveReview, fallbackReview.constructiveReview, 360),
    recommendations: sanitizeTextList(safeReview.recommendations, fallbackReview.recommendations, 160, 4),
    warnings: sanitizeTextList(safeReview.warnings, fallbackReview.warnings, 180, 4),
    reviewSource: safeReview.reviewSource === 'fallback'
      ? 'fallback'
      : safeReview.reviewSource === 'hybrid'
        ? 'hybrid'
      : safeReview.reviewSource === 'heuristic'
        ? 'heuristic'
        : fallbackReview.reviewSource === 'fallback'
          ? 'fallback'
          : 'ai',
    diagnostics: Array.isArray(safeReview.diagnostics)
      ? safeReview.diagnostics.map((entry) => ({
        attempt: sanitizeText(entry?.attempt, 'unknown', 80),
        elapsedMs: Math.max(0, Math.round(Number(entry?.elapsedMs) || 0)),
        success: entry?.success === true,
        stage: sanitizeText(entry?.stage, 'unknown', 80),
        error: sanitizeText(entry?.error, '', 220),
        rawPreview: sanitizeText(entry?.rawPreview, '', 280)
      }))
      : []
  };
}

function dedupeEditorBotDiagnostics(entries = []) {
  const seen = new Set();
  const deduped = [];

  for (const entry of Array.isArray(entries) ? entries : []) {
    const key = JSON.stringify([
      sanitizeText(entry?.attempt, 'unknown', 80),
      Math.max(0, Math.round(Number(entry?.elapsedMs) || 0)),
      entry?.success === true,
      sanitizeText(entry?.stage, 'unknown', 80),
      sanitizeText(entry?.error, '', 220),
      sanitizeText(entry?.rawPreview, '', 280)
    ]);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(entry);
  }

  return deduped;
}

function blendHybridEditorBotCategoryScore(categoryKey, aiScore, fallbackScore) {
  const safeFallback = clampEditorBotScore(fallbackScore, 7);
  const safeAi = clampEditorBotScore(aiScore, safeFallback);
  const maxDeviation = categoryKey === 'claritySimplicity' ? 2.5 : 2.2;
  const boundedAi = safeFallback + Math.max(-maxDeviation, Math.min(maxDeviation, safeAi - safeFallback));
  const blended = (safeFallback * 0.65) + (boundedAi * 0.35);
  return clampEditorBotScore(blended, safeFallback);
}

function buildHybridEditorBotReviewFromScoreMap(scoreMap = {}, fallbackReview) {
  const baseReview = fallbackReview && typeof fallbackReview === 'object'
    ? fallbackReview
    : buildFallbackEditorBotReview();
  const categories = CATEGORY_KEYS.reduce((acc, categoryKey) => {
    const fallbackCategory = baseReview.categoryRatings?.[categoryKey] || {
      score: 7,
      explanation: 'No extra detail was available for this category.'
    };
    const rawAiScore = clampEditorBotScore(scoreMap?.[categoryKey], fallbackCategory.score);
    acc[categoryKey] = {
      score: blendHybridEditorBotCategoryScore(categoryKey, rawAiScore, fallbackCategory.score),
      explanation: fallbackCategory.explanation
    };
    return acc;
  }, {});
  const overallScore = clampEditorBotScore(
    CATEGORY_KEYS.map((categoryKey) => categories[categoryKey].score).reduce((sum, score) => sum + score, 0) / CATEGORY_KEYS.length,
    baseReview.overallScore
  );

  return {
    overallScore,
    categories,
    rulesetSummary: baseReview.rulesetSummary,
    constructiveReview: baseReview.constructiveReview,
    recommendations: baseReview.recommendations,
    warnings: [],
    reviewSource: 'hybrid'
  };
}

async function reviewRulesetWithEditorBot({
  ruleset,
  ast,
  compiler = null,
  modelName = DEFAULT_EDITOR_BOT_FULL_OLLAMA_MODEL,
  baseUrl = DEFAULT_EDITOR_BOT_OLLAMA_BASE_URL,
  timeoutMs = EDITOR_BOT_TIMEOUT_MS
} = {}) {
  const safeRuleset = buildSafeRulesetPayload(ruleset);
  const metrics = buildRulesetJudgeMetrics({
    code: safeRuleset.code,
    type: safeRuleset.type,
    ast
  });
  const heuristicReview = buildFallbackEditorBotReview({
    title: safeRuleset.title,
    type: safeRuleset.type,
    code: safeRuleset.code,
    ast
  });
  const diagnostics = [];
  const scoreMapTimeoutMs = Math.min(timeoutMs, SCORE_MAP_TIMEOUT_CAP_MS);

  try {
    try {
      const warmupDiagnostic = await warmEditorBotModel({
        modelName,
        baseUrl,
        timeoutMs: Math.min(timeoutMs + 2500, EDITOR_BOT_MODEL_WARMUP_TIMEOUT_MS)
      });
      diagnostics.push(warmupDiagnostic);
    } catch (error) {
      if (error.editorBotDiagnostic) {
        diagnostics.push(error.editorBotDiagnostic);
      }
    }

    const { z } = await loadEditorBotRuntime();
    const leanModelName = pickLeanEditorBotModel(modelName);

    if (leanModelName !== modelName) {
      try {
        const leanWarmupDiagnostic = await warmEditorBotModel({
          modelName: leanModelName,
          baseUrl,
          timeoutMs: Math.min(Math.max(3000, Math.round(scoreMapTimeoutMs * 0.8)), EDITOR_BOT_MODEL_WARMUP_TIMEOUT_MS)
        });
        diagnostics.push(leanWarmupDiagnostic);
      } catch (error) {
        if (error.editorBotDiagnostic) {
          diagnostics.push(error.editorBotDiagnostic);
        }
      }
    }

    const scoreMapResponse = await requestEditorBotScoreMap({
      safeRuleset,
      compiler,
      metrics,
      heuristicReview,
      schema: buildScoreMapSchema(z),
      modelName: leanModelName,
      baseUrl,
      timeoutMs: scoreMapTimeoutMs
    });
    diagnostics.push(...(scoreMapResponse.diagnostics || []));

    if (scoreMapResponse.success) {
      return sanitizeEditorBotReview({
        ...buildHybridEditorBotReviewFromScoreMap(scoreMapResponse.data, heuristicReview),
        diagnostics: dedupeEditorBotDiagnostics(diagnostics)
      }, heuristicReview);
    }

    const error = new Error(
      scoreMapResponse.error === 'invalid-structured-output'
        ? 'Editor Bot returned malformed structured output.'
        : 'Editor Bot could not finish the review.'
    );
    error.editorBotDiagnostics = diagnostics;
    throw error;
  } catch (error) {
    if (Array.isArray(error.editorBotDiagnostics) && error.editorBotDiagnostics !== diagnostics) {
      diagnostics.push(...error.editorBotDiagnostics);
    } else if (error.editorBotDiagnostic) {
      diagnostics.push(error.editorBotDiagnostic);
    }

    const fallbackReview = buildFallbackEditorBotReview({
      title: safeRuleset.title,
      type: safeRuleset.type,
      code: safeRuleset.code,
      ast,
      fallbackWarning: `Editor Bot could not finish the Ollama review (${sanitizeText(error.message, 'unavailable', 140)}). This is a local fallback review based on the compiled ruleset.`
    });
    fallbackReview.diagnostics = dedupeEditorBotDiagnostics(diagnostics);
    return fallbackReview;
  }
}

module.exports = {
  CATEGORY_DEFINITIONS,
  DEFAULT_EDITOR_BOT_OLLAMA_BASE_URL,
  DEFAULT_EDITOR_BOT_OLLAMA_MODEL,
  EDITOR_BOT_TIMEOUT_MS,
  MAX_RULESET_SOURCE_LENGTH,
  buildFallbackEditorBotReview,
  buildHybridEditorBotReviewFromScoreMap,
  buildSalvagedEditorBotReview,
  buildEditorBotPromptPayload,
  buildRulesetJudgeMetrics,
  buildSafeRulesetPayload,
  clampEditorBotScore,
  reviewRulesetWithEditorBot,
  sanitizeEditorBotReview,
  warmEditorBotOnStartup
};

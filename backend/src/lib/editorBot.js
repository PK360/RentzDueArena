const DEFAULT_EDITOR_BOT_OLLAMA_MODEL = process.env.RENTZ_EDITOR_BOT_OLLAMA_MODEL
  || process.env.RENTZ_BOT_OLLAMA_MODEL
  || 'llama3.1:8b';
const DEFAULT_EDITOR_BOT_FULL_OLLAMA_MODEL = process.env.RENTZ_EDITOR_BOT_FULL_OLLAMA_MODEL
  || DEFAULT_EDITOR_BOT_OLLAMA_MODEL;
const DEFAULT_EDITOR_BOT_LEAN_OLLAMA_MODEL = process.env.RENTZ_EDITOR_BOT_LEAN_OLLAMA_MODEL
  || '';
const DEFAULT_EDITOR_BOT_OLLAMA_BASE_URL = process.env.RENTZ_EDITOR_BOT_OLLAMA_BASE_URL
  || process.env.RENTZ_BOT_OLLAMA_BASE_URL
  || 'http://127.0.0.1:11434';
const EDITOR_BOT_TIMEOUT_MS = Math.max(1500, Number(process.env.RENTZ_EDITOR_BOT_TIMEOUT_MS || 6500));
const EDITOR_BOT_NUM_PREDICT = Math.max(250, Number(process.env.RENTZ_EDITOR_BOT_NUM_PREDICT || 700));
const EDITOR_BOT_KEEP_ALIVE = process.env.RENTZ_EDITOR_BOT_KEEP_ALIVE || '10m';
const MAX_RULESET_SOURCE_LENGTH = 12000;
const MAX_RULESET_NAME_LENGTH = 120;
const MAX_RULESET_SHORT_NAME_LENGTH = 24;
const FULL_PROMPT_CODE_LIMIT = 2200;
const LEAN_PROMPT_CODE_LIMIT = 850;
const FULL_PROMPT_IDENTIFIER_LIMIT = 10;
const LEAN_PROMPT_IDENTIFIER_LIMIT = 5;
const NARRATIVE_NUM_PREDICT = 96;
const LEAN_NARRATIVE_NUM_PREDICT = 64;
const CATEGORY_NUM_PREDICT = 120;
const LEAN_CATEGORY_NUM_PREDICT = 80;
const EDITOR_BOT_PREFLIGHT_TIMEOUT_MS = Math.max(600, Number(process.env.RENTZ_EDITOR_BOT_PREFLIGHT_TIMEOUT_MS || 1500));
const ENABLE_EDITOR_BOT_CATEGORY_AI = String(process.env.RENTZ_EDITOR_BOT_ENABLE_CATEGORY_AI || '').trim().toLowerCase() === 'true';
const FULL_NARRATIVE_TIMEOUT_CAP_MS = Math.max(4000, Number(process.env.RENTZ_EDITOR_BOT_FULL_TIMEOUT_CAP_MS || 20000));
const LEAN_NARRATIVE_TIMEOUT_CAP_MS = Math.max(2500, Number(process.env.RENTZ_EDITOR_BOT_LEAN_TIMEOUT_CAP_MS || 12000));
const EDITOR_BOT_MODEL_WARMUP_TIMEOUT_MS = Math.max(3000, Number(process.env.RENTZ_EDITOR_BOT_MODEL_WARMUP_TIMEOUT_MS || 25000));
const EDITOR_BOT_MODEL_WARM_CACHE_MS = Math.max(60000, Number(process.env.RENTZ_EDITOR_BOT_MODEL_WARM_CACHE_MS || 480000));

const CATEGORY_DEFINITIONS = Object.freeze([
  { key: 'riskRewardBalance', label: 'Risk/reward balance' },
  { key: 'comebackPotential', label: 'Comeback potential' },
  { key: 'claritySimplicity', label: 'Clarity / simplicity' },
  { key: 'scoringBalance', label: 'Scoring balance' },
  { key: 'playerAgency', label: 'Player agency' },
  { key: 'interactionQuality', label: 'Interaction quality' }
]);
const CATEGORY_KEY_TO_SHORT_KEY = Object.freeze({
  riskRewardBalance: 'rr',
  comebackPotential: 'cp',
  claritySimplicity: 'cs',
  scoringBalance: 'sb',
  playerAgency: 'pa',
  interactionQuality: 'iq'
});
const CATEGORY_BATCHES = Object.freeze([
  ['riskRewardBalance', 'comebackPotential', 'claritySimplicity'],
  ['scoringBalance', 'playerAgency', 'interactionQuality']
]);
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

async function fetchJsonWithTimeout(url, timeoutMs, errorMessage) {
  const response = await withTimeout(fetch(url), timeoutMs, errorMessage);

  return {
    response,
    data: await response.json().catch(() => null)
  };
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
  };
}

function extractModelText(response) {
  if (!response) {
    return '';
  }

  if (typeof response.content === 'string') {
    return response.content;
  }

  if (Array.isArray(response.content)) {
    return response.content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }

        return part?.text || '';
      })
      .join('\n')
      .trim();
  }

  return String(response.content || '').trim();
}

async function readEditorBotGenerateResponse({ response, controller, clearTimeout, schema, attemptLabel, errorMessage, salvageParser = null }) {
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

function extractJsonStringField(text, key, maxLength = 320) {
  const pattern = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`);
  const match = String(text || '').match(pattern);
  if (!match) {
    return '';
  }

  try {
    return sanitizeText(JSON.parse(`"${match[1]}"`), '', maxLength);
  } catch {
    return '';
  }
}

function extractJsonStringArrayField(text, key, maxItems = 3, maxLength = 220) {
  const pattern = new RegExp(`"${key}"\\s*:\\s*\\[((?:.|\\n|\\r)*?)\\]`);
  const match = String(text || '').match(pattern);
  if (!match) {
    return [];
  }

  const items = [];
  const itemPattern = /"((?:\\.|[^"\\])*)"/g;
  let itemMatch = itemPattern.exec(match[1]);

  while (itemMatch && items.length < maxItems) {
    try {
      const value = sanitizeText(JSON.parse(`"${itemMatch[1]}"`), '', maxLength);
      if (value) {
        items.push(value);
      }
    } catch {
      // Skip malformed trailing items in truncated JSON.
    }
    itemMatch = itemPattern.exec(match[1]);
  }

  return items;
}

function salvageCompactNarrativeFromRawText(text) {
  const rs = extractJsonStringField(text, 'rs', 280);
  const cr = extractJsonStringField(text, 'cr', 320);

  if (!rs || !cr) {
    return null;
  }

  return {
    rs,
    cr,
    rec: extractJsonStringArrayField(text, 'rec', 3, 140),
    w: extractJsonStringArrayField(text, 'w', 3, 140)
  };
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

function sanitizeTextList(values, fallback = []) {
  const list = Array.isArray(values)
    ? values
    : typeof values === 'string'
      ? [values]
      : [];
  const sanitized = list
    .map((value) => sanitizeText(value, '', 220))
    .filter(Boolean);

  return sanitized.length > 0 ? sanitized.slice(0, 6) : fallback;
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

  return Math.max(80, Math.min(Math.round(numericTarget), EDITOR_BOT_NUM_PREDICT));
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
    fragments.push('manage heart captures carefully');
  }

  if (hasIdentifier(metrics, /DIAMOND/)) {
    fragments.push('watch diamond captures');
  }

  if (hasIdentifier(metrics, /(QUEEN|_Q$)/)) {
    fragments.push('track queen danger');
  }

  if (hasIdentifier(metrics, /CLUB/) && hasIdentifier(metrics, /(^10_|_10$|TEN)/)) {
    fragments.push('play around the ten of clubs');
  }

  if (hasIdentifier(metrics, /POINTS|TOTAL_POINTS|INITIAL_POINTS/)) {
    fragments.push('react to the current score state');
  }

  if (metrics.callCounts.game_end > 0 || metrics.callCounts.end > 0) {
    fragments.push('time when the rule should stop or the match should end');
  }

  return Array.from(new Set(fragments)).slice(0, 3);
}

function buildRulesetSummary({ title, type, metrics }) {
  const direction = metrics.scoringDirections.negative > metrics.scoringDirections.positive
    ? 'avoid risky captures that trigger penalties'
    : metrics.scoringDirections.positive > 0 && metrics.scoringDirections.negative > 0
      ? 'balance reward opportunities against punishments'
      : metrics.scoringDirections.positive > 0
        ? 'chase rewarding captures and timing windows'
        : 'play around the scripted scoring triggers';
  const fragments = buildObjectiveFragments(metrics);
  const triggerText = fragments.length > 0
    ? `Players are mainly trying to ${fragments.join(', ')}.`
    : 'Players are mainly trying to navigate the scripted card and score conditions.';
  const scoreText = metrics.callCounts.set_to > 0 || metrics.callCounts.reset_to > 0
    ? 'The rule can replace scores directly instead of only adding or subtracting points.'
    : metrics.estimatedMaxSwing >= 90
      ? 'Single outcomes can create large score swings.'
      : 'Score changes look incremental enough to resolve quickly at the table.';
  const behaviorText = type === 'end_game'
    ? 'Because it is an end-game ruleset, it shapes how the overall standings close out.'
    : 'Because it is a per-round ruleset, it mainly shapes trick-by-trick incentives during play.';

  return `${triggerText} ${scoreText} ${behaviorText} It tends to encourage players to ${direction}.`;
}

function pushUnique(list, message) {
  const text = sanitizeText(message, '', 220);
  if (text && !list.includes(text)) {
    list.push(text);
  }
}

function buildFallbackCategoryRatings(metrics) {
  const complexityPenalty = metrics.nonEmptyLineCount > 14
    ? 1.6
    : metrics.nonEmptyLineCount > 8
      ? 0.8
      : 0;
  const branchPenalty = metrics.ifCount > 3 ? 1 : metrics.ifCount > 1 ? 0.4 : 0;
  const swingPenalty = metrics.estimatedMaxSwing >= 180
    ? 2.4
    : metrics.estimatedMaxSwing >= 110
      ? 1.5
      : metrics.estimatedMaxSwing >= 70
        ? 0.8
        : 0;
  const totalSwingPenalty = metrics.totalEstimatedSwing >= 240
    ? 1.2
    : metrics.totalEstimatedSwing >= 140
      ? 0.6
      : 0;
  const scoreRewritePenalty = metrics.callCounts.set_to + metrics.callCounts.reset_to > 0 ? 1.3 : 0;
  const earlyEndPenalty = metrics.callCounts.game_end + metrics.callCounts.end > 0 ? 0.7 : 0;
  const onlyNegativePenalty = metrics.scoringDirections.negative > 0 && metrics.scoringDirections.positive === 0 ? 0.8 : 0;
  const mixedDirectionBonus = metrics.scoringDirections.negative > 0 && metrics.scoringDirections.positive > 0 ? 0.5 : 0;
  const moderateComplexityBonus = metrics.ifCount >= 1 && metrics.ifCount <= 2 && metrics.nonEmptyLineCount <= 10 ? 0.6 : 0;
  const exactCardHeavyPenalty = metrics.identifiers.filter((identifier) => /_(A|K|Q|J|10|9|8|7|6|5|4|3|2)$/.test(identifier)).length >= 5 ? 0.7 : 0;
  const scoreStatePenalty = hasIdentifier(metrics, /POINTS|TOTAL_POINTS|INITIAL_POINTS/) ? 0.7 : 0;

  const ratings = {
    fairness: clampEditorBotScore(7.4 - swingPenalty - scoreRewritePenalty - scoreStatePenalty + moderateComplexityBonus, 6.5),
    strategicDepth: clampEditorBotScore(5.6 + moderateComplexityBonus + mixedDirectionBonus - complexityPenalty * 0.6 - exactCardHeavyPenalty * 0.3, 5.8),
    riskRewardBalance: clampEditorBotScore(5.8 + mixedDirectionBonus - swingPenalty - onlyNegativePenalty - scoreRewritePenalty * 0.5, 5.6),
    comebackPotential: clampEditorBotScore(6.5 - swingPenalty - totalSwingPenalty - earlyEndPenalty - scoreRewritePenalty, 5.7),
    claritySimplicity: clampEditorBotScore(8.2 - complexityPenalty - branchPenalty - exactCardHeavyPenalty, 6.5),
    scoringBalance: clampEditorBotScore(6.8 - swingPenalty - totalSwingPenalty - scoreRewritePenalty + mixedDirectionBonus * 0.3, 5.9),
    playerAgency: clampEditorBotScore(6.1 + moderateComplexityBonus - exactCardHeavyPenalty * 0.4 - onlyNegativePenalty * 0.4, 5.8),
    interactionQuality: clampEditorBotScore(5.9 + moderateComplexityBonus + mixedDirectionBonus * 0.6 - exactCardHeavyPenalty * 0.4, 5.9),
    robustness: clampEditorBotScore(6.8 - complexityPenalty * 0.5 - swingPenalty * 0.5 - scoreStatePenalty - earlyEndPenalty, 6),
    exploitResistance: clampEditorBotScore(6.6 - scoreRewritePenalty - exactCardHeavyPenalty * 0.5 - onlyNegativePenalty * 0.4 - earlyEndPenalty * 0.5, 5.9)
  };

  return {
    fairness: {
      score: ratings.fairness,
      explanation: swingPenalty > 1
        ? 'Large point jumps can make one mistake decide too much of the outcome.'
        : 'Nothing in the script obviously hard-locks one player role, but score spikes still affect fairness.'
    },
    strategicDepth: {
      score: ratings.strategicDepth,
      explanation: moderateComplexityBonus > 0
        ? 'There is enough branching to create decisions without overwhelming the table.'
        : 'The decision space looks either very linear or a bit too scripted to stay fresh every round.'
    },
    riskRewardBalance: {
      score: ratings.riskRewardBalance,
      explanation: mixedDirectionBonus > 0
        ? 'The rule offers both upside and punishment, which usually creates better tradeoffs.'
        : 'The incentives lean heavily in one direction, so safe play may become too automatic.'
    },
    comebackPotential: {
      score: ratings.comebackPotential,
      explanation: swingPenalty > 1 || earlyEndPenalty > 0
        ? 'Big swings or sudden endings can make it hard for trailing players to recover.'
        : 'The score pace looks moderate enough that players should stay in contention longer.'
    },
    claritySimplicity: {
      score: ratings.claritySimplicity,
      explanation: complexityPenalty > 0
        ? 'The script is readable, but the extra conditions will take a little table explanation.'
        : 'The objective is compact enough that most players should understand it quickly.'
    },
    scoringBalance: {
      score: ratings.scoringBalance,
      explanation: scoreRewritePenalty > 0
        ? 'Direct score resets are powerful and can feel harsher than ordinary add or subtract scoring.'
        : 'The point values are closer to what players can usually reason about during a live round.'
    },
    playerAgency: {
      score: ratings.playerAgency,
      explanation: exactCardHeavyPenalty > 0
        ? 'A heavy focus on exact card hits can make outcomes feel a bit draw-dependent.'
        : 'Players should usually feel that planning and timing still matter.'
    },
    interactionQuality: {
      score: ratings.interactionQuality,
      explanation: moderateComplexityBonus > 0
        ? 'The rule should create some reading, baiting, and denial moments.'
        : 'The interaction may stay functional, but it does not obviously push strong counterplay.'
    },
    robustness: {
      score: ratings.robustness,
      explanation: scoreStatePenalty > 0
        ? 'Score-state logic can behave differently across groups and pacing expectations.'
        : 'The rule should travel reasonably well across different tables if players know the core objective.'
    },
    exploitResistance: {
      score: ratings.exploitResistance,
      explanation: onlyNegativePenalty > 0 || earlyEndPenalty > 0
        ? 'Players may discover a very defensive default line if the penalty structure is too one-sided.'
        : 'There is no single dominant loophole jumping out from the script alone.'
    }
  };
}

function buildConstructiveReview({ title, metrics, ratings }) {
  const strengths = [];
  const risks = [];

  if (ratings.claritySimplicity.score >= 7.5) {
    strengths.push('The objective is easy to teach and should read quickly in a live room.');
  }

  if (ratings.interactionQuality.score >= 6.4) {
    strengths.push('There is enough counterplay here that players should care about what the rest of the table is telegraphing.');
  }

  if (metrics.scoringDirections.positive > 0 && metrics.scoringDirections.negative > 0) {
    strengths.push('Using both rewards and penalties helps the ruleset feel more strategically alive than a single-axis punishment rule.');
  }

  if (metrics.estimatedMaxSwing >= 110) {
    risks.push('One result can swing the score very hard, so a single unlucky capture may overshadow several quieter good decisions.');
  }

  if (metrics.nonEmptyLineCount > 14 || metrics.ifCount > 3) {
    risks.push('The amount of logic may slow the table down because players will keep re-checking what matters before each trick.');
  }

  if (metrics.callCounts.set_to + metrics.callCounts.reset_to > 0) {
    risks.push('Direct score rewrites are dramatic and may feel less fair than gradual scoring unless the setup is very clear.');
  }

  const opening = strengths.length > 0
    ? `${title} has a solid core idea. ${strengths[0]}`
    : `${title} has a workable foundation and the objective is understandable enough to review as a playable Rentz variant.`;
  const middle = risks.length > 0
    ? risks[0]
    : 'The biggest opportunity is making sure the incentives stay interesting across repeated rounds instead of becoming routine.';
  const closing = strengths.length > 1
    ? strengths[1]
    : 'With a little tuning, this could become a dependable custom ruleset rather than just a novelty script.';

  return `${opening} ${middle} ${closing}`;
}

function buildRecommendations(metrics) {
  const recommendations = [];

  if (metrics.estimatedMaxSwing >= 110) {
    pushUnique(recommendations, 'Reduce the largest point swing or split it into smaller triggers so one trick does not decide the whole rule.');
  }

  if (metrics.nonEmptyLineCount > 14 || metrics.ifCount > 3) {
    pushUnique(recommendations, 'Simplify one or two conditions so players can remember the objective without constantly re-reading the script.');
  }

  if (metrics.scoringDirections.negative > 0 && metrics.scoringDirections.positive === 0) {
    pushUnique(recommendations, 'Consider adding a small positive incentive so the best strategy is not always just passive avoidance.');
  }

  if (metrics.callCounts.set_to + metrics.callCounts.reset_to > 0) {
    pushUnique(recommendations, 'Use direct score replacement sparingly, or gate it behind a rarer condition with clear table drama.');
  }

  if (metrics.callCounts.game_end + metrics.callCounts.end > 0) {
    pushUnique(recommendations, 'Double-check whether the ending trigger happens often enough to feel intentional rather than abrupt.');
  }

  if (recommendations.length === 0) {
    pushUnique(recommendations, 'Playtest it across a few tables and watch whether the intended objective stays obvious after the first round.');
    pushUnique(recommendations, 'If you want a bit more depth, add one conditional twist that rewards reading the table instead of only counting cards.');
  }

  return recommendations.slice(0, 4);
}

function buildWarnings(metrics, fallbackWarning = '') {
  const warnings = [];

  if (fallbackWarning) {
    pushUnique(warnings, fallbackWarning);
  }

  if (metrics.estimatedMaxSwing >= 180) {
    pushUnique(warnings, 'Very high point swings may create runaway leads or feel too punishing for one mistake.');
  }

  if (metrics.nonEmptyLineCount > 18) {
    pushUnique(warnings, 'This ruleset is long enough that turn speed may suffer unless everyone already knows it well.');
  }

  if (metrics.callCounts.set_to + metrics.callCounts.reset_to > 0) {
    pushUnique(warnings, 'Direct score replacement effects need careful playtesting because they can bypass normal comeback pacing.');
  }

  return warnings.slice(0, 4);
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
  const overallAverage = CATEGORY_DEFINITIONS
    .map(({ key }) => categoryRatings[key].score)
    .reduce((sum, score) => sum + score, 0) / CATEGORY_DEFINITIONS.length;
  const overallScore = clampEditorBotScore(overallAverage, 6);
  const constructiveReview = buildConstructiveReview({
    title,
    metrics,
    ratings: categoryRatings
  });
  const recommendations = buildRecommendations(metrics);
  const warnings = buildWarnings(metrics, fallbackWarning);

  return {
    overallScore,
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
  }, z.array(z.string().min(1).max(220)).max(6).optional());
  const categorySchema = z.object({
    score: z.number().min(0).max(10),
    explanation: z.string().min(1).max(220)
  });

  return z.object({
    overallScore: z.number().min(0).max(10),
    categoryRatings: z.object(
      CATEGORY_DEFINITIONS.reduce((shape, entry) => {
        shape[entry.key] = categorySchema;
        return shape;
      }, {})
    ),
    rulesetSummary: z.string().min(1).max(500),
    constructiveReview: z.string().min(1).max(500),
    recommendations: flexibleStringListSchema,
    warnings: flexibleStringListSchema
  });
}

function buildCompactReviewSchema(z) {
  const flexibleStringListSchema = z.preprocess((value) => {
    if (typeof value === 'string') {
      return [value];
    }

    return value;
  }, z.array(z.string().min(1).max(160)).max(4).optional());

  return z.object({
    o: z.number().min(0).max(10),
    rs: z.string().min(1).max(360),
    cr: z.string().min(1).max(360),
    rec: flexibleStringListSchema,
    w: flexibleStringListSchema
  });
}

function buildCompactNarrativeSchema(z) {
  const flexibleStringListSchema = z.preprocess((value) => {
    if (typeof value === 'string') {
      return [value];
    }

    return value;
  }, z.array(z.string().min(1).max(140)).max(3).optional());

  return z.object({
    rs: z.string().min(1).max(280),
    cr: z.string().min(1).max(320),
    rec: flexibleStringListSchema,
    w: flexibleStringListSchema
  });
}

function buildCompactCategorySchema(z, categoryKeys = []) {
  const compactCategorySchema = z.object({
    s: z.number().min(0).max(10),
    e: z.string().min(1).max(160)
  });

  return z.object({
    c: z.object(
      categoryKeys.reduce((shape, categoryKey) => {
        shape[CATEGORY_KEY_TO_SHORT_KEY[categoryKey]] = compactCategorySchema;
        return shape;
      }, {})
    )
  });
}

function applyCompactCategoryBatchToRatings(baseRatings, batchData, categoryKeys = []) {
  const nextRatings = { ...(baseRatings || {}) };

  for (const categoryKey of categoryKeys) {
    const shortKey = CATEGORY_KEY_TO_SHORT_KEY[categoryKey];
    const batchEntry = batchData?.c?.[shortKey];
    if (!batchEntry) {
      continue;
    }

    nextRatings[categoryKey] = {
      score: batchEntry.s,
      explanation: batchEntry.e
    };
  }

  return nextRatings;
}

function buildEditorBotRawPrompt(systemPrompt, humanPrompt) {
  return [
    systemPrompt,
    '',
    'User payload:',
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
  const safeBaseUrl = normalizeEditorBotBaseUrl(baseUrl);
  const payload = {
    modelName,
    baseUrl: safeBaseUrl,
    jsonMode,
    numPredict: resolveEditorBotNumPredict(numPredict)
  };

  return payload;
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
        temperature: 0.2,
        num_predict: request.numPredict,
        num_ctx: 2048
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

function pickLeanEditorBotModel(preferredModelName, availableModelNames = []) {
  const explicitLeanModel = sanitizeText(DEFAULT_EDITOR_BOT_LEAN_OLLAMA_MODEL, '', 120);
  if (explicitLeanModel) {
    return explicitLeanModel;
  }

  const safePreferred = sanitizeText(preferredModelName, DEFAULT_EDITOR_BOT_OLLAMA_MODEL, 120);
  const available = Array.isArray(availableModelNames) ? availableModelNames.filter(Boolean) : [];

  if (available.length === 0) {
    return safePreferred;
  }

  const rankedCandidates = [
    'llama3.2:1b',
    'llama3.2:3b',
    'qwen2.5:3b',
    'phi3:mini',
    safePreferred
  ];

  for (const candidate of rankedCandidates) {
    if (available.includes(candidate)) {
      return candidate;
    }
  }

  return safePreferred;
}

async function probeEditorBotAvailability({
  modelName = DEFAULT_EDITOR_BOT_OLLAMA_MODEL,
  baseUrl = DEFAULT_EDITOR_BOT_OLLAMA_BASE_URL,
  timeoutMs = EDITOR_BOT_PREFLIGHT_TIMEOUT_MS
} = {}) {
  const startedAt = Date.now();
  const safeBaseUrl = normalizeEditorBotBaseUrl(baseUrl);

  try {
    const { response, data } = await fetchJsonWithTimeout(
      `${safeBaseUrl}/api/tags`,
      timeoutMs,
      `Editor Bot could not reach Ollama within ${timeoutMs}ms`
    );

    if (!response.ok) {
      throw new Error(`Ollama availability check failed with HTTP ${response.status}`);
    }

    const availableModelNames = Array.isArray(data?.models)
      ? data.models
        .map((entry) => sanitizeText(entry?.model || entry?.name, '', 120))
        .filter(Boolean)
      : [];

    if (availableModelNames.length > 0 && !availableModelNames.includes(modelName)) {
      throw new Error(`Ollama is reachable, but model '${modelName}' is not installed.`);
    }

    return {
      attempt: 'availability-probe',
      elapsedMs: Date.now() - startedAt,
      success: true,
      stage: 'complete',
      error: '',
      availableModelNames,
      rawPreview: availableModelNames.length > 0
        ? buildEditorBotDiagnosticPreview(`models: ${availableModelNames.slice(0, 6).join(', ')}`)
        : ''
    };
  } catch (error) {
    error.editorBotDiagnostic = {
      attempt: 'availability-probe',
      elapsedMs: Date.now() - startedAt,
      success: false,
      stage: 'preflight',
      error: sanitizeText(error.message, 'unavailable', 220),
      rawPreview: ''
    };
    throw error;
  }
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
    const { response, controller, clearTimeout } = await postJsonWithTimeout(
      `${normalizeEditorBotBaseUrl(baseUrl)}/api/generate`,
      {
        model: modelName,
        prompt: 'Return {}',
        stream: false,
        keep_alive: EDITOR_BOT_KEEP_ALIVE,
        format: 'json',
        options: {
          temperature: 0,
          num_predict: 8,
          num_ctx: 512
        }
      },
      timeoutMs,
      `Editor Bot model warm-up timed out after ${timeoutMs}ms`
    );

    clearTimeout?.();
    controller?.abort?.();

    if (!response.ok) {
      throw new Error(`Editor Bot model warm-up failed with HTTP ${response.status}`);
    }

    await response.json().catch(() => null);
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

async function requestEditorBotReviewVariant({
  schema,
  systemPrompt,
  humanPrompt,
  modelName,
  baseUrl,
  timeoutMs,
  attemptLabel,
  numPredict,
  jsonMode = true,
  salvageParser = null
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

async function requestEditorBotReview({
  safeRuleset,
  metrics,
  heuristicReview,
  schema,
  modelName,
  baseUrl,
  timeoutMs,
  lean = false
} = {}) {
  const systemPrompt = [
    'You are Editor Bot for Rentz custom rulesets.',
    'Polish the provided gameplay review, do not analyze syntax.',
    'Be brief, specific, positive, and honest.',
    'Return JSON only.',
    'Use this exact compact shape:',
    '{"rs":string,"cr":string,"rec":[string],"w":[string]}',
    'Use the heuristic summary as the source of truth and keep recommendations short.'
  ].join(' ');
  const promptPayload = buildEditorBotNarrativePayload({
    title: safeRuleset?.title,
    shortName: safeRuleset?.shortName,
    type: safeRuleset?.type,
    metrics,
    heuristicReview,
    lean
  });
  const humanPrompt = JSON.stringify(promptPayload);

  return requestEditorBotReviewVariant({
    schema,
    systemPrompt,
    humanPrompt,
    modelName,
    baseUrl,
    timeoutMs,
    attemptLabel: lean ? 'lean-plain' : 'full-plain',
    numPredict: lean ? LEAN_NARRATIVE_NUM_PREDICT : NARRATIVE_NUM_PREDICT,
    jsonMode: false,
    salvageParser: salvageCompactNarrativeFromRawText
  });
}

async function requestEditorBotCategoryBatch({
  safeRuleset,
  compiler,
  metrics,
  schema,
  categoryKeys,
  batchIndex,
  modelName,
  baseUrl,
  timeoutMs,
  lean = false
} = {}) {
  const labels = categoryKeys
    .map((categoryKey) => CATEGORY_DEFINITIONS.find((entry) => entry.key === categoryKey)?.label || categoryKey)
    .join(', ');
  const systemPrompt = [
    'You are Editor Bot for Rentz custom rulesets.',
    'Judge design quality, not syntax.',
    'Return JSON only.',
    `Rate only these categories: ${labels}.`,
    'Use this exact compact shape:',
    JSON.stringify({
      c: categoryKeys.reduce((shape, categoryKey) => {
        shape[CATEGORY_KEY_TO_SHORT_KEY[categoryKey]] = { s: 'number', e: 'string' };
        return shape;
      }, {})
    }),
    'Clamp scores to 0-10 with one decimal and keep each explanation short.'
  ].join(' ');
  const promptPayload = buildEditorBotPromptPayload({
    ...safeRuleset,
    compiler,
    metrics,
    lean
  });
  const humanPrompt = JSON.stringify({
    r: promptPayload.ruleset,
    co: promptPayload.compiler,
    h: promptPayload.heuristics,
    g: promptPayload.guidance,
    focus: {
      categories: categoryKeys.map((categoryKey) => ({
        key: categoryKey,
        shortKey: CATEGORY_KEY_TO_SHORT_KEY[categoryKey],
        label: CATEGORY_DEFINITIONS.find((entry) => entry.key === categoryKey)?.label || categoryKey
      }))
    }
  });

  try {
    return await requestEditorBotReviewVariant({
      schema,
      systemPrompt,
      humanPrompt,
      modelName,
      baseUrl,
      timeoutMs,
      attemptLabel: `${lean ? 'lean' : 'full'}-categories-${batchIndex + 1}`,
      numPredict: lean ? LEAN_CATEGORY_NUM_PREDICT : CATEGORY_NUM_PREDICT,
      jsonMode: true
    });
  } catch (error) {
    if (!isRetryableEditorBotError(error)) {
      throw error;
    }

    return requestEditorBotReviewVariant({
      schema,
      systemPrompt,
      humanPrompt,
      modelName,
      baseUrl,
      timeoutMs: Math.max(3000, Math.round(timeoutMs * 0.85)),
      attemptLabel: `${lean ? 'lean' : 'full'}-categories-${batchIndex + 1}-plain-retry`,
      numPredict: lean ? LEAN_CATEGORY_NUM_PREDICT : CATEGORY_NUM_PREDICT,
      jsonMode: false
    });
  }
}

function sanitizeEditorBotReview(rawReview, fallbackReview) {
  const safeReview = rawReview && typeof rawReview === 'object' ? rawReview : {};
  const categoryRatings = CATEGORY_DEFINITIONS.reduce((acc, entry) => {
    const fallbackCategory = fallbackReview.categoryRatings[entry.key];
    const rawCategory = safeReview.categoryRatings?.[entry.key] || {};
    acc[entry.key] = {
      score: clampEditorBotScore(rawCategory.score, fallbackCategory.score),
      explanation: sanitizeText(rawCategory.explanation, fallbackCategory.explanation, 220)
    };
    return acc;
  }, {});

  return {
    overallScore: clampEditorBotScore(safeReview.overallScore, fallbackReview.overallScore),
    categoryRatings,
    rulesetSummary: sanitizeText(safeReview.rulesetSummary, fallbackReview.rulesetSummary, 500),
    constructiveReview: sanitizeText(safeReview.constructiveReview, fallbackReview.constructiveReview, 500),
    recommendations: sanitizeTextList(safeReview.recommendations, fallbackReview.recommendations),
    warnings: sanitizeTextList(safeReview.warnings, fallbackReview.warnings),
    reviewSource: safeReview.reviewSource === 'fallback'
      ? 'fallback'
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
    compiler: lean ? {
      status: compiler?.status || 'compiled',
      message: compiler?.message || 'Ruleset compiled successfully.'
    } : {
      status: compiler?.status || 'compiled',
      message: compiler?.message || 'Ruleset compiled successfully.',
      errors: Array.isArray(compiler?.errors) ? compiler.errors.slice(0, 3) : [],
      warnings: Array.isArray(compiler?.warnings) ? compiler.warnings.slice(0, 3) : []
    },
    heuristics: {
      lineCount: metrics.lineCount,
      nonEmptyLineCount: metrics.nonEmptyLineCount,
      statementCount: metrics.statementCount,
      ifCount: metrics.ifCount,
      conditionCount: metrics.conditionCount,
      maxBranchDepth: metrics.maxBranchDepth,
      callCounts: metrics.callCounts,
      identifiers: identifierSample.values,
      identifiersTruncated: identifierSample.truncated,
      estimatedMaxSwing: metrics.estimatedMaxSwing,
      totalEstimatedSwing: metrics.totalEstimatedSwing
    },
    guidance: lean ? {
      note: 'Lean retry after a timeout. Prioritize a fast, compact answer from the code excerpt and heuristics only.'
    } : {
      note: 'Use the source code and heuristics to judge gameplay quality, not syntax.'
    }
  };
}

function buildEditorBotNarrativePayload({
  title,
  shortName,
  type,
  metrics,
  heuristicReview,
  lean = false
} = {}) {
  const identifierSample = samplePromptIdentifiers(
    metrics?.identifiers,
    lean ? 3 : 5
  );

  return {
    t: sanitizeText(title, 'Untitled Ruleset', 80),
    s: sanitizeText(shortName, '', 24),
    y: type === 'end_game' ? 'end_game' : 'per_round',
    base: {
      score: clampEditorBotScore(heuristicReview?.overallScore, 6),
      summary: sanitizeText(heuristicReview?.rulesetSummary, '', 220),
      review: sanitizeText(heuristicReview?.constructiveReview, '', 240)
    },
    m: {
      lines: Math.max(0, Number(metrics?.nonEmptyLineCount) || 0),
      branches: Math.max(0, Number(metrics?.ifCount) || 0),
      maxDepth: Math.max(0, Number(metrics?.maxBranchDepth) || 0),
      swing: Math.max(0, Number(metrics?.estimatedMaxSwing) || 0),
      totalSwing: Math.max(0, Number(metrics?.totalEstimatedSwing) || 0),
      calls: metrics?.callCounts || {},
      ids: identifierSample.values
    },
    rec: sanitizeTextList(heuristicReview?.recommendations, []).slice(0, 2),
    warn: sanitizeTextList(heuristicReview?.warnings, []).slice(0, 2),
    note: lean
      ? 'Keep the answer very short and fast.'
      : 'Rewrite the base review into a cleaner, more helpful editor note.'
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
  const diagnostics = [];
  const heuristicReview = buildFallbackEditorBotReview({
    title: safeRuleset.title,
    type: safeRuleset.type,
    code: safeRuleset.code,
    ast
  });

  try {
    const availabilityDiagnostic = await probeEditorBotAvailability({
      modelName,
      baseUrl,
      timeoutMs: Math.min(
        EDITOR_BOT_PREFLIGHT_TIMEOUT_MS,
        Math.max(600, Math.round(timeoutMs * 0.18))
      )
    });
    diagnostics.push(availabilityDiagnostic);
    const availableModelNames = Array.isArray(availabilityDiagnostic.availableModelNames)
      ? availabilityDiagnostic.availableModelNames
      : [];

    try {
      const warmupDiagnostic = await warmEditorBotModel({
        modelName,
        baseUrl,
        timeoutMs: Math.min(timeoutMs + EDITOR_BOT_PREFLIGHT_TIMEOUT_MS, EDITOR_BOT_MODEL_WARMUP_TIMEOUT_MS)
      });
      diagnostics.push(warmupDiagnostic);
    } catch (error) {
      if (error.editorBotDiagnostic) {
        diagnostics.push(error.editorBotDiagnostic);
      }
    }

    const { z } = await loadEditorBotRuntime();
    const metrics = buildRulesetJudgeMetrics({
      code: safeRuleset.code,
      type: safeRuleset.type,
      ast
    });
    const narrativeSchema = buildCompactNarrativeSchema(z);
    let narrativeResponse;
    const fullNarrativeTimeoutMs = Math.min(timeoutMs, FULL_NARRATIVE_TIMEOUT_CAP_MS);
    const leanNarrativeTimeoutMs = Math.min(
      Math.max(2500, Math.round(timeoutMs * 0.6)),
      LEAN_NARRATIVE_TIMEOUT_CAP_MS
    );

    try {
      narrativeResponse = await requestEditorBotReview({
        safeRuleset,
        metrics,
        heuristicReview,
        schema: narrativeSchema,
        modelName,
        baseUrl,
        timeoutMs: fullNarrativeTimeoutMs,
        lean: false
      });
      diagnostics.push(narrativeResponse.diagnostic);
    } catch (error) {
      if (error.editorBotDiagnostic) {
        diagnostics.push(error.editorBotDiagnostic);
      }

      if (!isRetryableEditorBotError(error)) {
        throw error;
      }

      const leanModelName = pickLeanEditorBotModel(modelName, availableModelNames);

      try {
        const leanWarmupDiagnostic = await warmEditorBotModel({
          modelName: leanModelName,
          baseUrl,
          timeoutMs: Math.min(leanNarrativeTimeoutMs + EDITOR_BOT_PREFLIGHT_TIMEOUT_MS, EDITOR_BOT_MODEL_WARMUP_TIMEOUT_MS)
        });
        diagnostics.push(leanWarmupDiagnostic);
      } catch (warmupError) {
        if (warmupError.editorBotDiagnostic) {
          diagnostics.push(warmupError.editorBotDiagnostic);
        }
      }

      narrativeResponse = await requestEditorBotReview({
        safeRuleset,
        metrics,
        heuristicReview,
        schema: narrativeSchema,
        modelName: leanModelName,
        baseUrl,
        timeoutMs: leanNarrativeTimeoutMs,
        lean: true
      });
      diagnostics.push(narrativeResponse.diagnostic);
    }

    let categoryRatings = heuristicReview.categoryRatings;

    if (!ENABLE_EDITOR_BOT_CATEGORY_AI) {
      return sanitizeEditorBotReview({
        overallScore: heuristicReview.overallScore,
        categoryRatings,
        rulesetSummary: narrativeResponse?.success ? narrativeResponse.data.rs : heuristicReview.rulesetSummary,
        constructiveReview: narrativeResponse?.success ? narrativeResponse.data.cr : heuristicReview.constructiveReview,
        recommendations: narrativeResponse?.success ? narrativeResponse.data.rec : heuristicReview.recommendations,
        warnings: narrativeResponse?.success ? narrativeResponse.data.w : heuristicReview.warnings,
        reviewSource: narrativeResponse?.success ? 'ai' : 'heuristic',
        diagnostics
      }, heuristicReview);
    }

    for (const [batchIndex, categoryKeys] of CATEGORY_BATCHES.entries()) {
      const categorySchema = buildCompactCategorySchema(z, categoryKeys);

      try {
        const categoryResponse = await requestEditorBotCategoryBatch({
          safeRuleset,
          compiler,
          metrics,
          schema: categorySchema,
          categoryKeys,
          batchIndex,
          modelName,
          baseUrl,
          timeoutMs: Math.max(5000, Math.round(timeoutMs * 0.7)),
          lean: false
        });
        diagnostics.push(categoryResponse.diagnostic);

        if (categoryResponse.success) {
          categoryRatings = applyCompactCategoryBatchToRatings(categoryRatings, categoryResponse.data, categoryKeys);
          continue;
        }
      } catch (error) {
        if (error.editorBotDiagnostic) {
          diagnostics.push(error.editorBotDiagnostic);
        }

        if (!isRetryableEditorBotError(error)) {
          throw error;
        }
      }

      try {
        const leanCategoryResponse = await requestEditorBotCategoryBatch({
          safeRuleset,
          compiler,
          metrics,
          schema: categorySchema,
          categoryKeys,
          batchIndex,
          modelName,
          baseUrl,
          timeoutMs: Math.max(3500, Math.round(timeoutMs * 0.45)),
          lean: true
        });
        diagnostics.push(leanCategoryResponse.diagnostic);

        if (leanCategoryResponse.success) {
          categoryRatings = applyCompactCategoryBatchToRatings(categoryRatings, leanCategoryResponse.data, categoryKeys);
        }
      } catch (error) {
        if (error.editorBotDiagnostic) {
          diagnostics.push(error.editorBotDiagnostic);
        }

        if (!isRetryableEditorBotError(error)) {
          throw error;
        }
      }
    }

    return sanitizeEditorBotReview({
      overallScore: heuristicReview.overallScore,
      categoryRatings,
      rulesetSummary: narrativeResponse?.success ? narrativeResponse.data.rs : heuristicReview.rulesetSummary,
      constructiveReview: narrativeResponse?.success ? narrativeResponse.data.cr : heuristicReview.constructiveReview,
      recommendations: narrativeResponse?.success ? narrativeResponse.data.rec : heuristicReview.recommendations,
      warnings: narrativeResponse?.success ? narrativeResponse.data.w : heuristicReview.warnings,
      reviewSource: narrativeResponse?.success ? 'ai' : 'heuristic',
      diagnostics
    }, heuristicReview);
  } catch (error) {
    if (error.editorBotDiagnostic) {
      diagnostics.push(error.editorBotDiagnostic);
    }

    const fallbackReview = buildFallbackEditorBotReview({
      title: safeRuleset.title,
      type: safeRuleset.type,
      code: safeRuleset.code,
      ast,
      fallbackWarning: `Editor Bot could not reach Ollama just now (${sanitizeText(error.message, 'unavailable', 120)}), so this review uses the local design fallback instead.`
    });
    fallbackReview.diagnostics = diagnostics;
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
  buildEditorBotPromptPayload,
  buildRulesetJudgeMetrics,
  buildSafeRulesetPayload,
  clampEditorBotScore,
  reviewRulesetWithEditorBot,
  sanitizeEditorBotReview,
  warmEditorBotOnStartup
};

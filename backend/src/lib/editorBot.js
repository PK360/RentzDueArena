const crypto = require('crypto');

const {
  appendEditorAiLog,
  getEditorAiLogPath,
  initializeEditorAiLogging,
  isEditorAiLogEnabled,
  isEditorAiVerboseLoggingEnabled
} = require('./editorAiLogger');
const { appendEditorBotResponseCapture } = require('./editorBotResponseCapture');

function readFirstEditorBotEnv(keys = []) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function isCloudEditorBotTarget({ modelName = '', baseUrl = '' } = {}) {
  const normalizedModelName = String(modelName || '').trim().toLowerCase();
  const normalizedBaseUrl = String(baseUrl || '').trim().toLowerCase();

  return normalizedModelName.includes('cloud')
    || normalizedModelName.startsWith('gpt-oss:')
    || normalizedBaseUrl.startsWith('https://ollama.com/api')
    || normalizedBaseUrl.startsWith('https://');
}

const DEFAULT_EDITOR_BOT_OLLAMA_MODEL = readFirstEditorBotEnv([
  'OLLAMA_EDITOR_BOT_MODEL',
  'RENTZ_EDITOR_BOT_OLLAMA_MODEL',
  'RENTZ_BOT_OLLAMA_MODEL'
]) || 'llama3.2:3b';
const DEFAULT_EDITOR_BOT_FULL_OLLAMA_MODEL = readFirstEditorBotEnv([
  'OLLAMA_EDITOR_BOT_FULL_MODEL',
  'RENTZ_EDITOR_BOT_FULL_OLLAMA_MODEL'
]) || DEFAULT_EDITOR_BOT_OLLAMA_MODEL;
const DEFAULT_EDITOR_BOT_LEAN_OLLAMA_MODEL = readFirstEditorBotEnv([
  'OLLAMA_EDITOR_BOT_LEAN_MODEL',
  'RENTZ_EDITOR_BOT_LEAN_OLLAMA_MODEL'
]) || DEFAULT_EDITOR_BOT_OLLAMA_MODEL;
const DEFAULT_EDITOR_BOT_OLLAMA_BASE_URL = readFirstEditorBotEnv([
  'OLLAMA_EDITOR_BOT_BASE_URL',
  'RENTZ_EDITOR_BOT_OLLAMA_BASE_URL',
  'RENTZ_BOT_OLLAMA_BASE_URL'
]) || 'http://127.0.0.1:11434';
const DEFAULT_EDITOR_BOT_OLLAMA_AUTH_TOKEN = readFirstEditorBotEnv([
  'OLLAMA_EDITOR_BOT_AUTH_TOKEN',
  'RENTZ_EDITOR_BOT_OLLAMA_AUTH_TOKEN',
  'OLLAMA_AUTH_TOKEN',
  'OLLAMA_API_KEY'
]);
const DEFAULT_EDITOR_BOT_OLLAMA_AUTH_SCHEME = readFirstEditorBotEnv([
  'OLLAMA_EDITOR_BOT_AUTH_SCHEME',
  'RENTZ_EDITOR_BOT_OLLAMA_AUTH_SCHEME'
]) || 'Bearer';
const EDITOR_BOT_PROMPT_VERSION = 'editor-bot-judge-v3';
const EDITOR_BOT_NO_THINK_PREFIX = '/no_think';
const EDITOR_BOT_TIMEOUT_MS = Math.max(
  1800,
  Number(
    readFirstEditorBotEnv([
      'OLLAMA_EDITOR_BOT_TIMEOUT_MS',
      'RENTZ_EDITOR_BOT_TIMEOUT_MS'
    ]) || (
      isCloudEditorBotTarget({
        modelName: DEFAULT_EDITOR_BOT_FULL_OLLAMA_MODEL,
        baseUrl: DEFAULT_EDITOR_BOT_OLLAMA_BASE_URL
      })
        ? 60000
        : 7000
    )
  )
);
const CLOUD_EDITOR_BOT_NUM_PREDICT = Math.max(
  1200,
  Math.min(
    2400,
    Number(
      readFirstEditorBotEnv([
        'OLLAMA_EDITOR_BOT_CLOUD_NUM_PREDICT',
        'EDITOR_AI_NUM_PREDICT',
        'OLLAMA_EDITOR_BOT_NUM_PREDICT',
        'RENTZ_EDITOR_BOT_NUM_PREDICT'
      ]) || 1600
    )
  )
);
const CLOUD_EDITOR_BOT_RETRY_NUM_PREDICT = Math.max(
  CLOUD_EDITOR_BOT_NUM_PREDICT,
  Math.min(
    2600,
    Number(
      readFirstEditorBotEnv([
        'OLLAMA_EDITOR_BOT_CLOUD_RETRY_NUM_PREDICT',
        'EDITOR_AI_RETRY_NUM_PREDICT',
        'RENTZ_EDITOR_BOT_CLOUD_RETRY_NUM_PREDICT'
      ]) || Math.max(1800, CLOUD_EDITOR_BOT_NUM_PREDICT + 200)
    )
  )
);
const CLOUD_EDITOR_BOT_REPAIR_NUM_PREDICT = Math.max(
  360,
  Math.min(
    1200,
    Number(
      readFirstEditorBotEnv([
        'OLLAMA_EDITOR_BOT_CLOUD_REPAIR_NUM_PREDICT',
        'EDITOR_AI_REPAIR_NUM_PREDICT',
        'RENTZ_EDITOR_BOT_CLOUD_REPAIR_NUM_PREDICT'
      ]) || 720
    )
  )
);
const EDITOR_BOT_NUM_PREDICT = Math.max(
  160,
  Math.min(
    900,
    Number(
      readFirstEditorBotEnv([
        'OLLAMA_EDITOR_BOT_LOCAL_NUM_PREDICT',
        'RENTZ_EDITOR_BOT_LOCAL_NUM_PREDICT'
      ]) || 320
    )
  )
);
const LEAN_EDITOR_BOT_NUM_PREDICT = Math.max(
  120,
  Math.min(
    900,
    Number(
      readFirstEditorBotEnv([
        'OLLAMA_EDITOR_BOT_LEAN_NUM_PREDICT',
        'RENTZ_EDITOR_BOT_LEAN_NUM_PREDICT'
      ]) || (
        isCloudEditorBotTarget({
          modelName: DEFAULT_EDITOR_BOT_FULL_OLLAMA_MODEL,
          baseUrl: DEFAULT_EDITOR_BOT_OLLAMA_BASE_URL
        })
          ? 320
          : 220
      )
    )
  )
);
const EDITOR_BOT_KEEP_ALIVE = process.env.OLLAMA_EDITOR_BOT_KEEP_ALIVE
  || process.env.RENTZ_EDITOR_BOT_KEEP_ALIVE
  || '15m';
const EDITOR_BOT_LOG_RULESET_PREVIEW_LENGTH = Math.max(
  0,
  Number(readFirstEditorBotEnv([
    'EDITOR_AI_LOG_RULESET_PREVIEW_LENGTH'
  ]) || 180)
);
const MAX_RULESET_SOURCE_LENGTH = 12000;
const MAX_RULESET_NAME_LENGTH = 120;
const MAX_RULESET_SHORT_NAME_LENGTH = 24;
const FULL_PROMPT_CODE_LIMIT = 1500;
const LEAN_PROMPT_CODE_LIMIT = 720;
const RETRY_PROMPT_CODE_LIMIT = 420;
const SCORE_MAP_PROMPT_CODE_LIMIT = 140;
const FULL_PROMPT_IDENTIFIER_LIMIT = 8;
const LEAN_PROMPT_IDENTIFIER_LIMIT = 4;
const SCORE_MAP_TIMEOUT_CAP_MS = Math.max(4000, Number(process.env.RENTZ_EDITOR_BOT_SCORE_MAP_TIMEOUT_CAP_MS || 25000));
const SCORE_MAP_NUM_PREDICT = Math.max(16, Number(process.env.RENTZ_EDITOR_BOT_SCORE_MAP_NUM_PREDICT || 32));
const SCORE_MAP_WARMUP_NUM_PREDICT = Math.max(16, Number(process.env.RENTZ_EDITOR_BOT_SCORE_MAP_WARMUP_NUM_PREDICT || 32));
const EDITOR_BOT_WARMUP_NUM_PREDICT = Math.max(
  24,
  Math.min(
    180,
    Number(readFirstEditorBotEnv([
      'OLLAMA_EDITOR_BOT_WARMUP_NUM_PREDICT',
      'RENTZ_EDITOR_BOT_WARMUP_NUM_PREDICT'
    ]) || 80)
  )
);
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
const EDITOR_BOT_INTERNAL_TEXT_PATTERN = /\b(?:ollama|fallback review|heuristic review|hybrid review|score-map|diagnostic|model warmup|json schema|return json only|chain-of-thought|language model|llm|provider)\b/i;
const EDITOR_BOT_CALIBRATION_GUIDANCE = Object.freeze([
  'A Rentz match rotates through several short contracts, so judge this as one mini-game inside that rotation.',
  'Simple focused contracts can be excellent when they are clear, quick, and tactically readable.',
  'King of Hearts works because one iconic danger card creates focused table tension.',
  'Diamonds works because suit-based pressure is easy to understand and track.',
  'Queens works because the danger cards are recognizable and create clean table tension.',
  '10 of Clubs works because one high-stakes focal card creates immediate readable pressure.',
  'Whist works because rewarding trick-taking gives the rotation a clean contrast with avoidance rounds.',
  'Levate works because it flips Whist pressure and teaches trick avoidance cleanly.',
  'Total Plus and Total Minus work when several familiar pressures are combined into a deliberately swingier but still readable round.',
  'Do not require one contract to solve whole-match balance, deep strategy, or comeback pacing by itself.'
]);
const EDITOR_BOT_CRITERIA_GUIDANCE = Object.freeze({
  comebackPotential: 'Judge whether the contract avoids making the wider match feel hopeless too early. Do not require the contract to create a comeback by itself. Swingy rounds can still score well when the swing is visible, understandable, and fits Rentz rotation.',
  playerAgency: 'Judge whether players have meaningful choices through timing, taking or avoiding tricks, preserving suits, dumping danger cards, baiting opponents, reading the table, and managing known risks. Deep strategy is not required.',
  claritySimplicity: 'Judge how easy the contract is to explain, remember, track, and play quickly. Simple focused rules should often score high. Penalize only when extra complexity slows the table down without enough payoff.',
  scoringBalance: 'Judge whether the points or penalties match the difficulty and impact of the objective. Swingy scoring is acceptable when it is intentional, readable, and easy to track. Penalize arbitrary, confusing, exploitable, or wildly mismatched scoring.'
});
let cachedEditorBotRuntime = null;
const warmedEditorBotModels = new Map();

async function ensureEditorAiLoggingInitialized() {
  await initializeEditorAiLogging({
    model: sanitizeText(DEFAULT_EDITOR_BOT_FULL_OLLAMA_MODEL, DEFAULT_EDITOR_BOT_OLLAMA_MODEL, 120),
    baseUrl: sanitizeEditorBotBaseUrlForLog(DEFAULT_EDITOR_BOT_OLLAMA_BASE_URL),
    timeoutMs: EDITOR_BOT_TIMEOUT_MS,
    cloudEnabled: isCloudEditorBotTarget({
      modelName: DEFAULT_EDITOR_BOT_FULL_OLLAMA_MODEL,
      baseUrl: DEFAULT_EDITOR_BOT_OLLAMA_BASE_URL
    }),
    fallbackEnabled: true,
    logEnabled: isEditorAiLogEnabled(),
    logPath: getEditorAiLogPath()
  });
}

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

function sanitizeEditorBotBaseUrlForLog(baseUrl) {
  const normalizedBaseUrl = normalizeEditorBotBaseUrl(baseUrl);

  try {
    const parsedUrl = new URL(normalizedBaseUrl);
    return `${parsedUrl.origin}${parsedUrl.pathname.replace(/\/+$/, '') || '/'}`;
  } catch {
    return sanitizeText(normalizedBaseUrl, DEFAULT_EDITOR_BOT_OLLAMA_BASE_URL, 200);
  }
}

function buildEditorBotGenerateUrl(baseUrl) {
  const normalizedBaseUrl = normalizeEditorBotBaseUrl(baseUrl);

  if (/\/(?:api\/)?generate$/i.test(normalizedBaseUrl)) {
    return normalizedBaseUrl;
  }

  if (/\/api$/i.test(normalizedBaseUrl)) {
    return `${normalizedBaseUrl}/generate`;
  }

  return `${normalizedBaseUrl}/api/generate`;
}

function buildEditorBotRequestHeaders() {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (DEFAULT_EDITOR_BOT_OLLAMA_AUTH_TOKEN) {
    headers.Authorization = `${DEFAULT_EDITOR_BOT_OLLAMA_AUTH_SCHEME} ${DEFAULT_EDITOR_BOT_OLLAMA_AUTH_TOKEN}`.trim();
  }

  return headers;
}

function getEditorBotWarmModelCacheKey(modelName, baseUrl) {
  return `${normalizeEditorBotBaseUrl(baseUrl)}::${sanitizeText(modelName, DEFAULT_EDITOR_BOT_OLLAMA_MODEL, 120)}`;
}

function createEditorBotRequestId(prefix = 'editorai') {
  const randomPart = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  return `${prefix}-${randomPart}`;
}

function summarizeEditorBotError(error) {
  return {
    message: sanitizeText(error?.message, 'unknown-error', 240),
    code: sanitizeText(error?.code, '', 80),
    name: sanitizeText(error?.name, '', 80),
    httpStatus: Number.isFinite(Number(error?.httpStatus)) ? Number(error.httpStatus) : undefined,
    bodyPreview: sanitizeText(error?.bodyPreview, '', 240)
  };
}

function buildSafeRulesetPreviewForLog(code) {
  if (!isEditorAiVerboseLoggingEnabled() || EDITOR_BOT_LOG_RULESET_PREVIEW_LENGTH <= 0) {
    return '';
  }

  return sanitizeText(String(code || '').replace(/\s+/g, ' '), '', EDITOR_BOT_LOG_RULESET_PREVIEW_LENGTH);
}

async function logEditorAiEvent(level, message, fields = {}) {
  await appendEditorAiLog(level, message, fields);
}

function stringifyEditorBotResponseValue(value) {
  if (typeof value === 'string') {
    return value;
  }

  if (value == null) {
    return '';
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function readEditorBotHttpResponseBody(response) {
  if (!response) {
    return '';
  }

  if (typeof response.text === 'function') {
    return response.text().catch(() => '');
  }

  if (typeof response.json === 'function') {
    const data = await response.json().catch(() => null);
    return stringifyEditorBotResponseValue(data);
  }

  return stringifyEditorBotResponseValue(response);
}

function buildEditorBotResponseCaptureContent(sections = {}) {
  return Object.entries(sections)
    .map(([label, value]) => {
      const text = String(value ?? '').trim();
      if (!text) {
        return '';
      }

      return `${label}:\n${text}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

function isEditorBotLengthDoneReason(doneReason = '') {
  return /^(?:length|max_tokens|max_output_tokens|token_limit)$/i.test(String(doneReason || '').trim());
}

function extractEditorBotEnvelopeMetadata(envelope = null, responseText = '', thinkingText = '') {
  const normalizedResponseText = String(responseText || '').trim();
  const normalizedThinkingText = String(thinkingText || '').trim();
  const doneReason = sanitizeText(
    envelope?.done_reason ?? envelope?.doneReason,
    '',
    80
  );
  const evalCount = Math.max(
    0,
    Number(
      envelope?.eval_count
      ?? envelope?.evalCount
      ?? envelope?.prompt_eval_count
      ?? 0
    ) || 0
  );

  return {
    responseEmpty: !normalizedResponseText,
    responseLength: normalizedResponseText.length,
    thinkingDetected: Boolean(normalizedThinkingText),
    thinkingLength: normalizedThinkingText.length,
    emptyResponseWithThinking: !normalizedResponseText && Boolean(normalizedThinkingText),
    truncatedDuringThinking: !normalizedResponseText && Boolean(normalizedThinkingText) && isEditorBotLengthDoneReason(doneReason),
    doneReason,
    evalCount,
    responsePreview: buildEditorBotDiagnosticPreview(normalizedResponseText),
    thinkingPreview: buildEditorBotDiagnosticPreview(normalizedThinkingText)
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
      headers: buildEditorBotRequestHeaders(),
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
  errorMessage
}) {
  const finalize = () => {
    clearTimeout?.();
  };

  try {
    if (!response.body) {
      let envelope = null;
      let rawResponseBody = '';

      if (typeof response.json === 'function') {
        envelope = await response.json().catch(() => null);
        rawResponseBody = stringifyEditorBotResponseValue(envelope);
      } else {
        rawResponseBody = await readEditorBotHttpResponseBody(response);
        envelope = parseJsonEnvelope(rawResponseBody);
      }

      const responseText = String(envelope?.response || '').trim();
      const thinkingText = String(envelope?.thinking || '').trim();
      const responseMeta = extractEditorBotEnvelopeMetadata(envelope, responseText, thinkingText);
      const parsedJson = parseJsonObject(responseText);
      const parsed = schema.safeParse(parsedJson);

      if (!parsed.success) {
        return {
          success: false,
          error: responseMeta.emptyResponseWithThinking && isEditorBotLengthDoneReason(responseMeta.doneReason)
            ? 'empty_response_with_thinking_length'
            : responseMeta.responseEmpty
              ? 'empty-response'
              : 'invalid-structured-output',
          stage: responseMeta.responseEmpty ? 'response-empty' : parsedJson ? 'validation' : 'json-parse',
          rawPreview: responseMeta.responsePreview,
          rawText: responseText,
          rawResponseBody,
          responseMeta,
          attemptLabel
        };
      }

      return {
        success: true,
        data: parsed.data,
        rawText: responseText,
        rawResponseBody,
        responseMeta: {
          ...responseMeta,
          parseSuccess: true,
          validationSuccess: true
        },
        attemptLabel
      };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let envelopeText = '';
    let rawText = '';
    let thinkingText = '';
    let lastPayload = null;

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

      const decodedChunk = decoder.decode(value, { stream: true });
      envelopeText += decodedChunk;
      buffer += decodedChunk;
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

        lastPayload = payload;
        rawText += String(payload?.response || '');
        if (payload?.thinking) {
          thinkingText += String(payload.thinking);
        }
      }
    }

    const finalChunk = decoder.decode();
    envelopeText += finalChunk;
    buffer += finalChunk;
    if (buffer.trim()) {
      envelopeText = `${envelopeText}\n${buffer.trim()}`.trim();
    }

    const parsedEnvelope = parseJsonEnvelope(envelopeText);
    if (parsedEnvelope && typeof parsedEnvelope === 'object') {
      lastPayload = parsedEnvelope;
    }

    if (!rawText && buffer.trim()) {
      rawText = String(parsedEnvelope?.response || '').trim();
    }

    const rawResponseBody = envelopeText.trim();
    const responseMeta = extractEditorBotEnvelopeMetadata(lastPayload, rawText, thinkingText);
    const parsedJson = parseJsonObject(rawText);
    const parsed = schema.safeParse(parsedJson);
    if (parsed.success) {
      return {
        success: true,
        data: parsed.data,
        rawText,
        rawResponseBody,
        responseMeta: {
          ...responseMeta,
          parseSuccess: true,
          validationSuccess: true
        },
        attemptLabel
      };
    }

    return {
      success: false,
      error: responseMeta.emptyResponseWithThinking && isEditorBotLengthDoneReason(responseMeta.doneReason)
        ? 'empty_response_with_thinking_length'
        : responseMeta.responseEmpty
          ? 'empty-response'
          : 'invalid-structured-output',
      stage: responseMeta.responseEmpty ? 'response-empty' : parsedJson ? 'validation' : 'json-parse',
      rawPreview: responseMeta.responsePreview,
      rawText,
      rawResponseBody,
      responseMeta,
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
            explanation: sanitizeNarrativeText(entry.explanation ?? entry.e, '', 220)
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

function extractNarrativeCategoryScoresFromText(text) {
  const rawText = String(text || '');
  const categoryAliases = {
    comebackPotential: ['comebackPotential', 'comeback potential', 'comeback'],
    playerAgency: ['playerAgency', 'player agency', 'agency'],
    claritySimplicity: ['claritySimplicity', 'clarity / simplicity', 'clarity', 'simplicity'],
    scoringBalance: ['scoringBalance', 'scoring balance', 'scoring']
  };
  const extracted = {};

  for (const [categoryKey, aliases] of Object.entries(categoryAliases)) {
    let matchedWindow = '';

    for (const alias of aliases) {
      const aliasPattern = new RegExp(`${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\n]{0,180}`, 'i');
      const match = rawText.match(aliasPattern);
      if (match?.[0]) {
        matchedWindow = match[0];
        break;
      }
    }

    if (!matchedWindow) {
      continue;
    }

    const scoreMatch = matchedWindow.match(/score(?:\s+\w+)?\s*[:=]?\s*(\d+(?:\.\d+)?)/i)
      || matchedWindow.match(/(\d+(?:\.\d+)?)\s*(?:\/\s*10)?/i);
    const score = normalizeEditorBotRawScore(scoreMatch?.[1]);
    if (score == null) {
      continue;
    }

    const explanationMatch = matchedWindow.match(/explanation(?:\s+\w+)?\s*[:=]?\s*([^.;]+[.]?)/i)
      || matchedWindow.match(/reason(?:\s+\w+)?\s*[:=]?\s*([^.;]+[.]?)/i);

    extracted[categoryKey] = {
      score,
      explanation: sanitizeNarrativeText(explanationMatch?.[1] || matchedWindow, '', 220)
    };
  }

  return extracted;
}

function extractNarrativeOverallScore(text) {
  const rawText = String(text || '');
  const overallMatch = rawText.match(/overallScore(?:\s+\w+)?\s*[:=]?\s*(\d+(?:\.\d+)?)/i)
    || rawText.match(/overall score(?:\s+\w+)?\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  return normalizeEditorBotRawScore(overallMatch?.[1]);
}

function buildSalvagedEditorBotReview(rawText, fallbackReview, options = {}) {
  const {
    allowScoreOnly = false
  } = options || {};
  const parsedJson = parseJsonObject(rawText);
  const extractedCategories = {
    ...extractSequentialCategoryScoresFromText(rawText),
    ...extractNarrativeCategoryScoresFromText(rawText),
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
    const explanation = sanitizeNarrativeText(extractedCategories[categoryKey]?.explanation, '', 220);
    return explanation.length > 0;
  });
  const hasNarrativeText = Boolean(
    sanitizeNarrativeText(parsedJson?.rulesetSummary ?? parsedJson?.summary ?? parsedJson?.rs, '', 320)
    || sanitizeNarrativeText(parsedJson?.constructiveReview ?? parsedJson?.review ?? parsedJson?.cr, '', 360)
  );

  if (!allowScoreOnly && !hasCategoryExplanations && !hasNarrativeText) {
    return null;
  }

  return {
    overallScore: clampEditorBotScore(
      parsedJson?.overallScore ?? parsedJson?.score ?? extractNarrativeOverallScore(rawText) ?? averageScore,
      averageScore
    ),
    categories,
    rulesetSummary: sanitizeNarrativeText(
      parsedJson?.rulesetSummary ?? parsedJson?.summary ?? parsedJson?.rs,
      baseReview.rulesetSummary,
      320
    ),
    constructiveReview: sanitizeNarrativeText(
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

function sanitizeNarrativeText(value, fallback = '', maxLength = 320) {
  const text = sanitizeText(value, '', maxLength);
  if (!text) {
    return fallback;
  }

  return EDITOR_BOT_INTERNAL_TEXT_PATTERN.test(text) ? fallback : text;
}

function escapeRegex(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripEditorBotScoreBoilerplate(value) {
  return String(value ?? '')
    .replace(/\(\s*\d+(?:\.\d+)?\s*\/\s*10\s*\)/gi, '')
    .replace(/\b(?:score|rating|rated|overall)\s*(?:is\s+|was\s+|maybe\s+|likely\s+|probably\s+|around\s+|about\s+|at\s+)?[:=]?\s*\d+(?:\.\d+)?(?:\s*\/\s*10)?\.?/gi, '')
    .replace(/\b(?:i would score it|this is a|it is a|it's a)\s+\d+(?:\.\d+)?(?:\s*\/\s*10)?\.?/gi, '')
    .replace(/\b(?:so high|so low|maybe|likely|probably|around|about|overall)\s*,?\s*\d+(?:\.\d+)?(?:\s*\/\s*10)?\.?/gi, '')
    .replace(/\b\d+(?:\.\d+)?\s*\/\s*10\b\.?/gi, '')
    .replace(/\s*(?:[,;:]\s*|\s+(?:so high|so low|maybe|likely|probably|overall)\s*,?\s*)\d+\.\d+(?:\s*\/\s*10)?\.?$/i, '')
    .replace(/\s+(?:=|-)\s*\d+(?:\.\d+)?\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

function sanitizeEditorBotCategoryExplanation(value, category, fallback = '', maxLength = 220) {
  let text = sanitizeNarrativeText(value, '', maxLength);
  if (!text) {
    return fallback;
  }

  const keyPattern = escapeRegex(category?.key || '');
  const labelPattern = escapeRegex(category?.label || '');
  const labelPatternCompactSlash = escapeRegex(String(category?.label || '').replace(/\s*\/\s*/g, '/'));
  const labelPatternWithoutSlash = escapeRegex(String(category?.label || '').replace(/\s*\/\s*/g, ' '));

  const prefixPatterns = [
    keyPattern,
    labelPattern,
    labelPatternCompactSlash,
    labelPatternWithoutSlash,
    keyPattern ? keyPattern.replace(/([a-z])([A-Z])/g, '$1\\s*$2') : ''
  ].filter(Boolean);

  for (const pattern of prefixPatterns) {
    text = text.replace(
      new RegExp(`^${pattern}\\s*(?:[:=\\-—]+\\s*)?(?:(?:score|rating|rated|overall)\\s*)?(?:\\d+(?:\\.\\d+)?(?:\\s*\\/\\s*10)?)?\\s*(?:[:=\\-—]+\\s*)?`, 'i'),
      ''
    );
  }

  text = stripEditorBotScoreBoilerplate(text)
    .replace(/^(?:score|rating)\s*[:=]?\s*/i, '')
    .replace(/^[,;:—=\-\s]+/, '')
    .replace(/[,:;—=\-\s]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return text || fallback;
}

function getEditorBotFallbackRepresentativeEmoji(score = 5) {
  const safeScore = clampEditorBotScore(score, 5);

  if (safeScore >= 8.5) {
    return '👍';
  }

  if (safeScore >= 7) {
    return '🙂';
  }

  if (safeScore >= 5) {
    return '🤔';
  }

  if (safeScore >= 3) {
    return '😬';
  }

  return '👎';
}

function sanitizeRepresentativeEmoji(value, fallbackScore = 5) {
  const fallbackEmoji = getEditorBotFallbackRepresentativeEmoji(fallbackScore);
  const rawText = String(value ?? '').trim();
  if (!rawText) {
    return fallbackEmoji;
  }

  const graphemes = typeof Intl?.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(rawText), (entry) => entry.segment)
    : Array.from(rawText);

  for (const segment of graphemes) {
    const candidate = String(segment || '').trim();
    if (!candidate) {
      continue;
    }

    if (/[A-Za-z0-9]/.test(candidate)) {
      continue;
    }

    if (/^[.,:;'"!?()[\]{}<>/\\|`~_-]+$/.test(candidate)) {
      continue;
    }

    return candidate.slice(0, 8);
  }

  return fallbackEmoji;
}

function sanitizeTextList(values, fallback = [], maxLength = 160, maxItems = 4) {
  const list = Array.isArray(values)
    ? values
    : typeof values === 'string'
      ? [values]
      : [];
  const sanitized = list
    .map((value) => sanitizeNarrativeText(value, '', maxLength))
    .filter(Boolean);

  return sanitized.length > 0 ? sanitized.slice(0, maxItems) : fallback;
}

function stripEditorBotThinkingArtifacts(text) {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
    .replace(/^\s*thinking\s*:\s*[\s\S]*?(?=\{|\[|```|$)/i, ' ')
    .trim();
}

function extractBalancedJsonSegments(text) {
  const source = String(text || '');
  const segments = [];

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char !== '{' && char !== '[') {
      continue;
    }

    const stack = [char];
    let inString = false;
    let escaped = false;

    for (let cursor = index + 1; cursor < source.length; cursor += 1) {
      const current = source[cursor];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (current === '\\') {
        escaped = true;
        continue;
      }

      if (current === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (current === '{' || current === '[') {
        stack.push(current);
        continue;
      }

      if (current === '}' || current === ']') {
        const expected = current === '}' ? '{' : '[';
        if (stack[stack.length - 1] !== expected) {
          break;
        }

        stack.pop();
        if (stack.length === 0) {
          segments.push(source.slice(index, cursor + 1));
          index = cursor;
          break;
        }
      }
    }
  }

  return segments;
}

function extractEditorBotJsonCandidates(text) {
  const stripped = stripEditorBotThinkingArtifacts(text);
  const trimmed = stripped.trim();
  const candidates = [];
  const fencedBlocks = Array.from(
    trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)
  ).map((match) => match[1]?.trim()).filter(Boolean);

  candidates.push(trimmed);
  candidates.push(...fencedBlocks);
  candidates.push(...extractBalancedJsonSegments(trimmed));
  for (const block of fencedBlocks) {
    candidates.push(...extractBalancedJsonSegments(block));
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}

function parseJsonEnvelope(text) {
  for (const candidate of extractEditorBotJsonCandidates(text)) {
    try {
      return JSON.parse(candidate);
    } catch {
      const normalizedCandidate = normalizeLooseJsonCandidate(candidate);
      if (normalizedCandidate !== candidate) {
        try {
          return JSON.parse(normalizedCandidate);
        } catch {
          continue;
        }
      }
    }
  }

  return null;
}

function normalizeLooseJsonCandidate(candidate) {
  const text = String(candidate || '').trim();
  if (!text.includes('\'')) {
    return text;
  }

  return text.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, value) => JSON.stringify(value));
}

function normalizeEditorBotCategoryKey(key) {
  const normalizedKey = String(key || '').trim().toLowerCase();
  if (!normalizedKey) {
    return '';
  }

  const aliases = {
    comeback: 'comebackPotential',
    comebackpotential: 'comebackPotential',
    agency: 'playerAgency',
    playeragency: 'playerAgency',
    clarity: 'claritySimplicity',
    claritysimplicity: 'claritySimplicity',
    simplicity: 'claritySimplicity',
    scoring: 'scoringBalance',
    scoringbalance: 'scoringBalance'
  };

  return aliases[normalizedKey] || CATEGORY_KEYS.find((entry) => entry.toLowerCase() === normalizedKey) || '';
}

function normalizeEditorBotModelScoreValue(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return value;
  }

  if (numericValue > 10 && numericValue <= 100) {
    return Math.round(numericValue) / 10;
  }

  return numericValue;
}

function normalizeEditorBotCategoryObject(rawCategory = {}) {
  if (!rawCategory || typeof rawCategory !== 'object') {
    return rawCategory;
  }

  return {
    score: normalizeEditorBotModelScoreValue(rawCategory.score ?? rawCategory.value ?? rawCategory.rating),
    explanation: rawCategory.explanation ?? rawCategory.text ?? rawCategory.reason ?? rawCategory.e
  };
}

function normalizeEditorBotReviewCandidate(rawValue) {
  if (!rawValue || typeof rawValue !== 'object') {
    return rawValue;
  }

  const sourceObject = Array.isArray(rawValue)
    ? rawValue.length === 1 && rawValue[0] && typeof rawValue[0] === 'object'
      ? rawValue[0]
      : null
    : rawValue;

  if (!sourceObject || typeof sourceObject !== 'object') {
    return rawValue;
  }

  const normalized = {
    overallScore: normalizeEditorBotModelScoreValue(sourceObject.overallScore ?? sourceObject.score),
    representativeEmoji: sourceObject.representativeEmoji ?? sourceObject.emoji ?? sourceObject.moodEmoji ?? sourceObject.reaction,
    rulesetSummary: sourceObject.rulesetSummary ?? sourceObject.summary ?? sourceObject.rs,
    constructiveReview: sourceObject.constructiveReview ?? sourceObject.review ?? sourceObject.cr,
    recommendations: sourceObject.recommendations ?? sourceObject.rec,
    warnings: sourceObject.warnings ?? sourceObject.w
  };
  const categorySources = [
    sourceObject.categories,
    sourceObject.categoryRatings
  ].filter((entry) => entry && typeof entry === 'object');
  const normalizedCategories = {};

  for (const [rawKey, rawCategory] of Object.entries(sourceObject)) {
    const normalizedKey = normalizeEditorBotCategoryKey(rawKey);
    if (!normalizedKey) {
      continue;
    }

    normalizedCategories[normalizedKey] = normalizeEditorBotCategoryObject(
      rawCategory && typeof rawCategory === 'object'
        ? rawCategory
        : { score: normalizeEditorBotModelScoreValue(rawCategory) }
    );
  }

  for (const categorySource of categorySources) {
    for (const [rawKey, rawCategory] of Object.entries(categorySource)) {
      const normalizedKey = normalizeEditorBotCategoryKey(rawKey);
      if (!normalizedKey || normalizedCategories[normalizedKey]) {
        continue;
      }

      normalizedCategories[normalizedKey] = normalizeEditorBotCategoryObject(
        rawCategory && typeof rawCategory === 'object'
          ? rawCategory
          : { score: normalizeEditorBotModelScoreValue(rawCategory) }
      );
    }
  }

  normalized.categories = normalizedCategories;
  return normalized;
}

function parseJsonObject(text) {
  for (const candidate of extractEditorBotJsonCandidates(text)) {
    try {
      return normalizeEditorBotReviewCandidate(JSON.parse(candidate));
    } catch {
      const normalizedCandidate = normalizeLooseJsonCandidate(candidate);
      if (normalizedCandidate !== candidate) {
        try {
          return normalizeEditorBotReviewCandidate(JSON.parse(normalizedCandidate));
        } catch {
          continue;
        }
      }
    }
  }

  return null;
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

function buildRulesetSourceHash(code = '') {
  return crypto.createHash('sha1').update(String(code || '')).digest('hex').slice(0, 12);
}

function buildRulesetJudgeHash({ ruleset = {}, compiler = null } = {}) {
  return crypto.createHash('sha1').update(JSON.stringify({
    title: sanitizeText(ruleset.title, '', MAX_RULESET_NAME_LENGTH),
    shortName: sanitizeText(ruleset.shortName, '', MAX_RULESET_SHORT_NAME_LENGTH),
    type: ruleset.type === 'end_game' ? 'end_game' : 'per_round',
    code: String(ruleset.code || ''),
    compilerStatus: sanitizeText(compiler?.status, 'compiled', 40),
    compilerMessage: sanitizeText(compiler?.message, 'Ruleset compiled successfully.', 140),
    promptVersion: EDITOR_BOT_PROMPT_VERSION
  })).digest('hex').slice(0, 16);
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

  return Math.max(16, Math.min(Math.round(numericTarget), 2600));
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

function buildRulesetCalibrationProfile(metrics, type = 'per_round') {
  const hasHeartPressure = hasIdentifier(metrics, /HEART/);
  const hasKingPressure = hasIdentifier(metrics, /(KING|(^K_|_K(?:_|$)))/);
  const hasDiamondPressure = hasIdentifier(metrics, /DIAMOND/);
  const hasQueenPressure = hasIdentifier(metrics, /(QUEEN|(^Q_|_Q(?:_|$)))/);
  const hasClubPressure = hasIdentifier(metrics, /CLUB/);
  const hasTenPressure = hasIdentifier(metrics, /(TEN|(^10_|_10(?:_|$)))/);
  const exactCardMarkers = [
    hasHeartPressure && hasKingPressure,
    hasQueenPressure,
    hasClubPressure && hasTenPressure
  ].filter(Boolean).length;
  const compactSingleTrigger = metrics.nonEmptyLineCount <= 4
    && metrics.ifCount <= 1
    && metrics.callCounts.add === 1
    && metrics.callCounts.set_to + metrics.callCounts.reset_to === 0;
  const cleanTrickContract = metrics.ifCount === 0
    && metrics.callCounts.add === 1
    && metrics.callCounts.set_to + metrics.callCounts.reset_to === 0
    && metrics.identifiers.length === 0
    && metrics.estimatedMaxSwing <= 20;
  const aggregateDefaultMix = [hasHeartPressure && hasKingPressure, hasDiamondPressure, hasQueenPressure, hasClubPressure && hasTenPressure]
    .filter(Boolean)
    .length >= 3;

  return {
    compactSingleTrigger,
    cleanTrickContract,
    exactCardMarkers,
    kingOfHeartsStyle: compactSingleTrigger && hasHeartPressure && hasKingPressure,
    diamondsStyle: compactSingleTrigger && hasDiamondPressure,
    queensStyle: compactSingleTrigger && hasQueenPressure,
    tenOfClubsStyle: compactSingleTrigger && hasClubPressure && hasTenPressure,
    whistStyle: cleanTrickContract && metrics.scoringDirections.positive > 0,
    levateStyle: cleanTrickContract && metrics.scoringDirections.negative > 0,
    totalStyle: aggregateDefaultMix && metrics.nonEmptyLineCount <= 8,
    readableSwingStyle: compactSingleTrigger || cleanTrickContract || aggregateDefaultMix,
    roundEndIsExpected: type === 'per_round' && compactSingleTrigger && metrics.callCounts.game_end > 0
  };
}

function buildObjectiveFragments(metrics) {
  const calibration = buildRulesetCalibrationProfile(metrics);
  const fragments = [];

  if (calibration.kingOfHeartsStyle) {
    fragments.push('play around one focused danger card: the king of hearts');
  } else if (hasIdentifier(metrics, /HEART/) && hasIdentifier(metrics, /(KING|(^K_|_K(?:_|$)))/)) {
    fragments.push('avoid or contest the king of hearts');
  } else if (hasIdentifier(metrics, /HEART/)) {
    fragments.push('manage heart captures');
  }

  if (calibration.diamondsStyle) {
    fragments.push('handle clean suit-based pressure around diamond tricks');
  } else if (hasIdentifier(metrics, /DIAMOND/)) {
    fragments.push('avoid or pressure diamond tricks');
  }

  if (calibration.queensStyle) {
    fragments.push('track recognizable queen danger cards');
  } else if (hasIdentifier(metrics, /(QUEEN|(^Q_|_Q(?:_|$)))/)) {
    fragments.push('track queen danger cards');
  }

  if (calibration.tenOfClubsStyle) {
    fragments.push('play around one high-stakes focal card: the ten of clubs');
  } else if (hasIdentifier(metrics, /CLUB/) && hasIdentifier(metrics, /(TEN|(^10_|_10(?:_|$)))/)) {
    fragments.push('play around the ten of clubs');
  }

  if (calibration.whistStyle) {
    fragments.push('win tricks for straightforward positive pressure');
  }

  if (calibration.levateStyle) {
    fragments.push('avoid tricks for straightforward negative pressure');
  }

  if (calibration.totalStyle) {
    fragments.push('combine several classic Rentz pressures into one swingier round');
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
  const calibration = buildRulesetCalibrationProfile(metrics, type);
  const fragments = buildObjectiveFragments(metrics);
  const objectiveText = fragments.length > 0
    ? fragments.join(', ')
    : 'play around the scripted scoring target';
  const swingText = calibration.kingOfHeartsStyle
    ? 'It is clear and iconic because one danger card carries the whole round.'
    : calibration.diamondsStyle
      ? 'It creates clean suit pressure that players can track without extra bookkeeping.'
      : calibration.queensStyle
        ? 'It turns a small set of danger cards into visible table tension.'
        : calibration.tenOfClubsStyle
          ? 'It creates one obvious high-stakes focal card that everyone can read.'
          : calibration.whistStyle
            ? 'It rewards taking tricks and gives the rotation a simple change of pace.'
            : calibration.levateStyle
              ? 'It rewards trick avoidance and cleanly contrasts with trick-taking rounds.'
              : calibration.totalStyle
                ? 'It deliberately bundles several familiar pressures into a swingier but readable round.'
                : metrics.callCounts.set_to + metrics.callCounts.reset_to > 0
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
  const calibration = buildRulesetCalibrationProfile(metrics, metrics.type);
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
  const readableSwingFactor = calibration.totalStyle ? 0.55 : calibration.readableSwingStyle ? 0.35 : 1;
  const readableSwingPenalty = swingPenalty * readableSwingFactor;
  const readableTotalSwingPenalty = totalSwingPenalty * readableSwingFactor;
  const defaultAnchorBonus = calibration.kingOfHeartsStyle
    || calibration.diamondsStyle
    || calibration.queensStyle
    || calibration.tenOfClubsStyle
    || calibration.whistStyle
    || calibration.levateStyle
    ? 0.8
    : 0;
  const defaultAgencyBonus = calibration.kingOfHeartsStyle
    || calibration.diamondsStyle
    || calibration.queensStyle
    || calibration.tenOfClubsStyle
    ? 0.5
    : calibration.whistStyle || calibration.levateStyle
      ? 0.3
      : 0;
  const aggregateSwingBonus = calibration.totalStyle ? 0.9 : 0;
  const abruptEndPenalty = calibration.roundEndIsExpected
    ? 0
    : metrics.callCounts.game_end + metrics.callCounts.end > 0 && metrics.nonEmptyLineCount > 6
      ? 0.5
      : 0;

  const ratings = {
    comebackPotential: clampEditorBotScore(
      7.5 + focusedContractBonus + defaultAnchorBonus * 0.7 + aggregateSwingBonus * 0.4
      - readableSwingPenalty - readableTotalSwingPenalty - scoreRewritePenalty - abruptEndPenalty - scoreStatePenalty,
      7.1
    ),
    playerAgency: clampEditorBotScore(
      7.1 + simpleStructureBonus * 0.3 + moderateChoiceBonus + mixedDirectionBonus + defaultAgencyBonus
      - (calibration.totalStyle ? 0 : exactCardHeavyPenalty) - oneWayPenalty,
      7
    ),
    claritySimplicity: clampEditorBotScore(
      8.5 + simpleStructureBonus + focusedContractBonus + defaultAnchorBonus + aggregateSwingBonus * 0.45
      - complexityPenalty - branchPenalty - scoreStatePenalty * 0.5 - scoreRewritePenalty * 0.3,
      7.8
    ),
    scoringBalance: clampEditorBotScore(
      7.8 + focusedContractBonus * 0.4 + mixedDirectionBonus + defaultAnchorBonus * 0.55 + aggregateSwingBonus
      - readableSwingPenalty - readableTotalSwingPenalty * 0.8 - scoreRewritePenalty * 0.8,
      7.2
    )
  };

  return {
    comebackPotential: {
      score: ratings.comebackPotential,
      explanation: calibration.totalStyle
        ? 'The contract is swingy on purpose, but the familiar pressures help keep that swing readable inside a Rentz rotation.'
        : calibration.readableSwingStyle
          ? 'The pressure is strong but visible, so the wider match should still feel readable instead of hopeless.'
          : swingPenalty >= 1.1 || abruptEndPenalty > 0 || scoreRewritePenalty > 0
        ? 'The contract is exciting, but big resets or abrupt endings can make a round feel decided too early.'
        : 'It is focused without obviously making the wider Rentz match feel hopeless too early.'
    },
    playerAgency: {
      score: ratings.playerAgency,
      explanation: calibration.kingOfHeartsStyle || calibration.diamondsStyle || calibration.queensStyle || calibration.tenOfClubsStyle
        ? 'Players still get real choices about timing, suit pressure, and when to dump or protect the main danger card.'
        : calibration.whistStyle || calibration.levateStyle
          ? 'The contract stays simple, but trick timing and table reading still matter on most hands.'
          : exactCardHeavyPenalty > 0
        ? 'Players still have choices, but exact-card dependence can make outcomes feel a bit draw-led.'
        : 'Players should have readable choices around timing, suit pressure, and when to take or dodge tricks.'
    },
    claritySimplicity: {
      score: ratings.claritySimplicity,
      explanation: calibration.kingOfHeartsStyle || calibration.diamondsStyle || calibration.queensStyle || calibration.tenOfClubsStyle
        ? 'The objective is compact and instantly recognizable, which is exactly what a good Rentz rotation slot wants.'
        : calibration.whistStyle || calibration.levateStyle
          ? 'The rule is easy to explain in one sentence, so it should keep the table moving quickly.'
          : calibration.totalStyle
            ? 'For a combination contract it stays surprisingly readable because the pressures are all familiar.'
            : complexityPenalty > 0 || branchPenalty > 0
        ? 'The idea is understandable, but the extra conditions will slow teaching and table speed.'
        : 'The objective is compact and easy to remember, which is a real strength for Rentz rotation.'
    },
    scoringBalance: {
      score: ratings.scoringBalance,
      explanation: calibration.diamondsStyle || calibration.queensStyle || calibration.tenOfClubsStyle
        ? 'The stakes are high enough to matter, but the scoring target is easy to spot and therefore easier to accept.'
        : calibration.totalStyle
          ? 'The scoring is intentionally larger, but it still reads like a deliberate combination of familiar Rentz pressures.'
          : scoreRewritePenalty > 0
        ? 'The scoring is dramatic enough to be interesting, but direct rewrites need extra care to stay readable.'
        : swingPenalty >= 1.1
          ? 'The swing is intentionally high-stakes, so it works best when players can see the danger clearly.'
          : 'The point values look reasonably matched to the contract and easy to track at the table.'
    }
  };
}

function buildConstructiveReview({ title, type, metrics, ratings }) {
  const calibration = buildRulesetCalibrationProfile(metrics, type);
  const roleText = type === 'end_game' ? 'match closer' : 'rotating mini-game';
  const strengths = [];
  const concerns = [];

  if (calibration.kingOfHeartsStyle) {
    strengths.push('It captures the classic one-danger-card tension that makes King of Hearts memorable.');
  } else if (calibration.diamondsStyle) {
    strengths.push('It creates clean suit pressure without burying the table in extra text.');
  } else if (calibration.queensStyle) {
    strengths.push('The queens become recognizable danger cards, which makes the round easy to follow.');
  } else if (calibration.tenOfClubsStyle) {
    strengths.push('One high-stakes focal card gives the whole round a sharp identity.');
  } else if (calibration.whistStyle) {
    strengths.push('It cleanly rewards trick-taking and gives the rotation a useful contrast.');
  } else if (calibration.levateStyle) {
    strengths.push('It cleanly rewards trick avoidance and teaches the opposite pressure from Whist.');
  } else if (calibration.totalStyle) {
    strengths.push('It intentionally combines several familiar pressures into one bigger swing round.');
  }

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

  if (metrics.estimatedMaxSwing >= 180 && !calibration.readableSwingStyle) {
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
  const calibration = buildRulesetCalibrationProfile(metrics, metrics.type);
  const recommendations = [];

  if (metrics.estimatedMaxSwing >= 180 && !calibration.readableSwingStyle) {
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
    representativeEmoji: getEditorBotFallbackRepresentativeEmoji(overallScore),
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
    representativeEmoji: z.string().min(1).max(8).optional(),
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
    EDITOR_BOT_NO_THINK_PREFIX,
    '',
    systemPrompt,
    '',
    'Payload:',
    humanPrompt,
    '',
    'Return JSON only.'
  ].join('\n');
}

function shouldAttemptEditorBotNoThink({ modelName, baseUrl } = {}) {
  return isCloudEditorBotTarget({ modelName, baseUrl });
}

function buildEditorBotThinkingSuppressionConfig({ modelName, baseUrl } = {}) {
  if (!shouldAttemptEditorBotNoThink({ modelName, baseUrl })) {
    return {
      enabled: false,
      strategy: 'none',
      body: {},
      options: {}
    };
  }

  return {
    enabled: true,
    strategy: 'prompt-prefix+options.think=false+options.reasoning=false',
    body: {
      think: false,
      thinking: false,
      reasoning: false
    },
    options: {
      think: false,
      thinking: false,
      reasoning: false
    }
  };
}

function resolveEditorBotJudgeNumPredict({
  modelName,
  baseUrl,
  retry = false,
  repair = false
} = {}) {
  if (!isCloudEditorBotTarget({ modelName, baseUrl })) {
    return EDITOR_BOT_NUM_PREDICT;
  }

  if (repair) {
    return CLOUD_EDITOR_BOT_REPAIR_NUM_PREDICT;
  }

  if (retry) {
    return CLOUD_EDITOR_BOT_RETRY_NUM_PREDICT;
  }

  return CLOUD_EDITOR_BOT_NUM_PREDICT;
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
  jsonMode = true
} = {}) {
  const request = await invokeEditorBotModel({
    modelName,
    baseUrl,
    jsonMode,
    numPredict
  });
  const useStreaming = !isCloudEditorBotTarget({
    modelName: request.modelName,
    baseUrl: request.baseUrl
  });
  const thinkingSuppression = buildEditorBotThinkingSuppressionConfig({
    modelName: request.modelName,
    baseUrl: request.baseUrl
  });
  const errorMessage = `Editor Bot request timed out after ${timeoutMs}ms`;
  const { response, controller, clearTimeout } = await postJsonWithTimeout(
    buildEditorBotGenerateUrl(request.baseUrl),
    {
      model: request.modelName,
      prompt: buildEditorBotRawPrompt(systemPrompt, humanPrompt),
      stream: useStreaming,
      keep_alive: EDITOR_BOT_KEEP_ALIVE,
      ...thinkingSuppression.body,
      options: {
        temperature: 0.1,
        num_predict: request.numPredict,
        num_ctx: isCloudEditorBotTarget({ modelName: request.modelName, baseUrl: request.baseUrl }) ? 4096 : 2048,
        ...thinkingSuppression.options
      },
      ...(request.jsonMode ? { format: 'json' } : {})
    },
    timeoutMs,
    errorMessage
  );

  if (!response.ok) {
    const responseText = await readEditorBotHttpResponseBody(response);
    clearTimeout?.();
    const error = new Error(`Editor Bot Ollama request failed with HTTP ${response.status}`);
    error.httpStatus = response.status;
    error.responseText = responseText;
    error.bodyPreview = buildEditorBotDiagnosticPreview(responseText);
    throw error;
  }

  return readEditorBotGenerateResponse({
    response,
    controller,
    clearTimeout,
    schema,
    attemptLabel,
    errorMessage
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
  const calibration = buildRulesetCalibrationProfile(metrics, type);
  const codeExcerpt = buildPromptCodeExcerpt(
    code,
    lean ? LEAN_PROMPT_CODE_LIMIT : FULL_PROMPT_CODE_LIMIT
  );
  const identifierSample = samplePromptIdentifiers(
    metrics.identifiers,
    lean ? LEAN_PROMPT_IDENTIFIER_LIMIT : FULL_PROMPT_IDENTIFIER_LIMIT
  );

  return {
    responseShape: {
      overallScore: 0,
      representativeEmoji: '👍',
      categories: {
        comebackPotential: { score: 0, explanation: 'short prose only' },
        playerAgency: { score: 0, explanation: 'short prose only' },
        claritySimplicity: { score: 0, explanation: 'short prose only' },
        scoringBalance: { score: 0, explanation: 'short prose only' }
      },
      rulesetSummary: 'short prose',
      constructiveReview: 'short prose',
      recommendations: ['optional short string'],
      warnings: ['optional short string']
    },
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
      errors: Array.isArray(compiler?.errors)
        ? compiler.errors
          .slice(0, lean ? 1 : 2)
          .map((entry) => sanitizeText(entry, '', 160))
          .filter(Boolean)
        : [],
      warnings: Array.isArray(compiler?.warnings)
        ? compiler.warnings
          .slice(0, lean ? 1 : 2)
          .map((entry) => sanitizeText(entry, '', 160))
          .filter(Boolean)
        : []
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
      identifiersTruncated: identifierSample.truncated,
      defaultStyleSignals: [
        calibration.kingOfHeartsStyle ? 'king-of-hearts-style focused danger card' : '',
        calibration.diamondsStyle ? 'diamonds-style suit pressure' : '',
        calibration.queensStyle ? 'queens-style danger cards' : '',
        calibration.tenOfClubsStyle ? 'ten-of-clubs-style focal card' : '',
        calibration.whistStyle ? 'whist-style trick-taking reward' : '',
        calibration.levateStyle ? 'levate-style trick avoidance' : '',
        calibration.totalStyle ? 'total-plus-minus-style combined pressure' : ''
      ].filter(Boolean)
    },
    calibration: {
      matchContext: 'Judge this as one ruleset inside a larger Rentz match rotation, not as a full standalone game.',
      anchors: lean
        ? EDITOR_BOT_CALIBRATION_GUIDANCE.slice(0, 4)
        : EDITOR_BOT_CALIBRATION_GUIDANCE.slice(0, 6)
    },
    criteria: CATEGORY_DEFINITIONS.map((entry) => ({
      key: entry.key,
      label: entry.label,
      guidance: sanitizeText(
        EDITOR_BOT_CRITERIA_GUIDANCE[entry.key],
        '',
        lean ? 160 : 240
      )
    })),
    responseNotes: [
      'Analyze the actual ruleset, not generic card-game design.',
      'Return the JSON object immediately.',
      'Keep each category explanation concise but specific to the ruleset.',
      'Simple focused rulesets can still score very high.',
      'Do not mention prompts, JSON, models, providers, fallbacks, or hidden reasoning.',
      'Each category explanation must be clean prose only and must not repeat the category name, category key, score, or rating text.',
      'Return the exact nested categories object, not a flat score map.'
    ]
  };
}

function buildEditorBotFocusedRetryPayload({ title, shortName, type, code, compiler, metrics }) {
  const codeExcerpt = buildPromptCodeExcerpt(code, RETRY_PROMPT_CODE_LIMIT);

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
      message: sanitizeText(compiler?.message, 'Ruleset compiled successfully.', 120)
    },
    summary: {
      focus: buildPromptFocusSummary(metrics, type),
      scoringProfile: buildPromptScoringProfile(metrics),
      largestSingleSwing: metrics.estimatedMaxSwing,
      totalDeclaredSwing: metrics.totalEstimatedSwing,
      branchCount: metrics.ifCount
    },
    categories: CATEGORY_DEFINITIONS.map((entry) => ({
      key: entry.key,
      label: entry.label
    })),
    responseShape: {
      overallScore: 'number',
      representativeEmoji: 'exactly one emoji',
      categories: 'object with comebackPotential, playerAgency, claritySimplicity, scoringBalance; each must have score and explanation',
      rulesetSummary: 'short prose',
      constructiveReview: 'short prose',
      recommendations: 'array of short strings',
      warnings: 'array of short strings'
    }
  };
}

function buildEditorBotSystemPrompt() {
  return [
    'You are Editor Bot for Rentz custom rulesets.',
    'Return ONLY one JSON object.',
    'Start with { and end with }.',
    'Return the final JSON immediately.',
    'If you need reasoning, do it silently.',
    'Judge each ruleset as one rotating Rentz mini-game or contract inside a larger match, not as the entire game.',
    'Simple focused contracts can score very high when they are clear, fast, and tactically meaningful.',
    'Swingy scoring is acceptable when it is intentional, readable, and easy to track.',
    'Do not punish a ruleset for being narrow, simple, or for not solving comeback pacing by itself.',
    'Do punish rules that feel unclear, arbitrary, impossible to track, unplayable, or wildly mismatched in scoring.',
    'Use only these four categories: comebackPotential, playerAgency, claritySimplicity, scoringBalance.',
    'No markdown. No code fences. No commentary. No reasoning text.',
    'Do not include thinking, analysis, hidden reasoning, or explanations outside the JSON object.',
    'Include representativeEmoji as exactly one emoji that matches the overall judgment tone, with no words in that field.',
    'Every category explanation must be prose only: no category names, no camelCase keys, no score text, no ratings, no out-of-10 text, and no repeated labels.',
    'Do not begin any explanation with the category name or key.',
    'Do not write phrases like "Score maybe 6.0", "Rating 7.2", or "9.5/10" anywhere inside an explanation.',
    'The first character must be { and the last character must be }.',
    'Keep the feedback concise, practical, and specific to the ruleset.',
    'Return JSON only using the exact requested schema.'
  ].join(' ');
}

function buildEditorBotRetrySystemPrompt() {
  return [
    'You are Editor Bot for Rentz custom rulesets.',
    'Return ONLY the final JSON object now.',
    'Do not output analysis, reasoning, a thinking section, markdown, code fences, or commentary.',
    'The first visible character must be { and the last visible character must be }.',
    'Each category explanation must be one or two short prose sentences only.',
    'Do not include category names, category keys, scores, ratings, or x/10 text inside explanations.',
    'The score belongs only in the score field.',
    'If you need reasoning, do it silently and output only the final JSON object.'
  ].join(' ');
}

function buildEditorBotRepairPrompt() {
  return [
    'Convert the malformed Editor Bot output into exactly one valid JSON object.',
    'No markdown. No code fences. No commentary.',
    'Each category explanation must be prose only, with no category names, no keys, no score text, no ratings, and no out-of-10 text.',
    'The first character must be { and the last character must be }.',
    'Use this exact schema:',
    '{"overallScore":0,"representativeEmoji":"👍","categories":{"comebackPotential":{"score":0,"explanation":""},"playerAgency":{"score":0,"explanation":""},"claritySimplicity":{"score":0,"explanation":""},"scoringBalance":{"score":0,"explanation":""}},"rulesetSummary":"","constructiveReview":"","recommendations":[],"warnings":[]}'
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
  requestId = '',
  phase = 'judge'
} = {}) {
  const startedAt = Date.now();
  const thinkingSuppression = buildEditorBotThinkingSuppressionConfig({ modelName, baseUrl });
  await logEditorAiEvent('INFO', 'model request started', {
    requestId,
    phase,
    attempt: attemptLabel,
    model: sanitizeText(modelName, DEFAULT_EDITOR_BOT_OLLAMA_MODEL, 120),
    baseUrl: sanitizeEditorBotBaseUrlForLog(baseUrl),
    timeoutMs,
    jsonMode: jsonMode === true,
    numPredict,
    noThinkEnabled: thinkingSuppression.enabled,
    noThinkStrategy: thinkingSuppression.strategy
  });

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
      jsonMode
    });

    await appendEditorBotResponseCapture({
      title: 'editor bot model response',
      fields: {
        requestId,
        phase,
        attempt: attemptLabel,
        model: sanitizeText(modelName, DEFAULT_EDITOR_BOT_OLLAMA_MODEL, 120),
        baseUrl: sanitizeEditorBotBaseUrlForLog(baseUrl),
        success: result.success,
        parseStage: result.success ? 'complete' : result.stage || 'unknown',
        doneReason: result.responseMeta?.doneReason,
        evalCount: result.responseMeta?.evalCount,
        numPredict,
        noThinkEnabled: thinkingSuppression.enabled,
        noThinkStrategy: thinkingSuppression.strategy
      },
      content: buildEditorBotResponseCaptureContent({
        rawResponseBody: result.rawResponseBody,
        extractedResponseText: result.rawText,
        thinkingPreview: result.responseMeta?.thinkingPreview
      })
    });

    const diagnostic = {
      attempt: attemptLabel,
      elapsedMs: Date.now() - startedAt,
      success: result.success,
      stage: result.success ? 'complete' : result.stage || 'unknown',
      error: result.success ? '' : result.error || 'unknown-error',
      rawPreview: buildEditorBotDiagnosticPreview(
        [result.rawPreview, `model: ${modelName}`].filter(Boolean).join(' | ')
      ),
      responseMeta: result.responseMeta || {}
    };
    await logEditorAiEvent(result.success ? 'INFO' : 'WARN', result.success ? 'model request completed' : 'model request returned invalid output', {
      requestId,
      phase,
      attempt: attemptLabel,
      elapsedMs: diagnostic.elapsedMs,
      model: sanitizeText(modelName, DEFAULT_EDITOR_BOT_OLLAMA_MODEL, 120),
      baseUrl: sanitizeEditorBotBaseUrlForLog(baseUrl),
      timeoutMs,
      parseStage: diagnostic.stage,
      success: result.success,
      error: diagnostic.error,
      rawPreview: diagnostic.rawPreview,
      noThinkEnabled: thinkingSuppression.enabled,
      noThinkStrategy: thinkingSuppression.strategy,
      responseEmpty: result.responseMeta?.responseEmpty === true,
      responseLength: result.responseMeta?.responseLength,
      thinkingDetected: result.responseMeta?.thinkingDetected === true,
      thinkingLength: result.responseMeta?.thinkingLength,
      empty_response_with_thinking: result.responseMeta?.emptyResponseWithThinking === true,
      truncated_during_thinking: result.responseMeta?.truncatedDuringThinking === true,
      doneReason: result.responseMeta?.doneReason,
      evalCount: result.responseMeta?.evalCount,
      parseSuccess: result.responseMeta?.parseSuccess === true,
      validationSuccess: result.responseMeta?.validationSuccess === true,
      responsePreview: result.responseMeta?.responsePreview,
      thinkingPreview: result.responseMeta?.thinkingPreview
    });

    return {
      ...result,
      diagnostic
    };
  } catch (error) {
    await appendEditorBotResponseCapture({
      title: 'editor bot model response error',
      fields: {
        requestId,
        phase,
        attempt: attemptLabel,
        model: sanitizeText(modelName, DEFAULT_EDITOR_BOT_OLLAMA_MODEL, 120),
        baseUrl: sanitizeEditorBotBaseUrlForLog(baseUrl),
        error: sanitizeText(error?.message, 'unknown-error', 240),
        httpStatus: Number.isFinite(Number(error?.httpStatus)) ? Number(error.httpStatus) : ''
      },
      content: buildEditorBotResponseCaptureContent({
        rawResponseBody: error?.responseText,
        bodyPreview: error?.bodyPreview
      })
    });

    const errorSummary = summarizeEditorBotError(error);
    error.editorBotDiagnostic = {
      attempt: attemptLabel,
      elapsedMs: Date.now() - startedAt,
      success: false,
      stage: 'model',
      error: errorSummary.message,
      rawPreview: buildEditorBotDiagnosticPreview(`model: ${modelName}`)
    };
    await logEditorAiEvent('ERROR', 'model request failed', {
      requestId,
      phase,
      attempt: attemptLabel,
      elapsedMs: error.editorBotDiagnostic.elapsedMs,
      model: sanitizeText(modelName, DEFAULT_EDITOR_BOT_OLLAMA_MODEL, 120),
      baseUrl: sanitizeEditorBotBaseUrlForLog(baseUrl),
      timeoutMs,
      httpStatus: errorSummary.httpStatus,
      error: errorSummary.message,
      errorCode: errorSummary.code,
      bodyPreview: errorSummary.bodyPreview,
      noThinkEnabled: thinkingSuppression.enabled,
      noThinkStrategy: thinkingSuppression.strategy
    });
    throw error;
  }
}

async function requestEditorBotReviewVariant({
  safeRuleset,
  compiler,
  metrics,
  schema,
  modelName,
  baseUrl,
  timeoutMs,
  lean = false,
  requestId = ''
} = {}) {
  const systemPrompt = buildEditorBotSystemPrompt();
  const humanPrompt = JSON.stringify(buildEditorBotPromptPayload({
    ...safeRuleset,
    compiler,
    metrics,
    lean
  }));
  const diagnostics = [];

  try {
    const primaryResult = await requestEditorBotAttempt({
      schema,
      systemPrompt,
      humanPrompt,
      modelName,
      baseUrl,
      timeoutMs,
      attemptLabel: lean ? 'lean-main' : 'full-main',
      numPredict: resolveEditorBotJudgeNumPredict({ modelName, baseUrl }),
      jsonMode: isCloudEditorBotTarget({ modelName, baseUrl }),
      requestId,
      phase: 'judge'
    });
    diagnostics.push(primaryResult.diagnostic);

    if (primaryResult.success) {
      return {
        success: true,
        data: primaryResult.data,
        retryAttempted: false,
        diagnostics
      };
    }

    if (
      primaryResult.error === 'empty_response_with_thinking_length'
      && isCloudEditorBotTarget({ modelName, baseUrl })
    ) {
      await logEditorAiEvent('WARN', 'judge request triggering focused retry', {
        requestId,
        retryAttempt: 'empty-response-thinking-retry',
        numPredict: resolveEditorBotJudgeNumPredict({ modelName, baseUrl, retry: true }),
        previousDoneReason: primaryResult.diagnostic?.responseMeta?.doneReason,
        previousEvalCount: primaryResult.diagnostic?.responseMeta?.evalCount,
        responseEmpty: true,
        thinkingDetected: true,
        empty_response_with_thinking: true
      });

      const retryResult = await requestEditorBotAttempt({
        schema,
        systemPrompt: buildEditorBotRetrySystemPrompt(),
        humanPrompt: JSON.stringify(buildEditorBotFocusedRetryPayload({
          ...safeRuleset,
          compiler,
          metrics
        })),
        modelName,
        baseUrl,
        timeoutMs,
        attemptLabel: 'empty-response-thinking-retry',
        numPredict: resolveEditorBotJudgeNumPredict({ modelName, baseUrl, retry: true }),
        jsonMode: true,
        requestId,
        phase: 'judge-retry'
      });
      diagnostics.push(retryResult.diagnostic);

      if (retryResult.success) {
        return {
          success: true,
          data: retryResult.data,
          retryAttempted: true,
          diagnostics
        };
      }

      return {
        success: false,
        error: retryResult.error || primaryResult.error || 'invalid-structured-output',
        stage: retryResult.stage || primaryResult.stage || 'validation',
        rawText: retryResult.rawText || primaryResult.rawText || '',
        rawPreview: retryResult.rawPreview || primaryResult.rawPreview || '',
        retryAttempted: true,
        diagnostics
      };
    }

    return {
      success: false,
      error: primaryResult.error || 'invalid-structured-output',
      stage: primaryResult.stage || 'validation',
      rawText: primaryResult.rawText || '',
      rawPreview: primaryResult.rawPreview || '',
      retryAttempted: false,
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

async function requestEditorBotRepairVariant({
  malformedOutput = '',
  schema,
  modelName,
  baseUrl,
  timeoutMs,
  requestId = ''
} = {}) {
  const truncatedMalformedOutput = sanitizeText(malformedOutput, '', 3600);
  if (!truncatedMalformedOutput) {
    return {
      success: false,
      error: 'empty-malformed-output',
      stage: 'repair',
      diagnostics: []
    };
  }

  const systemPrompt = buildEditorBotRepairPrompt();
  const humanPrompt = JSON.stringify({
    malformedOutput: truncatedMalformedOutput,
    instructions: [
      'Convert this into the exact schema.',
      'Normalize near-miss field names.',
      'Return only one JSON object.'
    ]
  });
  const diagnostics = [];

  try {
    const repairResult = await requestEditorBotAttempt({
      schema,
      systemPrompt,
      humanPrompt,
      modelName,
      baseUrl,
      timeoutMs,
      attemptLabel: 'repair-json',
      numPredict: resolveEditorBotJudgeNumPredict({ modelName, baseUrl, repair: true }),
      jsonMode: isCloudEditorBotTarget({ modelName, baseUrl }),
      requestId,
      phase: 'repair'
    });
    diagnostics.push(repairResult.diagnostic);

    if (repairResult.success) {
      return {
        success: true,
        data: repairResult.data,
        diagnostics
      };
    }

    return {
      success: false,
      error: repairResult.error || 'invalid-structured-output',
      stage: repairResult.stage || 'repair',
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

function buildWarmupAttempts() {
  return [
    {
      attemptLabel: 'warmup-json-no-think',
      prompt: `${EDITOR_BOT_NO_THINK_PREFIX} Return exactly this JSON and nothing else: {"ok":true}`,
      validation: 'json-ok'
    },
    {
      attemptLabel: 'warmup-plain-ok',
      prompt: `${EDITOR_BOT_NO_THINK_PREFIX} Reply with exactly OK`,
      validation: 'plain-ok'
    }
  ];
}

function parseEditorBotWarmupEnvelope(rawText) {
  const parsedEnvelope = parseJsonEnvelope(rawText);
  if (!parsedEnvelope || typeof parsedEnvelope !== 'object') {
    return {
      envelope: null,
      responseText: '',
      thinkingText: '',
      doneReason: '',
      totalDuration: 0
    };
  }

  return {
    envelope: parsedEnvelope,
    responseText: sanitizeText(parsedEnvelope.response, '', 240),
    thinkingText: sanitizeText(parsedEnvelope.thinking, '', 240),
    doneReason: sanitizeText(parsedEnvelope.done_reason, '', 80),
    totalDuration: Math.max(0, Number(parsedEnvelope.total_duration) || 0),
    evalCount: Math.max(0, Number(parsedEnvelope.eval_count || 0) || 0)
  };
}

function validateEditorBotWarmupResponse(responseText, validationMode) {
  if (validationMode === 'plain-ok') {
    return sanitizeText(responseText, '', 16).toUpperCase() === 'OK';
  }

  const parsedJson = parseJsonEnvelope(responseText);
  return parsedJson?.ok === true;
}

async function requestEditorBotWarmupAttempt({
  requestId,
  modelName,
  baseUrl,
  timeoutMs,
  attemptLabel,
  prompt,
  validation
} = {}) {
  const startedAt = Date.now();
  await logEditorAiEvent('INFO', 'warmup model request started', {
    requestId,
    attempt: attemptLabel,
    model: sanitizeText(modelName, DEFAULT_EDITOR_BOT_OLLAMA_MODEL, 120),
    baseUrl: sanitizeEditorBotBaseUrlForLog(baseUrl),
    timeoutMs,
    numPredict: EDITOR_BOT_WARMUP_NUM_PREDICT,
    validation,
    noThinkAttempted: true
  });

  const errorMessage = `Editor Bot warmup timed out after ${timeoutMs}ms`;

  try {
    const { response, clearTimeout } = await postJsonWithTimeout(
      buildEditorBotGenerateUrl(baseUrl),
      {
        model: sanitizeText(modelName, DEFAULT_EDITOR_BOT_OLLAMA_MODEL, 120),
        prompt,
        stream: false,
        keep_alive: EDITOR_BOT_KEEP_ALIVE,
        options: {
          temperature: 0,
          num_predict: EDITOR_BOT_WARMUP_NUM_PREDICT,
          num_ctx: 512
        }
      },
      timeoutMs,
      errorMessage
    );
    const responseText = await readEditorBotHttpResponseBody(response);
    clearTimeout?.();
    const parsedEnvelope = parseEditorBotWarmupEnvelope(responseText);

    await appendEditorBotResponseCapture({
      title: 'editor bot warmup response',
      fields: {
        requestId,
        attempt: attemptLabel,
        model: sanitizeText(modelName, DEFAULT_EDITOR_BOT_OLLAMA_MODEL, 120),
        baseUrl: sanitizeEditorBotBaseUrlForLog(baseUrl),
        validation,
        httpStatus: response.status,
        ok: response.ok,
        doneReason: parsedEnvelope.doneReason
      },
      content: buildEditorBotResponseCaptureContent({
        rawResponseBody: responseText,
        responseText: parsedEnvelope.responseText,
        thinkingText: parsedEnvelope.thinkingText
      })
    });

    if (!response.ok) {
      const error = new Error(`Editor Bot warmup HTTP ${response.status}`);
      error.httpStatus = response.status;
      error.responseText = responseText;
      error.bodyPreview = buildEditorBotDiagnosticPreview(responseText);
      throw error;
    }

    const valid = validateEditorBotWarmupResponse(parsedEnvelope.responseText, validation);

    if (!valid) {
      const error = new Error('Editor Bot warm-up returned invalid-structured-output');
      error.code = 'invalid-structured-output';
      error.bodyPreview = buildEditorBotDiagnosticPreview(
        [parsedEnvelope.responseText, parsedEnvelope.doneReason && `doneReason=${parsedEnvelope.doneReason}`]
          .filter(Boolean)
          .join(' | ')
      );
      error.thinkingDetected = Boolean(parsedEnvelope.thinkingText);
      error.responseEmpty = !parsedEnvelope.responseText;
      throw error;
    }

    const elapsedMs = Date.now() - startedAt;
    await logEditorAiEvent('INFO', 'warmup model request completed', {
      requestId,
      attempt: attemptLabel,
      elapsedMs,
      validation,
      success: true,
      responseLength: parsedEnvelope.responseText.length,
      thinkingDetected: Boolean(parsedEnvelope.thinkingText),
      responseEmpty: !parsedEnvelope.responseText,
      empty_response_with_thinking: !parsedEnvelope.responseText && Boolean(parsedEnvelope.thinkingText),
      doneReason: parsedEnvelope.doneReason,
      evalCount: parsedEnvelope.evalCount
    });

    return {
      success: true,
      attempt: attemptLabel,
      elapsedMs,
      thinkingDetected: Boolean(parsedEnvelope.thinkingText),
      doneReason: parsedEnvelope.doneReason
    };
  } catch (error) {
    const errorSummary = summarizeEditorBotError(error);
    await logEditorAiEvent('WARN', 'warmup model request failed', {
      requestId,
      attempt: attemptLabel,
      elapsedMs: Date.now() - startedAt,
      validation,
      httpStatus: errorSummary.httpStatus,
      error: errorSummary.message,
      errorCode: errorSummary.code,
      responseEmpty: error?.responseEmpty === true,
      thinkingDetected: error?.thinkingDetected === true,
      empty_response_with_thinking: error?.responseEmpty === true && error?.thinkingDetected === true,
      bodyPreview: errorSummary.bodyPreview
    });
    throw error;
  }
}

async function warmEditorBotModel({
  modelName = DEFAULT_EDITOR_BOT_OLLAMA_MODEL,
  baseUrl = DEFAULT_EDITOR_BOT_OLLAMA_BASE_URL,
  timeoutMs = EDITOR_BOT_MODEL_WARMUP_TIMEOUT_MS
} = {}) {
  const startedAt = Date.now();
  await ensureEditorAiLoggingInitialized();
  const cacheKey = getEditorBotWarmModelCacheKey(modelName, baseUrl);
  const warmedAt = warmedEditorBotModels.get(cacheKey);
  const requestId = createEditorBotRequestId('warmup');

  if (warmedAt && (Date.now() - warmedAt) < EDITOR_BOT_MODEL_WARM_CACHE_MS) {
    await logEditorAiEvent('INFO', 'warmup cache hit', {
      requestId,
      model: sanitizeText(modelName, DEFAULT_EDITOR_BOT_OLLAMA_MODEL, 120),
      baseUrl: sanitizeEditorBotBaseUrlForLog(baseUrl),
      cacheAgeMs: Date.now() - warmedAt
    });
    return {
      attempt: 'model-warmup',
      elapsedMs: 0,
      success: true,
      stage: 'cached',
      error: '',
      rawPreview: buildEditorBotDiagnosticPreview(`model: ${modelName}`),
      requestId
    };
  }

  try {
    await logEditorAiEvent('INFO', 'warmup started', {
      requestId,
      purpose: 'connectivity-and-basic-response-check',
      modelName,
      baseUrl: sanitizeEditorBotBaseUrlForLog(baseUrl),
      timeoutMs,
      cloudEnabled: isCloudEditorBotTarget({ modelName, baseUrl }),
      nonFatal: true
    });
    let result = null;
    let lastError = null;

    for (const attempt of buildWarmupAttempts()) {
      try {
        result = await requestEditorBotWarmupAttempt({
          requestId,
          modelName,
          baseUrl,
          timeoutMs,
          ...attempt
        });
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!result?.success) {
      throw lastError || new Error('Editor Bot warm-up returned invalid output');
    }

    warmedEditorBotModels.set(cacheKey, Date.now());
    await logEditorAiEvent('INFO', 'warmup succeeded', {
      requestId,
      model: sanitizeText(modelName, DEFAULT_EDITOR_BOT_OLLAMA_MODEL, 120),
      baseUrl: sanitizeEditorBotBaseUrlForLog(baseUrl),
      elapsedMs: Date.now() - startedAt,
      winningAttempt: result.attempt,
      thinkingDetected: result.thinkingDetected,
      doneReason: result.doneReason
    });

    return {
      attempt: 'model-warmup',
      elapsedMs: Date.now() - startedAt,
      success: true,
      stage: 'complete',
      error: '',
      rawPreview: buildEditorBotDiagnosticPreview(`model: ${modelName}`),
      requestId
    };
  } catch (error) {
    const errorSummary = summarizeEditorBotError(error);
    await logEditorAiEvent('ERROR', 'warmup failed', {
      requestId,
      model: sanitizeText(modelName, DEFAULT_EDITOR_BOT_OLLAMA_MODEL, 120),
      baseUrl: sanitizeEditorBotBaseUrlForLog(baseUrl),
      elapsedMs: Date.now() - startedAt,
      httpStatus: errorSummary.httpStatus,
      error: errorSummary.message,
      errorCode: errorSummary.code,
      bodyPreview: errorSummary.bodyPreview,
      nonFatal: true
    });
    error.editorBotDiagnostic = {
      attempt: 'model-warmup',
      elapsedMs: Date.now() - startedAt,
      success: false,
      stage: 'warmup',
      error: sanitizeText(error.message, 'unavailable', 220),
      rawPreview: buildEditorBotDiagnosticPreview(`model: ${modelName}`),
      requestId
    };
    throw error;
  }
}

async function warmEditorBotOnStartup({
  baseUrl = DEFAULT_EDITOR_BOT_OLLAMA_BASE_URL,
  timeoutMs = EDITOR_BOT_MODEL_WARMUP_TIMEOUT_MS
} = {}) {
  await ensureEditorAiLoggingInitialized();
  await logEditorAiEvent('INFO', 'startup configuration loaded', {
    model: sanitizeText(DEFAULT_EDITOR_BOT_FULL_OLLAMA_MODEL, DEFAULT_EDITOR_BOT_OLLAMA_MODEL, 120),
    baseUrl: sanitizeEditorBotBaseUrlForLog(baseUrl),
    timeoutMs,
    cloudEnabled: isCloudEditorBotTarget({
      modelName: DEFAULT_EDITOR_BOT_FULL_OLLAMA_MODEL,
      baseUrl
    }),
    fallbackEnabled: true
  });
  const requestedModels = [
    sanitizeText(DEFAULT_EDITOR_BOT_FULL_OLLAMA_MODEL, '', 120)
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
      explanation: sanitizeEditorBotCategoryExplanation(
        rawCategory.explanation,
        entry,
        fallbackCategory.explanation,
        220
      )
    };
    return acc;
  }, {});
  const categoryAverage = CATEGORY_KEYS
    .map((key) => categories[key].score)
    .reduce((sum, score) => sum + score, 0) / CATEGORY_KEYS.length;

  return {
    overallScore: clampEditorBotScore(categoryAverage, categoryAverage),
    representativeEmoji: sanitizeRepresentativeEmoji(safeReview.representativeEmoji, categoryAverage),
    categories,
    categoryRatings: categories,
    rulesetSummary: sanitizeNarrativeText(safeReview.rulesetSummary, fallbackReview.rulesetSummary, 320),
    constructiveReview: sanitizeNarrativeText(safeReview.constructiveReview, fallbackReview.constructiveReview, 360),
    recommendations: sanitizeTextList(safeReview.recommendations, fallbackReview.recommendations, 160, 4),
    warnings: sanitizeTextList(safeReview.warnings, fallbackReview.warnings, 180, 4),
    reviewSource: safeReview.reviewSource === 'cloud'
      ? 'cloud'
      : safeReview.reviewSource === 'cloud-repaired'
        ? 'cloud-repaired'
      : safeReview.reviewSource === 'cached'
        ? 'cached'
      : safeReview.reviewSource === 'error'
        ? 'error'
      : safeReview.reviewSource === 'fallback'
      ? 'fallback'
      : safeReview.reviewSource === 'hybrid'
        ? 'hybrid'
      : safeReview.reviewSource === 'heuristic'
        ? 'heuristic'
        : fallbackReview.reviewSource === 'fallback'
          ? 'fallback'
          : 'cloud',
    requestId: sanitizeText(safeReview.requestId, '', 40),
    rulesetHash: sanitizeText(safeReview.rulesetHash, '', 40),
    usedFallback: safeReview.usedFallback === true,
    usedCache: safeReview.usedCache === true,
    errorCode: sanitizeText(safeReview.errorCode, '', 80),
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
    representativeEmoji: sanitizeRepresentativeEmoji(baseReview.representativeEmoji, overallScore),
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
  timeoutMs = EDITOR_BOT_TIMEOUT_MS,
  rulesetHashOverride = ''
} = {}) {
  await ensureEditorAiLoggingInitialized();
  const requestId = createEditorBotRequestId();
  const reviewStartedAt = Date.now();
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
  const sourceHash = buildRulesetSourceHash(safeRuleset.code);
  const rulesetHash = sanitizeText(rulesetHashOverride, '', 40) || buildRulesetJudgeHash({
    ruleset: safeRuleset,
    compiler
  });
  const judgeThinkingSuppression = buildEditorBotThinkingSuppressionConfig({ modelName, baseUrl });
  await logEditorAiEvent('INFO', 'judge request started', {
    requestId,
    ruleset: safeRuleset.title,
    shortName: safeRuleset.shortName,
    type: safeRuleset.type,
    sourceLength: safeRuleset.code.length,
    sourceHash,
    sourcePreview: buildSafeRulesetPreviewForLog(safeRuleset.code),
    compilerStatus: sanitizeText(compiler?.status, 'compiled', 40),
    compilerMessage: sanitizeText(compiler?.message, 'Ruleset compiled successfully.', 140),
    model: sanitizeText(modelName, DEFAULT_EDITOR_BOT_OLLAMA_MODEL, 120),
    baseUrl: sanitizeEditorBotBaseUrlForLog(baseUrl),
    timeoutMs,
    rulesetHash,
    numPredict: resolveEditorBotJudgeNumPredict({ modelName, baseUrl }),
    noThinkEnabled: judgeThinkingSuppression.enabled,
    noThinkStrategy: judgeThinkingSuppression.strategy
  });

  try {
    try {
      const warmupDiagnostic = await warmEditorBotModel({
        modelName,
        baseUrl,
        timeoutMs: Math.min(timeoutMs + 2500, EDITOR_BOT_MODEL_WARMUP_TIMEOUT_MS)
      });
      diagnostics.push(warmupDiagnostic);
      await logEditorAiEvent('INFO', 'judge warmup completed', {
        requestId,
        warmupRequestId: sanitizeText(warmupDiagnostic.requestId, '', 40),
        success: warmupDiagnostic.success === true,
        stage: sanitizeText(warmupDiagnostic.stage, '', 40),
        elapsedMs: warmupDiagnostic.elapsedMs
      });
    } catch (error) {
      if (error.editorBotDiagnostic) {
        diagnostics.push(error.editorBotDiagnostic);
        await logEditorAiEvent('WARN', 'judge warmup failed but request will continue', {
          requestId,
          warmupRequestId: sanitizeText(error.editorBotDiagnostic.requestId, '', 40),
          error: sanitizeText(error.editorBotDiagnostic.error, 'unavailable', 220),
          elapsedMs: error.editorBotDiagnostic.elapsedMs
        });
      }
    }

    const { z } = await loadEditorBotRuntime();
    const reviewSchema = buildReviewSchema(z);
    let lastError = null;

    const primaryReviewResponse = await requestEditorBotReviewVariant({
      safeRuleset,
      compiler,
      metrics,
      schema: reviewSchema,
      modelName,
      baseUrl,
      timeoutMs,
      lean: !isCloudEditorBotTarget({ modelName, baseUrl }),
      requestId
    }).catch((error) => {
      if (Array.isArray(error.editorBotDiagnostics)) {
        diagnostics.push(...error.editorBotDiagnostics);
      } else if (error.editorBotDiagnostic) {
        diagnostics.push(error.editorBotDiagnostic);
      }

      lastError = error;
      return null;
    });

    if (primaryReviewResponse) {
      diagnostics.push(...(primaryReviewResponse.diagnostics || []));

      if (primaryReviewResponse.success) {
        const sanitizedReview = sanitizeEditorBotReview({
          ...primaryReviewResponse.data,
          reviewSource: 'cloud',
          requestId,
          rulesetHash,
          usedFallback: false,
          usedCache: false,
          errorCode: '',
          diagnostics: dedupeEditorBotDiagnostics(diagnostics)
        }, heuristicReview);
        await logEditorAiEvent('INFO', 'judge request completed', {
          requestId,
          rulesetHash,
          elapsedMs: Date.now() - reviewStartedAt,
          overallScore: sanitizedReview.overallScore,
          resultSource: sanitizedReview.reviewSource,
          usedFallback: false,
          usedCache: false,
          validation: 'success'
        });
        return sanitizedReview;
      }

      lastError = new Error(
        primaryReviewResponse.error === 'empty_response_with_thinking_length'
          ? 'Editor Bot used its output budget on thinking and returned no final JSON.'
          : primaryReviewResponse.error === 'empty-response'
            ? 'Editor Bot returned an empty final response.'
          : primaryReviewResponse.error === 'invalid-structured-output'
            ? 'Editor Bot returned malformed structured output.'
            : 'Editor Bot could not finish the review.'
      );
      lastError.code = primaryReviewResponse.error || 'invalid-structured-output';
      const malformedOutput = sanitizeText(primaryReviewResponse.rawText, '', 3600);
      if (malformedOutput) {
        await logEditorAiEvent('WARN', 'judge request attempting repair pass', {
          requestId,
          rulesetHash,
          rawPreview: sanitizeText(primaryReviewResponse.rawPreview, '', 260),
          malformedLength: malformedOutput.length,
          repairAttempt: 'repair-json'
        });
        const repairedReviewResponse = await requestEditorBotRepairVariant({
          malformedOutput,
          schema: reviewSchema,
          modelName,
          baseUrl,
          timeoutMs: Math.max(3000, Math.min(10000, Math.round(timeoutMs * 0.2))),
          requestId
        }).catch((error) => {
          if (Array.isArray(error.editorBotDiagnostics)) {
            diagnostics.push(...error.editorBotDiagnostics);
          } else if (error.editorBotDiagnostic) {
            diagnostics.push(error.editorBotDiagnostic);
          }

          lastError = error;
          return null;
        });

        if (repairedReviewResponse) {
          diagnostics.push(...(repairedReviewResponse.diagnostics || []));

          if (repairedReviewResponse.success) {
            const sanitizedReview = sanitizeEditorBotReview({
              ...repairedReviewResponse.data,
              reviewSource: 'cloud-repaired',
              requestId,
              rulesetHash,
              usedFallback: false,
              usedCache: false,
              errorCode: '',
              diagnostics: dedupeEditorBotDiagnostics(diagnostics)
            }, heuristicReview);
            await logEditorAiEvent('INFO', 'judge request completed', {
              requestId,
              rulesetHash,
              elapsedMs: Date.now() - reviewStartedAt,
              overallScore: sanitizedReview.overallScore,
              resultSource: sanitizedReview.reviewSource,
              usedFallback: false,
              usedCache: false,
              validation: 'repair-success'
            });
            return sanitizedReview;
          }

          lastError = new Error(
            repairedReviewResponse.error === 'invalid-structured-output'
              ? 'Editor Bot returned malformed structured output.'
              : 'Editor Bot could not finish the review.'
          );
          lastError.code = repairedReviewResponse.error || 'invalid-structured-output';
        }
      }
    }

    if (lastError) {
      lastError.editorBotDiagnostics = diagnostics;
      throw lastError;
    }

    const error = new Error('Editor Bot could not finish the review.');
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
    fallbackReview.requestId = requestId;
    fallbackReview.rulesetHash = rulesetHash;
    fallbackReview.usedFallback = true;
    fallbackReview.usedCache = false;
    fallbackReview.errorCode = sanitizeText(error?.code, 'editor-bot-unavailable', 80);
    const errorSummary = summarizeEditorBotError(error);
    await logEditorAiEvent('WARN', 'judge request fell back to local review', {
      requestId,
      rulesetHash,
      elapsedMs: Date.now() - reviewStartedAt,
      error: errorSummary.message,
      errorCode: errorSummary.code,
      httpStatus: errorSummary.httpStatus,
      bodyPreview: errorSummary.bodyPreview,
      resultSource: fallbackReview.reviewSource,
      usedFallback: true,
      usedCache: false,
      overallScore: fallbackReview.overallScore
    });
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
  warmEditorBotModel,
  warmEditorBotOnStartup
};

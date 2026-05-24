const crypto = require('crypto');

const {
  DEFAULT_ACCOUNT_ELO,
  getRankTierForElo,
  normalizeEloValue
} = require('./elo');

const DEFAULT_BOT_OLLAMA_MODEL = process.env.RENTZ_BOT_OLLAMA_MODEL || 'llama3.1:8b';
const DEFAULT_BOT_OLLAMA_BASE_URL = process.env.RENTZ_BOT_OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const BOT_ACTION_DELAY_MS = Math.max(150, Number(process.env.RENTZ_BOT_ACTION_DELAY_MS || 900));
const BOT_DECISION_TIMEOUT_MS = Math.max(1000, Number(process.env.RENTZ_BOT_DECISION_TIMEOUT_MS || 6000));
const TRAINER_COMMENT_TIMEOUT_MS = Math.max(800, Number(process.env.RENTZ_TRAINER_COMMENT_TIMEOUT_MS || 1600));
const TRAINER_FEEDBACK_TIMEOUT_MS = Math.max(1000, Number(process.env.RENTZ_TRAINER_FEEDBACK_TIMEOUT_MS || 2400));
const ABANDONMENT_TIMEOUT_MS = Math.max(5000, Number(process.env.RENTZ_ABANDONMENT_TIMEOUT_MS || 120000));
const DEFAULT_AUTO_BOT_REPLACEMENT_ENABLED = process.env.RENTZ_AUTO_BOT_REPLACEMENT === 'false'
  ? false
  : true;
const DEFAULT_BOT_AVATAR_URL = '/media/defaults/default-bot-profile.svg';
const BOT_TYPE_STANDARD = 'standard';
const BOT_TYPE_TRAINER = 'trainer';
const BOT_NAME_POOL = Object.freeze([
  'Dealer Bot',
  'Table Bot',
  'Trick Bot',
  'Rentz Bot',
  'Atlas Bot',
  'Echo Bot'
]);
const FALLBACK_RULESET_OBJECTIVES = Object.freeze({
  kingOfHearts: 'Avoid taking the king of hearts if you can.',
  diamonds: 'Avoid taking diamonds if you can.',
  queens: 'Avoid taking queens if you can.',
  tenOfClubs: 'Avoid ending up with the ten of clubs if you can.',
  whist: 'Win tricks when that helps your score.',
  levate: 'Take tricks carefully and avoid giving away easy points.',
  totalPlus: 'Maximize positive score swings.',
  totalMinus: 'Minimize penalties and keep score losses small.'
});
const CARD_VALUE_ORDER = Object.freeze(['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']);
const SUIT_ORDER = Object.freeze(['C', 'D', 'S', 'H']);
const MISTAKE_CHANCE_BY_TIER = Object.freeze({
  'starting-out-rentz-rookie': 0.42,
  'devoted-rentz-player': 0.24,
  'practising-rentz-expert': 0.12,
  'grand-rentz-master': 0.06,
  'divine-rentz-envoy': 0.03,
  'ennead-of-rentz-member': 0.02,
  'ancestral-rentz-god': 0.01
});
const SUIT_NAME_TO_KEY = Object.freeze({
  c: 'C',
  clubs: 'C',
  club: 'C',
  d: 'D',
  diamonds: 'D',
  diamond: 'D',
  s: 'S',
  spades: 'S',
  spade: 'S',
  h: 'H',
  hearts: 'H',
  heart: 'H'
});
const BOT_KEEP_ALIVE = process.env.RENTZ_BOT_KEEP_ALIVE || '10m';
const BOT_WARMUP_TIMEOUT_MS = Math.max(1200, Number(process.env.RENTZ_BOT_MODEL_WARMUP_TIMEOUT_MS || 5000));
const BOT_WARM_CACHE_MS = Math.max(60000, Number(process.env.RENTZ_BOT_MODEL_WARM_CACHE_MS || 480000));
const LOG_BOT_AI_DEBUG = process.env.LOG_BOT_AI_DEBUG === 'true' || process.env.DEBUG_BOT_AI === 'true';

let cachedLangChainRuntime = null;
const warmedLocalBotModels = new Map();
const warmingLocalBotModels = new Map();
const localModelRequestQueues = new Map();
let localModelRequestSequence = 0;

function readFirstBotEnv(keys = [], fallback = '') {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return fallback;
}

function clampIntegerEnv(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return clampIntegerEnv(fallback, fallback, { min, max });
  }

  return Math.max(min, Math.min(max, Math.round(numericValue)));
}

function clampFloatEnv(value, fallback, { min = 0, max = 1 } = {}) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return clampFloatEnv(fallback, fallback, { min, max });
  }

  return Math.max(min, Math.min(max, numericValue));
}

function logGameplayRuntimeDebug(payload) {
  if (!LOG_BOT_AI_DEBUG) {
    return;
  }

  console.info('[gameplay-bot]', JSON.stringify(payload));
}

function normalizeBotMode(value, fallback, allowedModes = []) {
  const normalized = String(value || '').trim().toLowerCase();
  return allowedModes.includes(normalized) ? normalized : fallback;
}

function getGameplayBotMode() {
  return normalizeBotMode(process.env.RENTZ_GAMEPLAY_BOT_MODE, 'live', ['live', 'eval']);
}

function getTrainerBotMode() {
  const resolved = normalizeBotMode(process.env.RENTZ_TRAINER_MODE, 'fast', ['fast', 'deep', 'eval']);
  return resolved === 'eval' ? 'fast' : resolved;
}

function getGameplayBotRuntimeConfig({ mode = getGameplayBotMode() } = {}) {
  const runtimeMode = mode === 'eval' ? 'eval' : 'live';
  return {
    mode: runtimeMode,
    modelName: readFirstBotEnv([
      'OLLAMA_GAMEPLAY_MODEL',
      'RENTZ_GAMEPLAY_BOT_OLLAMA_MODEL',
      'RENTZ_BOT_OLLAMA_MODEL'
    ], DEFAULT_BOT_OLLAMA_MODEL),
    baseUrl: readFirstBotEnv(['RENTZ_BOT_OLLAMA_BASE_URL'], DEFAULT_BOT_OLLAMA_BASE_URL),
    timeoutMs: clampIntegerEnv(
      readFirstBotEnv([
        runtimeMode === 'eval' ? 'RENTZ_GAMEPLAY_BOT_EVAL_TIMEOUT_MS' : 'RENTZ_GAMEPLAY_BOT_LIVE_TIMEOUT_MS',
        'RENTZ_BOT_DECISION_TIMEOUT_MS'
      ]),
      runtimeMode === 'eval' ? 120000 : 10000,
      { min: 1000, max: 240000 }
    ),
    numPredict: clampIntegerEnv(
      readFirstBotEnv([
        runtimeMode === 'eval' ? 'RENTZ_GAMEPLAY_BOT_NUM_PREDICT_EVAL' : 'RENTZ_GAMEPLAY_BOT_NUM_PREDICT_LIVE'
      ]),
      runtimeMode === 'eval' ? 160 : 48,
      { min: 16, max: 512 }
    ),
    temperature: clampFloatEnv(
      readFirstBotEnv([
        runtimeMode === 'eval' ? 'RENTZ_GAMEPLAY_BOT_TEMPERATURE_EVAL' : 'RENTZ_GAMEPLAY_BOT_TEMPERATURE_LIVE'
      ]),
      runtimeMode === 'eval' ? 0.2 : 0.1,
      { min: 0, max: 1 }
    ),
    topP: runtimeMode === 'eval' ? 0.9 : 0.78,
    keepAlive: BOT_KEEP_ALIVE,
    includeReason: runtimeMode === 'eval'
  };
}

function getTrainerRuntimeConfig({ mode = getTrainerBotMode(), stage = 'after_move' } = {}) {
  const runtimeMode = mode === 'deep' ? 'deep' : 'fast';
  const isFinalReview = stage === 'final_review';
  const isBeforeMove = stage === 'before_move';
  const isAfterMove = stage === 'after_move';
  const stageTimeoutFallback = isFinalReview
    ? (runtimeMode === 'deep' ? 90000 : 45000)
    : isBeforeMove
      ? Math.max(4000, TRAINER_COMMENT_TIMEOUT_MS, 6000)
      : Math.max(4000, TRAINER_FEEDBACK_TIMEOUT_MS, 8000);
  const fastNumPredictFallback = isBeforeMove
    ? 48
    : isFinalReview
      ? 180
      : 48;

  return {
    mode: runtimeMode,
    modelName: readFirstBotEnv([
      isFinalReview
        ? 'OLLAMA_TRAINER_FINAL_MODEL'
        : runtimeMode === 'deep'
          ? 'OLLAMA_TRAINER_EVAL_MODEL'
          : 'OLLAMA_TRAINER_FAST_MODEL',
      runtimeMode === 'deep' ? 'OLLAMA_TRAINER_EVAL_MODEL' : 'OLLAMA_TRAINER_FAST_MODEL',
      'OLLAMA_TRAINER_MODEL',
      'RENTZ_TRAINER_OLLAMA_MODEL',
      'RENTZ_BOT_OLLAMA_MODEL'
    ], DEFAULT_BOT_OLLAMA_MODEL),
    baseUrl: readFirstBotEnv(['RENTZ_BOT_OLLAMA_BASE_URL'], DEFAULT_BOT_OLLAMA_BASE_URL),
    timeoutMs: clampIntegerEnv(
      readFirstBotEnv([
        isFinalReview ? 'RENTZ_TRAINER_FINAL_TIMEOUT_MS' : '',
        isFinalReview ? 'RENTZ_TRAINER_FINAL_REVIEW_TIMEOUT_MS' : '',
        runtimeMode === 'deep' ? 'RENTZ_TRAINER_EVAL_TIMEOUT_MS' : 'RENTZ_TRAINER_FAST_TIMEOUT_MS',
        isBeforeMove
          ? 'RENTZ_TRAINER_COMMENT_TIMEOUT_MS'
          : isAfterMove
            ? 'RENTZ_TRAINER_FEEDBACK_TIMEOUT_MS'
            : '',
        'RENTZ_BOT_DECISION_TIMEOUT_MS'
      ]),
      isFinalReview
        ? (runtimeMode === 'deep' ? stageTimeoutFallback : 40000)
        : runtimeMode === 'deep'
          ? 120000
          : stageTimeoutFallback,
      { min: 800, max: 240000 }
    ),
    numPredict: clampIntegerEnv(
      readFirstBotEnv([
        isFinalReview ? 'RENTZ_TRAINER_FINAL_NUM_PREDICT' : '',
        isFinalReview ? 'RENTZ_TRAINER_FINAL_REVIEW_NUM_PREDICT' : '',
        runtimeMode === 'deep' ? 'RENTZ_TRAINER_NUM_PREDICT_EVAL' : 'RENTZ_TRAINER_FAST_NUM_PREDICT',
        runtimeMode === 'deep' ? 'RENTZ_TRAINER_NUM_PREDICT_EVAL' : 'RENTZ_TRAINER_NUM_PREDICT_FAST'
      ]),
      runtimeMode === 'deep'
        ? (isFinalReview ? 420 : 500)
        : fastNumPredictFallback,
      { min: 32, max: 900 }
    ),
    temperature: clampFloatEnv(
      readFirstBotEnv([
        isFinalReview ? 'RENTZ_TRAINER_TEMPERATURE_FINAL' : '',
        runtimeMode === 'deep' ? 'RENTZ_TRAINER_TEMPERATURE_EVAL' : 'RENTZ_TRAINER_TEMPERATURE_FAST'
      ]),
      0.2,
      { min: 0, max: 1 }
    ),
    topP: runtimeMode === 'deep' ? 0.92 : 0.82,
    keepAlive: BOT_KEEP_ALIVE,
    concise: runtimeMode !== 'deep'
  };
}

function isBotPlayer(player) {
  return Boolean(player?.isBot);
}

function isTrainerBot(player) {
  return Boolean(player?.isTrainer || player?.botType === BOT_TYPE_TRAINER);
}

function parseCard(card) {
  const [value = '', suit = ''] = String(card || '').split('-');
  return { value, suit };
}

function normalizeSuitKey(suit) {
  return SUIT_NAME_TO_KEY[String(suit || '').trim().toLowerCase()] || '';
}

function getCardRankValue(card) {
  const { value } = parseCard(card);
  return CARD_VALUE_ORDER.indexOf(value);
}

function getLeadingSuit(currentTrick = [], explicitTrickSuit = null) {
  const explicitSuit = normalizeSuitKey(explicitTrickSuit);
  if (explicitSuit) {
    return explicitSuit;
  }

  const firstCard = Array.isArray(currentTrick) && currentTrick.length > 0
    ? currentTrick[0]?.card
    : '';
  return normalizeSuitKey(parseCard(firstCard).suit);
}

function getCurrentWinningPlay(currentTrick = [], explicitTrickSuit = null) {
  const leadingSuit = getLeadingSuit(currentTrick, explicitTrickSuit);
  const plays = Array.isArray(currentTrick) ? currentTrick : [];
  let winningPlay = null;

  for (const play of plays) {
    const playCard = play?.card || '';
    if (!playCard || normalizeSuitKey(parseCard(playCard).suit) !== leadingSuit) {
      continue;
    }

    if (!winningPlay || getCardRankValue(playCard) > getCardRankValue(winningPlay.card)) {
      winningPlay = play;
    }
  }

  return winningPlay;
}

function getRulesetIntentProfile(ruleset) {
  const rulesetId = String(ruleset?.id || '').trim();
  return {
    rulesetId,
    avoidsTricks: ['kingOfHearts', 'diamonds', 'queens', 'tenOfClubs', 'levate', 'totalMinus'].includes(rulesetId),
    wantsTricks: ['whist', 'totalPlus'].includes(rulesetId),
    dangerCard: rulesetId === 'kingOfHearts'
      ? 'K-hearts'
      : rulesetId === 'tenOfClubs'
        ? '10-clubs'
        : '',
    dangerSuit: rulesetId === 'diamonds' ? 'D' : '',
    dangerRank: rulesetId === 'queens' ? 'Q' : '',
    highPenalty: ['kingOfHearts', 'tenOfClubs'].includes(rulesetId)
  };
}

function getGameplayObjectiveHints(ruleset) {
  const intent = getRulesetIntentProfile(ruleset);
  const contract = intent.rulesetId || String(ruleset?.id || '').trim();
  let objective = 'improve score';

  if (contract === 'whist') {
    objective = 'take tricks';
  } else if (contract === 'levate') {
    objective = 'avoid tricks';
  } else if (contract === 'kingOfHearts') {
    objective = 'avoid king of hearts';
  } else if (contract === 'diamonds') {
    objective = 'avoid diamonds';
  } else if (contract === 'queens') {
    objective = 'avoid queens';
  } else if (contract === 'tenOfClubs') {
    objective = 'avoid ten of clubs';
  } else if (contract === 'totalPlus') {
    objective = 'maximize score';
  } else if (contract === 'totalMinus') {
    objective = 'minimize penalties';
  } else if (intent.wantsTricks) {
    objective = 'take tricks';
  } else if (intent.avoidsTricks) {
    objective = 'avoid tricks';
  }

  return {
    contract,
    objective,
    winningTrickIsGood: Boolean(intent.wantsTricks),
    avoidWinningTrick: Boolean(intent.avoidsTricks),
    dangerCard: intent.dangerCard || '',
    dangerSuit: intent.dangerSuit || '',
    dangerRank: intent.dangerRank || ''
  };
}

function compareCardsAscending(leftCard, rightCard) {
  const left = parseCard(leftCard);
  const right = parseCard(rightCard);
  const suitDiff = SUIT_ORDER.indexOf(left.suit) - SUIT_ORDER.indexOf(right.suit);
  if (suitDiff !== 0) {
    return suitDiff;
  }

  return CARD_VALUE_ORDER.indexOf(left.value) - CARD_VALUE_ORDER.indexOf(right.value);
}

function getAverageHumanElo(players = [], fallback = DEFAULT_ACCOUNT_ELO) {
  const humanElos = (Array.isArray(players) ? players : [])
    .filter((player) => !isBotPlayer(player))
    .map((player) => (typeof player?.elo === 'number' ? player.elo : null))
    .filter(Number.isFinite)
    .map((elo) => normalizeEloValue(elo, fallback));

  if (humanElos.length === 0) {
    return normalizeEloValue(fallback, DEFAULT_ACCOUNT_ELO);
  }

  const total = humanElos.reduce((sum, elo) => sum + elo, 0);
  return normalizeEloValue(Math.round(total / humanElos.length), fallback);
}

function getRulesetObjective(ruleset) {
  const ruleId = String(ruleset?.id || '').trim();
  return FALLBACK_RULESET_OBJECTIVES[ruleId]
    || `Play the ${ruleset?.label || 'selected'} ruleset in a way that improves your score.`;
}

function extractBotOrdinal(player) {
  const label = String(player?.displayName || player?.name || '').trim();
  const match = label.match(/\b(\d+)\s*$/);
  if (!match) {
    return null;
  }

  const ordinal = Number.parseInt(match[1], 10);
  return Number.isInteger(ordinal) && ordinal > 0 ? ordinal : null;
}

function getNextBotOrdinal(players = []) {
  const usedOrdinals = new Set(
    (Array.isArray(players) ? players : [])
      .filter((player) => isBotPlayer(player))
      .map((player) => extractBotOrdinal(player))
      .filter(Number.isInteger)
  );

  let nextOrdinal = 1;
  while (usedOrdinals.has(nextOrdinal)) {
    nextOrdinal += 1;
  }

  return nextOrdinal;
}

function buildBotIdentity({
  roomId,
  seatIndex,
  players = [],
  replacementFor = null,
  botType = BOT_TYPE_STANDARD,
  fixedElo = null,
  displayName = '',
  description = '',
  trainerSettings = null
} = {}) {
  const averageHumanElo = getAverageHumanElo(players);
  const trainerBot = botType === BOT_TYPE_TRAINER;
  const resolvedElo = trainerBot
    ? normalizeEloValue(fixedElo, DEFAULT_ACCOUNT_ELO)
    : averageHumanElo;
  const rankTier = getRankTierForElo(resolvedElo);
  const botOrdinal = trainerBot ? null : getNextBotOrdinal(players);
  const botNameBase = BOT_NAME_POOL[seatIndex % BOT_NAME_POOL.length] || 'Rentz Bot';
  const resolvedDisplayName = String(displayName || '').trim() || (
    trainerBot
      ? 'Trainer'
      : `${botNameBase} ${botOrdinal}`
  );
  const resolvedDescription = String(description || '').trim() || (
    trainerBot
      ? 'Training-focused Rentz AI bot.'
      : (replacementFor?.name
        ? `Computer-controlled replacement for ${replacementFor.name}.`
        : 'Computer-controlled Rentz player.')
  );
  const identityPrefix = trainerBot ? 'trainer' : 'bot';
  const socketPrefix = trainerBot ? 'trainer' : 'bot';
  const existingIds = new Set(
    (Array.isArray(players) ? players : [])
      .flatMap((player) => [player?.userId, player?.socketId])
      .filter(Boolean)
  );
  let collisionIndex = 0;
  let shortHash = '';
  let userId = '';
  let socketId = '';

  do {
    const baseSeed = `${roomId || 'room'}:${seatIndex}:${replacementFor?.userId || 'seat'}`;
    const botSeed = collisionIndex === 0
      ? baseSeed
      : `${baseSeed}:${collisionIndex}`;
    shortHash = crypto.createHash('sha1').update(botSeed).digest('hex').slice(0, 8);
    userId = `${identityPrefix}_${roomId || 'room'}_${seatIndex}_${shortHash}`;
    socketId = `${socketPrefix}:${roomId || 'room'}:${seatIndex}:${shortHash}`;
    collisionIndex += 1;
  } while (existingIds.has(userId) || existingIds.has(socketId));

  return {
    userId,
    socketId,
    name: resolvedDisplayName,
    displayName: resolvedDisplayName,
    avatarUrl: DEFAULT_BOT_AVATAR_URL,
    guest: false,
    isBot: true,
    isTrainer: trainerBot,
    botType,
    isReady: true,
    isConnected: true,
    connectionStatus: 'connected',
    elo: resolvedElo,
    rankName: rankTier.name,
    rankTierKey: rankTier.key,
    banner: '',
    description: resolvedDescription,
    accountCreatedAt: null,
    favouriteRulesets: [],
    rulesetLoadout: [],
    seatIndex: Number.isInteger(seatIndex) ? seatIndex : 0,
    averageHumanElo,
    botProvider: 'langchain-ollama',
    replacementForUserId: replacementFor?.userId || null,
    replacementForName: replacementFor?.name || null,
    replacementReason: replacementFor ? 'abandonment' : 'pregame-fill',
    trainerSettings: trainerBot && trainerSettings ? { ...trainerSettings } : null
  };
}

function createDeterministicRoll(seed) {
  const hex = crypto.createHash('sha1').update(String(seed || '')).digest('hex').slice(0, 8);
  const value = Number.parseInt(hex, 16);
  return (value % 10000) / 10000;
}

function sortLegalMovesForFallback(kind, legalMoves = []) {
  const moves = Array.isArray(legalMoves) ? [...legalMoves] : [];

  if (kind === 'play_card') {
    return moves.sort((left, right) => compareCardsAscending(left.card || left.id, right.card || right.id));
  }

  return moves.sort((left, right) => String(left.id || '').localeCompare(String(right.id || '')));
}

function chooseFallbackMove(kind, legalMoves = [], context = {}) {
  const orderedMoves = sortLegalMovesForFallback(kind, legalMoves);
  if (orderedMoves.length === 0) {
    return null;
  }

  if (kind === 'choose_nv') {
    const preferNv = Boolean(context?.botProfile?.averageHumanElo >= 2000);
    return orderedMoves.find((move) => Boolean(move.value) === preferNv) || orderedMoves[0];
  }

  return orderedMoves[0];
}

function chooseMistakeMove(kind, legalMoves = [], primaryMoveId, context = {}) {
  const orderedMoves = sortLegalMovesForFallback(kind, legalMoves);
  const alternativeMoves = orderedMoves.filter((move) => move.id !== primaryMoveId);
  if (alternativeMoves.length === 0) {
    return null;
  }

  if (kind === 'play_card') {
    return alternativeMoves[0];
  }

  if (kind === 'choose_nv') {
    return alternativeMoves.find((move) => move.id !== primaryMoveId) || alternativeMoves[0];
  }

  if (context?.botProfile?.rankTierKey === 'starting-out-rentz-rookie') {
    return alternativeMoves[alternativeMoves.length - 1];
  }

  return alternativeMoves[0];
}

function buildLocalGenerateUrl(baseUrl) {
  const normalized = String(baseUrl || '').replace(/\/+$/, '');
  if (/\/api\/generate$/i.test(normalized)) {
    return normalized;
  }
  if (/\/api$/i.test(normalized)) {
    return `${normalized}/generate`;
  }
  return `${normalized}/api/generate`;
}

function isLikelyLocalOllamaBaseUrl(baseUrl) {
  return /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(String(baseUrl || '').trim());
}

function getWarmCacheKey(modelName, baseUrl) {
  return `${String(modelName || '').trim()}::${String(baseUrl || '').trim()}`;
}

async function requestLocalModelWarmup({ modelName, baseUrl, timeoutMs = BOT_WARMUP_TIMEOUT_MS, keepAlive = BOT_KEEP_ALIVE } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  timeoutId.unref?.();

  try {
    await fetch(buildLocalGenerateUrl(baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelName,
        prompt: 'Reply with OK.',
        stream: false,
        keep_alive: keepAlive,
        options: {
          temperature: 0,
          num_predict: 8
        }
      }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function startLocalBotWarmup({ modelName, baseUrl, timeoutMs = BOT_WARMUP_TIMEOUT_MS, keepAlive = BOT_KEEP_ALIVE } = {}) {
  if (!modelName || !isLikelyLocalOllamaBaseUrl(baseUrl)) {
    return null;
  }

  const cacheKey = getWarmCacheKey(modelName, baseUrl);
  const warmedAt = warmedLocalBotModels.get(cacheKey);
  if (warmedAt && (Date.now() - warmedAt) < BOT_WARM_CACHE_MS) {
    return Promise.resolve(true);
  }

  if (warmingLocalBotModels.has(cacheKey)) {
    return warmingLocalBotModels.get(cacheKey);
  }

  const warmupPromise = requestLocalModelWarmup({
    modelName,
    baseUrl,
    timeoutMs,
    keepAlive
  })
    .then(() => {
      warmedLocalBotModels.set(cacheKey, Date.now());
      return true;
    })
    .catch(() => false)
    .finally(() => {
      warmingLocalBotModels.delete(cacheKey);
    });

  warmingLocalBotModels.set(cacheKey, warmupPromise);
  return warmupPromise;
}

function scheduleLocalBotWarmup({ modelName, baseUrl, timeoutMs = BOT_WARMUP_TIMEOUT_MS, keepAlive = BOT_KEEP_ALIVE } = {}) {
  void startLocalBotWarmup({
    modelName,
    baseUrl,
    timeoutMs,
    keepAlive
  });
}

async function warmLocalBotModel({ modelName, baseUrl, timeoutMs = BOT_WARMUP_TIMEOUT_MS, keepAlive = BOT_KEEP_ALIVE } = {}) {
  const warmupPromise = startLocalBotWarmup({
    modelName,
    baseUrl,
    timeoutMs,
    keepAlive
  });
  if (!warmupPromise) {
    return false;
  }

  return Boolean(await warmupPromise);
}

async function warmTrainerBotStage({ mode = getTrainerBotMode(), stage = 'before_move', timeoutMs = null } = {}) {
  const runtimeConfig = getTrainerRuntimeConfig({ mode, stage });
  const warmupTimeoutMs = clampIntegerEnv(
    timeoutMs,
    stage === 'final_review' ? 60000 : 45000,
    { min: 4000, max: 120000 }
  );

  return warmLocalBotModel({
    modelName: runtimeConfig.modelName,
    baseUrl: runtimeConfig.baseUrl,
    timeoutMs: warmupTimeoutMs,
    keepAlive: runtimeConfig.keepAlive
  });
}

function getLocalModelQueueState(modelName, baseUrl) {
  const cacheKey = getWarmCacheKey(modelName, baseUrl);
  if (!localModelRequestQueues.has(cacheKey)) {
    localModelRequestQueues.set(cacheKey, {
      active: null,
      queue: []
    });
  }

  return localModelRequestQueues.get(cacheKey);
}

function hasGameplayPriorityQueued(queueState) {
  if (!queueState) {
    return false;
  }

  if (queueState.active?.requestType === 'gameplay') {
    return true;
  }

  return queueState.queue.some((entry) => entry.requestType === 'gameplay');
}

function drainLocalModelQueue(modelName, baseUrl) {
  const queueState = getLocalModelQueueState(modelName, baseUrl);
  if (queueState.active || queueState.queue.length === 0) {
    return;
  }

  queueState.queue.sort((left, right) => (
    right.priority - left.priority
    || left.sequence - right.sequence
  ));
  const nextEntry = queueState.queue.shift();
  queueState.active = nextEntry;

  Promise.resolve()
    .then(() => nextEntry.run())
    .then((value) => {
      nextEntry.resolve(value);
    })
    .catch((error) => {
      nextEntry.reject(error);
    })
    .finally(() => {
      if (queueState.active === nextEntry) {
        queueState.active = null;
      }
      if (!queueState.active && queueState.queue.length === 0) {
        localModelRequestQueues.delete(getWarmCacheKey(modelName, baseUrl));
        return;
      }
      drainLocalModelQueue(modelName, baseUrl);
    });
}

async function queueLocalModelRequest({
  modelName,
  baseUrl,
  requestType = 'generic',
  priority = 0,
  skipWhenGameplayPending = false,
  run
} = {}) {
  if (!isLikelyLocalOllamaBaseUrl(baseUrl)) {
    return run();
  }

  const queueState = getLocalModelQueueState(modelName, baseUrl);
  if (skipWhenGameplayPending && hasGameplayPriorityQueued(queueState)) {
    return {
      skipped: true,
      reason: 'skipped-for-gameplay-priority'
    };
  }

  return new Promise((resolve, reject) => {
    queueState.queue.push({
      requestType,
      priority,
      run,
      resolve,
      reject,
      sequence: localModelRequestSequence += 1
    });
    drainLocalModelQueue(modelName, baseUrl);
  });
}

function describeRulesetScoringDirection(ruleset) {
  const intent = getRulesetIntentProfile(ruleset);
  if (intent.wantsTricks) {
    return 'win_tricks';
  }
  if (intent.avoidsTricks) {
    return 'avoid_tricks';
  }
  return 'mixed';
}

function buildGameplayMoveFeatures({ move, legalMoves = [], ruleset = null, currentTrick = [], trickSuit = null } = {}) {
  const intent = getRulesetIntentProfile(ruleset);
  const moveCard = move?.card || move?.id || '';
  const { value, suit } = parseCard(moveCard);
  const normalizedSuit = normalizeSuitKey(suit);
  const isLeadingMove = !Array.isArray(currentTrick) || currentTrick.length === 0;
  const leadingSuit = getLeadingSuit(currentTrick, trickSuit);
  const currentWinningPlay = getCurrentWinningPlay(currentTrick, trickSuit);
  const rankValue = Math.max(0, getCardRankValue(moveCard));
  const followsSuit = !leadingSuit || normalizedSuit === leadingSuit;
  const likelyWinsCurrentTrick = isLeadingMove
    ? Boolean(intent.wantsTricks && rankValue >= 9)
    : Boolean(
      followsSuit
      && (!currentWinningPlay || rankValue > getCardRankValue(currentWinningPlay.card))
    );
  const likelyLosesCurrentTrick = isLeadingMove
    ? Boolean(intent.avoidsTricks && rankValue <= 4)
    : !likelyWinsCurrentTrick;
  const isDangerCard = Boolean(
    (intent.dangerCard && moveCard === intent.dangerCard)
    || (intent.dangerSuit && normalizedSuit === intent.dangerSuit)
    || (intent.dangerRank && value === intent.dangerRank)
  );
  const triggersPenalty = Boolean(
    isDangerCard
    || (intent.avoidsTricks && likelyWinsCurrentTrick && Array.isArray(currentTrick) && currentTrick.length > 0)
  );
  const penaltyValue = intent.highPenalty && isDangerCard
    ? 100
    : intent.dangerSuit || intent.dangerRank
      ? 10
      : triggersPenalty
        ? 8
        : 0;
  const helpsObjective = intent.wantsTricks
    ? (isLeadingMove ? rankValue >= 9 : likelyWinsCurrentTrick)
    : (!isDangerCard && (isLeadingMove ? rankValue <= 4 : !likelyWinsCurrentTrick));
  const hurtsObjective = intent.wantsTricks
    ? (isLeadingMove ? rankValue <= 3 : likelyLosesCurrentTrick && Array.isArray(currentTrick) && currentTrick.length > 0)
    : (likelyWinsCurrentTrick && Array.isArray(currentTrick) && currentTrick.length > 0) || isDangerCard;
  const tags = [];

  if (legalMoves.length === 1) {
    tags.push('forced');
  }
  if (followsSuit) {
    tags.push('follows-suit');
  } else if (Array.isArray(currentTrick) && currentTrick.length > 0) {
    tags.push('off-suit');
  }
  if (likelyWinsCurrentTrick) {
    tags.push('wins-trick');
  }
  if (likelyLosesCurrentTrick && Array.isArray(currentTrick) && currentTrick.length > 0) {
    tags.push('loses-trick');
  }
  if (isDangerCard) {
    tags.push('danger-card');
  }
  if (triggersPenalty) {
    tags.push(penaltyValue >= 100 ? 'major-penalty' : 'penalty-risk');
  }
  if (helpsObjective) {
    tags.push('helps-objective');
  }
  if (hurtsObjective) {
    tags.push('hurts-objective');
  }
  if (intent.rulesetId === 'whist') {
    tags.push(likelyWinsCurrentTrick ? 'good-for-whist' : 'bad-for-whist');
  }
  if (intent.rulesetId === 'levate') {
    tags.push(likelyLosesCurrentTrick ? 'good-for-levate' : 'bad-for-levate');
  }
  if (!triggersPenalty && helpsObjective && !hurtsObjective) {
    tags.push('safe');
  }
  if (triggersPenalty || hurtsObjective) {
    tags.push('danger');
  }

  return {
    moveId: move?.id || '',
    card: moveCard,
    suit: normalizedSuit || suit || '',
    rank: value || '',
    rankValue,
    followsSuit,
    likelyWinsCurrentTrick,
    likelyLosesCurrentTrick,
    isDangerCard,
    triggersPenalty,
    penaltyValue,
    helpsObjective,
    hurtsObjective,
    isForced: legalMoves.length === 1,
    shortTags: tags
  };
}

function scoreGameplayMoveFeatureSet(features, ruleset) {
  const intent = getRulesetIntentProfile(ruleset);
  let score = 0;

  if (features.isForced) {
    return 0;
  }

  if (intent.wantsTricks) {
    score += features.likelyWinsCurrentTrick ? 3 : -2;
    score += features.helpsObjective ? 2 : 0;
    score -= features.isDangerCard ? 1 : 0;
  } else {
    score += features.likelyLosesCurrentTrick ? 2 : -2;
    score += features.helpsObjective ? 2 : 0;
    score -= features.triggersPenalty ? 4 : 0;
    score -= features.isDangerCard ? 3 : 0;
  }

  score -= Math.min(3, Number(features.penaltyValue || 0) / 20);
  return score;
}

function buildTrainerMoveAssessment({ playedCard, legalMoves = [], ruleset = null, currentTrickBeforeMove = [] } = {}) {
  const featureList = (Array.isArray(legalMoves) ? legalMoves : []).map((move) => buildGameplayMoveFeatures({
    move,
    legalMoves,
    ruleset,
    currentTrick: currentTrickBeforeMove
  }));
  const rankedMoves = [...featureList]
    .map((entry) => ({
      ...entry,
      objectiveScore: scoreGameplayMoveFeatureSet(entry, ruleset)
    }))
    .sort((left, right) => right.objectiveScore - left.objectiveScore);
  const selected = rankedMoves.find((entry) => entry.card === playedCard || entry.moveId === playedCard) || null;
  const bestMove = rankedMoves[0] || null;
  const bestAlternative = rankedMoves.find((entry) => entry.moveId !== selected?.moveId) || null;
  const saferAlternative = rankedMoves.find((entry) => (
    entry.moveId !== selected?.moveId
    && entry.objectiveScore > (selected?.objectiveScore ?? Number.NEGATIVE_INFINITY)
    && (!entry.isDangerCard || selected?.isDangerCard)
  )) || null;

  if (!selected) {
    return {
      ratingHintBand: { label: 'neutral', min: 5, max: 6.5 },
      selectedMoveFeatures: null,
      saferAlternativeCard: saferAlternative?.card || '',
      bestAlternativeCard: bestAlternative?.card || '',
      objectiveImpact: 'unclear'
    };
  }

  let ratingHintBand = { label: 'neutral', min: 5, max: 6.5 };
  if (selected.isForced) {
    ratingHintBand = { label: 'forced', min: 6.5, max: 8 };
  } else if ((selected.isDangerCard || selected.triggersPenalty) && saferAlternative) {
    ratingHintBand = selected.penaltyValue >= 100
      ? { label: 'severe_mistake', min: 0, max: 3 }
      : { label: 'bad', min: 3, max: 5 };
  } else if (selected.hurtsObjective && saferAlternative) {
    ratingHintBand = { label: 'bad', min: 3.5, max: 5.5 };
  } else if (selected.helpsObjective && !selected.hurtsObjective && bestMove?.moveId === selected.moveId) {
    ratingHintBand = { label: 'excellent', min: 8.5, max: 10 };
  } else if (selected.helpsObjective && !selected.hurtsObjective) {
    ratingHintBand = { label: 'good', min: 7, max: 8.5 };
  }

  return {
    ratingHintBand,
    selectedMoveFeatures: selected,
    selectedIsBestMove: bestMove?.moveId === selected.moveId,
    saferAlternativeCard: saferAlternative?.card || '',
    bestAlternativeCard: bestAlternative?.card || '',
    objectiveImpact: selected.helpsObjective && !selected.hurtsObjective
      ? 'helps'
      : selected.hurtsObjective
        ? 'hurts'
        : 'neutral'
  };
}

function buildTrainerAfterMoveFacts({
  playedCard,
  legalMoves = [],
  ruleset = null,
  currentTrickBeforeMove = []
} = {}) {
  const assessment = buildTrainerMoveAssessment({
    playedCard,
    legalMoves,
    ruleset,
    currentTrickBeforeMove
  });
  const selected = assessment.selectedMoveFeatures;
  const objective = getRulesetObjective(ruleset).replace(/\.$/, '');
  const rating = clampTrainerRating((assessment.ratingHintBand.min + assessment.ratingHintBand.max) / 2);
  const alternative = assessment.saferAlternativeCard || assessment.bestAlternativeCard || '';

  if (!selected) {
    return {
      rating,
      tone: 'neutral',
      objective,
      issue: 'kept the position unclear',
      alternative,
      shouldComment: false
    };
  }

  let tone = 'neutral';
  let issue = 'kept the move fairly balanced';

  if (selected.isForced) {
    tone = 'forced';
    issue = 'the move was forced by the legal cards';
  } else if ((selected.isDangerCard || selected.triggersPenalty) && alternative) {
    tone = selected.penaltyValue >= 100 ? 'severe mistake' : 'mistake';
    issue = selected.isDangerCard ? 'played the danger card' : 'took a penalty-risk line';
  } else if (selected.hurtsObjective && alternative) {
    tone = 'mistake';
    issue = 'missed a safer legal line';
  } else if (selected.helpsObjective && !selected.hurtsObjective && assessment.selectedIsBestMove) {
    tone = 'strong';
    issue = selected.likelyLosesCurrentTrick
      ? 'avoided the risky trick cleanly'
      : 'matched the objective very well';
  } else if (selected.helpsObjective && !selected.hurtsObjective) {
    tone = 'good';
    issue = 'helped the objective without adding extra risk';
  } else if (rating <= 5.5) {
    tone = 'mistake';
    issue = 'made the round riskier than needed';
  }

  return {
    rating,
    tone,
    objective,
    issue,
    alternative,
    shouldComment: true
  };
}

function maybeApplyMistakeLayer(kind, legalMoves, chosenMove, context = {}) {
  if (!chosenMove) {
    return chosenMove;
  }

  const botRankTierKey = context?.botProfile?.rankTierKey || getRankTierForElo(context?.botProfile?.averageHumanElo).key;
  const mistakeChance = MISTAKE_CHANCE_BY_TIER[botRankTierKey] ?? 0.08;
  const rollSeed = [
    context?.roomId,
    context?.gameState?.roundNumber,
    context?.gameState?.phase,
    context?.gameState?.turnIndex,
    context?.botPlayer?.userId,
    legalMoves.map((move) => move.id).join('|')
  ].join(':');
  const roll = createDeterministicRoll(rollSeed);

  if (roll >= mistakeChance) {
    return chosenMove;
  }

  const weakerMove = chooseMistakeMove(kind, legalMoves, chosenMove.id, context);
  if (!weakerMove) {
    return chosenMove;
  }

  return {
    ...weakerMove,
    source: chosenMove.source || 'llm',
    decisionAdjustment: 'mistake-layer',
    confidence: 0.2,
    reason: 'Difficulty layer forced a weaker legal move.'
  };
}

function buildBotPromptPayload({
  kind,
  gameState,
  botPlayer,
  legalMoves = [],
  ruleset = null,
  runtimeMode = getGameplayBotMode()
} = {}) {
  if (kind === 'choose_nv') {
    return {
      decisionType: kind,
      mode: runtimeMode,
      task: 'choose one move_id from legal_moves',
      bot: {
        elo: botPlayer?.elo,
        rankName: botPlayer?.rankName,
        difficultyElo: botPlayer?.difficultyElo ?? botPlayer?.elo ?? botPlayer?.averageHumanElo
      },
      round: {
        phase: gameState?.phase,
        roundNumber: gameState?.roundNumber || 0
      },
      ruleset: {
        objective: 'Choose whether to play the non-valid hand option based on difficulty and score context.'
      },
      scoreContext: {
        ownScore: gameState?.pointsByPlayer?.[botPlayer?.userId] || 0,
        tableLeaderScore: Math.max(0, ...(gameState?.players || []).map((player) => gameState?.pointsByPlayer?.[player.userId] || 0))
      },
      legalMoves: legalMoves.map((move) => ({
        moveId: move.id,
        value: Boolean(move.value),
        label: move.label || move.id
      }))
    };
  }

  const difficultyElo = botPlayer?.difficultyElo ?? botPlayer?.elo ?? botPlayer?.averageHumanElo;
  const currentTrick = Array.isArray(gameState?.currentTrick)
    ? gameState.currentTrick.map((play) => ({
      card: play.card
    }))
    : [];
  const moveFeatures = legalMoves.map((move) => buildGameplayMoveFeatures({
    move,
    legalMoves,
    ruleset,
    currentTrick,
    trickSuit: gameState?.trickSuit
  }));
  const scoreValues = (gameState?.players || []).map((player) => gameState?.pointsByPlayer?.[player.userId] || 0);
  const ownScore = gameState?.pointsByPlayer?.[botPlayer?.userId] || 0;
  const leaderScore = scoreValues.length > 0 ? Math.max(...scoreValues) : ownScore;
  const trailerScore = scoreValues.length > 0 ? Math.min(...scoreValues) : ownScore;
  const objectiveHints = getGameplayObjectiveHints(ruleset);
  const compactLegalMoves = moveFeatures.map((entry) => ({
      i: legalMoves.findIndex((move) => move.id === entry.moveId),
      move_id: entry.moveId,
      id: entry.moveId,
      card: entry.card,
      winsCurrentTrick: entry.likelyWinsCurrentTrick,
      losesCurrentTrick: entry.likelyLosesCurrentTrick,
      triggersPenalty: entry.triggersPenalty,
      helpsObjective: entry.helpsObjective,
      hurtsObjective: entry.hurtsObjective,
      pref: Math.round(scoreGameplayMoveFeatureSet(entry, ruleset) * 10) / 10,
      tags: entry.shortTags
    }));

  if (runtimeMode !== 'eval') {
    return {
      promptShape: 'gameplay-live-v4',
      decisionType: kind,
      mode: runtimeMode,
      task: 'choose one legal index',
      contract: objectiveHints.contract,
      objective: objectiveHints.objective,
      winningTrickIsGood: objectiveHints.winningTrickIsGood,
      avoidWinningTrick: objectiveHints.avoidWinningTrick,
      difficultyElo,
      botRank: botPlayer?.rankName || '',
      currentTrick: currentTrick.map((play) => play.card),
      legalMoves: compactLegalMoves.map((entry) => ({
        i: entry.i,
        id: entry.id,
        card: entry.card,
        tags: entry.tags
      }))
    };
  }

  return {
    promptShape: 'gameplay-eval-v3',
    decisionType: kind,
    mode: runtimeMode,
    task: 'choose one move_id',
    contract: objectiveHints.contract,
    objective: objectiveHints.objective,
    winningTrickIsGood: objectiveHints.winningTrickIsGood,
    avoidWinningTrick: objectiveHints.avoidWinningTrick,
    difficultyElo,
    botRank: botPlayer?.rankName || '',
    currentTrick: currentTrick.map((play) => play.card),
    scoreContext: {
      ownScore,
      leaderScore,
      trailerScore,
      cardsLeft: (gameState?.handsReady?.[botPlayer?.userId] || []).length
    },
    legalMoves: compactLegalMoves
  };
}

async function loadLangChainRuntime() {
  if (cachedLangChainRuntime) {
    return cachedLangChainRuntime;
  }

  const [{ ChatOllama }, { z }] = await Promise.all([
    import('@langchain/ollama'),
    import('zod')
  ]);

  cachedLangChainRuntime = { ChatOllama, z };
  return cachedLangChainRuntime;
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

function normalizeTrainerVisibleSentence(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^['"`]+/, '')
    .replace(/['"`]+$/, '')
    .trim();
}

function looksLikeJsonPayload(value) {
  const trimmed = String(value || '').trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('"');
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

function parseJsonIntegerPrimitive(text) {
  const trimmed = String(text || '').trim();
  if (!/^-?\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeDebugPreview(value, maxLength = 180) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001f]+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeCandidateCardText(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/_/g, '-')
    .replace(/\b(?:clubs?|diamonds?|spades?|hearts?)\b/gi, (match) => {
      const normalizedSuit = normalizeSuitKey(match);
      return normalizedSuit || match;
    })
    .replace(/([0-9JQKA]+)-([cdsh])/gi, (_match, rank, suit) => `${rank.toUpperCase()}-${suit.toUpperCase()}`)
    .replace(/([0-9JQKA]+)([CDSH])$/i, (_match, rank, suit) => `${rank.toUpperCase()}-${suit.toUpperCase()}`);
}

function normalizeGameplayErrorCode(error, fallback = 'llm-error') {
  const normalized = String(error?.message || error || '').trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (normalized.includes('timed out')) {
    return 'timeout';
  }
  if (normalized.includes('invalid-json')) {
    return 'invalid-json';
  }
  if (normalized.includes('invalid-index')) {
    return 'invalid-index';
  }
  if (normalized.includes('index-out-of-range')) {
    return 'index-out-of-range';
  }
  if (normalized.includes('illegal-move-selected')) {
    return 'illegal-move-selected';
  }
  if (normalized.includes('invalid-structured-output')) {
    return 'invalid-structured-output';
  }
  if (normalized.includes('empty-response')) {
    return 'empty-response';
  }
  if (normalized.includes('skipped-for-gameplay-priority')) {
    return 'skipped-for-gameplay-priority';
  }

  return fallback;
}

function isSafeTrainerVisibleText(text, {
  hiddenCards = [],
  maxLength = 420,
  requireRating = false
} = {}) {
  const normalized = String(text || '').trim();
  if (!normalized) {
    return false;
  }

  if (normalized.length > maxLength) {
    return false;
  }

  const lowered = normalized.toLowerCase();
  const forbiddenPatterns = [
    /i need to/,
    /we need to/,
    /let'?s analyze/,
    /thinking step by step/,
    /chain of thought/,
    /thought process/,
    /internal reasoning/,
    /system prompt/,
    /user prompt/,
    /developer prompt/,
    /```/,
    /<think>/,
    /<\/think>/
  ];

  if (forbiddenPatterns.some((pattern) => pattern.test(lowered))) {
    return false;
  }

  const hiddenLeak = hiddenCards
    .map((card) => normalizeGameplayCardToken(card))
    .filter(Boolean)
    .find((card) => lowered.includes(card.toLowerCase()));
  if (hiddenLeak) {
    return false;
  }

  if (requireRating && !/\b(?:move rating|rating)\b/i.test(normalized) && !/\b\d(?:\.\d+)?\s*\/\s*10\b/.test(normalized)) {
    return false;
  }

  return true;
}

function clampTrainerRating(value, fallback = 5) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return clampTrainerRating(fallback, 5);
  }

  return Math.max(0, Math.min(10, Math.round(numericValue * 10) / 10));
}

function clampTrainerStarRating(value, fallback = 3) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return clampTrainerStarRating(fallback, 3);
  }

  const clamped = Math.max(0.5, Math.min(5, numericValue));
  return Math.round(clamped * 2) / 2;
}

function normalizeBotErrorCode(error, fallback = 'llm-error') {
  const normalized = String(error?.message || error || '').trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (normalized.includes('timed out')) {
    return 'timeout';
  }
  if (normalized.includes('invalid-json')) {
    return 'invalid-json';
  }
  if (normalized.includes('invalid-index')) {
    return 'invalid-index';
  }
  if (normalized.includes('index-out-of-range')) {
    return 'index-out-of-range';
  }
  if (normalized.includes('invalid-structured-output')) {
    return 'invalid-structured-output';
  }
  if (normalized.includes('illegal-move-selected')) {
    return 'illegal-move-selected';
  }
  if (normalized.includes('empty-response')) {
    return 'empty-response';
  }
  if (normalized.includes('skipped-for-gameplay-priority')) {
    return 'skipped-for-gameplay-priority';
  }

  return fallback;
}

function buildGameplayDecisionDebugMeta({
  source = 'fallback',
  fallbackUsed = false,
  elapsedMs = 0,
  errorCode = null,
  mode = 'live',
  model = DEFAULT_BOT_OLLAMA_MODEL,
  timeoutMs = BOT_DECISION_TIMEOUT_MS,
  numPredict = 0,
  promptLength = 0,
  payloadLength = 0,
  legalMoveCount = 0,
  outputContract = 'legacy',
  rawOutputPreview = '',
  selectedIndex = null,
  selectedMoveId = ''
} = {}) {
  return {
    source,
    fallbackUsed: fallbackUsed === true,
    elapsedMs: Math.max(0, Math.round(Number(elapsedMs) || 0)),
    errorCode: errorCode ? String(errorCode) : null,
    mode,
    model: String(model || ''),
    timeoutMs: Math.max(0, Math.round(Number(timeoutMs) || 0)),
    numPredict: Math.max(0, Math.round(Number(numPredict) || 0)),
    promptLength: Math.max(0, Math.round(Number(promptLength) || 0)),
    payloadLength: Math.max(0, Math.round(Number(payloadLength) || 0)),
    legalMoveCount: Math.max(0, Math.round(Number(legalMoveCount) || 0)),
    outputContract: String(outputContract || 'legacy'),
    rawOutputPreview: sanitizeDebugPreview(rawOutputPreview, 160),
    selectedIndex: Number.isInteger(selectedIndex) ? selectedIndex : null,
    selectedMoveId: String(selectedMoveId || '')
  };
}

function buildTrainerDecisionDebugMeta({
  source = 'fallback',
  fallbackUsed = false,
  elapsedMs = 0,
  errorCode = null,
  mode = 'fast',
  model = DEFAULT_BOT_OLLAMA_MODEL,
  timeoutMs = BOT_DECISION_TIMEOUT_MS,
  numPredict = 0,
  promptLength = 0,
  payloadLength = 0,
  parserMode = 'fallback',
  preview = '',
  stage = '',
  rawResponsePreview = '',
  rawResponseLength = 0,
  parseStep = '',
  parseErrorMessage = '',
  validationErrorMessage = '',
  sourceBeforeFallback = '',
  finalSource = '',
  fallbackReason = ''
} = {}) {
  return {
    source,
    fallbackUsed: fallbackUsed === true,
    elapsedMs: Math.max(0, Math.round(Number(elapsedMs) || 0)),
    errorCode: errorCode ? String(errorCode) : null,
    mode,
    model: String(model || ''),
    timeoutMs: Math.max(0, Math.round(Number(timeoutMs) || 0)),
    numPredict: Math.max(0, Math.round(Number(numPredict) || 0)),
    promptLength: Math.max(0, Math.round(Number(promptLength) || 0)),
    payloadLength: Math.max(0, Math.round(Number(payloadLength) || 0)),
    parserMode: String(parserMode || 'fallback'),
    preview: sanitizeDebugPreview(preview, 160),
    stage: String(stage || ''),
    rawResponsePreview: sanitizeDebugPreview(rawResponsePreview, 160),
    rawResponseLength: Math.max(0, Math.round(Number(rawResponseLength) || 0)),
    parseStep: String(parseStep || ''),
    parseErrorMessage: sanitizeDebugPreview(parseErrorMessage, 160),
    validationErrorMessage: sanitizeDebugPreview(validationErrorMessage, 160),
    sourceBeforeFallback: String(sourceBeforeFallback || ''),
    finalSource: String(finalSource || source || ''),
    fallbackReason: sanitizeDebugPreview(fallbackReason, 160)
  };
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

async function queryStructuredBotResponse({
  schema,
  systemPrompt,
  humanPrompt,
  modelName = DEFAULT_BOT_OLLAMA_MODEL,
  baseUrl = DEFAULT_BOT_OLLAMA_BASE_URL,
  timeoutMs = BOT_DECISION_TIMEOUT_MS,
  temperature = 0.2,
  numPredict = 160,
  topP = 0.9,
  keepAlive = BOT_KEEP_ALIVE,
  requestType = 'generic',
  priority = 0,
  skipWhenGameplayPending = false
} = {}) {
  const { ChatOllama, z } = await loadLangChainRuntime();
  const parsedSchema = schema || z.object({});
  scheduleLocalBotWarmup({ modelName, baseUrl, keepAlive });
  const model = new ChatOllama({
    model: modelName,
    baseUrl,
    temperature,
    numPredict,
    topP,
    keepAlive,
    format: 'json'
  });
  const queuedResponse = await queueLocalModelRequest({
    modelName,
    baseUrl,
    requestType,
    priority,
    skipWhenGameplayPending,
    run: () => withTimeout(
      model.invoke([
        ['system', systemPrompt],
        ['human', humanPrompt]
      ]),
      timeoutMs,
      `Bot AI request timed out after ${timeoutMs}ms`
    )
  });

  if (queuedResponse?.skipped) {
    return {
      success: false,
      error: queuedResponse.reason,
      rawOutput: '',
      diagnostics: {
        rawResponsePreview: '',
        rawResponseLength: 0,
        parseStep: 'skipped',
        parseErrorMessage: '',
        validationErrorMessage: ''
      }
    };
  }

  const rawOutput = extractModelText(queuedResponse);
  const rawResponseLength = rawOutput.length;
  const rawResponsePreview = sanitizeDebugPreview(rawOutput, 160);
  if (!rawOutput) {
    return {
      success: false,
      error: 'empty-response',
      rawOutput,
      diagnostics: {
        rawResponsePreview,
        rawResponseLength,
        parseStep: 'empty-response',
        parseErrorMessage: 'Model returned an empty response.',
        validationErrorMessage: ''
      }
    };
  }

  const parsedJson = parseJsonObject(rawOutput);
  if (parsedJson == null) {
    return {
      success: false,
      error: 'invalid-json',
      rawOutput,
      diagnostics: {
        rawResponsePreview,
        rawResponseLength,
        parseStep: 'json-parse',
        parseErrorMessage: 'Unable to parse model JSON output.',
        validationErrorMessage: ''
      }
    };
  }

  const parsed = parsedSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return {
      success: false,
      error: 'invalid-structured-output',
      rawOutput,
      diagnostics: {
        rawResponsePreview,
        rawResponseLength,
        parseStep: 'schema-validate',
        parseErrorMessage: '',
        validationErrorMessage: parsed.error?.issues?.map((issue) => {
          const path = Array.isArray(issue.path) && issue.path.length > 0
            ? `${issue.path.join('.')}: `
            : '';
          return `${path}${issue.message}`;
        }).join('; ')
      }
    };
  }

  return {
    success: true,
    data: parsed.data,
    rawOutput,
    diagnostics: {
      rawResponsePreview,
      rawResponseLength,
      parseStep: 'validated-json',
      parseErrorMessage: '',
      validationErrorMessage: ''
    }
  };
}

async function queryStructuredLocalGenerateResponse({
  schema,
  prompt,
  modelName = DEFAULT_BOT_OLLAMA_MODEL,
  baseUrl = DEFAULT_BOT_OLLAMA_BASE_URL,
  timeoutMs = BOT_DECISION_TIMEOUT_MS,
  temperature = 0.2,
  numPredict = 160,
  topP = 0.9,
  keepAlive = BOT_KEEP_ALIVE,
  format = 'json',
  requestType = 'generic',
  priority = 0,
  skipWhenGameplayPending = false
} = {}) {
  scheduleLocalBotWarmup({ modelName, baseUrl, keepAlive });
  const queuedResponse = await queueLocalModelRequest({
    modelName,
    baseUrl,
    requestType,
    priority,
    skipWhenGameplayPending,
    run: async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeoutMs);
      timeoutId.unref?.();

      try {
        const response = await fetch(buildLocalGenerateUrl(baseUrl), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: modelName,
            prompt,
            raw: true,
            stream: false,
            format,
            keep_alive: keepAlive,
            options: {
              temperature,
              num_predict: numPredict,
              top_p: topP
            }
          }),
          signal: controller.signal
        });
        const bodyText = await response.text().catch(() => '');
        return {
          response,
          bodyText
        };
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw new Error(`Bot AI request timed out after ${timeoutMs}ms`);
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    }
  });

  if (queuedResponse?.skipped) {
    return {
      success: false,
      error: queuedResponse.reason,
      rawOutput: '',
      diagnostics: {
        rawResponsePreview: '',
        rawResponseLength: 0,
        parseStep: 'skipped',
        parseErrorMessage: '',
        validationErrorMessage: ''
      }
    };
  }

  const response = queuedResponse?.response;
  const bodyText = String(queuedResponse?.bodyText || '');
  const envelopePreview = sanitizeDebugPreview(bodyText, 160);
  const envelopeLength = bodyText.length;

  if (!response?.ok) {
    return {
      success: false,
      error: `ollama_http_${response?.status || 500}`,
      rawOutput: '',
      diagnostics: {
        rawResponsePreview: envelopePreview,
        rawResponseLength: envelopeLength,
        parseStep: 'http-error',
        parseErrorMessage: `Ollama returned HTTP ${response?.status || 500}.`,
        validationErrorMessage: ''
      }
    };
  }

  const envelope = parseJsonObject(bodyText);
  if (!isPlainObject(envelope)) {
    return {
      success: false,
      error: 'invalid-json',
      rawOutput: '',
      diagnostics: {
        rawResponsePreview: envelopePreview,
        rawResponseLength: envelopeLength,
        parseStep: 'envelope-json',
        parseErrorMessage: 'Unable to parse Ollama response envelope.',
        validationErrorMessage: ''
      }
    };
  }

  const rawOutput = String(envelope?.response || '').trim();
  const rawResponsePreview = sanitizeDebugPreview(rawOutput || bodyText, 160);
  const rawResponseLength = rawOutput.length || envelopeLength;
  if (!rawOutput) {
    return {
      success: false,
      error: 'empty-response',
      rawOutput,
      diagnostics: {
        rawResponsePreview,
        rawResponseLength,
        parseStep: 'empty-response',
        parseErrorMessage: 'Ollama response did not include model output.',
        validationErrorMessage: ''
      }
    };
  }

  const parsedJson = parseJsonObject(rawOutput);
  if (parsedJson == null) {
    return {
      success: false,
      error: 'invalid-json',
      rawOutput,
      diagnostics: {
        rawResponsePreview,
        rawResponseLength,
        parseStep: 'response-json',
        parseErrorMessage: 'Unable to parse model JSON output.',
        validationErrorMessage: ''
      }
    };
  }

  const parsed = schema.safeParse(parsedJson);
  if (!parsed.success) {
    return {
      success: false,
      error: 'invalid-structured-output',
      rawOutput,
      diagnostics: {
        rawResponsePreview,
        rawResponseLength,
        parseStep: 'schema-validate',
        parseErrorMessage: '',
        validationErrorMessage: parsed.error?.issues?.map((issue) => {
          const path = Array.isArray(issue.path) && issue.path.length > 0
            ? `${issue.path.join('.')}: `
            : '';
          return `${path}${issue.message}`;
        }).join('; ')
      }
    };
  }

  return {
    success: true,
    data: parsed.data,
    rawOutput,
    diagnostics: {
      rawResponsePreview,
      rawResponseLength,
      parseStep: 'validated-json',
      parseErrorMessage: '',
      validationErrorMessage: ''
    }
  };
}

async function queryPlainTextBotResponse({
  systemPrompt,
  humanPrompt,
  modelName = DEFAULT_BOT_OLLAMA_MODEL,
  baseUrl = DEFAULT_BOT_OLLAMA_BASE_URL,
  timeoutMs = BOT_DECISION_TIMEOUT_MS,
  temperature = 0.2,
  numPredict = 160,
  topP = 0.9,
  keepAlive = BOT_KEEP_ALIVE,
  requestType = 'generic',
  priority = 0,
  skipWhenGameplayPending = false
} = {}) {
  const { ChatOllama } = await loadLangChainRuntime();
  scheduleLocalBotWarmup({ modelName, baseUrl, keepAlive });
  const model = new ChatOllama({
    model: modelName,
    baseUrl,
    temperature,
    numPredict,
    topP,
    keepAlive
  });
  const queuedResponse = await queueLocalModelRequest({
    modelName,
    baseUrl,
    requestType,
    priority,
    skipWhenGameplayPending,
    run: () => withTimeout(
      model.invoke([
        ['system', systemPrompt],
        ['human', humanPrompt]
      ]),
      timeoutMs,
      `Bot AI request timed out after ${timeoutMs}ms`
    )
  });

  if (queuedResponse?.skipped) {
    return {
      success: false,
      error: queuedResponse.reason,
      rawOutput: '',
      diagnostics: {
        rawResponsePreview: '',
        rawResponseLength: 0,
        parseStep: 'skipped',
        parseErrorMessage: '',
        validationErrorMessage: ''
      }
    };
  }

  const rawOutput = normalizeTrainerVisibleSentence(extractModelText(queuedResponse));
  const rawResponseLength = rawOutput.length;
  const rawResponsePreview = sanitizeDebugPreview(rawOutput, 160);
  if (!rawOutput) {
    return {
      success: false,
      error: 'empty-response',
      rawOutput,
      diagnostics: {
        rawResponsePreview,
        rawResponseLength,
        parseStep: 'empty-response',
        parseErrorMessage: 'Model returned an empty response.',
        validationErrorMessage: ''
      }
    };
  }

  return {
    success: true,
    text: rawOutput,
    rawOutput,
    diagnostics: {
      rawResponsePreview,
      rawResponseLength,
      parseStep: 'plain-text',
      parseErrorMessage: '',
      validationErrorMessage: ''
    }
  };
}

async function queryPlainTextLocalGenerateResponse({
  prompt,
  modelName = DEFAULT_BOT_OLLAMA_MODEL,
  baseUrl = DEFAULT_BOT_OLLAMA_BASE_URL,
  timeoutMs = BOT_DECISION_TIMEOUT_MS,
  temperature = 0.2,
  numPredict = 160,
  topP = 0.9,
  keepAlive = BOT_KEEP_ALIVE,
  requestType = 'generic',
  priority = 0,
  skipWhenGameplayPending = false
} = {}) {
  scheduleLocalBotWarmup({ modelName, baseUrl, keepAlive });
  const queuedResponse = await queueLocalModelRequest({
    modelName,
    baseUrl,
    requestType,
    priority,
    skipWhenGameplayPending,
    run: async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeoutMs);
      timeoutId.unref?.();

      try {
        const response = await fetch(buildLocalGenerateUrl(baseUrl), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: modelName,
            prompt,
            raw: true,
            stream: false,
            keep_alive: keepAlive,
            options: {
              temperature,
              num_predict: numPredict,
              top_p: topP
            }
          }),
          signal: controller.signal
        });
        const bodyText = await response.text().catch(() => '');
        return {
          response,
          bodyText
        };
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw new Error(`Bot AI request timed out after ${timeoutMs}ms`);
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    }
  });

  if (queuedResponse?.skipped) {
    return {
      success: false,
      error: queuedResponse.reason,
      rawOutput: '',
      diagnostics: {
        rawResponsePreview: '',
        rawResponseLength: 0,
        parseStep: 'skipped',
        parseErrorMessage: '',
        validationErrorMessage: ''
      }
    };
  }

  const response = queuedResponse?.response;
  const bodyText = String(queuedResponse?.bodyText || '');
  const envelopePreview = sanitizeDebugPreview(bodyText, 160);
  const envelopeLength = bodyText.length;

  if (!response?.ok) {
    return {
      success: false,
      error: `ollama_http_${response?.status || 500}`,
      rawOutput: '',
      diagnostics: {
        rawResponsePreview: envelopePreview,
        rawResponseLength: envelopeLength,
        parseStep: 'http-error',
        parseErrorMessage: `Ollama returned HTTP ${response?.status || 500}.`,
        validationErrorMessage: ''
      }
    };
  }

  const envelope = parseJsonObject(bodyText);
  if (!isPlainObject(envelope)) {
    return {
      success: false,
      error: 'invalid-json',
      rawOutput: '',
      diagnostics: {
        rawResponsePreview: envelopePreview,
        rawResponseLength: envelopeLength,
        parseStep: 'envelope-json',
        parseErrorMessage: 'Unable to parse Ollama response envelope.',
        validationErrorMessage: ''
      }
    };
  }

  const rawOutput = normalizeTrainerVisibleSentence(String(envelope?.response || ''));
  const rawResponsePreview = sanitizeDebugPreview(rawOutput || bodyText, 160);
  const rawResponseLength = rawOutput.length || envelopeLength;
  if (!rawOutput) {
    return {
      success: false,
      error: 'empty-response',
      rawOutput,
      diagnostics: {
        rawResponsePreview,
        rawResponseLength,
        parseStep: 'empty-response',
        parseErrorMessage: 'Ollama response did not include model output.',
        validationErrorMessage: ''
      }
    };
  }

  return {
    success: true,
    text: rawOutput,
    rawOutput,
    diagnostics: {
      rawResponsePreview,
      rawResponseLength,
      parseStep: 'plain-text',
      parseErrorMessage: '',
      validationErrorMessage: ''
    }
  };
}

function buildGameplayLivePrompt(promptPayload = {}) {
  const trickText = Array.isArray(promptPayload.currentTrick) && promptPayload.currentTrick.length > 0
    ? promptPayload.currentTrick.join(', ')
    : '-';
  const moveText = (Array.isArray(promptPayload.legalMoves) ? promptPayload.legalMoves : [])
    .map((move) => {
      const tagText = Array.isArray(move.tags) && move.tags.length > 0 ? move.tags.join(',') : '-';
      return `${move.i}: ${move.card} tags=[${tagText}]`;
    })
    .join('\n');

  return [
    'You choose a Rentz bot move. Return only JSON.',
    '',
    `contract=${promptPayload.contract || 'unknown'}`,
    `objective=${promptPayload.objective || 'improve score'}`,
    `difficulty=${Math.round(Number(promptPayload.difficultyElo) || 0)}`,
    `currentTrick=${trickText}`,
    'legalMoves:',
    moveText || '0: unavailable tags=[-]',
    'Return JSON only.',
    'No markdown.',
    'No explanation.',
    'Schema: {"i": number}',
    `Choose i from 0 to ${Math.max(0, (promptPayload.legalMoves?.length || 1) - 1)}.`
  ].join('\n');
}

function normalizeGameplayCardToken(value) {
  return normalizeCandidateCardText(value).replace(/-HEARTS$/i, '-H')
    .replace(/-DIAMONDS$/i, '-D')
    .replace(/-CLUBS$/i, '-C')
    .replace(/-SPADES$/i, '-S');
}

function normalizeCandidateMoveId(value) {
  return String(value || '').trim();
}

function resolveLegalMoveSelection(parsed, legalMoves = []) {
  const candidateValues = [
    parsed?.moveId,
    parsed?.move_id,
    parsed?.id,
    parsed?.move,
    parsed?.card
  ]
    .map((value) => [normalizeCandidateMoveId(value), normalizeGameplayCardToken(value)])
    .flat()
    .filter(Boolean);

  for (const candidate of candidateValues) {
    const exactMatch = legalMoves.find((move) => (
      normalizeCandidateMoveId(move.id) === candidate
      || normalizeGameplayCardToken(move.id) === candidate
    ));
    if (exactMatch) {
      return exactMatch;
    }

    const cardMatch = legalMoves.find((move) => (
      normalizeGameplayCardToken(move.card || move.id) === candidate
      || normalizeCandidateMoveId(move.card || move.id) === candidate
    ));
    if (cardMatch) {
      return cardMatch;
    }
  }

  return null;
}

function parseGameplayDecisionOutput(rawOutput, legalMoves = [], { outputContract = 'legacy' } = {}) {
  const parsedJson = parseJsonObject(rawOutput);
  const parsedInteger = parseJsonIntegerPrimitive(rawOutput);
  const parsedJsonIsObject = isPlainObject(parsedJson);

  if (outputContract === 'index') {
    if (parsedJsonIsObject && Object.keys(parsedJson).length === 0) {
      return {
        success: false,
        error: 'empty-json'
      };
    }

    if (
      parsedJsonIsObject
      && Object.prototype.hasOwnProperty.call(parsedJson, 'schema')
      && !Object.prototype.hasOwnProperty.call(parsedJson, 'i')
      && !resolveLegalMoveSelection(parsedJson, legalMoves)
    ) {
      return {
        success: false,
        error: 'schema-output-instead-of-answer'
      };
    }

    const candidateIndexValue = parsedJson && Object.prototype.hasOwnProperty.call(parsedJson, 'i')
      ? parsedJson.i
      : parsedInteger;

    if (candidateIndexValue != null) {
      const normalizedIndex = typeof candidateIndexValue === 'string' && /^-?\d+$/.test(candidateIndexValue.trim())
        ? Number.parseInt(candidateIndexValue, 10)
        : candidateIndexValue;
      if (!Number.isInteger(normalizedIndex)) {
        return {
          success: false,
          error: 'invalid-index'
        };
      }
      if (normalizedIndex < 0 || normalizedIndex >= legalMoves.length) {
        return {
          success: false,
          error: 'index-out-of-range'
        };
      }

      return {
        success: true,
        move: legalMoves[normalizedIndex],
        selectedIndex: normalizedIndex,
        parserMode: parsedInteger != null && !parsedJson ? 'plain-number' : 'json-index',
        parsed: parsedJson
      };
    }
  }

  if (parsedJson) {
    const selectedMove = resolveLegalMoveSelection(parsedJson, legalMoves);
    if (selectedMove) {
      return {
        success: true,
        move: selectedMove,
        selectedIndex: legalMoves.findIndex((move) => move.id === selectedMove.id),
        parserMode: 'legacy-json',
        parsed: parsedJson
      };
    }

    return {
      success: false,
      error: outputContract === 'index' ? 'illegal-move-selected' : 'illegal-move-selected'
    };
  }

  if (parsedInteger != null) {
    if (parsedInteger < 0 || parsedInteger >= legalMoves.length) {
      return {
        success: false,
        error: 'index-out-of-range'
      };
    }

    return {
      success: true,
      move: legalMoves[parsedInteger],
      selectedIndex: parsedInteger,
      parserMode: 'plain-number'
    };
  }

  return {
    success: false,
    error: 'invalid-json'
  };
}

async function queryBotDecisionWithLangChain({
  kind,
  legalMoves,
  promptPayload,
  runtimeConfig = getGameplayBotRuntimeConfig()
} = {}) {
  const { z } = await loadLangChainRuntime();
  const promptSpec = buildGameplayDecisionPrompt({
    kind,
    promptPayload,
    runtimeMode: runtimeConfig.mode
  });
  const outputContract = runtimeConfig.mode === 'live' ? 'index' : 'legacy';
  const schema = outputContract === 'index'
    ? z.object({
      i: z.union([z.number().int(), z.string()]).optional()
    }).passthrough()
    : runtimeConfig.includeReason
      ? z.object({
        moveId: z.string().min(1).optional(),
        move_id: z.string().min(1).optional(),
        id: z.string().min(1).optional(),
        move: z.string().min(1).optional(),
        card: z.string().min(1).optional(),
        confidence: z.number().min(0).max(1).optional(),
        reason: z.string().max(160).optional()
      }).passthrough()
      : z.object({
        moveId: z.string().min(1).optional(),
        move_id: z.string().min(1).optional(),
        id: z.string().min(1).optional(),
        move: z.string().min(1).optional(),
        card: z.string().min(1).optional(),
        confidence: z.number().min(0).max(1).optional()
      }).passthrough();
  const useDirectLocalGenerate = runtimeConfig.mode === 'live' && isLikelyLocalOllamaBaseUrl(runtimeConfig.baseUrl);
  const result = useDirectLocalGenerate
    ? await queryStructuredLocalGenerateResponse({
      schema,
      prompt: promptSpec.rawPrompt || [promptSpec.systemPrompt, promptSpec.humanPrompt].filter(Boolean).join('\n'),
      modelName: runtimeConfig.modelName,
      baseUrl: runtimeConfig.baseUrl,
      timeoutMs: runtimeConfig.timeoutMs,
      temperature: runtimeConfig.temperature,
      numPredict: runtimeConfig.numPredict,
      topP: runtimeConfig.topP,
      keepAlive: runtimeConfig.keepAlive,
      format: 'json',
      requestType: 'gameplay',
      priority: 2
    })
    : await queryStructuredBotResponse({
      schema,
      systemPrompt: promptSpec.systemPrompt,
      humanPrompt: promptSpec.humanPrompt,
      modelName: runtimeConfig.modelName,
      baseUrl: runtimeConfig.baseUrl,
      timeoutMs: runtimeConfig.timeoutMs,
      temperature: runtimeConfig.temperature,
      numPredict: runtimeConfig.numPredict,
      topP: runtimeConfig.topP,
      keepAlive: runtimeConfig.keepAlive,
      requestType: 'gameplay',
      priority: 2
    });

  if (!result.success) {
    const repairedDecision = result.rawOutput
      ? parseGameplayDecisionOutput(result.rawOutput, legalMoves, { outputContract })
      : null;
    if (repairedDecision?.success) {
      return {
        success: true,
        move: {
          ...repairedDecision.move,
          source: 'llm',
          confidence: null,
          reason: ''
        },
        rawOutput: result.rawOutput,
        outputContract,
        parserMode: repairedDecision.parserMode || 'plain-number',
        selectedIndex: repairedDecision.selectedIndex
      };
    }

    return {
      ...result,
      error: repairedDecision?.error || result.error,
      outputContract
    };
  }

  const parsedDecision = parseGameplayDecisionOutput(result.rawOutput, legalMoves, {
    outputContract
  });
  if (!parsedDecision.success) {
    return {
      success: false,
      error: parsedDecision.error || 'invalid-structured-output',
      rawOutput: result.rawOutput,
      outputContract
    };
  }

  const parsed = result.data || parsedDecision.parsed || {};
  const selectedMove = parsedDecision.move;

  return {
    success: true,
    move: {
      ...selectedMove,
      source: 'llm',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
      reason: runtimeConfig.includeReason ? (parsed.reason || '') : ''
    },
    rawOutput: result.rawOutput,
    outputContract,
    parserMode: parsedDecision.parserMode || 'json-index',
    selectedIndex: parsedDecision.selectedIndex
  };
}

function buildGameplayDecisionPrompt({ kind, promptPayload, runtimeMode = getGameplayBotMode() } = {}) {
  const liveMode = runtimeMode !== 'eval';
  if (liveMode) {
    return {
      systemPrompt: '',
      humanPrompt: '',
      rawPrompt: buildGameplayLivePrompt({
        kind,
        ...promptPayload
      })
    };
  }

  const systemPrompt = [
    'Rentz move chooser.',
    'Choose exactly one legal move_id from legalMoves.',
    'Honor the objective flags.',
    'If winningTrickIsGood=true, prefer winning the trick when no penalty tag says otherwise.',
    'If avoidWinningTrick=true, prefer losing the trick when a safe legal move exists.',
    liveMode
      ? 'Return JSON only: {"move_id":"..."} or {"move_id":"...","confidence":0.7}.'
      : 'Return JSON only: {"move_id":"...","confidence":0.7,"reason":"short"}.',
    'No markdown. No extra text. No chain-of-thought.',
    'Never invent move IDs.'
  ].join(' ');
  const humanPrompt = JSON.stringify({
    kind,
    ...promptPayload
  });

  return {
    systemPrompt,
    humanPrompt
  };
}

function buildTrainerVisibleHandSummary(cards = []) {
  const countsBySuit = (Array.isArray(cards) ? cards : []).reduce((acc, card) => {
    const { suit } = parseCard(card);
    if (!suit) {
      return acc;
    }

    acc[suit] = (acc[suit] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(countsBySuit)
    .sort(([leftSuit], [rightSuit]) => SUIT_ORDER.indexOf(leftSuit) - SUIT_ORDER.indexOf(rightSuit))
    .map(([suit, count]) => `${count} ${suit}`)
    .join(', ');
}

function buildTrainerPreMoveFallbackComment({ selectedMove, legalMoves = [], ruleset } = {}) {
  if (!selectedMove) {
    return '';
  }

  const selectedCard = selectedMove.card || selectedMove.id || '';
  const orderedCards = sortLegalMovesForFallback('play_card', legalMoves).map((move) => move.card || move.id);
  const lowestCard = orderedCards[0] || selectedCard;
  const highestCard = orderedCards[orderedCards.length - 1] || selectedCard;
  const objective = getRulesetObjective(ruleset).replace(/\.$/, '');

  if (selectedCard === lowestCard && orderedCards.length > 1) {
    return `Safer line here. ${objective}.`;
  }

  if (selectedCard === highestCard && orderedCards.length > 1) {
    return `More assertive line here. ${objective}.`;
  }

  return `Balanced line here. ${objective}.`;
}

function describeTrainerMoveRole({ selectedMove, legalMoves = [] } = {}) {
  const selectedCard = selectedMove?.card || selectedMove?.id || '';
  const orderedCards = sortLegalMovesForFallback('play_card', legalMoves).map((move) => move.card || move.id);
  const selectedIndex = orderedCards.indexOf(selectedCard);
  if (selectedIndex === -1 || orderedCards.length <= 1) {
    return 'balanced option';
  }

  if (selectedIndex === 0) {
    return 'lower-risk option';
  }

  if (selectedIndex === orderedCards.length - 1) {
    return 'more assertive option';
  }

  return 'balanced option';
}

function buildTrainerPreMovePromptPayload({
  gameState,
  trainerPlayer,
  legalMoves = [],
  selectedMove,
  ruleset = null,
  runtimeMode = getTrainerBotMode()
} = {}) {
  const selectedMoveFeatures = buildGameplayMoveFeatures({
    move: selectedMove,
    legalMoves,
    ruleset,
    currentTrick: gameState?.currentTrick || [],
    trickSuit: gameState?.trickSuit
  });
  const publicTags = (selectedMoveFeatures.shortTags || [])
    .filter((tag) => ['follows-suit', 'off-suit', 'wins-trick', 'loses-trick', 'safe', 'danger', 'helps-objective', 'hurts-objective'].includes(tag))
    .slice(0, 3);

  return {
    promptShape: runtimeMode === 'deep' ? 'trainer-pre-move-deep' : 'trainer-pre-move-fast',
    selectedMove: {
      role: describeTrainerMoveRole({ selectedMove, legalMoves }),
      idea: publicTags.includes('danger')
        ? 'careful damage control'
        : publicTags.includes('wins-trick')
          ? 'assertive pressure'
          : publicTags.includes('loses-trick')
            ? 'safer low-risk card'
            : 'balanced control',
      publicTags
    },
    ruleset: ruleset
      ? {
        id: ruleset.id,
        label: ruleset.label,
        objective: getRulesetObjective(ruleset)
      }
      : null,
    round: {
      number: gameState?.roundNumber || 0,
      turnIndex: gameState?.turnIndex || 0
    },
    currentTrick: Array.isArray(gameState?.currentTrick)
      ? gameState.currentTrick.map((play) => play.card)
      : [],
    legalMoveTags: legalMoves.slice(0, 4).map((move) => describeTrainerMoveRole({
      selectedMove: move,
      legalMoves
    }))
  };
}

function buildTrainerPreMovePrompt(args = {}) {
  const runtimeMode = args.runtimeMode === 'deep' ? 'deep' : 'fast';
  if (runtimeMode !== 'deep') {
    const payload = buildTrainerPreMovePromptPayload({
      ...args,
      runtimeMode
    });
    const tagText = Array.isArray(payload.selectedMove?.publicTags) && payload.selectedMove.publicTags.length > 0
      ? payload.selectedMove.publicTags.join(', ')
      : 'calm';

    return {
      systemPrompt: '',
      humanPrompt: '',
      rawPrompt: [
        'You are a Rentz trainer.',
        'Write ONE short coaching line, max 18 words.',
        'Do not mention hidden cards, exact card names, JSON, or analysis.',
        `Objective: ${payload.ruleset?.objective || 'Improve score safely.'}`,
        `Move idea: ${payload.selectedMove?.idea || payload.selectedMove?.role || 'balanced control'}.`,
        `Public tags: ${tagText}.`,
        'Return only the sentence.'
      ].join('\n')
    };
  }

  const systemPrompt = [
    'You are Trainer, a concise Rentz coaching bot.',
    'Write one short chat message before your move.',
    'Explain the idea without revealing hidden cards or chain-of-thought.',
    'Do not mention private hand contents or exact hidden card IDs.',
    runtimeMode === 'deep'
      ? 'Return JSON only with key comment.'
      : 'Return JSON only with key comment. Keep it under 110 characters.'
  ].join(' ');
  const humanPrompt = JSON.stringify(buildTrainerPreMovePromptPayload({
    ...args,
    runtimeMode
  }));

  return {
    systemPrompt,
    humanPrompt
  };
}

function buildTrainerMoveFeedbackFallback({
  playedCard,
  legalMoves = [],
  ruleset,
  currentTrickBeforeMove = []
} = {}) {
  const candidateCards = sortLegalMovesForFallback('play_card', legalMoves).map((move) => move.card || move.id);
  if (candidateCards.length <= 1) {
    return {
      shouldComment: false,
      rating: null,
      feedback: ''
    };
  }
  const facts = buildTrainerAfterMoveFacts({
    playedCard,
    legalMoves,
    ruleset,
    currentTrickBeforeMove
  });
  const selectedCard = String(playedCard || '');
  if (!facts.shouldComment) {
    return {
      shouldComment: false,
      rating: null,
      feedback: ''
    };
  }
  const rating = facts.rating;
  const alternativeCard = facts.alternative || '';

  if (rating >= 8.2) {
    return {
      shouldComment: true,
      rating,
      feedback: 'Strong choice. You protected the objective and kept the turn under control.'
    };
  }

  if (rating >= 6.2) {
    return {
      shouldComment: true,
      rating,
      feedback: 'Decent choice. The turn stayed manageable, even if a slightly calmer line may have existed.'
    };
  }

  return {
    shouldComment: true,
    rating,
    feedback: alternativeCard && alternativeCard !== selectedCard
      ? `Risky choice. ${alternativeCard} was the safer card here.`
      : 'Risky choice. A calmer legal move was available here.'
  };
}

function collectTrainerHiddenCards({
  gameState,
  trainerPlayer,
  humanPlayer,
  selectedMove,
  playedCard
} = {}) {
  const allowedVisibleCards = new Set(
    [selectedMove?.card, selectedMove?.id, playedCard]
      .map((card) => normalizeGameplayCardToken(card))
      .filter(Boolean)
  );
  const hiddenCards = new Set();
  const handsReady = gameState?.handsReady || {};

  Object.entries(handsReady).forEach(([playerId, cards]) => {
    const isHuman = playerId === humanPlayer?.userId;
    const isTrainer = playerId === trainerPlayer?.userId;
    if (!Array.isArray(cards) || (!isHuman && !isTrainer && cards.length === 0)) {
      return;
    }

    cards.forEach((card) => {
      const normalizedCard = normalizeGameplayCardToken(card);
      if (normalizedCard && !allowedVisibleCards.has(normalizedCard)) {
        hiddenCards.add(normalizedCard);
      }
    });
  });

  return [...hiddenCards];
}

function filterTrainerHiddenCardsForAfterMove(hiddenCards = [], legalMoves = []) {
  const allowedCards = new Set(
    (Array.isArray(legalMoves) ? legalMoves : [])
      .flatMap((move) => [move?.card, move?.id])
      .map((card) => normalizeGameplayCardToken(card))
      .filter(Boolean)
  );

  return (Array.isArray(hiddenCards) ? hiddenCards : []).filter((card) => {
    const normalizedCard = normalizeGameplayCardToken(card);
    return normalizedCard && !allowedCards.has(normalizedCard);
  });
}

function extractTrainerRatingFromText(text, fallback = null) {
  const normalized = String(text || '').trim();
  if (!normalized) {
    return fallback;
  }

  const slashTenMatch = normalized.match(/\b(\d(?:\.\d+)?)\s*\/\s*10\b/);
  if (slashTenMatch) {
    return clampTrainerRating(Number(slashTenMatch[1]), fallback ?? 5);
  }

  const ratingMatch = normalized.match(/\brating[:\s]+(\d(?:\.\d+)?)\b/i);
  if (ratingMatch) {
    return clampTrainerRating(Number(ratingMatch[1]), fallback ?? 5);
  }

  return fallback;
}

function getTrainerTextFieldPriority(mode) {
  if (mode === 'before_move') {
    return ['comment', 'moveComment', 'message', 'text', 'feedback'];
  }

  if (mode === 'after_move') {
    return ['feedback', 'comment', 'message', 'text', 'moveFeedback'];
  }

  if (mode === 'final_review') {
    return ['review', 'summary', 'finalReview', 'message', 'text'];
  }

  return ['comment', 'feedback', 'review', 'message', 'text'];
}

function extractTrainerVisibleText(mode, value) {
  if (typeof value === 'string') {
    const trimmed = normalizeTrainerVisibleSentence(value);
    if (!trimmed) {
      return '';
    }

    const parsedJson = parseJsonObject(trimmed);
    if (isPlainObject(parsedJson)) {
      return extractTrainerVisibleText(mode, parsedJson);
    }

    return trimmed;
  }

  if (!isPlainObject(value)) {
    return '';
  }

  for (const key of getTrainerTextFieldPriority(mode)) {
    const candidate = typeof value[key] === 'string'
      ? normalizeTrainerVisibleSentence(value[key])
      : '';
    if (candidate) {
      return candidate;
    }
  }

  return '';
}

function stripLeadingTrainerRatingPrefix(text) {
  return String(text || '')
    .trim()
    .replace(/^(?:move\s+rating|rating)\s*:\s*\d+(?:\.\d+)?\s*\/\s*10\.?\s*/i, '')
    .replace(/^\d+(?:\.\d+)?\s*\/\s*10\s*[-:]\s*/i, '')
    .trim();
}

function getTrainerCardMentionVariants(card) {
  const normalizedCard = normalizeGameplayCardToken(card);
  if (!normalizedCard) {
    return [];
  }

  const { value, suit } = parseCard(normalizedCard);
  const suitNames = {
    H: 'hearts',
    D: 'diamonds',
    C: 'clubs',
    S: 'spades'
  };
  const rankNames = {
    A: 'ace',
    K: 'king',
    Q: 'queen',
    J: 'jack',
    '10': 'ten',
    '9': 'nine',
    '8': 'eight',
    '7': 'seven',
    '6': 'six',
    '5': 'five',
    '4': 'four',
    '3': 'three',
    '2': 'two'
  };
  const suitWord = suitNames[suit] || '';
  const rankWord = rankNames[value] || String(value || '').toLowerCase();

  return [
    normalizedCard,
    `${value}-${suitWord}`,
    `${value} ${suitWord}`,
    `${value} of ${suitWord}`,
    `${rankWord} of ${suitWord}`,
    `${value}${suit}`,
    `${value}-${suit}`
  ]
    .map((variant) => normalizeTrainerVisibleSentence(variant).toLowerCase())
    .filter(Boolean);
}

function trainerTextMentionsCard(text, card) {
  const normalizedText = normalizeTrainerVisibleSentence(text).toLowerCase();
  if (!normalizedText) {
    return false;
  }

  return getTrainerCardMentionVariants(card).some((variant) => normalizedText.includes(variant));
}

function buildTrainerAfterMoveVisibleRepair({
  visibleText,
  hiddenCards = [],
  maxLength = 180,
  facts = null,
  fallbackFeedback = {}
} = {}) {
  const normalizedVisibleText = stripLeadingTrainerRatingPrefix(normalizeTrainerVisibleSentence(visibleText));
  const deterministicText = normalizeTrainerVisibleSentence(fallbackFeedback.feedback || '');
  let repairedText = normalizedVisibleText;

  if (!repairedText || !isSafeTrainerVisibleText(repairedText, {
    hiddenCards,
    maxLength,
    requireRating: false
  })) {
    repairedText = deterministicText;
  }

  if (!repairedText) {
    return null;
  }

  if (
    facts?.alternative
    && Number(facts.rating) < 6
    && !trainerTextMentionsCard(repairedText, facts.alternative)
  ) {
    repairedText = `Risky choice. ${facts.alternative} was the safer card here.`;
  }

  if (!isSafeTrainerVisibleText(repairedText, {
    hiddenCards,
    maxLength,
    requireRating: false
  })) {
    return null;
  }

  return {
    feedback: repairedText,
    source: repairedText === normalizedVisibleText ? 'llm' : 'llm-repaired',
    fallbackUsed: false,
    parserMode: repairedText === normalizedVisibleText ? 'plain-text' : 'plain-text-repair',
    errorCode: null,
    preview: repairedText
  };
}

function extractTrainerNumericField(value, keys = [], fallback = null) {
  if (!isPlainObject(value)) {
    return fallback;
  }

  for (const key of keys) {
    const candidate = Number(value[key]);
    if (Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return fallback;
}

function buildTrainerPlainTextRepairResult({
  mode,
  rawOutput,
  hiddenCards = [],
  fallbackResult = {},
  maxLength = 220,
  deterministicRating = null,
  deterministicStarRating = null,
  afterMoveFacts = null,
  finalReviewSummary = null
} = {}) {
  const parsedJson = parseJsonObject(rawOutput);
  const parsedPayload = isPlainObject(parsedJson) ? parsedJson : null;
  const visibleText = extractTrainerVisibleText(mode, parsedPayload || rawOutput);
  if (!isSafeTrainerVisibleText(visibleText, {
    hiddenCards,
    maxLength,
    requireRating: false
  })) {
    return null;
  }

  if (mode === 'before_move') {
    return {
      comment: visibleText,
      source: 'llm-repaired',
      fallbackUsed: false,
      parserMode: 'plain-text-repair',
      errorCode: null,
      preview: visibleText
    };
  }

  if (mode === 'after_move') {
    const extractedRating = clampTrainerRating(
      Number.isFinite(Number(deterministicRating))
        ? deterministicRating
        : extractTrainerNumericField(parsedPayload, ['rating', 'score', 'moveRating'], extractTrainerRatingFromText(visibleText, fallbackResult.rating ?? 5.5)),
      fallbackResult.rating ?? 5.5
    );
    const repairedFeedback = buildTrainerAfterMoveVisibleRepair({
      visibleText,
      hiddenCards,
      maxLength,
      facts: afterMoveFacts || { rating: extractedRating, alternative: fallbackResult?.alternative || '' },
      fallbackFeedback: fallbackResult
    });

    if (!repairedFeedback) {
      return null;
    }

    return {
      shouldComment: true,
      rating: extractedRating,
      feedback: repairedFeedback.feedback,
      source: 'llm-repaired',
      fallbackUsed: false,
      parserMode: repairedFeedback.parserMode,
      errorCode: null,
      preview: repairedFeedback.feedback
    };
  }

  if (mode === 'final_review') {
    const repairedReview = buildTrainerFinalReviewVisibleRepair({
      visibleText,
      hiddenCards,
      maxLength,
      finalReviewSummary,
      fallbackReview: fallbackResult
    });
    if (!repairedReview) {
      return null;
    }

    return {
      review: repairedReview.review,
      starRating: clampTrainerStarRating(
        Number.isFinite(Number(deterministicStarRating))
          ? deterministicStarRating
          : extractTrainerNumericField(parsedPayload, ['starRating', 'rating'], fallbackResult.starRating),
        3
      ),
      source: 'llm-repaired',
      fallbackUsed: false,
      parserMode: repairedReview.parserMode,
      errorCode: null,
      preview: repairedReview.review
    };
  }

  return null;
}

function sanitizeTrainerFinalReviewText(text, fallbackText) {
  const normalizedText = String(text || '').trim().replace(/\s+/g, ' ');
  if (!normalizedText) {
    return fallbackText;
  }

  const cleanedText = normalizedText
    .replace(/^(?:avoid any additional comments\.?\s*)+/i, '')
    .replace(/^(?:return only the (?:review|sentence|text)\.?\s*)+/i, '')
    .replace(/^(?:do not mention[^.]*\.\s*)+/i, '')
    .trim();
  const candidateText = cleanedText || normalizedText;

  if (
    candidateText === '{}'
    || candidateText === '[]'
    || /^[{[][\s\S]*[}\]]$/.test(candidateText)
  ) {
    return fallbackText;
  }

  if (
    /\/\s*10\b/i.test(candidateText)
    || /\bout of 10\b/i.test(candidateText)
    || /\b(?:star|stars)\b/i.test(candidateText)
    || /\b(?:numeric|number)\s+rating\b/i.test(candidateText)
  ) {
    return fallbackText;
  }

  return candidateText;
}

function buildCompactTrainerFinalReviewFromSummary(summary = null) {
  const rulesetLabel = summary?.rulesetLabel || 'this ruleset';
  const strength = normalizeTrainerVisibleSentence(summary?.strength || 'found a few solid turns');
  const suggestedFocus = normalizeTrainerVisibleSentence(summary?.suggestedFocus || 'plan one safer move earlier');
  return `In ${rulesetLabel}, you ${strength}. Next time, ${suggestedFocus}.`;
}

function buildTrainerFinalReviewVisibleRepair({
  visibleText,
  hiddenCards = [],
  maxLength = 220,
  finalReviewSummary = null,
  fallbackReview = {}
} = {}) {
  const sanitizedReview = sanitizeTrainerFinalReviewText(visibleText, '');
  const compactReview = buildCompactTrainerFinalReviewFromSummary(finalReviewSummary);
  let repairedReview = sanitizedReview;

  if (!repairedReview || !isSafeTrainerVisibleText(repairedReview, {
    hiddenCards,
    maxLength
  })) {
    repairedReview = compactReview;
  }

  if (!repairedReview || !isSafeTrainerVisibleText(repairedReview, {
    hiddenCards,
    maxLength
  })) {
    const fallbackText = sanitizeTrainerFinalReviewText(fallbackReview.review || '', '');
    repairedReview = fallbackText;
  }

  if (!repairedReview || !isSafeTrainerVisibleText(repairedReview, {
    hiddenCards,
    maxLength
  })) {
    return null;
  }

  return {
    review: repairedReview,
    source: repairedReview === sanitizedReview ? 'llm' : 'llm-repaired',
    parserMode: repairedReview === sanitizedReview ? 'plain-text' : 'plain-text-repair'
  };
}

function normalizeTrainerFeedbackSnippet(text) {
  return stripLeadingTrainerRatingPrefix(String(text || ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function buildTrainerFinalReviewSummary({
  training = null,
  feedbackEntries = [],
  roundSummaries = []
} = {}) {
  const normalizedFeedback = Array.isArray(feedbackEntries) ? feedbackEntries : [];
  const rulesetLabel = training?.selectedRulesetLabel || roundSummaries?.[0]?.rulesetLabel || 'this ruleset';
  const totalRounds = Number(training?.totalRounds || roundSummaries.length || 0);
  const averageMoveRating = normalizedFeedback.length > 0
    ? normalizedFeedback.reduce((sum, entry) => sum + clampTrainerRating(entry?.rating, 0), 0) / normalizedFeedback.length
    : 6;
  const bestEntry = normalizedFeedback.reduce((best, entry) => (
    !best || clampTrainerRating(entry?.rating, 0) > clampTrainerRating(best?.rating, 0)
      ? entry
      : best
  ), null);
  const worstEntry = normalizedFeedback.reduce((worst, entry) => (
    !worst || clampTrainerRating(entry?.rating, 10) < clampTrainerRating(worst?.rating, 10)
      ? entry
      : worst
  ), null);
  const bestRating = bestEntry ? clampTrainerRating(bestEntry.rating, 8) : clampTrainerRating(averageMoveRating + 1.2, 7.5);
  const worstRating = worstEntry ? clampTrainerRating(worstEntry.rating, 4.5) : clampTrainerRating(averageMoveRating - 1.2, 4.5);
  const bestText = normalizeTrainerFeedbackSnippet(bestEntry?.feedback || '');
  const worstText = normalizeTrainerFeedbackSnippet(worstEntry?.feedback || '');
  const starRating = clampTrainerStarRating(averageMoveRating / 2, 3);

  let strength = 'found a few solid, objective-friendly turns';
  if (/avoid|avoided|safe|safer|control|manageable/i.test(bestText)) {
    strength = 'avoided the main danger on your stronger turns';
  } else if (/good choice|strong choice|protected the objective/i.test(bestText)) {
    strength = 'made calm, objective-friendly decisions when the line was clear';
  }

  let commonMistake = 'chose the risky line when a safer option existed';
  if (/safer choice|safer card|calmer legal move|risk/i.test(worstText)) {
    commonMistake = 'let risky cards go too early when a safer legal line existed';
  } else if (/forced/i.test(worstText)) {
    commonMistake = 'had a few turns where the position became awkward too early';
  }

  let suggestedFocus = `slow down and keep one safer exit card for ${rulesetLabel}`;
  if (/trick/i.test(worstText)) {
    suggestedFocus = `read the trick one move earlier before committing a risky card in ${rulesetLabel}`;
  } else if (/danger/i.test(worstText) || /risk/i.test(worstText)) {
    suggestedFocus = `keep the danger card parked until the safer option disappears in ${rulesetLabel}`;
  }

  return {
    rulesetLabel,
    totalRounds,
    averageMoveRating: Math.round(averageMoveRating * 10) / 10,
    bestRating,
    worstRating,
    strength,
    commonMistake,
    suggestedFocus,
    starRating
  };
}

function buildTrainerFinalReviewFallback({
  training = null,
  feedbackEntries = [],
  roundSummaries = []
} = {}) {
  const summary = buildTrainerFinalReviewSummary({
    training,
    feedbackEntries,
    roundSummaries
  });
  const review = buildCompactTrainerFinalReviewFromSummary(summary);

  return {
    review: sanitizeTrainerFinalReviewText(review, `You completed a useful ${summary.rulesetLabel} session. Keep focusing on safer timing next time.`),
    starRating: summary.starRating
  };
}

function getTrainerResponseDiagnostics(response = null, fallbackPreview = '') {
  const diagnostics = response?.diagnostics || {};
  return {
    rawResponsePreview: diagnostics.rawResponsePreview || sanitizeDebugPreview(response?.rawOutput || fallbackPreview, 160),
    rawResponseLength: Math.max(
      0,
      Math.round(Number(
        diagnostics.rawResponseLength
        || String(response?.rawOutput || fallbackPreview || '').length
      ) || 0)
    ),
    parseStep: diagnostics.parseStep || '',
    parseErrorMessage: diagnostics.parseErrorMessage || '',
    validationErrorMessage: diagnostics.validationErrorMessage || ''
  };
}

function buildTrainerAttemptDebugMeta({
  stage,
  runtimeConfig,
  resolvedTimeoutMs,
  promptLength,
  payloadLength,
  elapsedMs,
  source,
  fallbackUsed,
  errorCode,
  parserMode = 'fallback',
  preview = '',
  response = null,
  sourceBeforeFallback = '',
  fallbackReason = ''
} = {}) {
  const diagnostics = getTrainerResponseDiagnostics(response, preview);
  return buildTrainerDecisionDebugMeta({
    source,
    fallbackUsed,
    elapsedMs,
    errorCode,
    mode: runtimeConfig?.mode,
    model: runtimeConfig?.modelName,
    timeoutMs: resolvedTimeoutMs,
    numPredict: runtimeConfig?.numPredict,
    promptLength,
    payloadLength,
    parserMode,
    preview,
    stage,
    rawResponsePreview: diagnostics.rawResponsePreview,
    rawResponseLength: diagnostics.rawResponseLength,
    parseStep: diagnostics.parseStep,
    parseErrorMessage: diagnostics.parseErrorMessage,
    validationErrorMessage: diagnostics.validationErrorMessage,
    sourceBeforeFallback,
    finalSource: source,
    fallbackReason
  });
}

async function generateTrainerPreMoveComment({
  gameState,
  trainerPlayer,
  legalMoves = [],
  selectedMove,
  ruleset = null,
  timeoutMs = null,
  returnMetadata = false
} = {}) {
  const runtimeConfig = getTrainerRuntimeConfig({
    stage: 'before_move'
  });
  const stage = 'before_move';
  const startedAt = Date.now();
  if (!selectedMove || !isTrainerBot(trainerPlayer)) {
    const elapsedMs = Date.now() - startedAt;
    return returnMetadata
      ? {
        comment: '',
        source: 'fallback',
        fallbackUsed: true,
        elapsedMs,
        errorCode: 'trainer_pre_move_unavailable',
        mode: runtimeConfig.mode,
        model: runtimeConfig.modelName,
        timeoutMs: runtimeConfig.timeoutMs,
        numPredict: runtimeConfig.numPredict,
        promptLength: 0,
        payloadLength: 0,
        debugMeta: buildTrainerAttemptDebugMeta({
          stage,
          runtimeConfig,
          resolvedTimeoutMs: runtimeConfig.timeoutMs,
          promptLength: 0,
          payloadLength: 0,
          elapsedMs,
          source: 'fallback',
          fallbackUsed: true,
          errorCode: 'trainer_pre_move_unavailable',
          parserMode: 'fallback',
          preview: '',
          sourceBeforeFallback: 'none',
          fallbackReason: 'trainer_pre_move_unavailable'
        })
      }
      : '';
  }

  const fallbackComment = buildTrainerPreMoveFallbackComment({
    selectedMove,
    legalMoves,
    ruleset
  });
  const promptSpec = buildTrainerPreMovePrompt({
    gameState,
    trainerPlayer,
    legalMoves,
    selectedMove,
    ruleset,
    runtimeMode: runtimeConfig.mode
  });
  const promptLength = promptSpec.rawPrompt
    ? promptSpec.rawPrompt.length
    : promptSpec.systemPrompt.length + promptSpec.humanPrompt.length;
  const payloadLength = promptSpec.rawPrompt
    ? promptSpec.rawPrompt.length
    : promptSpec.humanPrompt.length;
  const resolvedTimeoutMs = timeoutMs || runtimeConfig.timeoutMs;
  const hiddenCards = collectTrainerHiddenCards({
    gameState,
    trainerPlayer,
    selectedMove
  });

  try {
    if (runtimeConfig.mode !== 'deep') {
      const useDirectLocalGenerate = isLikelyLocalOllamaBaseUrl(runtimeConfig.baseUrl);
      const response = useDirectLocalGenerate
        ? await queryPlainTextLocalGenerateResponse({
          prompt: promptSpec.rawPrompt || [promptSpec.systemPrompt, promptSpec.humanPrompt].filter(Boolean).join('\n'),
          modelName: runtimeConfig.modelName,
          baseUrl: runtimeConfig.baseUrl,
          timeoutMs: resolvedTimeoutMs,
          temperature: runtimeConfig.temperature,
          numPredict: runtimeConfig.numPredict,
          topP: runtimeConfig.topP,
          keepAlive: runtimeConfig.keepAlive,
          requestType: 'trainer-live',
          priority: 1,
          skipWhenGameplayPending: true
        })
        : await queryPlainTextBotResponse({
          systemPrompt: promptSpec.systemPrompt || 'You are a Rentz trainer.',
          humanPrompt: promptSpec.rawPrompt || promptSpec.humanPrompt,
          modelName: runtimeConfig.modelName,
          baseUrl: runtimeConfig.baseUrl,
          timeoutMs: resolvedTimeoutMs,
          temperature: runtimeConfig.temperature,
          numPredict: runtimeConfig.numPredict,
          topP: runtimeConfig.topP,
          keepAlive: runtimeConfig.keepAlive,
          requestType: 'trainer-live',
          priority: 1,
          skipWhenGameplayPending: true
        });
      const elapsedMs = Date.now() - startedAt;

      if (!response.success) {
        const repaired = response.rawOutput && looksLikeJsonPayload(response.rawOutput)
          ? buildTrainerPlainTextRepairResult({
            mode: 'before_move',
            rawOutput: response.rawOutput,
            hiddenCards,
            fallbackResult: { comment: fallbackComment },
            maxLength: 140
          })
          : null;
        if (repaired) {
          return returnMetadata
            ? {
              comment: repaired.comment,
              source: repaired.source,
              fallbackUsed: repaired.fallbackUsed,
              elapsedMs,
              errorCode: repaired.errorCode,
              mode: runtimeConfig.mode,
              model: runtimeConfig.modelName,
              timeoutMs: resolvedTimeoutMs,
              numPredict: runtimeConfig.numPredict,
              promptLength,
              payloadLength,
              debugMeta: buildTrainerAttemptDebugMeta({
                stage,
                runtimeConfig,
                resolvedTimeoutMs,
                promptLength,
                payloadLength,
                elapsedMs,
                source: repaired.source,
                fallbackUsed: repaired.fallbackUsed,
                errorCode: repaired.errorCode,
                parserMode: repaired.parserMode,
                preview: repaired.preview,
                response,
                sourceBeforeFallback: 'llm'
              })
            }
            : repaired.comment;
        }

        return returnMetadata
          ? {
            comment: fallbackComment,
            source: 'fallback',
            fallbackUsed: true,
            elapsedMs,
            errorCode: response.error || 'invalid-plain-text-output',
            mode: runtimeConfig.mode,
            model: runtimeConfig.modelName,
            timeoutMs: resolvedTimeoutMs,
            numPredict: runtimeConfig.numPredict,
            promptLength,
            payloadLength,
            debugMeta: buildTrainerAttemptDebugMeta({
              stage,
              runtimeConfig,
              resolvedTimeoutMs,
              promptLength,
              payloadLength,
              elapsedMs,
              source: 'fallback',
              fallbackUsed: true,
              errorCode: response.error || 'invalid-plain-text-output',
              parserMode: 'fallback',
              preview: response.rawOutput || fallbackComment,
              response,
              sourceBeforeFallback: 'llm',
              fallbackReason: response.error || 'invalid-plain-text-output'
            })
          }
          : fallbackComment;
      }

      if (looksLikeJsonPayload(response.text)) {
        const repaired = buildTrainerPlainTextRepairResult({
          mode: 'before_move',
          rawOutput: response.text,
          hiddenCards,
          fallbackResult: { comment: fallbackComment },
          maxLength: 140
        });
        if (repaired) {
          return returnMetadata
            ? {
              comment: repaired.comment,
              source: repaired.source,
              fallbackUsed: repaired.fallbackUsed,
              elapsedMs,
              errorCode: repaired.errorCode,
              mode: runtimeConfig.mode,
              model: runtimeConfig.modelName,
              timeoutMs: resolvedTimeoutMs,
              numPredict: runtimeConfig.numPredict,
              promptLength,
              payloadLength,
              debugMeta: buildTrainerAttemptDebugMeta({
                stage,
                runtimeConfig,
                resolvedTimeoutMs,
                promptLength,
                payloadLength,
                elapsedMs,
                source: repaired.source,
                fallbackUsed: repaired.fallbackUsed,
                errorCode: repaired.errorCode,
                parserMode: repaired.parserMode,
                preview: repaired.preview,
                response,
                sourceBeforeFallback: 'llm'
              })
            }
            : repaired.comment;
        }
      }

      const comment = normalizeTrainerVisibleSentence(response.text);
      if (!isSafeTrainerVisibleText(comment, {
        hiddenCards,
        maxLength: 140,
        requireRating: false
      })) {
        return returnMetadata
          ? {
            comment: fallbackComment,
            source: 'fallback',
            fallbackUsed: true,
            elapsedMs,
            errorCode: 'empty-comment',
            mode: runtimeConfig.mode,
            model: runtimeConfig.modelName,
            timeoutMs: resolvedTimeoutMs,
            numPredict: runtimeConfig.numPredict,
            promptLength,
            payloadLength,
            debugMeta: buildTrainerAttemptDebugMeta({
              stage,
              runtimeConfig,
              resolvedTimeoutMs,
              promptLength,
              payloadLength,
              elapsedMs,
              source: 'fallback',
              fallbackUsed: true,
              errorCode: 'empty-comment',
              parserMode: 'fallback',
              preview: response.rawOutput || fallbackComment,
              response,
              sourceBeforeFallback: 'llm',
              fallbackReason: 'empty-comment'
            })
          }
          : fallbackComment;
      }

      return returnMetadata
        ? {
          comment,
          source: 'llm',
          fallbackUsed: false,
          elapsedMs,
          errorCode: null,
          mode: runtimeConfig.mode,
          model: runtimeConfig.modelName,
          timeoutMs: resolvedTimeoutMs,
          numPredict: runtimeConfig.numPredict,
          promptLength,
          payloadLength,
          debugMeta: buildTrainerAttemptDebugMeta({
            stage,
            runtimeConfig,
            resolvedTimeoutMs,
            promptLength,
            payloadLength,
            elapsedMs,
            source: 'llm',
            fallbackUsed: false,
            errorCode: null,
            parserMode: 'plain-text',
            preview: comment,
            response,
            sourceBeforeFallback: 'llm'
          })
        }
        : comment;
    }

    const { z } = await loadLangChainRuntime();
    const schema = z.object({
      comment: z.string().min(1).max(220).optional(),
      moveComment: z.string().min(1).max(220).optional(),
      message: z.string().min(1).max(220).optional(),
      text: z.string().min(1).max(220).optional(),
      feedback: z.string().min(1).max(220).optional()
    }).passthrough();
    const useDirectLocalGenerate = runtimeConfig.mode !== 'deep' && isLikelyLocalOllamaBaseUrl(runtimeConfig.baseUrl);
    const response = useDirectLocalGenerate
      ? await queryStructuredLocalGenerateResponse({
        schema,
        prompt: promptSpec.rawPrompt || [promptSpec.systemPrompt, promptSpec.humanPrompt].filter(Boolean).join('\n'),
        modelName: runtimeConfig.modelName,
        baseUrl: runtimeConfig.baseUrl,
        timeoutMs: resolvedTimeoutMs,
        temperature: runtimeConfig.temperature,
        numPredict: runtimeConfig.numPredict,
        topP: runtimeConfig.topP,
        keepAlive: runtimeConfig.keepAlive,
        requestType: 'trainer-live',
        priority: 1,
        skipWhenGameplayPending: true
      })
      : await queryStructuredBotResponse({
        schema,
        systemPrompt: promptSpec.systemPrompt,
        humanPrompt: promptSpec.humanPrompt,
        modelName: runtimeConfig.modelName,
        baseUrl: runtimeConfig.baseUrl,
        timeoutMs: resolvedTimeoutMs,
        temperature: runtimeConfig.temperature,
        numPredict: runtimeConfig.numPredict,
        topP: runtimeConfig.topP,
        keepAlive: runtimeConfig.keepAlive,
        requestType: 'trainer-live',
        priority: 1,
        skipWhenGameplayPending: true
      });

    if (!response.success) {
      const repaired = buildTrainerPlainTextRepairResult({
        mode: 'before_move',
        rawOutput: response.rawOutput,
        hiddenCards,
        fallbackResult: { comment: fallbackComment },
        maxLength: runtimeConfig.mode === 'deep' ? 220 : 140
      });
      const elapsedMs = Date.now() - startedAt;
      if (repaired) {
        return returnMetadata
          ? {
            comment: repaired.comment,
            source: repaired.source,
            fallbackUsed: repaired.fallbackUsed,
            elapsedMs,
            errorCode: repaired.errorCode,
            mode: runtimeConfig.mode,
            model: runtimeConfig.modelName,
            timeoutMs: resolvedTimeoutMs,
            numPredict: runtimeConfig.numPredict,
            promptLength,
            payloadLength,
            debugMeta: buildTrainerAttemptDebugMeta({
              stage,
              runtimeConfig,
              resolvedTimeoutMs,
              promptLength,
              payloadLength,
              elapsedMs,
              source: repaired.source,
              fallbackUsed: repaired.fallbackUsed,
              errorCode: repaired.errorCode,
              parserMode: repaired.parserMode,
              preview: repaired.preview,
              response,
              sourceBeforeFallback: 'llm',
              fallbackReason: ''
            })
          }
          : repaired.comment;
      }

      return returnMetadata
        ? {
          comment: fallbackComment,
          source: 'fallback',
          fallbackUsed: true,
          elapsedMs,
          errorCode: response.error || 'invalid-structured-output',
          mode: runtimeConfig.mode,
          model: runtimeConfig.modelName,
          timeoutMs: resolvedTimeoutMs,
          numPredict: runtimeConfig.numPredict,
          promptLength,
          payloadLength,
          debugMeta: buildTrainerAttemptDebugMeta({
            stage,
            runtimeConfig,
            resolvedTimeoutMs,
            promptLength,
            payloadLength,
            elapsedMs,
            source: 'fallback',
            fallbackUsed: true,
            errorCode: response.error || 'invalid-structured-output',
            parserMode: 'fallback',
            preview: response.rawOutput || fallbackComment,
            response,
            sourceBeforeFallback: 'llm',
            fallbackReason: response.error || 'invalid-structured-output'
          })
        }
        : fallbackComment;
    }

    const comment = extractTrainerVisibleText('before_move', response.data);
    const elapsedMs = Date.now() - startedAt;
    if (!isSafeTrainerVisibleText(comment, {
      hiddenCards,
      maxLength: runtimeConfig.mode === 'deep' ? 220 : 140,
      requireRating: false
    })) {
      return returnMetadata
        ? {
          comment: fallbackComment,
          source: 'fallback',
          fallbackUsed: true,
          elapsedMs,
          errorCode: 'empty-comment',
          mode: runtimeConfig.mode,
          model: runtimeConfig.modelName,
          timeoutMs: resolvedTimeoutMs,
          numPredict: runtimeConfig.numPredict,
          promptLength,
          payloadLength,
          debugMeta: buildTrainerAttemptDebugMeta({
            stage,
            runtimeConfig,
            resolvedTimeoutMs,
            promptLength,
            payloadLength,
            elapsedMs,
            source: 'fallback',
            fallbackUsed: true,
            errorCode: 'empty-comment',
            parserMode: 'fallback',
            preview: response.rawOutput || fallbackComment,
            response,
            sourceBeforeFallback: 'llm',
            fallbackReason: 'empty-comment'
          })
        }
        : fallbackComment;
    }

    return returnMetadata
      ? {
        comment,
        source: 'llm',
        fallbackUsed: false,
        elapsedMs,
        errorCode: null,
        mode: runtimeConfig.mode,
        model: runtimeConfig.modelName,
        timeoutMs: resolvedTimeoutMs,
        numPredict: runtimeConfig.numPredict,
        promptLength,
        payloadLength,
        debugMeta: buildTrainerAttemptDebugMeta({
          stage,
          runtimeConfig,
          resolvedTimeoutMs,
          promptLength,
          payloadLength,
          elapsedMs,
          source: 'llm',
          fallbackUsed: false,
          errorCode: null,
          parserMode: 'json',
          preview: comment,
          response,
          sourceBeforeFallback: 'llm'
        })
      }
      : comment;
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const errorCode = normalizeBotErrorCode(error, 'trainer_pre_move_error');
    return returnMetadata
      ? {
        comment: fallbackComment,
        source: 'fallback',
        fallbackUsed: true,
        elapsedMs,
        errorCode,
        mode: runtimeConfig.mode,
        model: runtimeConfig.modelName,
        timeoutMs: resolvedTimeoutMs,
        numPredict: runtimeConfig.numPredict,
        promptLength,
        payloadLength,
        debugMeta: buildTrainerAttemptDebugMeta({
          stage,
          runtimeConfig,
          resolvedTimeoutMs,
          promptLength,
          payloadLength,
          elapsedMs,
          source: 'fallback',
          fallbackUsed: true,
          errorCode,
          parserMode: 'fallback',
          preview: fallbackComment,
          sourceBeforeFallback: 'llm',
          fallbackReason: error?.message || errorCode
        })
      }
      : fallbackComment;
  }
}

function buildTrainerAfterMovePromptPayload({
  gameState,
  humanPlayer,
  playedCard,
  legalMoves = [],
  ruleset = null,
  currentTrickBeforeMove = [],
  runtimeMode = getTrainerBotMode()
} = {}) {
  const facts = buildTrainerAfterMoveFacts({
    playedCard,
    legalMoves,
    ruleset,
    currentTrickBeforeMove
  });

  return {
    promptShape: runtimeMode === 'deep' ? 'trainer-after-move-deep' : 'trainer-after-move-fast',
    playedCard,
    ruleset: ruleset
      ? {
        id: ruleset.id,
        label: ruleset.label,
        objective: facts.objective
      }
      : null,
    rating: facts.rating,
    tone: facts.tone,
    issue: facts.issue,
    saferAlternativeCard: facts.alternative || ''
  };
}

function buildTrainerAfterMovePrompt(args = {}) {
  const runtimeMode = args.runtimeMode === 'deep' ? 'deep' : 'fast';
  if (runtimeMode !== 'deep') {
    const payload = buildTrainerAfterMovePromptPayload({
      ...args,
      runtimeMode
    });

    return {
      systemPrompt: '',
      humanPrompt: '',
      rawPrompt: [
        'You are a Rentz trainer.',
        'Write ONE short feedback sentence, max 22 words.',
        `Rating: ${payload.rating}/10.`,
        `Tone: ${payload.tone || 'neutral'}.`,
        `Objective: ${payload.ruleset?.objective || 'Improve score safely'}.`,
        `Issue: ${payload.issue || 'kept the move balanced'}.`,
        `Safer alternative: ${payload.saferAlternativeCard || 'none'}.`,
        'Do not mention hidden cards, JSON, or analysis.',
        'Return only the sentence.'
      ].join('\n')
    };
  }

  const systemPrompt = [
    'You are Trainer, a constructive Rentz coaching bot.',
    'Evaluate a human player move in one short chat message.',
    'Only comment when the move is strategically meaningful.',
    'Include a rating out of 10 inside the feedback text when you choose to comment.',
    'Use the full rating scale.',
    'For penalty-avoidance rulesets, a clearly safer move that avoids the obvious penalty line is usually 8-10.',
    'For penalty-avoidance rulesets, a risky move that leans into the obvious penalty line is usually 0-5.',
    'Keep the numeric rating aligned with the written judgment.',
    'If the feedback says the move was risky, worse than a safer alternative, or should usually be avoided, keep the rating at 5 or below.',
    'Stay inside the provided ratingHintBand unless the public trick context gives a strong reason not to.',
    'If selectedIsBestMove is true, treat the played card as the best public option in this position.',
    'If saferAlternativeCard is provided and the move is below 6, mention that concrete alternative.',
    'Never describe a danger card, penalty card, or worse-rated legal move as the safer or better option.',
    'Do not reveal hidden opponent cards, your hidden hand, or chain-of-thought.',
    runtimeMode === 'deep'
      ? 'Return JSON only with keys shouldComment, rating, feedback.'
      : 'Return JSON only with keys shouldComment, rating, feedback. Keep feedback under 140 characters when possible.'
  ].join(' ');
  const humanPrompt = JSON.stringify(buildTrainerAfterMovePromptPayload({
    ...args,
    runtimeMode
  }));

  return {
    systemPrompt,
    humanPrompt
  };
}

async function evaluateTrainerPlayerMove({
  gameState,
  trainerPlayer,
  humanPlayer,
  playedCard,
  legalMoves = [],
  ruleset = null,
  currentTrickBeforeMove = [],
  timeoutMs = null,
  returnMetadata = false
} = {}) {
  const runtimeConfig = getTrainerRuntimeConfig({
    stage: 'after_move'
  });
  const stage = 'after_move';
  const startedAt = Date.now();
  const afterMoveFacts = buildTrainerAfterMoveFacts({
    playedCard,
    legalMoves,
    ruleset,
    currentTrickBeforeMove
  });
  const fallbackFeedback = buildTrainerMoveFeedbackFallback({
    playedCard,
    legalMoves,
    ruleset,
    currentTrickBeforeMove
  });
  const promptSpec = buildTrainerAfterMovePrompt({
    gameState,
    humanPlayer,
    playedCard,
    legalMoves,
    ruleset,
    currentTrickBeforeMove,
    runtimeMode: runtimeConfig.mode
  });
  const promptLength = promptSpec.rawPrompt
    ? promptSpec.rawPrompt.length
    : promptSpec.systemPrompt.length + promptSpec.humanPrompt.length;
  const payloadLength = promptSpec.rawPrompt
    ? promptSpec.rawPrompt.length
    : promptSpec.humanPrompt.length;
  const resolvedTimeoutMs = timeoutMs || runtimeConfig.timeoutMs;
  const hiddenCards = collectTrainerHiddenCards({
    gameState,
    trainerPlayer,
    humanPlayer,
    playedCard
  });
  const feedbackHiddenCards = filterTrainerHiddenCardsForAfterMove(hiddenCards, legalMoves);

  if (!isTrainerBot(trainerPlayer) || !humanPlayer || legalMoves.length <= 1) {
    const elapsedMs = Date.now() - startedAt;
    return returnMetadata
      ? {
        ...fallbackFeedback,
        source: 'fallback',
        fallbackUsed: true,
        elapsedMs,
        errorCode: 'trainer_after_move_unavailable',
        mode: runtimeConfig.mode,
        model: runtimeConfig.modelName,
        timeoutMs: resolvedTimeoutMs,
        numPredict: runtimeConfig.numPredict,
        promptLength,
        payloadLength,
        debugMeta: buildTrainerAttemptDebugMeta({
          stage,
          runtimeConfig,
          resolvedTimeoutMs,
          promptLength,
          payloadLength,
          elapsedMs,
          source: 'fallback',
          fallbackUsed: true,
          errorCode: 'trainer_after_move_unavailable',
          parserMode: 'fallback',
          preview: fallbackFeedback.feedback,
          sourceBeforeFallback: 'none',
          fallbackReason: 'trainer_after_move_unavailable'
        })
      }
      : fallbackFeedback;
  }

  try {
    if (runtimeConfig.mode !== 'deep') {
      const useDirectLocalGenerate = isLikelyLocalOllamaBaseUrl(runtimeConfig.baseUrl);
      const response = useDirectLocalGenerate
        ? await queryPlainTextLocalGenerateResponse({
          prompt: promptSpec.rawPrompt || [promptSpec.systemPrompt, promptSpec.humanPrompt].filter(Boolean).join('\n'),
          modelName: runtimeConfig.modelName,
          baseUrl: runtimeConfig.baseUrl,
          timeoutMs: resolvedTimeoutMs,
          temperature: runtimeConfig.temperature,
          numPredict: runtimeConfig.numPredict,
          topP: runtimeConfig.topP,
          keepAlive: runtimeConfig.keepAlive,
          requestType: 'trainer-live',
          priority: 1,
          skipWhenGameplayPending: true
        })
        : await queryPlainTextBotResponse({
          systemPrompt: promptSpec.systemPrompt || 'You are a Rentz trainer.',
          humanPrompt: promptSpec.rawPrompt || promptSpec.humanPrompt,
          modelName: runtimeConfig.modelName,
          baseUrl: runtimeConfig.baseUrl,
          timeoutMs: resolvedTimeoutMs,
          temperature: runtimeConfig.temperature,
          numPredict: runtimeConfig.numPredict,
          topP: runtimeConfig.topP,
          keepAlive: runtimeConfig.keepAlive,
          requestType: 'trainer-live',
          priority: 1,
          skipWhenGameplayPending: true
        });
      const elapsedMs = Date.now() - startedAt;

      if (!response.success) {
        const repaired = response.rawOutput && looksLikeJsonPayload(response.rawOutput)
          ? buildTrainerPlainTextRepairResult({
            mode: 'after_move',
            rawOutput: response.rawOutput,
            hiddenCards: feedbackHiddenCards,
            fallbackResult: fallbackFeedback,
            maxLength: 180,
            deterministicRating: afterMoveFacts.rating,
            afterMoveFacts
          })
          : null;
        if (repaired) {
          return returnMetadata
            ? {
              shouldComment: repaired.shouldComment,
              rating: afterMoveFacts.rating,
              feedback: repaired.feedback,
              source: repaired.source,
              fallbackUsed: repaired.fallbackUsed,
              elapsedMs,
              errorCode: repaired.errorCode,
              mode: runtimeConfig.mode,
              model: runtimeConfig.modelName,
              timeoutMs: resolvedTimeoutMs,
              numPredict: runtimeConfig.numPredict,
              promptLength,
              payloadLength,
              debugMeta: buildTrainerAttemptDebugMeta({
                stage,
                runtimeConfig,
                resolvedTimeoutMs,
                promptLength,
                payloadLength,
                elapsedMs,
                source: repaired.source,
                fallbackUsed: repaired.fallbackUsed,
                errorCode: repaired.errorCode,
                parserMode: repaired.parserMode,
                preview: repaired.preview,
                response,
                sourceBeforeFallback: 'llm'
              })
            }
            : {
              shouldComment: repaired.shouldComment,
              rating: afterMoveFacts.rating,
              feedback: repaired.feedback
            };
        }

        return returnMetadata
          ? {
            ...fallbackFeedback,
            source: 'fallback',
            fallbackUsed: true,
            elapsedMs,
            errorCode: response.error || 'invalid-plain-text-output',
            mode: runtimeConfig.mode,
            model: runtimeConfig.modelName,
            timeoutMs: resolvedTimeoutMs,
            numPredict: runtimeConfig.numPredict,
            promptLength,
            payloadLength,
            debugMeta: buildTrainerAttemptDebugMeta({
              stage,
              runtimeConfig,
              resolvedTimeoutMs,
              promptLength,
              payloadLength,
              elapsedMs,
              source: 'fallback',
              fallbackUsed: true,
              errorCode: response.error || 'invalid-plain-text-output',
              parserMode: 'fallback',
              preview: response.rawOutput || fallbackFeedback.feedback,
              response,
              sourceBeforeFallback: 'llm',
              fallbackReason: response.error || 'invalid-plain-text-output'
            })
          }
          : fallbackFeedback;
      }

      if (looksLikeJsonPayload(response.text)) {
        const repaired = buildTrainerPlainTextRepairResult({
          mode: 'after_move',
          rawOutput: response.text,
          hiddenCards: feedbackHiddenCards,
          fallbackResult: fallbackFeedback,
          maxLength: 180,
          deterministicRating: afterMoveFacts.rating,
          afterMoveFacts
        });
        if (repaired) {
          return returnMetadata
            ? {
              shouldComment: repaired.shouldComment,
              rating: afterMoveFacts.rating,
              feedback: repaired.feedback,
              source: repaired.source,
              fallbackUsed: repaired.fallbackUsed,
              elapsedMs,
              errorCode: repaired.errorCode,
              mode: runtimeConfig.mode,
              model: runtimeConfig.modelName,
              timeoutMs: resolvedTimeoutMs,
              numPredict: runtimeConfig.numPredict,
              promptLength,
              payloadLength,
              debugMeta: buildTrainerAttemptDebugMeta({
                stage,
                runtimeConfig,
                resolvedTimeoutMs,
                promptLength,
                payloadLength,
                elapsedMs,
                source: repaired.source,
                fallbackUsed: repaired.fallbackUsed,
                errorCode: repaired.errorCode,
                parserMode: repaired.parserMode,
                preview: repaired.preview,
                response,
                sourceBeforeFallback: 'llm'
              })
            }
            : {
              shouldComment: repaired.shouldComment,
              rating: afterMoveFacts.rating,
              feedback: repaired.feedback
            };
        }
      }

      const repairedVisibleFeedback = buildTrainerAfterMoveVisibleRepair({
        visibleText: response.text,
        hiddenCards: feedbackHiddenCards,
        maxLength: 180,
        facts: afterMoveFacts,
        fallbackFeedback
      });
      if (!repairedVisibleFeedback) {
        return returnMetadata
          ? {
            ...fallbackFeedback,
            source: 'fallback',
            fallbackUsed: true,
            elapsedMs,
            errorCode: 'empty-feedback',
            mode: runtimeConfig.mode,
            model: runtimeConfig.modelName,
            timeoutMs: resolvedTimeoutMs,
            numPredict: runtimeConfig.numPredict,
            promptLength,
            payloadLength,
            debugMeta: buildTrainerAttemptDebugMeta({
              stage,
              runtimeConfig,
              resolvedTimeoutMs,
              promptLength,
              payloadLength,
              elapsedMs,
              source: 'fallback',
              fallbackUsed: true,
              errorCode: 'empty-feedback',
              parserMode: 'fallback',
              preview: response.rawOutput || fallbackFeedback.feedback,
              response,
              sourceBeforeFallback: 'llm',
              fallbackReason: 'empty-feedback'
            })
          }
          : fallbackFeedback;
      }

      const result = {
        shouldComment: true,
        rating: afterMoveFacts.rating,
        feedback: repairedVisibleFeedback.feedback
      };
      return returnMetadata
        ? {
          ...result,
          source: repairedVisibleFeedback.source,
          fallbackUsed: repairedVisibleFeedback.fallbackUsed,
          elapsedMs,
          errorCode: repairedVisibleFeedback.errorCode,
          mode: runtimeConfig.mode,
          model: runtimeConfig.modelName,
          timeoutMs: resolvedTimeoutMs,
          numPredict: runtimeConfig.numPredict,
          promptLength,
          payloadLength,
          debugMeta: buildTrainerAttemptDebugMeta({
            stage,
            runtimeConfig,
            resolvedTimeoutMs,
              promptLength,
              payloadLength,
              elapsedMs,
              source: repairedVisibleFeedback.source,
              fallbackUsed: repairedVisibleFeedback.fallbackUsed,
              errorCode: repairedVisibleFeedback.errorCode,
              parserMode: repairedVisibleFeedback.parserMode,
              preview: result.feedback,
              response,
              sourceBeforeFallback: 'llm'
          })
        }
        : result;
    }

    const { z } = await loadLangChainRuntime();
    const schema = z.object({
      shouldComment: z.boolean().optional(),
      rating: z.number().min(0).max(10).optional(),
      score: z.number().min(0).max(10).optional(),
      moveRating: z.number().min(0).max(10).optional(),
      feedback: z.string().max(260).optional(),
      comment: z.string().max(260).optional(),
      message: z.string().max(260).optional(),
      text: z.string().max(260).optional(),
      moveFeedback: z.string().max(260).optional()
    }).passthrough();
    const useDirectLocalGenerate = runtimeConfig.mode !== 'deep' && isLikelyLocalOllamaBaseUrl(runtimeConfig.baseUrl);
    const response = useDirectLocalGenerate
      ? await queryStructuredLocalGenerateResponse({
        schema,
        prompt: promptSpec.rawPrompt || [promptSpec.systemPrompt, promptSpec.humanPrompt].filter(Boolean).join('\n'),
        modelName: runtimeConfig.modelName,
        baseUrl: runtimeConfig.baseUrl,
        timeoutMs: resolvedTimeoutMs,
        temperature: runtimeConfig.temperature,
        numPredict: runtimeConfig.numPredict,
        topP: runtimeConfig.topP,
        keepAlive: runtimeConfig.keepAlive,
        requestType: 'trainer-live',
        priority: 1,
        skipWhenGameplayPending: true
      })
      : await queryStructuredBotResponse({
        schema,
        systemPrompt: promptSpec.systemPrompt,
        humanPrompt: promptSpec.humanPrompt,
        modelName: runtimeConfig.modelName,
        baseUrl: runtimeConfig.baseUrl,
        timeoutMs: resolvedTimeoutMs,
        temperature: runtimeConfig.temperature,
        numPredict: runtimeConfig.numPredict,
        topP: runtimeConfig.topP,
        keepAlive: runtimeConfig.keepAlive,
        requestType: 'trainer-live',
        priority: 1,
        skipWhenGameplayPending: true
      });

    if (!response.success) {
      const repaired = buildTrainerPlainTextRepairResult({
        mode: 'after_move',
        rawOutput: response.rawOutput,
        hiddenCards,
        fallbackResult: fallbackFeedback,
        maxLength: runtimeConfig.mode === 'deep' ? 260 : 180
      });
      const elapsedMs = Date.now() - startedAt;
      if (repaired) {
        return returnMetadata
          ? {
            shouldComment: repaired.shouldComment,
            rating: repaired.rating,
            feedback: repaired.feedback,
            source: repaired.source,
            fallbackUsed: repaired.fallbackUsed,
            elapsedMs,
            errorCode: repaired.errorCode,
            mode: runtimeConfig.mode,
            model: runtimeConfig.modelName,
            timeoutMs: resolvedTimeoutMs,
            numPredict: runtimeConfig.numPredict,
            promptLength,
            payloadLength,
            debugMeta: buildTrainerAttemptDebugMeta({
              stage,
              runtimeConfig,
              resolvedTimeoutMs,
              promptLength,
              payloadLength,
              elapsedMs,
              source: repaired.source,
              fallbackUsed: repaired.fallbackUsed,
              errorCode: repaired.errorCode,
              parserMode: repaired.parserMode,
              preview: repaired.preview,
              response,
              sourceBeforeFallback: 'llm'
            })
          }
          : {
            shouldComment: repaired.shouldComment,
            rating: repaired.rating,
            feedback: repaired.feedback
          };
      }

      return returnMetadata
        ? {
          ...fallbackFeedback,
          source: 'fallback',
          fallbackUsed: true,
          elapsedMs,
          errorCode: response.error || 'invalid-structured-output',
          mode: runtimeConfig.mode,
          model: runtimeConfig.modelName,
          timeoutMs: resolvedTimeoutMs,
          numPredict: runtimeConfig.numPredict,
          promptLength,
          payloadLength,
          debugMeta: buildTrainerAttemptDebugMeta({
            stage,
            runtimeConfig,
            resolvedTimeoutMs,
            promptLength,
            payloadLength,
            elapsedMs,
            source: 'fallback',
            fallbackUsed: true,
            errorCode: response.error || 'invalid-structured-output',
            parserMode: 'fallback',
            preview: response.rawOutput || fallbackFeedback.feedback,
            response,
            sourceBeforeFallback: 'llm',
            fallbackReason: response.error || 'invalid-structured-output'
          })
        }
        : fallbackFeedback;
    }

    const shouldComment = response.data.shouldComment !== false;
    const feedback = stripLeadingTrainerRatingPrefix(extractTrainerVisibleText('after_move', response.data));
    const rating = clampTrainerRating(
      extractTrainerNumericField(response.data, ['rating', 'score', 'moveRating'], fallbackFeedback.rating ?? 5.5),
      fallbackFeedback.rating ?? 5.5
    );

    if (!shouldComment) {
      const elapsedMs = Date.now() - startedAt;
      const quietResult = {
        shouldComment: false,
        rating,
        feedback: ''
      };
      return returnMetadata
        ? {
          ...quietResult,
          source: 'llm',
          fallbackUsed: false,
          elapsedMs,
          errorCode: null,
          mode: runtimeConfig.mode,
          model: runtimeConfig.modelName,
          timeoutMs: resolvedTimeoutMs,
          numPredict: runtimeConfig.numPredict,
          promptLength,
          payloadLength,
          debugMeta: buildTrainerAttemptDebugMeta({
            stage,
            runtimeConfig,
            resolvedTimeoutMs,
            promptLength,
            payloadLength,
            elapsedMs,
            source: 'llm',
            fallbackUsed: false,
            errorCode: null,
            parserMode: 'json',
            preview: '',
            response,
            sourceBeforeFallback: 'llm'
          })
        }
        : quietResult;
    }

    if (!feedback) {
      const elapsedMs = Date.now() - startedAt;
      return returnMetadata
        ? {
          ...fallbackFeedback,
          source: 'fallback',
          fallbackUsed: true,
          elapsedMs,
          errorCode: 'empty-feedback',
          mode: runtimeConfig.mode,
          model: runtimeConfig.modelName,
          timeoutMs: resolvedTimeoutMs,
          numPredict: runtimeConfig.numPredict,
          promptLength,
          payloadLength,
          debugMeta: buildTrainerAttemptDebugMeta({
            stage,
            runtimeConfig,
            resolvedTimeoutMs,
            promptLength,
            payloadLength,
            elapsedMs,
            source: 'fallback',
            fallbackUsed: true,
            errorCode: 'empty-feedback',
            parserMode: 'fallback',
            preview: response.rawOutput || fallbackFeedback.feedback,
            response,
            sourceBeforeFallback: 'llm',
            fallbackReason: 'empty-feedback'
          })
        }
        : fallbackFeedback;
    }

    const result = {
      shouldComment: true,
      rating,
      feedback
    };
    const elapsedMs = Date.now() - startedAt;
    return returnMetadata
      ? {
        ...result,
        source: 'llm',
        fallbackUsed: false,
        elapsedMs,
        errorCode: null,
        mode: runtimeConfig.mode,
        model: runtimeConfig.modelName,
        timeoutMs: resolvedTimeoutMs,
        numPredict: runtimeConfig.numPredict,
        promptLength,
        payloadLength,
        debugMeta: buildTrainerAttemptDebugMeta({
          stage,
          runtimeConfig,
          resolvedTimeoutMs,
          promptLength,
          payloadLength,
          elapsedMs,
          source: 'llm',
          fallbackUsed: false,
          errorCode: null,
          parserMode: 'json',
          preview: result.feedback,
          response,
          sourceBeforeFallback: 'llm'
        })
      }
      : result;
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const errorCode = normalizeBotErrorCode(error, 'trainer_after_move_error');
    return returnMetadata
      ? {
        ...fallbackFeedback,
        source: 'fallback',
        fallbackUsed: true,
        elapsedMs,
        errorCode,
        mode: runtimeConfig.mode,
        model: runtimeConfig.modelName,
        timeoutMs: resolvedTimeoutMs,
        numPredict: runtimeConfig.numPredict,
        promptLength,
        payloadLength,
        debugMeta: buildTrainerAttemptDebugMeta({
          stage,
          runtimeConfig,
          resolvedTimeoutMs,
          promptLength,
          payloadLength,
          elapsedMs,
          source: 'fallback',
          fallbackUsed: true,
          errorCode,
          parserMode: 'fallback',
          preview: fallbackFeedback.feedback,
          sourceBeforeFallback: 'llm',
          fallbackReason: error?.message || errorCode
        })
      }
      : fallbackFeedback;
  }
}

function getBotDifficultyElo(botPlayer, players = []) {
  if (isTrainerBot(botPlayer)) {
    return normalizeEloValue(botPlayer?.elo, DEFAULT_ACCOUNT_ELO);
  }

  return getAverageHumanElo(players);
}

function buildTrainerFinalReviewPromptPayload({
  training = null,
  feedbackEntries = [],
  roundSummaries = [],
  humanPlayer = null,
  trainerPlayer = null,
  runtimeMode = getTrainerBotMode()
} = {}) {
  const summary = buildTrainerFinalReviewSummary({
    training,
    feedbackEntries,
    roundSummaries
  });

  return {
    promptShape: runtimeMode === 'deep' ? 'trainer-final-review-deep' : 'trainer-final-review-fast',
    training: {
      rulesetLabel: summary.rulesetLabel,
      totalRounds: summary.totalRounds
    },
    summary: {
      averageMoveRating: summary.averageMoveRating,
      bestRating: summary.bestRating,
      worstRating: summary.worstRating,
      strength: summary.strength,
      commonMistake: summary.commonMistake,
      suggestedFocus: summary.suggestedFocus
    }
  };
}

function buildTrainerFinalReviewPrompt(args = {}) {
  const runtimeMode = args.runtimeMode === 'deep' ? 'deep' : 'fast';
  if (runtimeMode !== 'deep') {
    const payload = buildTrainerFinalReviewPromptPayload({
      ...args,
      runtimeMode
    });

    return {
      systemPrompt: '',
      humanPrompt: '',
      rawPrompt: [
        'You are a Rentz trainer.',
        'Write a final review in exactly 2 short sentences, max 55 words total.',
        `Ruleset: ${payload.training?.rulesetLabel || 'Training'}.`,
        `Rounds: ${payload.training?.totalRounds || 0}.`,
        `Average rating: ${payload.summary?.averageMoveRating ?? 6}/10.`,
        `Best rating: ${payload.summary?.bestRating ?? 8}/10.`,
        `Worst rating: ${payload.summary?.worstRating ?? 4}/10.`,
        `Strength: ${payload.summary?.strength || 'found solid turns'}.`,
        `Improvement: ${payload.summary?.commonMistake || 'chose risky lines too often'}.`,
        `Focus: ${payload.summary?.suggestedFocus || 'plan one safer move earlier'}.`,
        'Do not mention hidden cards, JSON, analysis, or star ratings.',
        'Return only the review text.'
      ].join('\n')
    };
  }

  const systemPrompt = [
    'You are Trainer, a constructive Rentz coach.',
    'Write one short-to-medium final review for the player after a finished training session.',
    'Mention overall strengths, recurring mistakes, and one recommendation.',
    'Do not reveal hidden information, private cards, chain-of-thought, or any numeric score/rating in the review text.',
    runtimeMode === 'deep'
      ? 'Return JSON only with keys review and starRating.'
      : 'Return JSON only with keys review and starRating. Keep the review concise.'
  ].join(' ');
  const humanPrompt = JSON.stringify(buildTrainerFinalReviewPromptPayload({
    ...args,
    runtimeMode
  }));

  return {
    systemPrompt,
    humanPrompt
  };
}

async function generateTrainerFinalReview({
  training = null,
  feedbackEntries = [],
  roundSummaries = [],
  humanPlayer = null,
  trainerPlayer = null,
  timeoutMs = null,
  returnMetadata = false
} = {}) {
  const runtimeConfig = getTrainerRuntimeConfig({
    stage: 'final_review'
  });
  const stage = 'final_review';
  const startedAt = Date.now();
  const finalReviewSummary = buildTrainerFinalReviewSummary({
    training,
    feedbackEntries,
    roundSummaries
  });
  const fallbackReview = buildTrainerFinalReviewFallback({
    training,
    feedbackEntries,
    roundSummaries
  });
  const promptSpec = buildTrainerFinalReviewPrompt({
    training,
    feedbackEntries,
    roundSummaries,
    humanPlayer,
    trainerPlayer,
    runtimeMode: runtimeConfig.mode
  });
  const promptLength = promptSpec.rawPrompt
    ? promptSpec.rawPrompt.length
    : promptSpec.systemPrompt.length + promptSpec.humanPrompt.length;
  const payloadLength = promptSpec.rawPrompt
    ? promptSpec.rawPrompt.length
    : promptSpec.humanPrompt.length;
  const resolvedTimeoutMs = timeoutMs || runtimeConfig.timeoutMs;
  const hiddenCards = collectTrainerHiddenCards({
    gameState: {
      handsReady: {
        ...(humanPlayer?.userId ? { [humanPlayer.userId]: [] } : {}),
        ...(trainerPlayer?.userId ? { [trainerPlayer.userId]: [] } : {})
      }
    },
    humanPlayer,
    trainerPlayer
  });

  try {
    if (runtimeConfig.mode !== 'deep') {
      const useDirectLocalGenerate = isLikelyLocalOllamaBaseUrl(runtimeConfig.baseUrl);
      const response = useDirectLocalGenerate
        ? await queryPlainTextLocalGenerateResponse({
          prompt: promptSpec.rawPrompt || [promptSpec.systemPrompt, promptSpec.humanPrompt].filter(Boolean).join('\n'),
          modelName: runtimeConfig.modelName,
          baseUrl: runtimeConfig.baseUrl,
          timeoutMs: resolvedTimeoutMs,
          temperature: runtimeConfig.temperature,
          numPredict: runtimeConfig.numPredict,
          topP: runtimeConfig.topP,
          keepAlive: runtimeConfig.keepAlive,
          requestType: 'trainer-final-review',
          priority: 0
        })
        : await queryPlainTextBotResponse({
          systemPrompt: promptSpec.systemPrompt || 'You are a Rentz trainer.',
          humanPrompt: promptSpec.rawPrompt || promptSpec.humanPrompt,
          modelName: runtimeConfig.modelName,
          baseUrl: runtimeConfig.baseUrl,
          timeoutMs: resolvedTimeoutMs,
          temperature: runtimeConfig.temperature,
          numPredict: runtimeConfig.numPredict,
          topP: runtimeConfig.topP,
          keepAlive: runtimeConfig.keepAlive,
          requestType: 'trainer-final-review',
          priority: 0
        });
      const elapsedMs = Date.now() - startedAt;

      if (!response.success) {
        const repaired = response.rawOutput && looksLikeJsonPayload(response.rawOutput)
          ? buildTrainerPlainTextRepairResult({
            mode: 'final_review',
            rawOutput: response.rawOutput,
            hiddenCards,
            fallbackResult: fallbackReview,
            maxLength: 220,
            deterministicStarRating: finalReviewSummary.starRating,
            finalReviewSummary
          })
          : null;
        if (repaired) {
          return returnMetadata
            ? {
              review: repaired.review,
              starRating: finalReviewSummary.starRating,
              source: repaired.source,
              fallbackUsed: repaired.fallbackUsed,
              elapsedMs,
              errorCode: repaired.errorCode,
              mode: runtimeConfig.mode,
              model: runtimeConfig.modelName,
              timeoutMs: resolvedTimeoutMs,
              numPredict: runtimeConfig.numPredict,
              promptLength,
              payloadLength,
              debugMeta: buildTrainerAttemptDebugMeta({
                stage,
                runtimeConfig,
                resolvedTimeoutMs,
                promptLength,
                payloadLength,
                elapsedMs,
                source: repaired.source,
                fallbackUsed: repaired.fallbackUsed,
                errorCode: repaired.errorCode,
                parserMode: repaired.parserMode,
                preview: repaired.preview,
                response,
                sourceBeforeFallback: 'llm'
              })
            }
            : {
              review: repaired.review,
              starRating: finalReviewSummary.starRating
            };
        }

        return returnMetadata
          ? {
            ...fallbackReview,
            source: 'fallback',
            fallbackUsed: true,
            elapsedMs,
            errorCode: response.error || 'invalid-plain-text-output',
            mode: runtimeConfig.mode,
            model: runtimeConfig.modelName,
            timeoutMs: resolvedTimeoutMs,
            numPredict: runtimeConfig.numPredict,
            promptLength,
            payloadLength,
            debugMeta: buildTrainerAttemptDebugMeta({
              stage,
              runtimeConfig,
              resolvedTimeoutMs,
              promptLength,
              payloadLength,
              elapsedMs,
              source: 'fallback',
              fallbackUsed: true,
              errorCode: response.error || 'invalid-plain-text-output',
              parserMode: 'fallback',
              preview: response.rawOutput || fallbackReview.review,
              response,
              sourceBeforeFallback: 'llm',
              fallbackReason: response.error || 'invalid-plain-text-output'
            })
          }
          : fallbackReview;
      }

      if (looksLikeJsonPayload(response.text)) {
        const repaired = buildTrainerPlainTextRepairResult({
          mode: 'final_review',
          rawOutput: response.text,
          hiddenCards,
          fallbackResult: fallbackReview,
          maxLength: 220,
          deterministicStarRating: finalReviewSummary.starRating,
          finalReviewSummary
        });
        if (repaired) {
          return returnMetadata
            ? {
              review: repaired.review,
              starRating: finalReviewSummary.starRating,
              source: repaired.source,
              fallbackUsed: repaired.fallbackUsed,
              elapsedMs,
              errorCode: repaired.errorCode,
              mode: runtimeConfig.mode,
              model: runtimeConfig.modelName,
              timeoutMs: resolvedTimeoutMs,
              numPredict: runtimeConfig.numPredict,
              promptLength,
              payloadLength,
              debugMeta: buildTrainerAttemptDebugMeta({
                stage,
                runtimeConfig,
                resolvedTimeoutMs,
                promptLength,
                payloadLength,
                elapsedMs,
                source: repaired.source,
                fallbackUsed: repaired.fallbackUsed,
                errorCode: repaired.errorCode,
                parserMode: repaired.parserMode,
                preview: repaired.preview,
                response,
                sourceBeforeFallback: 'llm'
              })
            }
            : {
              review: repaired.review,
              starRating: finalReviewSummary.starRating
            };
        }
      }

      const repairedVisibleReview = buildTrainerFinalReviewVisibleRepair({
        visibleText: response.text,
        hiddenCards,
        maxLength: 220,
        finalReviewSummary,
        fallbackReview
      });
      if (!repairedVisibleReview) {
        return returnMetadata
          ? {
            ...fallbackReview,
            source: 'fallback',
            fallbackUsed: true,
            elapsedMs,
            errorCode: 'empty-final-review',
            mode: runtimeConfig.mode,
            model: runtimeConfig.modelName,
            timeoutMs: resolvedTimeoutMs,
            numPredict: runtimeConfig.numPredict,
            promptLength,
            payloadLength,
            debugMeta: buildTrainerAttemptDebugMeta({
              stage,
              runtimeConfig,
              resolvedTimeoutMs,
              promptLength,
              payloadLength,
              elapsedMs,
              source: 'fallback',
              fallbackUsed: true,
              errorCode: 'empty-final-review',
              parserMode: 'fallback',
              preview: response.rawOutput || fallbackReview.review,
              response,
              sourceBeforeFallback: 'llm',
              fallbackReason: 'empty-final-review'
            })
          }
          : fallbackReview;
      }

      return returnMetadata
        ? {
          review: repairedVisibleReview.review,
          starRating: finalReviewSummary.starRating,
          source: repairedVisibleReview.source,
          fallbackUsed: false,
          elapsedMs,
          errorCode: null,
          mode: runtimeConfig.mode,
          model: runtimeConfig.modelName,
          timeoutMs: resolvedTimeoutMs,
          numPredict: runtimeConfig.numPredict,
          promptLength,
          payloadLength,
          debugMeta: buildTrainerAttemptDebugMeta({
            stage,
            runtimeConfig,
            resolvedTimeoutMs,
            promptLength,
            payloadLength,
            elapsedMs,
            source: repairedVisibleReview.source,
            fallbackUsed: false,
            errorCode: null,
            parserMode: repairedVisibleReview.parserMode,
            preview: repairedVisibleReview.review,
            response,
            sourceBeforeFallback: 'llm'
          })
        }
        : {
          review: repairedVisibleReview.review,
          starRating: finalReviewSummary.starRating
        };
    }

    const { z } = await loadLangChainRuntime();
    const schema = z.object({
      review: z.string().min(1).max(420).optional(),
      summary: z.string().min(1).max(420).optional(),
      finalReview: z.string().min(1).max(420).optional(),
      message: z.string().min(1).max(420).optional(),
      text: z.string().min(1).max(420).optional(),
      starRating: z.number().min(0.5).max(5).optional(),
      rating: z.number().min(0.5).max(5).optional()
    }).passthrough();
    const useDirectLocalGenerate = isLikelyLocalOllamaBaseUrl(runtimeConfig.baseUrl);
    const response = useDirectLocalGenerate
      ? await queryStructuredLocalGenerateResponse({
        schema,
        prompt: promptSpec.rawPrompt || [promptSpec.systemPrompt, promptSpec.humanPrompt].filter(Boolean).join('\n'),
        modelName: runtimeConfig.modelName,
        baseUrl: runtimeConfig.baseUrl,
        timeoutMs: resolvedTimeoutMs,
        temperature: runtimeConfig.temperature,
        numPredict: runtimeConfig.numPredict,
        topP: runtimeConfig.topP,
        keepAlive: runtimeConfig.keepAlive,
        requestType: 'trainer-final-review',
        priority: 0
      })
      : await queryStructuredBotResponse({
        schema,
        systemPrompt: promptSpec.systemPrompt,
        humanPrompt: promptSpec.humanPrompt,
        modelName: runtimeConfig.modelName,
        baseUrl: runtimeConfig.baseUrl,
        timeoutMs: resolvedTimeoutMs,
        temperature: runtimeConfig.temperature,
        numPredict: runtimeConfig.numPredict,
        topP: runtimeConfig.topP,
        keepAlive: runtimeConfig.keepAlive,
        requestType: 'trainer-final-review',
        priority: 0
      });

    if (!response.success) {
      const repaired = buildTrainerPlainTextRepairResult({
        mode: 'final_review',
        rawOutput: response.rawOutput,
        hiddenCards,
        fallbackResult: fallbackReview,
        maxLength: runtimeConfig.mode === 'deep' ? 420 : 180
      });
      const elapsedMs = Date.now() - startedAt;
      if (repaired) {
        return returnMetadata
          ? {
            review: repaired.review,
            starRating: repaired.starRating,
            source: repaired.source,
            fallbackUsed: repaired.fallbackUsed,
            elapsedMs,
            errorCode: repaired.errorCode,
            mode: runtimeConfig.mode,
            model: runtimeConfig.modelName,
            timeoutMs: resolvedTimeoutMs,
            numPredict: runtimeConfig.numPredict,
            promptLength,
            payloadLength,
            debugMeta: buildTrainerAttemptDebugMeta({
              stage,
              runtimeConfig,
              resolvedTimeoutMs,
              promptLength,
              payloadLength,
              elapsedMs,
              source: repaired.source,
              fallbackUsed: repaired.fallbackUsed,
              errorCode: repaired.errorCode,
              parserMode: repaired.parserMode,
              preview: repaired.preview,
              response,
              sourceBeforeFallback: 'llm'
            })
          }
          : {
            review: repaired.review,
            starRating: repaired.starRating
          };
      }

      return returnMetadata
        ? {
          ...fallbackReview,
          source: 'fallback',
          fallbackUsed: true,
          elapsedMs,
          errorCode: response.error || 'invalid-structured-output',
          mode: runtimeConfig.mode,
          model: runtimeConfig.modelName,
          timeoutMs: resolvedTimeoutMs,
          numPredict: runtimeConfig.numPredict,
          promptLength,
          payloadLength,
          debugMeta: buildTrainerAttemptDebugMeta({
            stage,
            runtimeConfig,
            resolvedTimeoutMs,
            promptLength,
            payloadLength,
            elapsedMs,
            source: 'fallback',
            fallbackUsed: true,
            errorCode: response.error || 'invalid-structured-output',
            parserMode: 'fallback',
            preview: response.rawOutput || fallbackReview.review,
            response,
            sourceBeforeFallback: 'llm',
            fallbackReason: response.error || 'invalid-structured-output'
          })
        }
        : fallbackReview;
    }

    const review = sanitizeTrainerFinalReviewText(
      extractTrainerVisibleText('final_review', response.data),
      fallbackReview.review
    );
    const starRating = clampTrainerStarRating(
      extractTrainerNumericField(response.data, ['starRating', 'rating'], fallbackReview.starRating),
      fallbackReview.starRating
    );
    const elapsedMs = Date.now() - startedAt;
    if (!review || review === fallbackReview.review) {
      return returnMetadata
        ? {
          ...fallbackReview,
          source: 'fallback',
          fallbackUsed: true,
          elapsedMs,
          errorCode: 'empty-final-review',
          mode: runtimeConfig.mode,
          model: runtimeConfig.modelName,
          timeoutMs: resolvedTimeoutMs,
          numPredict: runtimeConfig.numPredict,
          promptLength,
          payloadLength,
          debugMeta: buildTrainerAttemptDebugMeta({
            stage,
            runtimeConfig,
            resolvedTimeoutMs,
            promptLength,
            payloadLength,
            elapsedMs,
            source: 'fallback',
            fallbackUsed: true,
            errorCode: 'empty-final-review',
            parserMode: 'fallback',
            preview: response.rawOutput || fallbackReview.review,
            response,
            sourceBeforeFallback: 'llm',
            fallbackReason: 'empty-final-review'
          })
        }
        : fallbackReview;
    }

    const result = {
      review,
      starRating
    };
    return returnMetadata
      ? {
        ...result,
        source: 'llm',
        fallbackUsed: false,
        elapsedMs,
        errorCode: null,
        mode: runtimeConfig.mode,
        model: runtimeConfig.modelName,
        timeoutMs: resolvedTimeoutMs,
        numPredict: runtimeConfig.numPredict,
        promptLength,
        payloadLength,
        debugMeta: buildTrainerAttemptDebugMeta({
          stage,
          runtimeConfig,
          resolvedTimeoutMs,
          promptLength,
          payloadLength,
          elapsedMs,
          source: 'llm',
          fallbackUsed: false,
          errorCode: null,
          parserMode: 'json',
          preview: result.review,
          response,
          sourceBeforeFallback: 'llm'
        })
      }
      : result;
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const errorCode = normalizeBotErrorCode(error, 'trainer_final_review_error');
    return returnMetadata
      ? {
        ...fallbackReview,
        source: 'fallback',
        fallbackUsed: true,
        elapsedMs,
        errorCode,
        mode: runtimeConfig.mode,
        model: runtimeConfig.modelName,
        timeoutMs: resolvedTimeoutMs,
        numPredict: runtimeConfig.numPredict,
        promptLength,
        payloadLength,
        debugMeta: buildTrainerAttemptDebugMeta({
          stage,
          runtimeConfig,
          resolvedTimeoutMs,
          promptLength,
          payloadLength,
          elapsedMs,
          source: 'fallback',
          fallbackUsed: true,
          errorCode,
          parserMode: 'fallback',
          preview: fallbackReview.review,
          sourceBeforeFallback: 'llm',
          fallbackReason: error?.message || errorCode
        })
      }
      : fallbackReview;
  }
}

async function chooseBotMove({
  roomId,
  kind,
  gameState,
  botPlayer,
  legalMoves = [],
  ruleset = null
} = {}) {
  const averageHumanElo = getAverageHumanElo(gameState?.players || []);
  const difficultyElo = getBotDifficultyElo(botPlayer, gameState?.players || []);
  const runtimeConfig = getGameplayBotRuntimeConfig();
  const startedAt = Date.now();
  const botProfile = {
    averageHumanElo,
    difficultyElo,
    isTrainer: isTrainerBot(botPlayer),
    rankTierKey: getRankTierForElo(difficultyElo).key
  };
  const fallbackMove = chooseFallbackMove(kind, legalMoves, {
    botProfile,
    gameState
  });
  const outputContract = runtimeConfig.mode === 'live' ? 'index' : 'legacy';
  let decision = fallbackMove
    ? {
      ...fallbackMove,
      source: 'fallback',
      confidence: null,
      reason: 'Fallback legal move.'
    }
      : null;
  let errorCode = null;
  let rawOutputPreview = '';
  let selectedIndex = null;
  let promptLength = 0;
  let payloadLength = 0;

  if (legalMoves.length === 0) {
    const elapsedMs = Date.now() - startedAt;
    return {
      selectedMove: null,
      botRank: getRankTierForElo(difficultyElo).name,
      botDifficultyElo: difficultyElo,
      roomAverageElo: averageHumanElo,
      source: 'fallback',
      fallbackUsed: true,
      confidence: null,
      reason: 'No legal moves available.',
      errorCode: 'no_legal_moves',
      elapsedMs,
      mode: runtimeConfig.mode,
      model: runtimeConfig.modelName,
      timeoutMs: runtimeConfig.timeoutMs,
      numPredict: runtimeConfig.numPredict,
      promptLength,
      payloadLength,
      legalMoveCount: 0,
      debugMeta: buildGameplayDecisionDebugMeta({
        source: 'fallback',
        fallbackUsed: true,
        elapsedMs,
        errorCode: 'no_legal_moves',
        mode: runtimeConfig.mode,
        model: runtimeConfig.modelName,
        timeoutMs: runtimeConfig.timeoutMs,
        numPredict: runtimeConfig.numPredict,
        promptLength,
        payloadLength,
        legalMoveCount: 0,
        outputContract
      })
    };
  }

  if (legalMoves.length === 1) {
    const forcedMove = legalMoves[0];
    const elapsedMs = Date.now() - startedAt;
    const debugMeta = buildGameplayDecisionDebugMeta({
      source: 'forced',
      fallbackUsed: false,
      elapsedMs,
      errorCode: null,
      mode: runtimeConfig.mode,
      model: runtimeConfig.modelName,
      timeoutMs: runtimeConfig.timeoutMs,
      numPredict: runtimeConfig.numPredict,
      promptLength: 0,
      payloadLength: 0,
      legalMoveCount: 1,
      outputContract,
      rawOutputPreview: '',
      selectedIndex: 0,
      selectedMoveId: forcedMove.id || forcedMove.card || ''
    });

    logGameplayRuntimeDebug({
      roomId: roomId || '',
      botId: botPlayer?.userId || '',
      source: 'forced',
      fallbackUsed: false,
      elapsedMs,
      mode: runtimeConfig.mode,
      model: runtimeConfig.modelName,
      timeoutMs: runtimeConfig.timeoutMs,
      numPredict: runtimeConfig.numPredict,
      promptLength: 0,
      payloadLength: 0,
      legalMoveCount: 1,
      outputContract,
      rawOutputPreview: '',
      selectedIndex: 0,
      selectedMoveId: forcedMove.id || forcedMove.card || '',
      errorCode: null
    });

    return {
      selectedMove: {
        ...forcedMove,
        source: 'forced',
        confidence: null,
        reason: ''
      },
      botRank: getRankTierForElo(difficultyElo).name,
      botDifficultyElo: difficultyElo,
      roomAverageElo: averageHumanElo,
      source: 'forced',
      fallbackUsed: false,
      confidence: null,
      reason: '',
      errorCode: null,
      elapsedMs,
      mode: runtimeConfig.mode,
      model: runtimeConfig.modelName,
      timeoutMs: runtimeConfig.timeoutMs,
      numPredict: runtimeConfig.numPredict,
      promptLength: 0,
      payloadLength: 0,
      legalMoveCount: 1,
      debugMeta
    };
  }

  const promptPayload = buildBotPromptPayload({
    kind,
    gameState,
    botPlayer: {
      ...botPlayer,
      averageHumanElo,
      difficultyElo
    },
    legalMoves,
    ruleset,
    runtimeMode: runtimeConfig.mode
  });
  const promptSpec = buildGameplayDecisionPrompt({
    kind,
    promptPayload,
    runtimeMode: runtimeConfig.mode
  });
  promptLength = promptSpec.rawPrompt
    ? promptSpec.rawPrompt.length
    : promptSpec.systemPrompt.length + promptSpec.humanPrompt.length;
  payloadLength = promptSpec.rawPrompt
    ? promptSpec.rawPrompt.length
    : promptSpec.humanPrompt.length;

  try {
    const llmDecision = await queryBotDecisionWithLangChain({
      kind,
      legalMoves,
      promptPayload,
      runtimeConfig
    });

    if (llmDecision.success && llmDecision.move) {
      decision = llmDecision.move;
      rawOutputPreview = llmDecision.rawOutput || '';
      selectedIndex = Number.isInteger(llmDecision.selectedIndex) ? llmDecision.selectedIndex : null;
    } else {
      errorCode = llmDecision.error || 'llm_no_move';
      rawOutputPreview = llmDecision.rawOutput || '';
    }
  } catch (error) {
    errorCode = normalizeGameplayErrorCode(error, 'gameplay-llm-error');
    decision = decision
      ? {
        ...decision,
        reason: `Fallback after AI error: ${error.message}`
      }
      : null;
  }

  const finalMove = maybeApplyMistakeLayer(kind, legalMoves, decision, {
    roomId,
    botPlayer,
    gameState,
    botProfile
  }) || decision;
  const rankTier = getRankTierForElo(difficultyElo);
  const source = finalMove?.source || 'fallback';
  const fallbackUsed = source === 'fallback';
  const elapsedMs = Date.now() - startedAt;
  const debugMeta = buildGameplayDecisionDebugMeta({
    source,
    fallbackUsed,
    elapsedMs,
    errorCode,
    mode: runtimeConfig.mode,
    model: runtimeConfig.modelName,
    timeoutMs: runtimeConfig.timeoutMs,
    numPredict: runtimeConfig.numPredict,
    promptLength,
    payloadLength,
    legalMoveCount: legalMoves.length,
    outputContract,
    rawOutputPreview,
    selectedIndex,
    selectedMoveId: finalMove?.id || finalMove?.card || ''
  });

  logGameplayRuntimeDebug({
    roomId: roomId || '',
    botId: botPlayer?.userId || '',
    source,
    fallbackUsed,
    elapsedMs,
    mode: runtimeConfig.mode,
    model: runtimeConfig.modelName,
    timeoutMs: runtimeConfig.timeoutMs,
    numPredict: runtimeConfig.numPredict,
    promptLength,
    payloadLength,
    legalMoveCount: legalMoves.length,
    outputContract,
    rawOutputPreview: sanitizeDebugPreview(rawOutputPreview, 160),
    selectedIndex,
    selectedMoveId: finalMove?.id || finalMove?.card || '',
    errorCode
  });

  return {
    selectedMove: finalMove,
    botRank: rankTier.name,
    botDifficultyElo: difficultyElo,
    roomAverageElo: averageHumanElo,
    source,
    fallbackUsed,
    confidence: finalMove?.confidence ?? null,
    reason: finalMove?.reason || '',
    errorCode,
    elapsedMs,
    mode: runtimeConfig.mode,
    model: runtimeConfig.modelName,
    timeoutMs: runtimeConfig.timeoutMs,
    numPredict: runtimeConfig.numPredict,
    promptLength,
    payloadLength,
    legalMoveCount: legalMoves.length,
    debugMeta
  };
}

module.exports = {
  ABANDONMENT_TIMEOUT_MS,
  BOT_ACTION_DELAY_MS,
  BOT_DECISION_TIMEOUT_MS,
  BOT_TYPE_STANDARD,
  BOT_TYPE_TRAINER,
  DEFAULT_AUTO_BOT_REPLACEMENT_ENABLED,
  DEFAULT_BOT_AVATAR_URL,
  DEFAULT_BOT_OLLAMA_BASE_URL,
  DEFAULT_BOT_OLLAMA_MODEL,
  buildGameplayDecisionPrompt,
  clampTrainerStarRating,
  TRAINER_COMMENT_TIMEOUT_MS,
  TRAINER_FEEDBACK_TIMEOUT_MS,
  buildBotIdentity,
  buildBotPromptPayload,
  buildTrainerPlainTextRepairResult,
  buildTrainerAfterMovePrompt,
  buildTrainerAfterMovePromptPayload,
  buildTrainerFinalReviewPrompt,
  buildTrainerFinalReviewPromptPayload,
  buildTrainerPreMovePrompt,
  buildTrainerPreMovePromptPayload,
  clampTrainerRating,
  chooseBotMove,
  chooseFallbackMove,
  evaluateTrainerPlayerMove,
  generateTrainerFinalReview,
  generateTrainerPreMoveComment,
  getAverageHumanElo,
  getBotDifficultyElo,
  getGameplayBotRuntimeConfig,
  getNextBotOrdinal,
  getRulesetObjective,
  getTrainerRuntimeConfig,
  isBotPlayer,
  isTrainerBot,
  parseGameplayDecisionOutput,
  warmTrainerBotStage
};

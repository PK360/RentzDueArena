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
const ABANDONMENT_TIMEOUT_MS = Math.max(5000, Number(process.env.RENTZ_ABANDONMENT_TIMEOUT_MS || 120000));
const DEFAULT_AUTO_BOT_REPLACEMENT_ENABLED = process.env.RENTZ_AUTO_BOT_REPLACEMENT === 'false'
  ? false
  : true;
const DEFAULT_BOT_AVATAR_URL = '/media/defaults/default-bot-profile.svg';
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

let cachedLangChainRuntime = null;

function isBotPlayer(player) {
  return Boolean(player?.isBot);
}

function parseCard(card) {
  const [value = '', suit = ''] = String(card || '').split('-');
  return { value, suit };
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
  replacementFor = null
} = {}) {
  const averageHumanElo = getAverageHumanElo(players);
  const rankTier = getRankTierForElo(averageHumanElo);
  const botSeed = `${roomId || 'room'}:${seatIndex}:${replacementFor?.userId || 'seat'}`;
  const shortHash = crypto.createHash('sha1').update(botSeed).digest('hex').slice(0, 8);
  const botOrdinal = getNextBotOrdinal(players);
  const botNameBase = BOT_NAME_POOL[seatIndex % BOT_NAME_POOL.length] || 'Rentz Bot';
  const displayName = `${botNameBase} ${botOrdinal}`;

  return {
    userId: `bot_${roomId || 'room'}_${seatIndex}_${shortHash}`,
    socketId: `bot:${roomId || 'room'}:${seatIndex}:${shortHash}`,
    name: displayName,
    displayName,
    avatarUrl: DEFAULT_BOT_AVATAR_URL,
    guest: false,
    isBot: true,
    isReady: true,
    isConnected: true,
    connectionStatus: 'connected',
    elo: averageHumanElo,
    rankName: rankTier.name,
    rankTierKey: rankTier.key,
    banner: '',
    description: replacementFor?.name
      ? `Computer-controlled replacement for ${replacementFor.name}.`
      : 'Computer-controlled Rentz player.',
    accountCreatedAt: null,
    favouriteRulesets: [],
    rulesetLoadout: [],
    seatIndex: Number.isInteger(seatIndex) ? seatIndex : 0,
    averageHumanElo,
    botProvider: 'langchain-ollama',
    replacementForUserId: replacementFor?.userId || null,
    replacementForName: replacementFor?.name || null,
    replacementReason: replacementFor ? 'abandonment' : 'pregame-fill'
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
    source: 'mistake-layer',
    confidence: 0.2,
    reason: 'Difficulty layer forced a weaker legal move.'
  };
}

function buildBotPromptPayload({
  kind,
  gameState,
  botPlayer,
  legalMoves = [],
  ruleset = null
} = {}) {
  const scores = (gameState?.players || []).map((player) => ({
    userId: player.userId,
    name: player.name,
    isBot: Boolean(player.isBot),
    seatIndex: player.seatIndex,
    score: gameState?.pointsByPlayer?.[player.userId] || 0,
    cardsLeft: (gameState?.handsReady?.[player.userId] || []).length,
    tricksWon: (gameState?.collectedByPlayer?.[player.userId] || []).length,
    connectionStatus: player.connectionStatus || (player.isConnected === false ? 'reconnecting' : 'connected')
  }));

  const lastTricks = Array.isArray(gameState?.roundStats?.tricks)
    ? gameState.roundStats.tricks.slice(-3).map((trick) => ({
      takenBy: trick.takenByName,
      cards: trick.cards?.map((play) => play.card) || [],
      scoreDelta: trick.scoreDelta || 0
    }))
    : [];

  return {
    decisionType: kind,
    bot: {
      userId: botPlayer?.userId,
      name: botPlayer?.name,
      seatIndex: botPlayer?.seatIndex,
      elo: botPlayer?.elo,
      rankName: botPlayer?.rankName,
      averageHumanElo: botPlayer?.averageHumanElo
    },
    round: {
      phase: gameState?.phase,
      roundNumber: gameState?.roundNumber || 0,
      turnIndex: gameState?.turnIndex || 0,
      chooserId: gameState?.chooserId || null
    },
    ruleset: ruleset
      ? {
        id: ruleset.id,
        label: ruleset.label,
        abbreviation: ruleset.abbreviation,
        type: ruleset.type,
        objective: getRulesetObjective(ruleset),
        nvSelected: Boolean(gameState?.nvSelected)
      }
      : null,
    hand: gameState?.handsReady?.[botPlayer?.userId] || [],
    currentTrick: gameState?.currentTrick || [],
    trickSuit: gameState?.trickSuit || null,
    scores,
    lastTricks,
    legalMoves: legalMoves.map((move) => ({
      id: move.id,
      label: move.label,
      description: move.description || '',
      card: move.card || null,
      value: Object.prototype.hasOwnProperty.call(move, 'value') ? move.value : null
    }))
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

async function queryBotDecisionWithLangChain({
  kind,
  legalMoves,
  promptPayload,
  modelName = DEFAULT_BOT_OLLAMA_MODEL,
  baseUrl = DEFAULT_BOT_OLLAMA_BASE_URL,
  timeoutMs = BOT_DECISION_TIMEOUT_MS
} = {}) {
  const { ChatOllama, z } = await loadLangChainRuntime();
  const decisionSchema = z.object({
    moveId: z.string().min(1),
    confidence: z.number().min(0).max(1).optional(),
    reason: z.string().max(240).optional()
  });
  const model = new ChatOllama({
    model: modelName,
    baseUrl,
    temperature: 0.2,
    format: 'json'
  });
  const systemPrompt = [
    'You are a Rentz card-game assistant.',
    'Choose exactly one legal move from the provided legalMoves array.',
    'Return JSON only with keys moveId, confidence, reason.',
    'Never invent cards, rulesets, or IDs that are not listed.'
  ].join(' ');
  const humanPrompt = JSON.stringify({
    instruction: {
      kind,
      responseShape: {
        moveId: 'string',
        confidence: 'number between 0 and 1',
        reason: 'short sentence'
      }
    },
    state: promptPayload
  });
  const response = await withTimeout(
    model.invoke([
      ['system', systemPrompt],
      ['human', humanPrompt]
    ]),
    timeoutMs,
    `Bot decision timed out after ${timeoutMs}ms`
  );
  const parsed = decisionSchema.safeParse(parseJsonObject(extractModelText(response)));

  if (!parsed.success) {
    return {
      success: false,
      error: 'invalid-structured-output'
    };
  }

  const selectedMove = legalMoves.find((move) => move.id === parsed.data.moveId);
  if (!selectedMove) {
    return {
      success: false,
      error: 'illegal-move-selected'
    };
  }

  return {
    success: true,
    move: {
      ...selectedMove,
      source: 'llm',
      confidence: typeof parsed.data.confidence === 'number' ? parsed.data.confidence : null,
      reason: parsed.data.reason || ''
    }
  };
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
  const botProfile = {
    averageHumanElo,
    rankTierKey: getRankTierForElo(averageHumanElo).key
  };
  const promptPayload = buildBotPromptPayload({
    kind,
    gameState,
    botPlayer: {
      ...botPlayer,
      averageHumanElo
    },
    legalMoves,
    ruleset
  });
  const fallbackMove = chooseFallbackMove(kind, legalMoves, {
    botProfile,
    gameState
  });
  let decision = fallbackMove
    ? {
      ...fallbackMove,
      source: 'fallback',
      confidence: null,
      reason: 'Fallback legal move.'
    }
    : null;

  if (legalMoves.length === 0) {
    return {
      selectedMove: null,
      botRank: getRankTierForElo(averageHumanElo).name,
      roomAverageElo: averageHumanElo,
      source: 'fallback',
      confidence: null,
      reason: 'No legal moves available.'
    };
  }

  try {
    const llmDecision = await queryBotDecisionWithLangChain({
      kind,
      legalMoves,
      promptPayload
    });

    if (llmDecision.success && llmDecision.move) {
      decision = llmDecision.move;
    }
  } catch (error) {
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
  const rankTier = getRankTierForElo(averageHumanElo);

  return {
    selectedMove: finalMove,
    botRank: rankTier.name,
    roomAverageElo: averageHumanElo,
    source: finalMove?.source || 'fallback',
    confidence: finalMove?.confidence ?? null,
    reason: finalMove?.reason || ''
  };
}

module.exports = {
  ABANDONMENT_TIMEOUT_MS,
  BOT_ACTION_DELAY_MS,
  BOT_DECISION_TIMEOUT_MS,
  DEFAULT_AUTO_BOT_REPLACEMENT_ENABLED,
  DEFAULT_BOT_AVATAR_URL,
  DEFAULT_BOT_OLLAMA_BASE_URL,
  DEFAULT_BOT_OLLAMA_MODEL,
  buildBotIdentity,
  buildBotPromptPayload,
  chooseBotMove,
  chooseFallbackMove,
  getAverageHumanElo,
  getNextBotOrdinal,
  getRulesetObjective,
  isBotPlayer
};

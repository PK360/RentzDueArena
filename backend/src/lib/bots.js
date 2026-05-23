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

let cachedLangChainRuntime = null;

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
      botType: botPlayer?.botType || (isTrainerBot(botPlayer) ? BOT_TYPE_TRAINER : BOT_TYPE_STANDARD),
      isTrainer: isTrainerBot(botPlayer),
      elo: botPlayer?.elo,
      rankName: botPlayer?.rankName,
      averageHumanElo: botPlayer?.averageHumanElo,
      difficultyElo: botPlayer?.difficultyElo ?? botPlayer?.elo ?? botPlayer?.averageHumanElo
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
  timeoutMs = BOT_DECISION_TIMEOUT_MS
} = {}) {
  const { ChatOllama, z } = await loadLangChainRuntime();
  const parsedSchema = schema || z.object({});
  const model = new ChatOllama({
    model: modelName,
    baseUrl,
    temperature: 0.2,
    format: 'json'
  });
  const response = await withTimeout(
    model.invoke([
      ['system', systemPrompt],
      ['human', humanPrompt]
    ]),
    timeoutMs,
    `Bot AI request timed out after ${timeoutMs}ms`
  );
  const parsed = parsedSchema.safeParse(parseJsonObject(extractModelText(response)));

  if (!parsed.success) {
    return {
      success: false,
      error: 'invalid-structured-output'
    };
  }

  return {
    success: true,
    data: parsed.data
  };
}

async function queryBotDecisionWithLangChain({
  kind,
  legalMoves,
  promptPayload,
  modelName = DEFAULT_BOT_OLLAMA_MODEL,
  baseUrl = DEFAULT_BOT_OLLAMA_BASE_URL,
  timeoutMs = BOT_DECISION_TIMEOUT_MS
} = {}) {
  const { z } = await loadLangChainRuntime();
  const result = await queryStructuredBotResponse({
    schema: z.object({
      moveId: z.string().min(1),
      confidence: z.number().min(0).max(1).optional(),
      reason: z.string().max(240).optional()
    }),
    systemPrompt: [
      'You are a Rentz card-game assistant.',
      'Choose exactly one legal move from the provided legalMoves array.',
      'Return JSON only with keys moveId, confidence, reason.',
      'Never invent cards, rulesets, or IDs that are not listed.'
    ].join(' '),
    humanPrompt: JSON.stringify({
      instruction: {
        kind,
        responseShape: {
          moveId: 'string',
          confidence: 'number between 0 and 1',
          reason: 'short sentence'
        }
      },
      state: promptPayload
    }),
    modelName,
    baseUrl,
    timeoutMs
  });

  if (!result.success) {
    return result;
  }

  const parsed = result.data;

  const selectedMove = legalMoves.find((move) => move.id === parsed.moveId);
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
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
      reason: parsed.reason || ''
    }
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
  const objective = getRulesetObjective(ruleset);

  if (selectedCard === lowestCard && orderedCards.length > 1) {
    return `I’m choosing a lower-risk card here. ${objective} This keeps stronger options available later.`;
  }

  if (selectedCard === highestCard && orderedCards.length > 1) {
    return `I’m taking a more assertive line here. ${objective} This play pressures the trick without spelling out my whole hand.`;
  }

  return `I’m balancing safety and tempo here. ${objective}`;
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

  const selectedCard = String(playedCard || '');
  const chosenIndex = candidateCards.indexOf(selectedCard);
  if (chosenIndex === -1) {
    return {
      shouldComment: false,
      rating: null,
      feedback: ''
    };
  }

  const riskAverseRuleset = !['whist', 'totalPlus'].includes(String(ruleset?.id || ''));
  const bestIndex = riskAverseRuleset ? 0 : (candidateCards.length - 1);
  const distanceFromBest = Math.abs(chosenIndex - bestIndex);
  const normalizedDistance = candidateCards.length <= 1
    ? 0
    : distanceFromBest / Math.max(candidateCards.length - 1, 1);
  const currentTrickMatters = Array.isArray(currentTrickBeforeMove) && currentTrickBeforeMove.length > 0;
  const rating = clampTrainerRating(9.2 - (normalizedDistance * 5.4) - (currentTrickMatters ? 0 : 0.8));
  const alternativeCard = candidateCards[bestIndex];

  if (rating >= 8.2) {
    return {
      shouldComment: true,
      rating,
      feedback: `Move rating: ${rating}/10. Good choice. It fits the ${ruleset?.label || 'current'} objective and keeps the position manageable.`
    };
  }

  if (rating >= 6.2) {
    return {
      shouldComment: true,
      rating,
      feedback: `Move rating: ${rating}/10. Reasonable move, but there may have been a slightly safer line depending on how the next trick develops.`
    };
  }

  return {
    shouldComment: true,
    rating,
    feedback: `Move rating: ${rating}/10. This was a riskier choice for ${ruleset?.label || 'this ruleset'}. ${alternativeCard && alternativeCard !== selectedCard ? `A card like ${alternativeCard} would usually be steadier here.` : 'A lower-risk line was probably available.'}`
  };
}

function sanitizeTrainerFinalReviewText(text, fallbackText) {
  const normalizedText = String(text || '').trim().replace(/\s+/g, ' ');
  if (!normalizedText) {
    return fallbackText;
  }

  if (
    /\/\s*10\b/i.test(normalizedText)
    || /\bout of 10\b/i.test(normalizedText)
    || /\b(?:star|stars)\b/i.test(normalizedText)
    || /\b(?:numeric|number)\s+rating\b/i.test(normalizedText)
  ) {
    return fallbackText;
  }

  return normalizedText;
}

function buildTrainerFinalReviewFallback({
  training = null,
  feedbackEntries = [],
  roundSummaries = []
} = {}) {
  const normalizedFeedback = Array.isArray(feedbackEntries) ? feedbackEntries : [];
  const averageMoveRating = normalizedFeedback.length > 0
    ? normalizedFeedback.reduce((sum, entry) => sum + clampTrainerRating(entry?.rating, 0), 0) / normalizedFeedback.length
    : 6;
  const strongMoveCount = normalizedFeedback.filter((entry) => clampTrainerRating(entry?.rating, 0) >= 7.5).length;
  const riskyMoveCount = normalizedFeedback.filter((entry) => clampTrainerRating(entry?.rating, 0) <= 5.5).length;
  const rulesetLabel = training?.selectedRulesetLabel || 'this ruleset';
  const totalRounds = Math.max(1, Number(training?.totalRounds || roundSummaries.length || 1));
  const starRating = clampTrainerStarRating(averageMoveRating / 2, 3);

  let review = `You completed a useful ${rulesetLabel} training session. `;
  if (averageMoveRating >= 8) {
    review += 'Your overall decision-making was steady, and you usually picked the safer or more purposeful line when the trick got tense. ';
  } else if (averageMoveRating >= 6.2) {
    review += 'There were several solid ideas in your play, especially when you slowed the hand down and avoided forcing the trick too early. ';
  } else {
    review += 'You found a few good ideas, but too many turns became harder than they needed to be once the trick started shifting. ';
  }

  if (strongMoveCount > riskyMoveCount) {
    review += 'One strength was your willingness to stay patient instead of burning useful cards too soon. ';
  } else if (riskyMoveCount > 0) {
    review += 'A recurring issue was giving up too much control with riskier cards when a calmer option was available. ';
  } else {
    review += 'Your choices improved once the round shape became clearer. ';
  }

  if (totalRounds > 1) {
    review += `Keep carrying that same plan-first mindset from one round to the next when you practise ${rulesetLabel} again.`;
  } else {
    review += `The next step is to think one move earlier in ${rulesetLabel} spots so your later turns stay easier to manage.`;
  }

  return {
    review: sanitizeTrainerFinalReviewText(review, `You completed a useful ${rulesetLabel} training session. Keep focusing on safer timing and cleaner trick control in future rounds.`),
    starRating
  };
}

async function generateTrainerPreMoveComment({
  gameState,
  trainerPlayer,
  legalMoves = [],
  selectedMove,
  ruleset = null,
  timeoutMs = TRAINER_COMMENT_TIMEOUT_MS
} = {}) {
  if (!selectedMove || !isTrainerBot(trainerPlayer)) {
    return '';
  }

  const fallbackComment = buildTrainerPreMoveFallbackComment({
    selectedMove,
    legalMoves,
    ruleset
  });

  try {
    const { z } = await loadLangChainRuntime();
    const response = await queryStructuredBotResponse({
      schema: z.object({
        comment: z.string().min(1).max(220)
      }),
      systemPrompt: [
        'You are Trainer, a concise Rentz coaching bot.',
        'Write one short chat message before your move.',
        'Explain the strategic idea without revealing hidden cards, exact unseen cards, or chain-of-thought.',
        'Do not mention private hand contents explicitly.',
        'Return JSON only with key comment.'
      ].join(' '),
      humanPrompt: JSON.stringify({
        selectedMove: {
          id: selectedMove.id,
          card: selectedMove.card || selectedMove.id,
          label: selectedMove.label
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
          ? gameState.currentTrick.map((play) => ({
            playerName: play.playerName,
            card: play.card
          }))
          : [],
        legalMoveCount: legalMoves.length,
        handSummary: buildTrainerVisibleHandSummary(gameState?.handsReady?.[trainerPlayer?.userId] || [])
      }),
      timeoutMs
    });

    if (!response.success) {
      return fallbackComment;
    }

    return String(response.data.comment || '').trim() || fallbackComment;
  } catch {
    return fallbackComment;
  }
}

async function evaluateTrainerPlayerMove({
  gameState,
  trainerPlayer,
  humanPlayer,
  playedCard,
  legalMoves = [],
  ruleset = null,
  currentTrickBeforeMove = [],
  timeoutMs = TRAINER_FEEDBACK_TIMEOUT_MS
} = {}) {
  const fallbackFeedback = buildTrainerMoveFeedbackFallback({
    playedCard,
    legalMoves,
    ruleset,
    currentTrickBeforeMove
  });

  if (!isTrainerBot(trainerPlayer) || !humanPlayer || legalMoves.length <= 1) {
    return fallbackFeedback;
  }

  try {
    const { z } = await loadLangChainRuntime();
    const response = await queryStructuredBotResponse({
      schema: z.object({
        shouldComment: z.boolean().optional(),
        rating: z.number().min(0).max(10).optional(),
        feedback: z.string().max(260).optional()
      }),
      systemPrompt: [
        'You are Trainer, a constructive Rentz coaching bot.',
        'Evaluate a human player move in one short chat message.',
        'Only comment when the move is strategically meaningful.',
        'Include a rating out of 10 inside the feedback text when you choose to comment.',
        'Do not reveal hidden opponent cards, your hidden hand, or chain-of-thought.',
        'Return JSON only with keys shouldComment, rating, feedback.'
      ].join(' '),
      humanPrompt: JSON.stringify({
        player: {
          userId: humanPlayer.userId,
          name: humanPlayer.name
        },
        playedCard,
        legalMoves: legalMoves.map((move) => ({
          id: move.id,
          card: move.card || move.id,
          label: move.label
        })),
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
        currentTrickBeforeMove: Array.isArray(currentTrickBeforeMove)
          ? currentTrickBeforeMove.map((play) => ({
            playerName: play.playerName,
            card: play.card
          }))
          : [],
        scores: (gameState?.players || []).map((player) => ({
          userId: player.userId,
          name: player.name,
          score: gameState?.pointsByPlayer?.[player.userId] || 0
        }))
      }),
      timeoutMs
    });

    if (!response.success) {
      return fallbackFeedback;
    }

    const shouldComment = response.data.shouldComment !== false;
    const feedback = String(response.data.feedback || '').trim();
    const rating = clampTrainerRating(response.data.rating, fallbackFeedback.rating ?? 5.5);

    if (!shouldComment || !feedback) {
      return {
        shouldComment: false,
        rating,
        feedback: ''
      };
    }

    return {
      shouldComment: true,
      rating,
      feedback: feedback.includes('/10')
        ? feedback
        : `Move rating: ${rating}/10. ${feedback}`
    };
  } catch {
    return fallbackFeedback;
  }
}

function getBotDifficultyElo(botPlayer, players = []) {
  if (isTrainerBot(botPlayer)) {
    return normalizeEloValue(botPlayer?.elo, DEFAULT_ACCOUNT_ELO);
  }

  return getAverageHumanElo(players);
}

async function generateTrainerFinalReview({
  training = null,
  feedbackEntries = [],
  roundSummaries = [],
  humanPlayer = null,
  trainerPlayer = null,
  timeoutMs = TRAINER_FEEDBACK_TIMEOUT_MS
} = {}) {
  const fallbackReview = buildTrainerFinalReviewFallback({
    training,
    feedbackEntries,
    roundSummaries
  });

  try {
    const { z } = await loadLangChainRuntime();
    const averageMoveRating = Array.isArray(feedbackEntries) && feedbackEntries.length > 0
      ? feedbackEntries.reduce((sum, entry) => sum + clampTrainerRating(entry?.rating, 0), 0) / feedbackEntries.length
      : null;
    const reviewHighlights = (Array.isArray(feedbackEntries) ? feedbackEntries : [])
      .slice(-6)
      .map((entry) => String(entry?.feedback || '').replace(/^Move rating:\s*[\d.]+\/10\.\s*/i, '').trim())
      .filter(Boolean);

    const response = await queryStructuredBotResponse({
      schema: z.object({
        review: z.string().min(1).max(420),
        starRating: z.number().min(0.5).max(5).optional()
      }),
      systemPrompt: [
        'You are Trainer, a constructive Rentz coach.',
        'Write one short-to-medium final review for the player after a finished training session.',
        'Mention overall strengths, recurring mistakes, and one recommendation.',
        'Do not reveal hidden information, private cards, chain-of-thought, or any numeric score/rating in the review text.',
        'Return JSON only with keys review and starRating.'
      ].join(' '),
      humanPrompt: JSON.stringify({
        training: {
          rulesetLabel: training?.selectedRulesetLabel || 'Training',
          totalRounds: Number(training?.totalRounds || roundSummaries.length || 0)
        },
        player: {
          name: humanPlayer?.name || humanPlayer?.displayName || 'Player'
        },
        trainer: {
          name: trainerPlayer?.name || 'Trainer'
        },
        summary: {
          averageMoveRating: averageMoveRating == null ? null : Math.round(averageMoveRating * 10) / 10,
          strongMoveCount: (Array.isArray(feedbackEntries) ? feedbackEntries : []).filter((entry) => clampTrainerRating(entry?.rating, 0) >= 7.5).length,
          riskyMoveCount: (Array.isArray(feedbackEntries) ? feedbackEntries : []).filter((entry) => clampTrainerRating(entry?.rating, 0) <= 5.5).length,
          notableFeedback: reviewHighlights,
          rounds: (Array.isArray(roundSummaries) ? roundSummaries : []).map((round) => ({
            roundNumber: round?.roundNumber,
            humanScoreDelta: round?.humanScoreDelta,
            humanTricksWon: round?.humanTricksWon,
            trainerTricksWon: round?.trainerTricksWon
          }))
        }
      }),
      timeoutMs
    });

    if (!response.success) {
      return fallbackReview;
    }

    return {
      review: sanitizeTrainerFinalReviewText(response.data.review, fallbackReview.review),
      starRating: clampTrainerStarRating(response.data.starRating, fallbackReview.starRating)
    };
  } catch {
    return fallbackReview;
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
  const botProfile = {
    averageHumanElo,
    difficultyElo,
    isTrainer: isTrainerBot(botPlayer),
    rankTierKey: getRankTierForElo(difficultyElo).key
  };
  const promptPayload = buildBotPromptPayload({
    kind,
    gameState,
    botPlayer: {
      ...botPlayer,
      averageHumanElo,
      difficultyElo
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
      botRank: getRankTierForElo(difficultyElo).name,
      botDifficultyElo: difficultyElo,
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
  const rankTier = getRankTierForElo(difficultyElo);

  return {
    selectedMove: finalMove,
    botRank: rankTier.name,
    botDifficultyElo: difficultyElo,
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
  BOT_TYPE_STANDARD,
  BOT_TYPE_TRAINER,
  DEFAULT_AUTO_BOT_REPLACEMENT_ENABLED,
  DEFAULT_BOT_AVATAR_URL,
  DEFAULT_BOT_OLLAMA_BASE_URL,
  DEFAULT_BOT_OLLAMA_MODEL,
  clampTrainerStarRating,
  TRAINER_COMMENT_TIMEOUT_MS,
  TRAINER_FEEDBACK_TIMEOUT_MS,
  buildBotIdentity,
  buildBotPromptPayload,
  clampTrainerRating,
  chooseBotMove,
  chooseFallbackMove,
  evaluateTrainerPlayerMove,
  generateTrainerFinalReview,
  generateTrainerPreMoveComment,
  getAverageHumanElo,
  getBotDifficultyElo,
  getNextBotOrdinal,
  getRulesetObjective,
  isBotPlayer,
  isTrainerBot
};

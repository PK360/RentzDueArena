const crypto = require('crypto');
const path = require('path');

const {
  BACKEND_ROOT,
  requireBackendModule,
  safeReadText
} = require('./eval-utils');

const { getRankTierForElo, normalizeEloValue } = requireBackendModule('src/lib/elo.js');
const { RULESETS, getRulesetDefinitionById, readRootRulesets } = requireBackendModule('rulesets/index.js');
const { compileRuleset } = requireBackendModule('engine/evaluator.js');
const { createSixBotGame } = require(path.join(BACKEND_ROOT, 'tests/helpers/builders.js'));

function normalizeStructuredValue(value, fallback = value) {
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    return value;
  }

  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return fallback;
  }

  if (trimmed.startsWith('[') || trimmed.startsWith('{') || trimmed.startsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return fallback;
    }
  }

  return fallback;
}

function normalizeList(value) {
  const normalized = normalizeStructuredValue(value, value);

  if (Array.isArray(normalized)) {
    return normalized;
  }

  if (normalized == null || normalized === '') {
    return [];
  }

  return [normalized];
}

function normalizeObject(value) {
  const normalized = normalizeStructuredValue(value, value);
  return normalized && typeof normalized === 'object' && !Array.isArray(normalized)
    ? normalized
    : {};
}

function formatMove(move) {
  if (typeof move === 'string') {
    return {
      id: move,
      card: move,
      label: move,
      description: `Play ${move}`,
      value: null
    };
  }

  return {
    id: move.id,
    card: move.card || move.id || null,
    label: move.label || move.card || move.id || '',
    description: move.description || '',
    value: Object.prototype.hasOwnProperty.call(move, 'value') ? move.value : null
  };
}

function buildDefaultPlayers({ botUserId, botElo, playerCount, humanElos = [] }) {
  const players = [];
  const normalizedBotElo = normalizeEloValue(botElo, 500);

  players.push({
    userId: botUserId,
    name: 'Eval Bot',
    displayName: 'Eval Bot',
    seatIndex: 0,
    isBot: true,
    elo: normalizedBotElo,
    rankName: getRankTierForElo(normalizedBotElo).name
  });

  for (let index = 1; index < playerCount; index += 1) {
    const elo = normalizeEloValue(humanElos[index - 1], humanElos[0] || 500);
    players.push({
      userId: `human-${index}`,
      name: `Human ${index}`,
      displayName: `Human ${index}`,
      seatIndex: index,
      isBot: false,
      elo
    });
  }

  return players;
}

function buildGameStateForGameplay(vars = {}) {
  const botUserId = vars.botUserId || 'bot-1';
  const kind = vars.kind || 'play_card';
  const legalMoves = normalizeList(vars.legalMoves).map(formatMove);
  const playerCount = Math.max(
    Number(vars.playerCount || 4),
    Number(normalizeList(vars.humanElos).length + 1)
  );
  const botElo = normalizeEloValue(vars.botElo, 500);
  const normalizedPlayers = normalizeList(vars.players);
  const players = Array.isArray(normalizedPlayers) && normalizedPlayers.length > 0
    ? normalizedPlayers
    : buildDefaultPlayers({
      botUserId,
      botElo,
      playerCount,
      humanElos: normalizeList(vars.humanElos)
    });
  const pointsByPlayer = Object.fromEntries(players.map((player) => [
    player.userId,
    Number(normalizeObject(vars.pointsByPlayer)?.[player.userId] || 0)
  ]));
  const collectedByPlayer = Object.fromEntries(players.map((player) => [
    player.userId,
    normalizeObject(vars.collectedByPlayer)?.[player.userId] || []
  ]));
  const handsReady = Object.fromEntries(players.map((player) => [
    player.userId,
    player.userId === botUserId
      ? [...normalizeList(vars.botHand)]
      : [...(normalizeObject(vars.otherHands)?.[player.userId] || [])]
  ]));
  const currentTrick = normalizeList(vars.currentTrick).map((play, index) => ({
    playedBy: play.playedBy || `human-${index + 1}`,
    playerName: play.playerName || play.playedBy || `Player ${index + 1}`,
    card: play.card
  }));
  const trickSuit = vars.trickSuit
    || (currentTrick[0]?.card ? String(currentTrick[0].card).split('-')[1] : null);
  const ruleset = kind === 'play_card'
    ? getRulesetDefinitionById(vars.rulesetId || 'kingOfHearts') || RULESETS.kingOfHearts
    : null;

  return {
    kind,
    legalMoves,
    ruleset,
    botPlayer: players.find((player) => player.userId === botUserId) || players[0],
    gameState: {
      phase: kind === 'play_card'
        ? 'playing_round'
        : (kind === 'choose_ruleset' ? 'choosing_ruleset' : 'choosing_nv'),
      status: 'playing',
      roundNumber: Number(vars.roundNumber || 1),
      turnIndex: Number(vars.turnIndex || 0),
      chooserId: botUserId,
      currentPlayerId: botUserId,
      activeRulesetId: ruleset?.id || '',
      players,
      pointsByPlayer,
      collectedByPlayer,
      handsReady,
      currentTrick,
      trickSuit,
      roundStats: {
        tricks: normalizeList(vars.lastTricks)
      },
      nvSelected: Boolean(vars.nvSelected),
      trickPending: false,
      customRulesets: []
    }
  };
}

function buildTrainerContext(vars = {}) {
  const trainerUserId = vars.trainerUserId || 'trainer-1';
  const humanUserId = vars.humanUserId || 'human-1';
  const trainerElo = normalizeEloValue(vars.trainerElo, 2500);
  const humanElo = normalizeEloValue(vars.humanElo, 1500);
  const ruleset = getRulesetDefinitionById(vars.rulesetId || 'kingOfHearts') || RULESETS.kingOfHearts;
  const legalMoves = normalizeList(vars.legalMoves).map(formatMove);
  const players = [
    {
      userId: humanUserId,
      name: vars.humanName || 'Learner',
      displayName: vars.humanName || 'Learner',
      seatIndex: 0,
      isBot: false,
      elo: humanElo
    },
    {
      userId: trainerUserId,
      name: 'Trainer',
      displayName: 'Trainer',
      seatIndex: 1,
      isBot: true,
      isTrainer: true,
      botType: 'trainer',
      elo: trainerElo,
      rankName: getRankTierForElo(trainerElo).name
    }
  ];
  const currentTrick = normalizeList(vars.currentTrick).map((play, index) => ({
    playedBy: play.playedBy || `player-${index + 1}`,
    playerName: play.playerName || play.playedBy || `Player ${index + 1}`,
    card: play.card
  }));
  const currentTrickBeforeMove = normalizeList(vars.currentTrickBeforeMove).map((play, index) => ({
    playedBy: play.playedBy || `player-${index + 1}`,
    playerName: play.playerName || play.playedBy || `Player ${index + 1}`,
    card: play.card
  }));

  return {
    legalMoves,
    ruleset,
    trainerPlayer: players[1],
    humanPlayer: players[0],
    gameState: {
      phase: 'playing_round',
      roundNumber: Number(vars.roundNumber || 1),
      turnIndex: Number(vars.turnIndex || 0),
      players,
      pointsByPlayer: {
        [humanUserId]: Number(vars.humanScore || 0),
        [trainerUserId]: Number(vars.trainerScore || 0)
      },
      handsReady: {
        [trainerUserId]: [...normalizeList(vars.trainerHand)],
        [humanUserId]: [...normalizeList(vars.humanHand)]
      },
      currentTrick,
      trickSuit: vars.trickSuit || (currentTrick[0]?.card ? String(currentTrick[0].card).split('-')[1] : null),
      training: {
        enabled: true,
        humanUserId,
        trainerUserId,
        selectedRulesetId: ruleset.id,
        selectedRulesetLabel: ruleset.label,
        totalRounds: Number(vars.totalRounds || 1)
      }
    },
    currentTrickBeforeMove,
    training: {
      enabled: true,
      humanUserId,
      trainerUserId,
      selectedRulesetId: ruleset.id,
      selectedRulesetLabel: vars.selectedRulesetLabel || ruleset.label,
      totalRounds: Number(vars.totalRounds || 1)
    },
    feedbackEntries: normalizeList(vars.feedbackEntries),
    roundSummaries: normalizeList(vars.roundSummaries)
  };
}

function buildSixPlayerGameplayContext(vars = {}) {
  const base = createSixBotGame();
  const players = base.players.map((player, index) => ({
    ...player,
    isBot: index === 0,
    elo: normalizeEloValue(vars.humanElos?.[index - 1], 1500)
  }));
  players[0] = {
    ...players[0],
    userId: vars.botUserId || 'bot-1',
    name: 'Eval Bot',
    displayName: 'Eval Bot',
    isBot: true,
    elo: normalizeEloValue(vars.botElo, 1500),
    rankName: getRankTierForElo(normalizeEloValue(vars.botElo, 1500)).name
  };

  const legalMoves = normalizeList(vars.legalMoves).map(formatMove);
  const botUserId = players[0].userId;
  const ruleset = getRulesetDefinitionById(vars.rulesetId || 'whist') || RULESETS.whist;

  return {
    kind: vars.kind || 'play_card',
    legalMoves,
    ruleset,
    botPlayer: players[0],
    gameState: {
      ...base,
      players,
      currentPlayerId: botUserId,
      chooserId: botUserId,
      activeRulesetId: ruleset.id,
      pointsByPlayer: Object.fromEntries(players.map((player) => [player.userId, 0])),
      handsReady: {
        ...base.handsReady,
        [botUserId]: [...normalizeList(vars.botHand)]
      },
      currentTrick: normalizeList(vars.currentTrick).map((play) => ({
        playedBy: play.playedBy,
        playerName: play.playerName || play.playedBy,
        card: play.card
      })),
      trickSuit: vars.trickSuit || null
    }
  };
}

function loadRulesetFixture(fileName) {
  return safeReadText(path.join('evals/promptfoo/editor-bot/fixtures', fileName));
}

function loadDefaultRulesetById(rulesetId) {
  const definition = getRulesetDefinitionById(rulesetId);
  if (!definition) {
    throw new Error(`Unknown default ruleset '${rulesetId}'`);
  }

  return {
    longName: definition.label,
    shortName: definition.abbreviation,
    type: definition.type,
    code: definition.code
  };
}

function buildRulesetPayload(vars = {}) {
  if (vars.defaultRulesetId) {
    return loadDefaultRulesetById(vars.defaultRulesetId);
  }

  const code = vars.rulesetSource
    || vars.rulesetCode
    || (vars.rulesetFixture ? loadRulesetFixture(vars.rulesetFixture) : '');

  return {
    longName: vars.rulesetName || vars.rulesetTitle || 'Eval Ruleset',
    shortName: vars.shortName || vars.rulesetShortName || 'ER',
    type: vars.rulesetType || 'per_round',
    code
  };
}

function compileRulesetPayload(payload) {
  return compileRuleset(payload.code, payload.type);
}

function buildRulesetSourceHash(value = '') {
  return crypto
    .createHash('sha256')
    .update(String(value || ''))
    .digest('hex')
    .slice(0, 16);
}

function listRootRulesets() {
  return readRootRulesets();
}

module.exports = {
  RULESETS,
  buildGameStateForGameplay,
  buildRulesetPayload,
  buildRulesetSourceHash,
  buildSixPlayerGameplayContext,
  buildTrainerContext,
  compileRulesetPayload,
  getRankTierForElo,
  listRootRulesets
};

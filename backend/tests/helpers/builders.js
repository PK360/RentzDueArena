const { dealCards, generateDeck } = require('../../utils/cards');
const { compileRuleset } = require('../../engine/evaluator');

let uniqueCounter = 0;

function nextUniqueSuffix(prefix = 'case') {
  uniqueCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${uniqueCounter}`;
}

function createTestAccountPayload(overrides = {}) {
  const username = overrides.username || nextUniqueSuffix('user');

  return {
    username,
    password: overrides.password || 'SecretPass123',
    description: overrides.description || 'Test account',
    ...overrides
  };
}

function createTestGuestProfile(overrides = {}) {
  const userId = overrides.userId || nextUniqueSuffix('guest_user');
  const name = overrides.name || `Guest ${nextUniqueSuffix('guest')}`;

  return {
    userId,
    name,
    displayName: name,
    guest: true,
    avatarUrl: overrides.avatarUrl || '',
    ...overrides
  };
}

function createTestPlayer(overrides = {}) {
  const userId = overrides.userId || nextUniqueSuffix('player');

  return {
    userId,
    name: overrides.name || userId,
    socketId: overrides.socketId || `socket:${userId}`,
    isBot: false,
    ...overrides
  };
}

function createTestBot(overrides = {}) {
  const basePlayer = createTestPlayer({
    ...overrides,
    userId: overrides.userId || nextUniqueSuffix('bot')
  });

  return {
    ...basePlayer,
    isBot: true
  };
}

function createSixBotGame(overrides = {}) {
  const players = overrides.players || Array.from({ length: 6 }, (_, index) => createTestBot({
    userId: `bot-${index + 1}`,
    name: `Bot ${index + 1}`,
    socketId: `socket-${index + 1}`
  }));
  const handsReady = overrides.handsReady || dealCards(
    generateDeck(players.length),
    players.map((player) => player.userId)
  );

  return {
    roomId: overrides.roomId || 'BOT6TEST',
    phase: 'playing_round',
    status: 'playing',
    players,
    chooserOrder: players.map((player) => player.userId),
    chooserCursor: 0,
    chooserId: players[0].userId,
    usedChoices: Object.fromEntries(players.map((player) => [player.userId, { whist: true }])),
    selectedRulesets: { whist: true },
    rulesetPermissions: Object.fromEntries(players.map((player) => [player.userId, { whist: true }])),
    activeRulesetId: 'whist',
    nvAllowed: false,
    nvSelected: false,
    roundNumber: 1,
    handsReady,
    startingHandSize: handsReady[players[0].userId]?.length || 0,
    stateVersion: 0,
    turnVersion: 0,
    turnIndex: 0,
    currentPlayerId: players[0].userId,
    trickPending: false,
    currentTrick: [],
    trickSuit: null,
    collectedHands: [],
    pointsByPlayer: Object.fromEntries(players.map((player) => [player.userId, 0])),
    collectedByPlayer: Object.fromEntries(players.map((player) => [player.userId, []])),
    chatMessages: [],
    roundStats: { tricks: [], scoreDeltas: {} },
    customRulesets: [],
    choiceState: null,
    botActionTimeoutId: null,
    pendingBotActionKey: null,
    botActionGeneration: 0,
    botActionInFlightKey: null,
    botActionInFlightGeneration: null,
    useTurnTimer: false,
    training: null,
    ...overrides
  };
}

function createCompiledRuleset(code = 'add(-100, HEART_KING)', type = 'per_round', overrides = {}) {
  return {
    id: overrides.id || nextUniqueSuffix('ruleset'),
    label: overrides.label || 'Test Ruleset',
    abbreviation: overrides.abbreviation || 'TR',
    type,
    code,
    compiled: compileRuleset(code, type),
    ...overrides
  };
}

module.exports = {
  createCompiledRuleset,
  createSixBotGame,
  createTestAccountPayload,
  createTestBot,
  createTestGuestProfile,
  createTestPlayer,
  nextUniqueSuffix
};

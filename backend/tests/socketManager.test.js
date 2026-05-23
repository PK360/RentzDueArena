const assert = require('node:assert');
const {
  abandonActiveMatch,
  __testHelpers,
  applyActiveRulesetAtRoundEnd,
  applyCompletedGameEloUpdates,
  buildPublicRoomSummary,
  bumpGameStateVersion,
  createTrainingMatchSession,
  findNextChooser,
  getEligibleRuleIdsForPlayer,
  getStartGameValidationError,
  addBotToLobby,
  removeWaitingLobbyMember,
  removeBotFromLobby,
  persistCompletedMatchHistory,
  setLobbyChatMutedState,
  deleteCustomRulesetFromLobby,
  sanitizeTurnTimerSeconds,
  sanitizeRulesetPermissions,
  setLobbyMemberRole,
  setNvChoiceForRound,
  updateCustomRulesetInLobby,
  validateTrainingSettings
} = require('../socketManager');
const { compileRuleset } = require('../engine/evaluator');
const { generateDeck, dealCards } = require('../utils/cards');
const { createSixBotGame } = require('./helpers/builders');
const {
  assertRoundInvariants,
  assertUniqueActivePlayers,
  assertValidCurrentPlayer,
  buildInvariantSnapshot,
  createMockIo,
  createSixBotRoom,
  getRoundActivePlayerIds,
  playOneCompleteTrick,
  playUntilRoundEnd,
  startGameWithBots
} = require('./helpers/gameFlow');
const {
  activeGames,
  beginChooserTurn,
  buildGameStateFromLobby,
  buildRoundActivePlayerIds,
  continueAfterRound,
  dealNewRoundCards,
  getLegalCardsForPlayer,
  playCardForPlayer,
  selectRulesetForRound,
  setCurrentPlayer,
  validateActiveTurnState,
  validateRoundStateIntegrity
} = __testHelpers;

function captureWarnings() {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => {
    warnings.push(args.map((value) => String(value)).join(' '));
  };

  return {
    warnings,
    restore() {
      console.warn = originalWarn;
    }
  };
}

test('prevents starting a game when the lobby has only one player', () => {
  const error = getStartGameValidationError(
    {
      hostId: 'host-1',
      players: [{ userId: 'host-1', isReady: true }]
    },
    { userId: 'host-1' }
  );

  assert.strictEqual(error, 'At least 2 players are required to start the game');
});

test('allows the host to start when at least two ready players are present', () => {
  const error = getStartGameValidationError(
    {
      hostId: 'host-1',
      players: [
        { userId: 'host-1', isReady: true },
        { userId: 'guest-1', isReady: true }
      ],
      spectators: [{ userId: 'viewer-1', role: 'spectator' }]
    },
    { userId: 'host-1' }
  );

  assert.strictEqual(error, null);
});

test('lets a spectator claim an open player seat as unready', () => {
  const lobby = {
    hostId: 'host-1',
    players: [{ socketId: 'socket-host', userId: 'host-1', isReady: true, role: 'player' }],
    spectators: [{ socketId: 'socket-viewer', userId: 'viewer-1', isReady: false, role: 'spectator' }]
  };

  const result = setLobbyMemberRole(lobby, 'socket-viewer', 'player');

  assert.deepStrictEqual(result, { assignedRole: 'player', changed: true });
  assert.strictEqual(lobby.players.length, 2);
  assert.strictEqual(lobby.spectators.length, 0);
  assert.strictEqual(lobby.players[1].userId, 'viewer-1');
  assert.strictEqual(lobby.players[1].isReady, false);
});

test('lets the host add a ready bot seat before the game starts', () => {
  const lobby = {
    roomId: 'BOT123',
    hostId: 'host-1',
    players: [
      { socketId: 'socket-host', userId: 'host-1', isReady: true, role: 'player', elo: 1200 },
      { socketId: 'socket-p2', userId: 'player-2', isReady: true, role: 'player', elo: 1800 }
    ],
    spectators: [],
    customRulesets: [],
    selectedRulesets: { whist: true },
    rulesetPermissions: {
      'host-1': { whist: true },
      'player-2': { whist: true }
    }
  };

  const result = addBotToLobby(lobby);

  assert.strictEqual(result.error, undefined);
  assert.strictEqual(lobby.players.length, 3);
  assert.strictEqual(lobby.players[2].isBot, true);
  assert.strictEqual(lobby.players[2].isReady, true);
  assert.strictEqual(lobby.players[2].rankName, 'Devoted Rentz Player');
  assert.deepStrictEqual(lobby.players.map((player) => player.seatIndex), [0, 1, 2]);
});

test('lets the host remove a bot seat before the game starts', () => {
  const lobby = {
    roomId: 'BOT456',
    hostId: 'host-1',
    players: [
      { socketId: 'socket-host', userId: 'host-1', isReady: true, role: 'player', seatIndex: 0 },
      { socketId: 'bot:BOT456:1:abcd', userId: 'bot_BOT456_1_abcd', isReady: true, role: 'player', isBot: true, seatIndex: 1 }
    ],
    spectators: [],
    customRulesets: [],
    selectedRulesets: { whist: true },
    rulesetPermissions: {
      'host-1': { whist: true },
      'bot_BOT456_1_abcd': { whist: true }
    }
  };

  const result = removeBotFromLobby(lobby, 'bot_BOT456_1_abcd');

  assert.strictEqual(result.error, undefined);
  assert.strictEqual(lobby.players.length, 1);
  assert.strictEqual(lobby.players[0].seatIndex, 0);
  assert.strictEqual(lobby.rulesetPermissions['bot_BOT456_1_abcd'], undefined);
});

test('re-adding a removed middle bot seat keeps lobby bot ids unique', () => {
  const lobby = {
    roomId: 'TL2SVI',
    hostId: 'host-1',
    players: [{
      socketId: 'socket-host',
      userId: 'host-1',
      isReady: true,
      role: 'player',
      elo: 1200
    }],
    spectators: [],
    customRulesets: [],
    selectedRulesets: { whist: true },
    rulesetPermissions: {
      'host-1': { whist: true }
    }
  };

  for (let index = 0; index < 5; index += 1) {
    const result = addBotToLobby(lobby);
    assert.strictEqual(result.error, undefined);
  }

  const removedBotUserId = lobby.players[3].userId;
  assert.strictEqual(removeBotFromLobby(lobby, removedBotUserId).error, undefined);
  assert.strictEqual(addBotToLobby(lobby).error, undefined);

  const playerIds = lobby.players.map((player) => player.userId);
  assert.strictEqual(playerIds.length, 6);
  assert.strictEqual(new Set(playerIds).size, 6);
});

test('buildRoundActivePlayerIds keeps all 6 seated bot participants unique', () => {
  const lobby = createSixBotRoom({
    roomId: 'BOT6ACTIVE',
    selectedRulesets: { whist: true, levate: true }
  });
  const game = buildGameStateFromLobby(lobby);

  const roundActivePlayerIds = buildRoundActivePlayerIds(game, { allowDisconnected: true });

  assert.strictEqual(
    roundActivePlayerIds.length,
    6,
    JSON.stringify(buildInvariantSnapshot(game, { step: 'buildRoundActivePlayerIds' }))
  );
  assert.strictEqual(
    new Set(roundActivePlayerIds).size,
    6,
    JSON.stringify(buildInvariantSnapshot(game, { step: 'buildRoundActivePlayerIds' }))
  );
  assert.deepStrictEqual(
    roundActivePlayerIds.slice().sort(),
    game.players.map((player) => player.userId).sort()
  );
});

test('validateRoundStateIntegrity rejects an invalid currentPlayerId during active play', () => {
  const game = {
    ...createSixBotGame({
      roundActivePlayerIds: ['bot-1', 'bot-2', 'bot-3', 'bot-4', 'bot-5', 'bot-6'],
      currentPlayerId: 'ghost-player'
    })
  };

  assert.strictEqual(
    validateRoundStateIntegrity(game, 'invalid-current-player', {
      allowDisconnected: true,
      requireHands: true
    }),
    false
  );
});

test('prevents moving a spectator into the player list when all six seats are taken', () => {
  const lobby = {
    hostId: 'host-1',
    players: Array.from({ length: 6 }, (_, index) => ({
      socketId: `socket-${index}`,
      userId: `player-${index}`,
      isReady: index < 3,
      role: 'player'
    })),
    spectators: [{ socketId: 'socket-viewer', userId: 'viewer-1', isReady: false, role: 'spectator' }]
  };

  const result = setLobbyMemberRole(lobby, 'socket-viewer', 'player');

  assert.strictEqual(result.error, 'All 6 player seats are taken. You can spectate for now.');
  assert.strictEqual(lobby.players.length, 6);
  assert.strictEqual(lobby.spectators.length, 1);
});

test('reassigns host to the next joined player when the current host leaves', () => {
  const lobby = {
    hostId: 'host-1',
    players: [
      { socketId: 'socket-host', userId: 'host-1', isReady: true, role: 'player' },
      { socketId: 'socket-second', userId: 'player-2', isReady: false, role: 'player' },
      { socketId: 'socket-third', userId: 'player-3', isReady: false, role: 'player' }
    ],
    spectators: [{ socketId: 'socket-viewer', userId: 'viewer-1', isReady: false, role: 'spectator' }],
    rulesetPermissions: {
      'host-1': { whist: true },
      'player-2': { whist: true },
      'player-3': { whist: true }
    }
  };

  const result = removeWaitingLobbyMember(lobby, 'host-1');

  assert.strictEqual(result.member.userId, 'host-1');
  assert.strictEqual(result.shouldDeleteRoom, false);
  assert.strictEqual(result.hostChanged, true);
  assert.strictEqual(result.nextHostId, 'player-2');
  assert.strictEqual(lobby.hostId, 'player-2');
  assert.deepStrictEqual(lobby.players.map((player) => player.userId), ['player-2', 'player-3']);
});

test('marks the room for deletion when the last active player leaves even if spectators remain', () => {
  const lobby = {
    hostId: 'host-1',
    players: [{ socketId: 'socket-host', userId: 'host-1', isReady: true, role: 'player' }],
    spectators: [{ socketId: 'socket-viewer', userId: 'viewer-1', isReady: false, role: 'spectator' }],
    rulesetPermissions: {
      'host-1': { whist: true }
    }
  };

  const result = removeWaitingLobbyMember(lobby, 'host-1');

  assert.strictEqual(result.member.userId, 'host-1');
  assert.strictEqual(result.shouldDeleteRoom, true);
  assert.strictEqual(result.remainingPlayerCount, 0);
  assert.strictEqual(lobby.hostId, 'viewer-1');
  assert.strictEqual(lobby.players.length, 0);
  assert.strictEqual(lobby.spectators.length, 1);
});

test('removing a waiting lobby member also clears their chat mute state', () => {
  const lobby = {
    hostId: 'host-1',
    players: [
      { socketId: 'socket-host', userId: 'host-1', isReady: true, role: 'player' },
      { socketId: 'socket-player', userId: 'player-2', isReady: false, role: 'player' }
    ],
    spectators: [],
    mutedChatUserIds: ['player-2'],
    rulesetPermissions: {
      'host-1': { whist: true },
      'player-2': { whist: true }
    }
  };

  const result = removeWaitingLobbyMember(lobby, 'player-2');

  assert.strictEqual(result.member.userId, 'player-2');
  assert.deepStrictEqual(lobby.mutedChatUserIds, []);
});

test('setLobbyChatMutedState toggles chat mute entries without duplicates', () => {
  const lobby = {
    mutedChatUserIds: ['player-2']
  };

  const unchangedMute = setLobbyChatMutedState(lobby, 'player-2', true);
  assert.deepStrictEqual(unchangedMute, { changed: false, muted: true });
  assert.deepStrictEqual(lobby.mutedChatUserIds, ['player-2']);

  const muted = setLobbyChatMutedState(lobby, 'player-3', true);
  assert.deepStrictEqual(muted, { changed: true, muted: true });
  assert.deepStrictEqual(lobby.mutedChatUserIds, ['player-2', 'player-3']);

  const unmuted = setLobbyChatMutedState(lobby, 'player-2', false);
  assert.deepStrictEqual(unmuted, { changed: true, muted: false });
  assert.deepStrictEqual(lobby.mutedChatUserIds, ['player-3']);
});

test('bumps the gameplay state version monotonically for room sync events', () => {
  const game = { stateVersion: 0 };

  assert.strictEqual(bumpGameStateVersion(game), 1);
  assert.strictEqual(bumpGameStateVersion(game), 2);
  assert.strictEqual(game.stateVersion, 2);
});

test('sanitizes per-player ruleset permissions against enabled rules', () => {
  const permissions = sanitizeRulesetPermissions(
    {
      'p-1': { whist: false, levate: true }
    },
    [{ userId: 'p-1' }, { userId: 'p-2' }],
    { whist: true, levate: false }
  );

  assert.strictEqual(permissions['p-1'].whist, false);
  assert.strictEqual(permissions['p-1'].levate, false);
  assert.strictEqual(permissions['p-2'].whist, true);
  assert.strictEqual(permissions['p-2'].levate, false);
});

test('sanitizes turn timer seconds to the 15-300 range with a 45 second default', () => {
  assert.strictEqual(sanitizeTurnTimerSeconds(undefined), 45);
  assert.strictEqual(sanitizeTurnTimerSeconds(5), 15);
  assert.strictEqual(sanitizeTurnTimerSeconds(45), 45);
  assert.strictEqual(sanitizeTurnTimerSeconds(420), 300);
});

test('fixed chooser order loops and skips players with no choices', () => {
  const game = {
    chooserOrder: ['p-1', 'p-2', 'p-3'],
    chooserCursor: 1,
    selectedRulesets: {
      kingOfHearts: false,
      diamonds: false,
      queens: false,
      tenOfClubs: false,
      whist: true,
      levate: true,
      totalPlus: false,
      totalMinus: false
    },
    rulesetPermissions: {
      'p-1': { whist: true, levate: true },
      'p-2': { whist: false, levate: false },
      'p-3': { whist: true, levate: false }
    },
    usedChoices: {
      'p-1': {},
      'p-2': {},
      'p-3': {}
    }
  };

  assert.deepStrictEqual(findNextChooser(game), { cursor: 2, playerId: 'p-3' });
  game.usedChoices['p-3'].whist = true;
  assert.deepStrictEqual(findNextChooser(game, 0), { cursor: 0, playerId: 'p-1' });
  assert.deepStrictEqual(getEligibleRuleIdsForPlayer(game, 'p-2'), []);
});

test('builds public room summaries with avatars and friend markers', () => {
  const summary = buildPublicRoomSummary(
    'ABCDEF',
    {
      roomName: 'Public Table',
      visibility: 'public',
      status: 'waiting',
      players: [
        { userId: 'p-1', name: 'Alex', avatarUrl: 'alex.png' },
        { userId: 'p-2', name: 'Mara' }
      ],
      spectators: []
    },
    { userId: 'viewer', friends: ['p-2'] }
  );

  assert.strictEqual(summary.roomId, 'ABCDEF');
  assert.strictEqual(summary.roomName, 'Public Table');
  assert.strictEqual(summary.playerCount, 2);
  assert.strictEqual(summary.avatars[0].avatarUrl, 'alex.png');
  assert.strictEqual(summary.hasFriend, true);
  assert.strictEqual(summary.isInGame, false);
});

test('marks public room summaries when the room is already in a game', () => {
  const summary = buildPublicRoomSummary(
    'ZXCVBN',
    {
      roomName: 'Busy Table',
      visibility: 'public',
      status: 'playing',
      players: [{ userId: 'p-1', name: 'Alex' }],
      spectators: [{ userId: 'viewer-1', name: 'Mara' }]
    }
  );

  assert.strictEqual(summary.status, 'playing');
  assert.strictEqual(summary.isInGame, true);
  assert.strictEqual(summary.spectatorCount, 1);
});

test('updates and deletes room-scoped custom rulesets in-place', () => {
  const lobby = {
    hostId: 'host-1',
    players: [{ userId: 'host-1' }],
    customRulesets: [{
      id: 'room_custom_1',
      label: 'Old Rule',
      abbreviation: 'OLD',
      type: 'per_round',
      code: 'add(5)',
      source: 'room',
      createdBy: 'host-1',
      createdAt: 1,
      compiled: compileRuleset('add(5)', 'per_round')
    }],
    selectedRulesets: { room_custom_1: true },
    rulesetPermissions: { 'host-1': { room_custom_1: true } }
  };

  const updateResult = updateCustomRulesetInLobby(lobby, 'room_custom_1', {
    longName: 'New Rule',
    shortName: 'NEW',
    type: 'end_game',
    code: 'reset_to(100)'
  });

  assert.strictEqual(updateResult.error, undefined);
  assert.strictEqual(lobby.customRulesets[0].id, 'room_custom_1');
  assert.strictEqual(lobby.customRulesets[0].label, 'New Rule');
  assert.strictEqual(lobby.customRulesets[0].type, 'end_game');
  assert.strictEqual(lobby.customRulesets[0].createdAt, 1);
  assert.strictEqual(typeof lobby.customRulesets[0].updatedAt, 'number');

  const deleteResult = deleteCustomRulesetFromLobby(lobby, 'room_custom_1');
  assert.strictEqual(deleteResult.error, undefined);
  assert.strictEqual(lobby.customRulesets.length, 0);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(lobby.selectedRulesets, 'room_custom_1'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(lobby.rulesetPermissions['host-1'], 'room_custom_1'), false);
});

test('applies end_game rulesets once at small-game end using collected cards', () => {
  const game = {
    activeRulesetId: 'room_end_game',
    customRulesets: [{
      id: 'room_end_game',
      label: 'Round Reset',
      abbreviation: 'RR',
      type: 'end_game',
      code: 'reset_to(1000, HEART_KING)',
      compiled: compileRuleset('reset_to(1000, HEART_KING)', 'end_game')
    }],
    nvSelected: false,
    players: [
      { userId: 'p-1' },
      { userId: 'p-2' }
    ],
    pointsByPlayer: {
      'p-1': 40,
      'p-2': 60
    },
    collectedByPlayer: {
      'p-1': [[{ card: 'K-H' }]],
      'p-2': [[{ card: 'A-S' }]]
    }
  };

  const result = applyActiveRulesetAtRoundEnd(game);

  assert.strictEqual(result.applied, true);
  assert.strictEqual(result.scoreDeltas['p-1'], 960);
  assert.strictEqual(result.scoreDeltas['p-2'], 0);
  assert.strictEqual(game.pointsByPlayer['p-1'], 1000);
  assert.strictEqual(game.pointsByPlayer['p-2'], 60);
});

test('skips round-end scoring for per_round rulesets', () => {
  const game = {
    activeRulesetId: 'room_per_round',
    customRulesets: [{
      id: 'room_per_round',
      label: 'Per Trick',
      abbreviation: 'PT',
      type: 'per_round',
      code: 'add(10)',
      compiled: compileRuleset('add(10)', 'per_round')
    }],
    nvSelected: false,
    players: [{ userId: 'p-1' }],
    pointsByPlayer: { 'p-1': 25 },
    collectedByPlayer: { 'p-1': [] }
  };

  const result = applyActiveRulesetAtRoundEnd(game);

  assert.deepStrictEqual(result, { applied: false, scoreDeltas: {} });
  assert.strictEqual(game.pointsByPlayer['p-1'], 25);
});

test('validates default training settings and computes filler bots', async () => {
  const result = await validateTrainingSettings({
    trainerElo: 1800,
    selectedRulesetId: 'whist',
    preMoveCommentaryEnabled: true,
    postMoveFeedbackEnabled: false,
    totalRounds: 3,
    playerCount: 5
  }, {
    userId: 'player-1',
    elo: 2200,
    guest: false
  });

  assert.strictEqual(result.error, undefined);
  assert.strictEqual(result.trainerElo, 1800);
  assert.strictEqual(result.totalRounds, 3);
  assert.strictEqual(result.playerCount, 5);
  assert.strictEqual(result.regularBotCount, 3);
  assert.strictEqual(result.selectedRulesetId, 'whist');
  assert.strictEqual(result.selectedRulesetSource, 'default');
  assert.strictEqual(result.postMoveFeedbackEnabled, false);
});

test('creates a training session with one Trainer and filler bots', async () => {
  const emitted = [];
  const joinedRooms = [];
  const io = {
    to(target) {
      return {
        emit(event, payload) {
          emitted.push({ target, event, payload });
        }
      };
    }
  };
  const socket = {
    id: 'socket-training-host',
    join(roomId) {
      joinedRooms.push(roomId);
    }
  };
  const user = {
    userId: 'guest-training',
    guest: true,
    name: 'Guest Coach',
    displayName: 'Guest Coach',
    avatarUrl: '',
    elo: null
  };

  const result = await createTrainingMatchSession(io, socket, user, {
    trainerElo: 2750,
    selectedRulesetId: 'whist',
    preMoveCommentaryEnabled: true,
    postMoveFeedbackEnabled: true,
    totalRounds: 2,
    playerCount: 4
  });

  assert.strictEqual(result.error, undefined);
  assert.strictEqual(result.success, true);
  assert.strictEqual(joinedRooms.length, 1);
  assert.strictEqual(result.lobby.matchMode, 'training');
  assert.strictEqual(result.game.matchMode, 'training');
  assert.strictEqual(result.lobby.training.trainerElo, 2750);
  assert.strictEqual(result.lobby.training.totalRounds, 2);
  assert.strictEqual(result.lobby.training.playerCount, 4);
  assert.strictEqual(result.lobby.training.regularBotCount, 2);
  assert.strictEqual(result.lobby.players.length, 4);
  assert.strictEqual(result.lobby.players.filter((player) => player.isTrainer).length, 1);
  assert.strictEqual(result.lobby.players.filter((player) => player.isBot && !player.isTrainer).length, 2);
  assert.strictEqual(result.lobby.players[1].rankName, 'Practising Rentz Expert');
  assert.strictEqual(result.game.choiceState?.phase, 'choosing_nv');
  assert.ok(emitted.some((entry) => entry.event === 'game_started'));
  assert.ok(emitted.some((entry) => entry.event === 'choice_state_update'));
});

test('skips elo and match-history persistence for training matches', async () => {
  const io = {
    to() {
      return {
        emit() {}
      };
    }
  };
  const trainingGame = {
    matchMode: 'training',
    training: {
      enabled: true,
      totalRounds: 1
    },
    players: [
      { userId: 'guest-1', guest: true, isBot: false },
      { userId: 'trainer-1', guest: false, isBot: true, isTrainer: true }
    ],
    lastEloResults: [{ userId: 'stale' }],
    lastEloDeltaByUserId: { stale: 5 }
  };
  const standings = [
    { userId: 'guest-1', points: 10 },
    { userId: 'trainer-1', points: 0 }
  ];

  const eloResult = await applyCompletedGameEloUpdates(io, 'TRN999', trainingGame, standings);
  const historyResult = await persistCompletedMatchHistory(trainingGame, standings);

  assert.deepStrictEqual(eloResult, {
    applied: false,
    reason: 'training-match',
    results: []
  });
  assert.deepStrictEqual(trainingGame.lastEloResults, []);
  assert.deepStrictEqual(trainingGame.lastEloDeltaByUserId, {});
  assert.strictEqual(historyResult, null);
});

test('Trainer NV choice starts the locked training ruleset without ruleset selection', () => {
  const emitted = [];
  const io = {
    to(target) {
      return {
        emit(event, payload) {
          emitted.push({ target, event, payload });
        }
      };
    }
  };
  const game = {
    roomId: 'TRNSET',
    matchMode: 'training',
    training: {
      enabled: true,
      humanUserId: 'human-1',
      trainerUserId: 'trainer-1',
      selectedRulesetId: 'whist',
      selectedRulesetLabel: 'Whist',
      totalRounds: 3
    },
    phase: 'choosing_nv',
    chooserId: 'human-1',
    nvAllowed: true,
    nvSelected: false,
    turnIndex: 0,
    roundNumber: 0,
    useTurnTimer: false,
    turnTimerSeconds: 45,
    players: [
      { userId: 'human-1', name: 'Player', socketId: 'socket-human', isBot: false },
      { userId: 'trainer-1', name: 'Trainer', socketId: 'trainer:1', isBot: true, isTrainer: true }
    ],
    handsReady: {
      'human-1': [],
      'trainer-1': []
    },
    currentTrick: [],
    collectedHands: [],
    collectedByPlayer: {
      'human-1': [],
      'trainer-1': []
    },
    pointsByPlayer: {
      'human-1': 0,
      'trainer-1': 0
    },
    stateVersion: 0,
    customRulesets: [],
    selectedRulesets: { whist: true },
    rulesetPermissions: {
      'human-1': { whist: true },
      'trainer-1': { whist: true }
    }
  };

  const result = setNvChoiceForRound(io, 'TRNSET', game, 'human-1', true);

  assert.strictEqual(result.error, undefined);
  assert.strictEqual(game.phase, 'playing_round');
  assert.strictEqual(game.activeRulesetId, 'whist');
  assert.strictEqual(game.roundNumber, 1);
  assert.strictEqual(game.nvSelected, true);
  assert.ok(emitted.some((entry) => entry.event === 'small_game_started'));
  assert.ok(!emitted.some((entry) => entry.event === 'choice_state_update'));
});

test('setCurrentPlayer normalizes the authoritative turn state', () => {
  const game = {
    players: [
      { userId: 'player-1', isCurrent: true },
      { userId: 'player-2', isCurrent: false },
      { userId: 'player-3', isCurrent: true }
    ],
    turnIndex: 0,
    currentPlayerId: 'player-1'
  };

  const changed = setCurrentPlayer(game, 'player-2');

  assert.strictEqual(changed, true);
  assert.strictEqual(game.turnIndex, 1);
  assert.strictEqual(game.currentPlayerId, 'player-2');
  assert.deepStrictEqual(game.players.map((player) => Boolean(player.isCurrent)), [false, true, false]);
  assert.strictEqual(validateActiveTurnState({
    ...game,
    roomId: 'TURNTEST',
    phase: 'playing_round',
    trickPending: false,
    handsReady: {
      'player-1': ['2-hearts'],
      'player-2': ['3-hearts'],
      'player-3': ['4-hearts']
    },
    currentTrick: [],
    trickSuit: null
  }, 'unit-test'), true);
});

test('playCardForPlayer keeps the trick winner as the only next current player', () => {
  const emitted = [];
  const io = {
    to(target) {
      return {
        emit(event, payload) {
          emitted.push({ target, event, payload });
        }
      };
    }
  };
  const roomId = 'BOTTURN';
  const game = {
    roomId,
    phase: 'playing_round',
    status: 'playing',
    players: [
      { userId: 'bot-1', name: 'Bot 1', socketId: 'socket-1', isBot: true },
      { userId: 'bot-2', name: 'Bot 2', socketId: 'socket-2', isBot: true },
      { userId: 'bot-3', name: 'Bot 3', socketId: 'socket-3', isBot: true }
    ],
    turnIndex: 2,
    currentPlayerId: 'bot-3',
    trickPending: false,
    trickSuit: 'hearts',
    currentTrick: [
      { playedBy: 'bot-1', playerName: 'Bot 1', card: '10-hearts', auto: true },
      { playedBy: 'bot-2', playerName: 'Bot 2', card: 'K-hearts', auto: true }
    ],
    handsReady: {
      'bot-1': ['2-clubs'],
      'bot-2': ['3-clubs'],
      'bot-3': ['A-hearts', '4-clubs']
    },
    collectedHands: [],
    collectedByPlayer: {
      'bot-1': [],
      'bot-2': [],
      'bot-3': []
    },
    pointsByPlayer: {
      'bot-1': 0,
      'bot-2': 0,
      'bot-3': 0
    },
    roundStats: { tricks: [] },
    stateVersion: 0,
    customRulesets: [],
    activeRulesetId: null,
    choiceState: null,
    botActionTimeoutId: null,
    pendingBotActionKey: null,
    botActionGeneration: 0,
    botActionInFlightKey: null,
    botActionInFlightGeneration: null,
    useTurnTimer: false,
    training: null
  };

  activeGames.set(roomId, game);
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (callback, delay) => {
    if (delay === 1500) {
      callback();
    }
    return { unref() {} };
  };

  try {
    const result = playCardForPlayer(io, roomId, 'bot-3', 'A-hearts', { auto: true });

    assert.deepStrictEqual(result, { success: true });
    assert.strictEqual(game.turnIndex, 2);
    assert.strictEqual(game.currentPlayerId, 'bot-3');
    assert.strictEqual(game.trickPending, false);
    assert.deepStrictEqual(game.currentTrick, []);

    const gameUpdate = emitted.find((entry) => entry.event === 'game_update');
    assert.ok(gameUpdate);
    assert.strictEqual(gameUpdate.payload.turnIndex, 2);
    assert.strictEqual(gameUpdate.payload.currentPlayerId, 'bot-3');

    const trickWon = emitted.find((entry) => entry.event === 'trick_won');
    assert.ok(trickWon);
    assert.strictEqual(trickWon.payload.nextTurnIndex, 2);
    assert.strictEqual(trickWon.payload.currentPlayerId, 'bot-3');

    const trickEnd = emitted.find((entry) => entry.event === 'trick_end');
    assert.ok(trickEnd);
    assert.strictEqual(trickEnd.payload.nextTurnIndex, 2);
    assert.strictEqual(trickEnd.payload.currentPlayerId, 'bot-3');
  } finally {
    global.setTimeout = originalSetTimeout;
    activeGames.delete(roomId);
  }
});

test('playCardForPlayer preserves all 6 bots across trick boundaries and finishes the round cleanly', () => {
  const emitted = [];
  const io = {
    to(target) {
      return {
        emit(event, payload) {
          emitted.push({ target, event, payload });
        }
      };
    }
  };
  const roomId = 'BOT6ROUND';
  const players = Array.from({ length: 6 }, (_, index) => ({
    userId: `bot-${index + 1}`,
    name: `Bot ${index + 1}`,
    socketId: `socket-${index + 1}`,
    isBot: true
  }));
  const hands = dealCards(generateDeck(players.length), players.map((player) => player.userId));
  const game = {
    roomId,
    phase: 'playing_round',
    status: 'playing',
    players,
    chooserOrder: players.map((player) => player.userId),
    chooserCursor: 0,
    chooserId: players[0].userId,
    usedChoices: Object.fromEntries(players.map((player) => [player.userId, { whist: true }])),
    selectedRulesets: { whist: true },
    rulesetPermissions: Object.fromEntries(players.map((player) => [player.userId, { whist: true }])),
    roundActivePlayerIds: players.map((player) => player.userId),
    activeRulesetId: 'whist',
    nvAllowed: false,
    nvSelected: false,
    roundNumber: 1,
    handsReady: hands,
    startingHandSize: hands[players[0].userId].length,
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
    training: null
  };

  activeGames.set(roomId, game);
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (callback, delay) => {
    if (delay === 1500) {
      callback();
    }
    return { unref() {} };
  };

  const pickLegalCard = (currentGame, playerId) => {
    const hand = currentGame.handsReady[playerId] || [];
    if (!currentGame.trickSuit || currentGame.currentTrick.length === 0) {
      return hand[0];
    }

    return hand.find((card) => card.split('-')[1] === currentGame.trickSuit) || hand[0];
  };

  try {
    let firstTrickLeader = game.currentPlayerId;
    let secondTrickLeader = null;
    let completedTricks = 0;

    while (game.phase === 'playing_round') {
      assert.equal(validateActiveTurnState(game, 'six-bot-regression', { allowDisconnected: true }), true);
      assert.strictEqual(game.roundActivePlayerIds.length, game.players.length);

      const currentPlayerId = game.currentPlayerId;
      assert.ok(currentPlayerId);

      const currentFlags = game.players.filter((player) => Boolean(player.isCurrent || player.current || player.isTurn));
      assert.equal(currentFlags.length <= 1, true);
      assert.strictEqual(new Set(game.roundActivePlayerIds.length ? game.roundActivePlayerIds : game.players.map((player) => player.userId)).size, players.length);

      const selectedCard = pickLegalCard(game, currentPlayerId);
      const result = playCardForPlayer(io, roomId, currentPlayerId, selectedCard, { auto: true });
      assert.deepEqual(result, { success: true });

      if (game.currentTrick.length === 0) {
        completedTricks += 1;
        if (completedTricks === 1) {
          secondTrickLeader = game.currentPlayerId;
        }
      }

      if (completedTricks > 12) {
        assert.fail('expected the 6-bot round to finish within the dealt hand size');
      }
    }

    assert.equal(firstTrickLeader, players[0].userId);
    assert.ok(secondTrickLeader);
    assert.notEqual(secondTrickLeader, '');
    assert.equal(game.phase, 'round_stats');
    assert.equal(game.roundStats.tricks.length, 8);
    assert.deepEqual(
      Object.fromEntries(players.map((player) => [player.userId, (game.handsReady[player.userId] || []).length])),
      Object.fromEntries(players.map((player) => [player.userId, 0]))
    );
    assert.equal(
      game.roundStats.tricks.every((trick) => new Set(trick.cards.map((play) => play.playedBy)).size === players.length),
      true
    );
    assert.equal(
      emitted.some((entry) => entry.event === 'trick_end' && entry.payload.currentPlayerId === secondTrickLeader),
      true
    );
  } finally {
    global.setTimeout = originalSetTimeout;
    activeGames.delete(roomId);
  }
});

test('dealNewRoundCards keeps 6 unique active bots and uniform hands after a bot seat is reused', () => {
  const io = {
    to() {
      return {
        emit() {}
      };
    }
  };
  const lobby = {
    roomId: 'BOT6DEAL',
    roomName: 'Bot Table',
    hostId: 'bot-host',
    rulesetId: null,
    customRulesets: [],
    selectedRulesets: { whist: true },
    rulesetPermissions: {},
    nvAllowed: false,
    autoBotReplacementEnabled: true,
    useTurnTimer: false,
    turnTimerSeconds: 45,
    players: Array.from({ length: 6 }, (_, index) => ({
      userId: `bot-${index + 1}`,
      socketId: `socket-${index + 1}`,
      seatIndex: index,
      joinOrder: index + 1,
      displayName: `Bot ${index + 1}`,
      name: `Bot ${index + 1}`,
      isBot: true,
      isReady: true,
      role: 'player',
      isConnected: true,
      connectionStatus: 'connected'
    }))
  };
  const game = buildGameStateFromLobby(lobby);

  assert.deepStrictEqual(dealNewRoundCards(io, lobby.roomId, game), true);
  assert.strictEqual(game.roundActivePlayerIds.length, 6);
  assert.strictEqual(new Set(game.roundActivePlayerIds).size, 6);
  assert.strictEqual(
    game.roundActivePlayerIds.every((playerId) => Array.isArray(game.handsReady[playerId])),
    true
  );
  assert.deepStrictEqual(
    game.roundActivePlayerIds.map((playerId) => game.handsReady[playerId].length),
    [8, 8, 8, 8, 8, 8]
  );
});

test('standard 6-bot game flow completes one full trick with invariant checks after every move', () => {
  const { io, emitted } = createMockIo();
  const lobby = createSixBotRoom({
    roomId: 'BOT6TRICKFLOW',
    selectedRulesets: { whist: true, levate: true }
  });
  const warningCapture = captureWarnings();
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (callback, delay) => {
    if (delay === 1500) {
      callback();
    }
    return { unref() {} };
  };

  try {
    const { game } = startGameWithBots(io, lobby, {
      buildGameStateFromLobby,
      beginChooserTurn,
      selectRulesetForRound,
      getEligibleRuleIdsForPlayer,
      preferredRulesetId: 'levate'
    });
    activeGames.set(lobby.roomId, game);

    const initialActivePlayerIds = getRoundActivePlayerIds(game);
    const expectedDeckSize = 8 * initialActivePlayerIds.length;

    assertRoundInvariants(game, {
      expectedDeckSize,
      expectedHandSize: 8,
      initialActivePlayerIds,
      step: 'roundStart'
    });

    playOneCompleteTrick(io, lobby.roomId, game, {
      playCardForPlayer,
      getLegalCardsForPlayer,
      expectedDeckSize,
      initialActivePlayerIds,
      step: 'firstTrick'
    });

    assert.strictEqual(
      game.currentTrick.length,
      0,
      JSON.stringify(buildInvariantSnapshot(game, { step: 'afterFirstTrick', expectedDeckSize, initialActivePlayerIds }))
    );
    assertRoundInvariants(game, {
      expectedDeckSize,
      expectedHandSize: 7,
      initialActivePlayerIds,
      step: 'afterFirstTrick'
    });
    assert.ok(emitted.some((entry) => entry.event === 'trick_won'));
    assert.ok(emitted.some((entry) => entry.event === 'trick_end'));
    assert.strictEqual(
      warningCapture.warnings.some((warning) =>
        warning.includes('no active player was available')
        || warning.includes('Active players corrupted before bot scheduling')
      ),
      false,
      warningCapture.warnings.join('\n')
    );
  } finally {
    warningCapture.restore();
    global.setTimeout = originalSetTimeout;
    activeGames.delete(lobby.roomId);
  }
});

test('standard 6-bot game flow completes a full round without deadlock or card loss', () => {
  const { io, emitted } = createMockIo();
  const lobby = createSixBotRoom({
    roomId: 'BOT6FULLFLOW',
    selectedRulesets: { whist: true, levate: true }
  });
  const warningCapture = captureWarnings();
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (callback, delay) => {
    if (delay === 1500) {
      callback();
    }
    return { unref() {} };
  };

  try {
    const { game } = startGameWithBots(io, lobby, {
      buildGameStateFromLobby,
      beginChooserTurn,
      selectRulesetForRound,
      getEligibleRuleIdsForPlayer,
      preferredRulesetId: 'levate'
    });
    activeGames.set(lobby.roomId, game);

    const initialActivePlayerIds = getRoundActivePlayerIds(game);
    const expectedDeckSize = 8 * initialActivePlayerIds.length;

    const moveCount = playUntilRoundEnd(io, lobby.roomId, game, {
      playCardForPlayer,
      getLegalCardsForPlayer,
      expectedDeckSize,
      initialActivePlayerIds
    });

    assert.ok(moveCount > 0);
    assert.strictEqual(game.phase, 'round_stats');
    assert.deepStrictEqual(
      Object.fromEntries(initialActivePlayerIds.map((playerId) => [playerId, (game.handsReady[playerId] || []).length])),
      Object.fromEntries(initialActivePlayerIds.map((playerId) => [playerId, 0])),
      JSON.stringify(buildInvariantSnapshot(game, { step: 'roundEnd', expectedDeckSize, initialActivePlayerIds }))
    );
    assertUniqueActivePlayers(game, {
      expectedCount: 6,
      initialActivePlayerIds,
      step: 'roundEnd'
    });
    assert.strictEqual(game.pendingBotActionKey || null, null);
    assert.strictEqual(game.botActionTimeoutId || null, null);
    assert.ok(emitted.some((entry) => entry.event === 'round_finished'));
    assert.strictEqual(
      warningCapture.warnings.some((warning) =>
        warning.includes('no active player was available')
        || warning.includes('Active players corrupted before bot scheduling')
        || warning.includes('Duplicate roundActivePlayerIds detected')
      ),
      false,
      warningCapture.warnings.join('\n')
    );
  } finally {
    warningCapture.restore();
    global.setTimeout = originalSetTimeout;
    activeGames.delete(lobby.roomId);
  }
});

test('continuing after round stats rebuilds the next round cleanly for the same 6 bots', () => {
  const { io } = createMockIo();
  const lobby = createSixBotRoom({
    roomId: 'BOT6ROUND2',
    selectedRulesets: { whist: true, levate: true }
  });
  const warningCapture = captureWarnings();
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (callback, delay) => {
    if (delay === 1500) {
      callback();
    }
    return { unref() {} };
  };

  try {
    const { game } = startGameWithBots(io, lobby, {
      buildGameStateFromLobby,
      beginChooserTurn,
      selectRulesetForRound,
      getEligibleRuleIdsForPlayer,
      preferredRulesetId: 'levate'
    });
    activeGames.set(lobby.roomId, game);

    const firstRoundActivePlayerIds = getRoundActivePlayerIds(game);
    const expectedDeckSize = 8 * firstRoundActivePlayerIds.length;

    playUntilRoundEnd(io, lobby.roomId, game, {
      playCardForPlayer,
      getLegalCardsForPlayer,
      expectedDeckSize,
      initialActivePlayerIds: firstRoundActivePlayerIds
    });

    assert.strictEqual(game.phase, 'round_stats');
    assert.deepStrictEqual(continueAfterRound(io, lobby.roomId, game), { success: true });
    assert.strictEqual(game.phase, 'choosing_ruleset');
    assert.strictEqual(game.currentTrick.length, 0);
    assert.strictEqual(game.trickSuit, null);

    const secondRoundPreSelectionActivePlayerIds = getRoundActivePlayerIds(game);
    assert.deepStrictEqual(
      [...new Set(secondRoundPreSelectionActivePlayerIds)].sort(),
      [...new Set(firstRoundActivePlayerIds)].sort(),
      JSON.stringify(buildInvariantSnapshot(game, {
        step: 'secondRoundPreSelection',
        expectedDeckSize,
        initialActivePlayerIds: firstRoundActivePlayerIds
      }))
    );
    assert.deepStrictEqual(
      secondRoundPreSelectionActivePlayerIds.map((playerId) => game.handsReady[playerId].length),
      [8, 8, 8, 8, 8, 8]
    );

    const eligibleRuleIds = getEligibleRuleIdsForPlayer(game, game.chooserId);
    assert.ok(eligibleRuleIds.length > 0);
    assert.deepStrictEqual(
      selectRulesetForRound(io, lobby.roomId, game, game.chooserId, eligibleRuleIds[0]),
      { success: true }
    );
    assert.strictEqual(game.roundNumber, 2);

    const secondRoundActivePlayerIds = getRoundActivePlayerIds(game);
    assertRoundInvariants(game, {
      expectedDeckSize,
      expectedHandSize: 8,
      initialActivePlayerIds: secondRoundActivePlayerIds,
      step: 'secondRoundStart'
    });

    playOneCompleteTrick(io, lobby.roomId, game, {
      playCardForPlayer,
      getLegalCardsForPlayer,
      expectedDeckSize,
      initialActivePlayerIds: secondRoundActivePlayerIds,
      step: 'secondRoundFirstTrick'
    });

    assertValidCurrentPlayer(game, { step: 'secondRoundFirstTrickEnd' });
    assert.strictEqual(
      warningCapture.warnings.some((warning) =>
        warning.includes('no active player was available')
        || warning.includes('Active players corrupted before bot scheduling')
      ),
      false,
      warningCapture.warnings.join('\n')
    );
  } finally {
    warningCapture.restore();
    global.setTimeout = originalSetTimeout;
    activeGames.delete(lobby.roomId);
  }
});

test('validateRoundStateIntegrity rejects duplicated active players before bot scheduling', () => {
  const duplicatedPlayerId = 'bot_TL2SVI_4_e16d7807';
  const game = {
    roomId: 'TL2SVI',
    phase: 'playing_round',
    status: 'playing',
    players: [
      { userId: 'bot_TL2SVI_1_955e3fa9', isBot: true, connectionStatus: 'connected' },
      { userId: 'bot_TL2SVI_2_0e50db5f', isBot: true, connectionStatus: 'connected' },
      { userId: 'bot_TL2SVI_3_2591d9b3', isBot: true, connectionStatus: 'connected' },
      { userId: duplicatedPlayerId, isBot: true, connectionStatus: 'connected' },
      { userId: duplicatedPlayerId, isBot: true, connectionStatus: 'connected' },
      { userId: 'bot_TL2SVI_5_7f06bfcb', isBot: true, connectionStatus: 'connected' }
    ],
    roundActivePlayerIds: [
      'bot_TL2SVI_1_955e3fa9',
      'bot_TL2SVI_2_0e50db5f',
      'bot_TL2SVI_3_2591d9b3',
      duplicatedPlayerId,
      duplicatedPlayerId,
      'bot_TL2SVI_5_7f06bfcb'
    ],
    handsReady: {
      'bot_TL2SVI_1_955e3fa9': Array(7).fill('2-C'),
      'bot_TL2SVI_2_0e50db5f': Array(7).fill('3-C'),
      'bot_TL2SVI_3_2591d9b3': Array(7).fill('4-C'),
      [duplicatedPlayerId]: Array(15).fill('5-C'),
      'bot_TL2SVI_5_7f06bfcb': Array(7).fill('6-C')
    },
    startingHandSize: 8,
    collectedHands: [],
    currentTrick: [
      { playedBy: 'bot_TL2SVI_1_955e3fa9', card: 'A-H' },
      { playedBy: 'bot_TL2SVI_2_0e50db5f', card: 'K-H' },
      { playedBy: 'bot_TL2SVI_3_2591d9b3', card: 'Q-H' },
      { playedBy: duplicatedPlayerId, card: 'J-H' },
      { playedBy: 'bot_TL2SVI_5_7f06bfcb', card: '10-H' }
    ],
    trickPending: false,
    currentPlayerId: 'bot_TL2SVI_3_2591d9b3',
    turnIndex: 2
  };

  assert.strictEqual(
    validateRoundStateIntegrity(game, 'six-bot-corruption', {
      allowDisconnected: true,
      requireHands: true
    }),
    false
  );
});

test('playCardForPlayer rejects a second play from the same player in one trick', () => {
  const io = {
    to() {
      return {
        emit() {}
      };
    }
  };
  const roomId = 'BOTDUP';
  const game = {
    roomId,
    phase: 'playing_round',
    status: 'playing',
    players: [
      { userId: 'bot-1', name: 'Bot 1', socketId: 'socket-1', isBot: true },
      { userId: 'bot-2', name: 'Bot 2', socketId: 'socket-2', isBot: true },
      { userId: 'bot-3', name: 'Bot 3', socketId: 'socket-3', isBot: true }
    ],
    turnIndex: 0,
    currentPlayerId: 'bot-1',
    trickPending: false,
    trickSuit: 'hearts',
    currentTrick: [
      { playedBy: 'bot-1', playerName: 'Bot 1', card: 'A-hearts', auto: true }
    ],
    handsReady: {
      'bot-1': ['K-hearts'],
      'bot-2': ['Q-hearts'],
      'bot-3': ['J-hearts']
    },
    collectedHands: [],
    collectedByPlayer: {
      'bot-1': [],
      'bot-2': [],
      'bot-3': []
    },
    pointsByPlayer: {
      'bot-1': 0,
      'bot-2': 0,
      'bot-3': 0
    },
    roundStats: { tricks: [] },
    stateVersion: 0,
    turnVersion: 0,
    customRulesets: [],
    activeRulesetId: null,
    choiceState: null,
    botActionTimeoutId: null,
    pendingBotActionKey: null,
    botActionGeneration: 0,
    botActionInFlightKey: null,
    botActionInFlightGeneration: null,
    useTurnTimer: false,
    training: null
  };

  activeGames.set(roomId, game);

  try {
    const result = playCardForPlayer(io, roomId, 'bot-1', 'K-hearts', { auto: true });
    assert.equal(result.error, 'You already played in this trick');
  } finally {
    activeGames.delete(roomId);
  }
});

test('playCardForPlayer keeps mixed human and bot turn order intact', () => {
  const io = {
    to() {
      return {
        emit() {}
      };
    }
  };
  const roomId = 'MIXTURN';
  const game = {
    roomId,
    phase: 'playing_round',
    status: 'playing',
    players: [
      { userId: 'human-1', name: 'Human 1', socketId: 'socket-human', isBot: false },
      { userId: 'bot-2', name: 'Bot 2', socketId: 'socket-bot-2', isBot: true },
      { userId: 'bot-3', name: 'Bot 3', socketId: 'socket-bot-3', isBot: true }
    ],
    turnIndex: 0,
    currentPlayerId: 'human-1',
    trickPending: false,
    trickSuit: null,
    currentTrick: [],
    handsReady: {
      'human-1': ['A-hearts', '2-clubs'],
      'bot-2': ['K-hearts', '3-clubs'],
      'bot-3': ['Q-hearts', '4-clubs']
    },
    collectedHands: [],
    collectedByPlayer: {
      'human-1': [],
      'bot-2': [],
      'bot-3': []
    },
    pointsByPlayer: {
      'human-1': 0,
      'bot-2': 0,
      'bot-3': 0
    },
    roundStats: { tricks: [] },
    stateVersion: 0,
    turnVersion: 0,
    customRulesets: [],
    activeRulesetId: null,
    choiceState: null,
    botActionTimeoutId: null,
    pendingBotActionKey: null,
    botActionGeneration: 0,
    botActionInFlightKey: null,
    botActionInFlightGeneration: null,
    useTurnTimer: false,
    training: null
  };

  activeGames.set(roomId, game);

  try {
    assert.deepEqual(playCardForPlayer(io, roomId, 'human-1', 'A-hearts'), { success: true });
    assert.equal(game.currentPlayerId, 'bot-2');
    assert.equal(game.turnIndex, 1);

    assert.deepEqual(playCardForPlayer(io, roomId, 'bot-2', 'K-hearts', { auto: true }), { success: true });
    assert.equal(game.currentPlayerId, 'bot-3');
    assert.equal(game.turnIndex, 2);
    assert.equal(validateActiveTurnState(game, 'mixed-turn-regression', { allowDisconnected: true }), true);
  } finally {
    activeGames.delete(roomId);
  }
});

test('leaving a training match ends the live session instead of replacing the player', () => {
  const emitted = [];
  const leftRooms = [];
  const io = {
    to(target) {
      return {
        emit(event, payload) {
          emitted.push({ target, event, payload });
        }
      };
    },
    sockets: {
      sockets: new Map([
        ['socket-human', {
          leave(roomId) {
            leftRooms.push(roomId);
          }
        }]
      ])
    }
  };
  const lobby = {
    roomId: 'TRNLEAVE',
    players: [
      { userId: 'human-1', socketId: 'socket-human', name: 'Player', isBot: false },
      { userId: 'trainer-1', socketId: 'trainer:1', name: 'Trainer', isBot: true, isTrainer: true }
    ],
    spectators: []
  };
  const game = {
    matchMode: 'training',
    training: {
      enabled: true,
      humanUserId: 'human-1',
      selectedRulesetId: 'whist'
    },
    players: [
      { userId: 'human-1', socketId: 'socket-human', name: 'Player', isBot: false },
      { userId: 'trainer-1', socketId: 'trainer:1', name: 'Trainer', isBot: true, isTrainer: true }
    ]
  };
  const member = lobby.players[0];

  const result = abandonActiveMatch(io, 'TRNLEAVE', lobby, game, member);

  assert.deepStrictEqual(result, {
    success: true,
    message: 'Training session ended.'
  });
  assert.deepStrictEqual(leftRooms, ['TRNLEAVE']);
  assert.ok(emitted.some((entry) => entry.event === 'live_game_session_closed'));
  assert.ok(!emitted.some((entry) => entry.event === 'game_activity'));
});

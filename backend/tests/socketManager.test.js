const test = require('node:test');
const assert = require('node:assert');
const {
  applyActiveRulesetAtRoundEnd,
  buildPublicRoomSummary,
  bumpGameStateVersion,
  findNextChooser,
  getEligibleRuleIdsForPlayer,
  getStartGameValidationError,
  addBotToLobby,
  removeWaitingLobbyMember,
  removeBotFromLobby,
  setLobbyChatMutedState,
  deleteCustomRulesetFromLobby,
  sanitizeTurnTimerSeconds,
  sanitizeRulesetPermissions,
  setLobbyMemberRole,
  updateCustomRulesetInLobby
} = require('../socketManager');
const { compileRuleset } = require('../engine/evaluator');

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

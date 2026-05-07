const Game = require('./models/Game');
const User = require('./models/User');
const { randomFriendCode } = require('./utils/helpers');
const { DEFAULT_PROFILE_PICTURE_PATH } = require('./src/lib/accountAssets');
const { buildFriendStatePayload } = require('./src/lib/friends');
const { getAuthenticatedUserFromCookieHeader, serializeAccount } = require('./src/lib/auth');
const { generateDeck, shuffle, dealCards } = require('./utils/cards');
const {
  DEFAULT_RULESET_SELECTIONS,
  evaluateRulesetForTrick,
  getAvailableRulesets,
  getRulesetDefinitionById,
  sanitizeRulesetSelections
} = require('./rulesets');
const { compileRuleset } = require('./engine/evaluator');

// In-memory lobby management
const lobbies = new Map(); // roomId -> Set(socketIds)
const activeGames = new Map(); // roomId -> game state
const socketToUser = new Map(); // socketId -> { userId, name }
const pendingLobbyDisconnects = new Map(); // roomId:userId -> timeout
const MIN_PLAYERS_TO_START = 2;
const MAX_ACTIVE_PLAYERS = 6;
const DEFAULT_ROOM_VISIBILITY = 'public';
const ROOM_VISIBILITIES = new Set(['public', 'private']);
const DEFAULT_TURN_TIMER_SECONDS = 45;
const TURN_TIMER_RANGE = { min: 15, max: 300 };
const DISCONNECT_GRACE_MS = 120000;
const ROOM_CUSTOM_RULESET_LIMIT = 20;
const ROOM_RULESET_NAME_MAX_LENGTH = 80;
const ROOM_RULESET_ABBREVIATION_MAX_LENGTH = 12;
const ROOM_RULESET_CODE_MAX_LENGTH = 20000;
const RULESET_TYPES = new Set(['per_round', 'end_game']);
const EMOJI_REACTION_IDS = new Set(['grin', 'wink', 'laugh', 'shock', 'love', 'gg']);
const SUIT_NAMES = {
  H: 'Hearts',
  D: 'Diamonds',
  C: 'Clubs',
  S: 'Spades'
};

function serializeRoomSettings(lobby) {
  return {
    availableRulesets: getAvailableRulesets(lobby?.customRulesets),
    selectedRulesets: sanitizeRulesetSelections(lobby?.selectedRulesets, lobby?.customRulesets),
    rulesetPermissions: sanitizeRulesetPermissions(
      lobby?.rulesetPermissions,
      lobby?.players || [],
      lobby?.selectedRulesets,
      lobby?.customRulesets
    ),
    nvAllowed: lobby?.nvAllowed ?? true,
    useTurnTimer: lobby?.useTurnTimer ?? true,
    turnTimerSeconds: sanitizeTurnTimerSeconds(lobby?.turnTimerSeconds),
    visibility: sanitizeRoomVisibility(lobby?.visibility),
    roomName: lobby?.roomName || ''
  };
}

function buildCardCounts(game) {
  return game.players.reduce((acc, player) => {
    acc[player.userId] = (game.handsReady[player.userId] || []).length;
    return acc;
  }, {});
}

function buildPointTotals(game) {
  return game.players.reduce((acc, player) => {
    acc[player.userId] = game.pointsByPlayer?.[player.userId] || 0;
    return acc;
  }, {});
}

function buildCollectedHands(game) {
  return game.players.reduce((acc, player) => {
    acc[player.userId] = game.collectedByPlayer[player.userId] || [];
    return acc;
  }, {});
}

function buildStandings(game, pointsByPlayer = game.pointsByPlayer) {
  return game.players
    .map((player) => ({
      userId: player.userId,
      name: player.name,
      points: pointsByPlayer?.[player.userId] || 0,
      tricksWon: (game.collectedByPlayer[player.userId] || []).length,
      cardsLeft: (game.handsReady[player.userId] || []).length
    }))
    .sort((left, right) => {
      if (right.points !== left.points) {
        return right.points - left.points;
      }

      if (right.tricksWon !== left.tricksWon) {
        return right.tricksWon - left.tricksWon;
      }

      return left.name.localeCompare(right.name);
    });
}

function bumpGameStateVersion(game) {
  game.stateVersion = (game.stateVersion || 0) + 1;
  return game.stateVersion;
}

function createLobbyMember(user, socketId, { isReady = false, role = 'player' } = {}) {
  return {
    socketId,
    ...user,
    isReady,
    role,
    isConnected: true
  };
}

function serializeLobby(lobby) {
  return {
    roomId: lobby.roomId,
    roomName: lobby.roomName,
    visibility: sanitizeRoomVisibility(lobby.visibility),
    hostId: lobby.hostId,
    players: lobby.players,
    spectators: lobby.spectators,
    rulesetId: lobby.rulesetId,
    roomSettings: serializeRoomSettings(lobby),
    status: lobby.status
  };
}

function emitLobbyUpdate(io, roomId, lobby, message) {
  io.to(roomId).emit('lobby_update', {
    ...serializeLobby(lobby),
    ...(message ? { message } : {})
  });
}

function closeWaitingLobby(io, roomId, lobby, { reason = 'The room was deleted', deletedBy = null } = {}) {
  clearLobbyDisconnects(roomId, lobby);
  io.to(roomId).emit('lobby_deleted', {
    roomId,
    reason,
    ...(deletedBy ? { deletedBy } : {})
  });
  getAllLobbyMembers(lobby).forEach((member) => {
    io.sockets.sockets.get(member.socketId)?.leave(roomId);
  });
  lobbies.delete(roomId);
  console.log(`Room deleted: ${roomId}${reason ? ` (${reason})` : ''}`);
}

function getAllLobbyMembers(lobby) {
  return [...lobby.players, ...lobby.spectators];
}

function getLobbyDisconnectKey(roomId, userId) {
  return `${roomId}:${userId}`;
}

function clearPendingLobbyDisconnect(roomId, userId) {
  const key = getLobbyDisconnectKey(roomId, userId);
  const timeoutId = pendingLobbyDisconnects.get(key);
  if (timeoutId) {
    clearTimeout(timeoutId);
    pendingLobbyDisconnects.delete(key);
  }
}

function clearLobbyDisconnects(roomId, lobby) {
  getAllLobbyMembers(lobby).forEach((member) => {
    clearPendingLobbyDisconnect(roomId, member.userId);
  });
}

function getNextHostId(lobby) {
  return lobby.players[0]?.userId || lobby.spectators[0]?.userId || null;
}

function sanitizeRoomVisibility(visibility) {
  return ROOM_VISIBILITIES.has(visibility) ? visibility : DEFAULT_ROOM_VISIBILITY;
}

function sanitizeTurnTimerSeconds(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return DEFAULT_TURN_TIMER_SECONDS;
  }

  return Math.min(TURN_TIMER_RANGE.max, Math.max(TURN_TIMER_RANGE.min, Math.round(numberValue)));
}

function getUserDisplayName(user) {
  return user?.displayName || user?.name || 'Player';
}

function normalizeGuestSocketUser(userData = {}) {
  if (!userData?.guest) {
    return null;
  }

  const userId = String(userData.userId || '').trim();
  const name = String(userData.name || userData.displayName || '').trim();

  if (!userId || !name) {
    return null;
  }

  return {
    userId,
    name,
    displayName: name,
    guest: true,
    avatarUrl: DEFAULT_PROFILE_PICTURE_PATH
  };
}

function getDefaultRoomName(user) {
  return `${getUserDisplayName(user)}'s Room`;
}

function sanitizeRoomName(roomName, user) {
  const trimmedName = String(roomName || '').trim();
  return trimmedName || getDefaultRoomName(user);
}

function sanitizeRulesetTextField(value, fallback, maxLength) {
  const trimmed = String(value || '').trim();
  const resolved = trimmed || fallback;
  return resolved.slice(0, maxLength);
}

function buildRulesetAbbreviationFallback(label) {
  const compactLabel = Array.from(String(label || '').replace(/\s+/g, ''));
  return compactLabel.slice(0, 4).join('') || 'R';
}

function buildRoomRulesetId(lobby) {
  let nextId = '';

  do {
    nextId = `room_${randomFriendCode().toLowerCase()}_${Date.now().toString(36)}`;
  } while (getRulesetDefinitionById(nextId, lobby.customRulesets));

  return nextId;
}

function createRoomRulesetDefinition(lobby, payload = {}) {
  const label = sanitizeRulesetTextField(
    payload.longName ?? payload.title ?? payload.label,
    'Untitled Ruleset',
    ROOM_RULESET_NAME_MAX_LENGTH
  );
  const abbreviation = sanitizeRulesetTextField(
    payload.shortName ?? payload.abbreviation,
    buildRulesetAbbreviationFallback(label),
    ROOM_RULESET_ABBREVIATION_MAX_LENGTH
  );
  const type = String(payload.type || 'per_round').trim();
  const code = String(payload.code || '').trim();

  if (!RULESET_TYPES.has(type)) {
    throw new Error(`Unsupported ruleset type '${type}'`);
  }

  if (!code) {
    throw new Error('Ruleset code is required');
  }

  if (code.length > ROOM_RULESET_CODE_MAX_LENGTH) {
    throw new Error(`Ruleset code must be ${ROOM_RULESET_CODE_MAX_LENGTH} characters or less`);
  }

  return {
    id: buildRoomRulesetId(lobby),
    label,
    abbreviation,
    type,
    code,
    source: 'room',
    enabledByDefault: true,
    createdBy: lobby.hostId,
    createdAt: Date.now(),
    compiled: compileRuleset(code, type)
  };
}

function findCustomRulesetIndex(lobby, rulesetId) {
  lobby.customRulesets = Array.isArray(lobby.customRulesets) ? lobby.customRulesets : [];
  return lobby.customRulesets.findIndex((definition) => definition?.id === rulesetId && definition?.source === 'room');
}

function addCustomRulesetToLobby(lobby, payload = {}) {
  lobby.customRulesets = Array.isArray(lobby.customRulesets) ? lobby.customRulesets : [];

  if (lobby.customRulesets.length >= ROOM_CUSTOM_RULESET_LIMIT) {
    return { error: `A room can have at most ${ROOM_CUSTOM_RULESET_LIMIT} custom rulesets` };
  }

  let definition;
  try {
    definition = createRoomRulesetDefinition(lobby, payload);
  } catch (error) {
    return { error: error.message };
  }

  lobby.customRulesets.push(definition);
  lobby.selectedRulesets = sanitizeRulesetSelections(
    {
      ...lobby.selectedRulesets,
      [definition.id]: true
    },
    lobby.customRulesets
  );
  const nextPermissions = { ...(lobby.rulesetPermissions || {}) };
  lobby.players.forEach((player) => {
    nextPermissions[player.userId] = {
      ...(nextPermissions[player.userId] || {}),
      [definition.id]: true
    };
  });
  lobby.rulesetPermissions = sanitizeRulesetPermissions(
    nextPermissions,
    lobby.players,
    lobby.selectedRulesets,
    lobby.customRulesets
  );

  return { definition };
}

function updateCustomRulesetInLobby(lobby, rulesetId, payload = {}) {
  const rulesetIndex = findCustomRulesetIndex(lobby, rulesetId);
  if (rulesetIndex === -1) {
    return { error: 'Room ruleset not found' };
  }

  const currentDefinition = lobby.customRulesets[rulesetIndex];
  let nextDefinition;
  try {
    nextDefinition = {
      ...createRoomRulesetDefinition(lobby, payload),
      id: currentDefinition.id,
      source: 'room',
      createdBy: currentDefinition.createdBy || lobby.hostId,
      createdAt: currentDefinition.createdAt || Date.now(),
      updatedAt: Date.now()
    };
  } catch (error) {
    return { error: error.message };
  }

  lobby.customRulesets[rulesetIndex] = nextDefinition;
  lobby.selectedRulesets = sanitizeRulesetSelections(lobby.selectedRulesets, lobby.customRulesets);
  lobby.rulesetPermissions = sanitizeRulesetPermissions(
    lobby.rulesetPermissions,
    lobby.players,
    lobby.selectedRulesets,
    lobby.customRulesets
  );

  return { definition: nextDefinition };
}

function deleteCustomRulesetFromLobby(lobby, rulesetId) {
  const rulesetIndex = findCustomRulesetIndex(lobby, rulesetId);
  if (rulesetIndex === -1) {
    return { error: 'Room ruleset not found' };
  }

  const [definition] = lobby.customRulesets.splice(rulesetIndex, 1);
  lobby.selectedRulesets = sanitizeRulesetSelections(lobby.selectedRulesets, lobby.customRulesets);
  lobby.rulesetPermissions = sanitizeRulesetPermissions(
    lobby.rulesetPermissions,
    lobby.players,
    lobby.selectedRulesets,
    lobby.customRulesets
  );

  return { definition };
}

function getAvatarSource(member) {
  return (
    member?.avatarUrl ||
    member?.avatar ||
    member?.profileImageUrl ||
    member?.profileImage ||
    member?.image ||
    DEFAULT_PROFILE_PICTURE_PATH
  );
}

function createDefaultPermissionsForPlayer(customRulesets = []) {
  return Object.keys(sanitizeRulesetSelections({}, customRulesets)).reduce((acc, ruleId) => {
    acc[ruleId] = true;
    return acc;
  }, {});
}

function sanitizeRulesetPermissions(nextPermissions = {}, players = [], selectedRulesets = DEFAULT_RULESET_SELECTIONS, customRulesets = []) {
  const sanitizedSelections = sanitizeRulesetSelections(selectedRulesets, customRulesets);

  return players.reduce((acc, player) => {
    const playerPermissions = nextPermissions?.[player.userId] || {};

    acc[player.userId] = Object.keys(sanitizedSelections).reduce((ruleAcc, ruleId) => {
      ruleAcc[ruleId] = typeof playerPermissions[ruleId] === 'boolean'
        ? playerPermissions[ruleId]
        : true;
      if (!sanitizedSelections[ruleId]) {
        ruleAcc[ruleId] = false;
      }
      return ruleAcc;
    }, {});

    return acc;
  }, {});
}

function ensureRulesetPermissionsForPlayers(lobby) {
  lobby.rulesetPermissions = sanitizeRulesetPermissions(
    lobby.rulesetPermissions,
    lobby.players,
    lobby.selectedRulesets,
    lobby.customRulesets
  );
}

function getMemberByUserId(lobby, userId) {
  return getAllLobbyMembers(lobby).find((member) => member.userId === userId) || null;
}

function getLobbyMemberRole(lobby, userId) {
  if (lobby.players.some((member) => member.userId === userId)) {
    return 'player';
  }

  if (lobby.spectators.some((member) => member.userId === userId)) {
    return 'spectator';
  }

  return null;
}

function updateLobbyMemberSocket(lobby, user, socketId) {
  const member = getMemberByUserId(lobby, user.userId);
  if (!member) {
    return null;
  }

  member.socketId = socketId;
  member.name = user.name || member.name;
  member.displayName = user.displayName || member.displayName;
  member.avatarUrl = getAvatarSource(user) || member.avatarUrl || null;
  member.guest = Boolean(user.guest);
  member.banner = user.banner || member.banner || '';
  member.description = user.description || member.description || '';
  member.favouriteRulesets = Array.isArray(user.favouriteRulesets)
    ? [...user.favouriteRulesets]
    : (member.favouriteRulesets || []);
  member.rulesetLoadout = Array.isArray(user.rulesetLoadout)
    ? [...user.rulesetLoadout]
    : (member.rulesetLoadout || []);
  member.isConnected = true;
  return member;
}

function removeWaitingLobbyMember(lobby, targetUserId) {
  lobby.rulesetPermissions = lobby.rulesetPermissions || {};

  const playerIndex = lobby.players.findIndex((player) => player.userId === targetUserId);
  const spectatorIndex = lobby.spectators.findIndex((spectator) => spectator.userId === targetUserId);
  const collection = playerIndex !== -1 ? lobby.players : lobby.spectators;
  const index = playerIndex !== -1 ? playerIndex : spectatorIndex;

  if (index === -1) {
    return null;
  }

  const previousHostId = lobby.hostId || null;
  const [member] = collection.splice(index, 1);
  delete lobby.rulesetPermissions[member.userId];

  const remainingPlayerCount = lobby.players.length;
  const remainingMemberCount = getAllLobbyMembers(lobby).length;
  const shouldDeleteRoom = remainingPlayerCount === 0;

  if (previousHostId === member.userId) {
    lobby.hostId = getNextHostId(lobby);
  }

  ensureRulesetPermissionsForPlayers(lobby);

  return {
    member,
    previousHostId,
    nextHostId: lobby.hostId || null,
    hostChanged: previousHostId === member.userId && lobby.hostId && lobby.hostId !== previousHostId,
    remainingPlayerCount,
    remainingMemberCount,
    shouldDeleteRoom
  };
}

function findCurrentRoomForUser(user) {
  if (!user?.userId) {
    return null;
  }

  for (const [roomId, lobby] of lobbies.entries()) {
    if (getAllLobbyMembers(lobby).some((member) => member.userId === user.userId)) {
      return { roomId, source: 'lobby', room: lobby };
    }
  }

  for (const [roomId, game] of activeGames.entries()) {
    if (game.players.some((player) => player.userId === user.userId)) {
      return { roomId, source: 'game', room: game };
    }
  }

  return null;
}

function buildPublicRoomSummary(roomId, lobby, viewer = null) {
  const members = getAllLobbyMembers(lobby);
  const viewerFriends = new Set(
    Array.isArray(viewer?.friends)
      ? viewer.friends.map((friend) => (typeof friend === 'object' ? friend.userId || friend._id || friend.id : friend)).filter(Boolean)
      : []
  );
  const friendsInRoom = members
    .filter((member) => viewerFriends.has(member.userId))
    .map((member) => ({
      userId: member.userId,
      name: getUserDisplayName(member),
      avatarUrl: getAvatarSource(member),
      guest: Boolean(member.guest)
    }));

  return {
    roomId,
    roomName: lobby.roomName,
    visibility: sanitizeRoomVisibility(lobby.visibility),
    playerCount: lobby.players.length,
    spectatorCount: lobby.spectators.length,
    maxPlayers: MAX_ACTIVE_PLAYERS,
    avatars: members.slice(0, MAX_ACTIVE_PLAYERS).map((member) => ({
      userId: member.userId,
      name: getUserDisplayName(member),
      avatarUrl: getAvatarSource(member),
      guest: Boolean(member.guest)
    })),
    hasFriend: friendsInRoom.length > 0,
    friendsInRoom,
    status: lobby.status,
    isInGame: lobby.status === 'playing'
  };
}

function listPublicRoomsForUser(user) {
  return [...lobbies.entries()]
    .filter(([, lobby]) => ['waiting', 'playing'].includes(lobby.status) && sanitizeRoomVisibility(lobby.visibility) === 'public')
    .filter(([, lobby]) => !lobby.bannedUserIds?.includes(user?.userId))
    .map(([roomId, lobby]) => buildPublicRoomSummary(roomId, lobby, user))
    .sort((left, right) => {
      if (left.hasFriend !== right.hasFriend) {
        return left.hasFriend ? -1 : 1;
      }

      if (left.status !== right.status) {
        return left.status === 'waiting' ? -1 : 1;
      }

      return left.roomName.localeCompare(right.roomName);
    });
}

async function emitFriendStateUpdate(io, userOrId) {
  if (!io || !userOrId) {
    return;
  }

  const resolvedUserId = String(
    typeof userOrId === 'string'
      ? userOrId
      : (userOrId._id || userOrId.userId || userOrId.id || '')
  ).trim();

  if (!resolvedUserId) {
    return;
  }

  const user = userOrId?.username
    ? userOrId
    : await User.findById(resolvedUserId);

  if (!user) {
    return;
  }

  const friendState = await buildFriendStatePayload(user);
  const accountProfile = serializeAccount(user);

  for (const [socketId, socketUser] of socketToUser.entries()) {
    if (socketUser?.guest || socketUser?.userId !== accountProfile.userId) {
      continue;
    }

    socketToUser.set(socketId, accountProfile);
    io.to(socketId).emit('friend_state_update', {
      user: accountProfile,
      friendState,
      shouldRefreshPublicRooms: true
    });
  }
}

function addMemberToLobby(lobby, user, socketId, { isReady = false } = {}) {
  const shouldSpectate = lobby.players.length >= MAX_ACTIVE_PLAYERS;
  const role = shouldSpectate ? 'spectator' : 'player';
  const member = createLobbyMember(user, socketId, {
    isReady: role === 'player' ? isReady : false,
    role
  });

  if (role === 'player') {
    lobby.players.push(member);
    lobby.rulesetPermissions[member.userId] = createDefaultPermissionsForPlayer(lobby.customRulesets);
    ensureRulesetPermissionsForPlayers(lobby);
  } else {
    lobby.spectators.push(member);
  }

  return {
    assignedRole: role,
    autoSpectator: shouldSpectate
  };
}

function setLobbyMemberRole(lobby, socketId, nextRole) {
  lobby.rulesetPermissions = lobby.rulesetPermissions || {};

  if (!['player', 'spectator'].includes(nextRole)) {
    return { error: 'Invalid lobby role' };
  }

  const playerIndex = lobby.players.findIndex((player) => player.socketId === socketId);
  const spectatorIndex = lobby.spectators.findIndex((spectator) => spectator.socketId === socketId);

  if (playerIndex === -1 && spectatorIndex === -1) {
    return { error: 'You are not in this lobby' };
  }

  if (nextRole === 'player') {
    if (playerIndex !== -1) {
      return { assignedRole: 'player', changed: false };
    }

    if (lobby.players.length >= MAX_ACTIVE_PLAYERS) {
      return { error: `All ${MAX_ACTIVE_PLAYERS} player seats are taken. You can spectate for now.` };
    }

    const [member] = lobby.spectators.splice(spectatorIndex, 1);
    lobby.players.push({
      ...member,
      isReady: false,
      role: 'player'
    });
    lobby.rulesetPermissions[member.userId] = createDefaultPermissionsForPlayer(lobby.customRulesets);
    ensureRulesetPermissionsForPlayers(lobby);

    return { assignedRole: 'player', changed: true };
  }

  if (spectatorIndex !== -1) {
    return { assignedRole: 'spectator', changed: false };
  }

  const [member] = lobby.players.splice(playerIndex, 1);
  delete lobby.rulesetPermissions[member.userId];
  lobby.spectators.push({
    ...member,
    isReady: false,
    role: 'spectator'
  });

  return { assignedRole: 'spectator', changed: true };
}

function getStartGameValidationError(lobby, user) {
  if (!lobby) {
    return 'Lobby not found';
  }

  if (!user) {
    return 'Not authenticated';
  }

  if (lobby.hostId !== user.userId) {
    return 'Only host can start the game';
  }

  if (lobby.players.length > MAX_ACTIVE_PLAYERS) {
    return `A lobby can have at most ${MAX_ACTIVE_PLAYERS} active players`;
  }

  if (lobby.players.length < MIN_PLAYERS_TO_START) {
    return `At least ${MIN_PLAYERS_TO_START} players are required to start the game`;
  }

  const allReady = lobby.players.every((player) => player.isReady);
  if (!allReady) {
    return 'Not all players are ready';
  }

  const selectedRulesets = sanitizeRulesetSelections(lobby.selectedRulesets, lobby.customRulesets);
  const hasSelectedRuleset = Object.values(selectedRulesets).some(Boolean);
  if (!hasSelectedRuleset) {
    return 'At least one ruleset must be enabled';
  }

  const permissions = sanitizeRulesetPermissions(lobby.rulesetPermissions, lobby.players, selectedRulesets, lobby.customRulesets);
  const hasAllowedChoice = lobby.players.some((player) => (
    Object.entries(permissions[player.userId] || {}).some(([ruleId, allowed]) => selectedRulesets[ruleId] && allowed)
  ));
  if (!hasAllowedChoice) {
    return 'At least one player must be allowed to choose an enabled ruleset';
  }

  return null;
}

function getEligibleRuleIdsForPlayer(game, playerId) {
  const selections = sanitizeRulesetSelections(game.selectedRulesets, game.customRulesets);
  const playerPermissions = game.rulesetPermissions?.[playerId] || {};
  const usedByPlayer = game.usedChoices?.[playerId] || {};

  return Object.keys(selections).filter((ruleId) => (
    selections[ruleId] &&
    getRulesetDefinitionById(ruleId, game.customRulesets) &&
    playerPermissions[ruleId] !== false &&
    !usedByPlayer[ruleId]
  ));
}

function hasRemainingChoices(game) {
  return game.chooserOrder.some((playerId) => getEligibleRuleIdsForPlayer(game, playerId).length > 0);
}

function findNextChooser(game, startCursor = game.chooserCursor) {
  if (!game.chooserOrder.length) {
    return null;
  }

  for (let offset = 0; offset < game.chooserOrder.length; offset += 1) {
    const cursor = (startCursor + offset) % game.chooserOrder.length;
    const playerId = game.chooserOrder[cursor];
    if (getEligibleRuleIdsForPlayer(game, playerId).length > 0) {
      return { cursor, playerId };
    }
  }

  return null;
}

function serializeChoiceState(game) {
  if (!game) {
    return null;
  }

  return {
    phase: game.phase,
    chooserId: game.chooserId || null,
    chooserOrder: game.chooserOrder || [],
    chooserCursor: game.chooserCursor || 0,
    nvAllowed: Boolean(game.nvAllowed),
    nvSelected: Boolean(game.nvSelected),
    activeRulesetId: game.activeRulesetId || null,
    usedChoices: game.usedChoices || {},
    selectedRulesets: sanitizeRulesetSelections(game.selectedRulesets, game.customRulesets),
    rulesetPermissions: game.rulesetPermissions || {},
    timerDeadline: game.timerDeadline || null,
    timerRemainingMs: game.timerDeadline ? Math.max(0, game.timerDeadline - Date.now()) : 0,
    availableRulesets: getAvailableRulesets(game.customRulesets)
  };
}

function buildGameSessionSnapshot(roomId, game, userId, { isSpectator = false } = {}) {
  const playerIndex = isSpectator
    ? -1
    : game.players.findIndex((player) => player.userId === userId);
  const effectivePlayer = playerIndex >= 0 ? game.players[playerIndex] : null;
  const gameFinished = game.status === 'finished' || game.phase === 'finished';

  return {
    roomId,
    hand: effectivePlayer ? (game.handsReady[effectivePlayer.userId] || []) : [],
    playerIndex,
    isSpectator,
    gameStarted: true,
    gameFinished,
    trickPending: Boolean(game.trickPending),
    currentTrick: game.currentTrick || [],
    turnIndex: game.turnIndex || 0,
    trickSuit: game.trickSuit || null,
    stateVersion: game.stateVersion || 0,
    cardCounts: buildCardCounts(game),
    playerPoints: buildPointTotals(game),
    collectedHandsByPlayer: buildCollectedHands(game),
    choiceState: serializeChoiceState(game),
    latestRoundStats: game.lastRoundStats || null,
    matchComplete: gameFinished || (game.phase === 'round_stats' && !hasRemainingChoices(game)),
    standings: buildStandings(game),
    startingHandSize: game.startingHandSize || 0
  };
}

function restoreUserSession(io, socket, user) {
  const currentRoom = findCurrentRoomForUser(user);
  if (!currentRoom) {
    return null;
  }

  const { roomId, room: lobby } = currentRoom;
  const role = getLobbyMemberRole(lobby, user.userId);
  const member = updateLobbyMemberSocket(lobby, user, socket.id);
  if (!member || !role) {
    return null;
  }

  clearPendingLobbyDisconnect(roomId, user.userId);
  socket.join(roomId);

  const game = activeGames.get(roomId);
  if (game) {
    const gamePlayer = game.players.find((player) => player.userId === user.userId);
    if (gamePlayer) {
      gamePlayer.socketId = socket.id;
      gamePlayer.name = getUserDisplayName(user);
      gamePlayer.isConnected = true;
    }
  }

  emitLobbyUpdate(io, roomId, lobby);

  return {
    roomId,
    assignedRole: role,
    lobby: serializeLobby(lobby),
    game: game
      ? buildGameSessionSnapshot(roomId, game, user.userId, { isSpectator: role === 'spectator' })
      : null
  };
}

function emitChoiceState(io, roomId, game, extra = {}) {
  io.to(roomId).emit('choice_state_update', {
    choiceState: serializeChoiceState(game),
    stateVersion: bumpGameStateVersion(game),
    ...extra
  });
}

function clearGameTimer(game) {
  if (game?.timerId) {
    clearTimeout(game.timerId);
    game.timerId = null;
  }
  if (game) {
    game.timerDeadline = null;
  }
}

function scheduleGameTimer(io, roomId, game, callback) {
  clearGameTimer(game);

  if (!game?.useTurnTimer) {
    return;
  }

  const timerMs = sanitizeTurnTimerSeconds(game.turnTimerSeconds) * 1000;
  game.timerDeadline = Date.now() + timerMs;
  game.timerId = setTimeout(() => {
    game.timerId = null;
    game.timerDeadline = null;
    callback();
  }, timerMs);
  game.timerId.unref?.();
}

function emitHands(io, roomId, game) {
  game.players.forEach((player) => {
    io.to(player.socketId).emit('hand_update', game.handsReady[player.userId] || []);
  });

  const lobby = lobbies.get(roomId);
  lobby?.spectators.forEach((spectator) => {
    io.to(spectator.socketId).emit('hand_update', []);
  });
}

function dealNewRoundCards(io, roomId, game) {
  const unShuffledDeck = generateDeck(game.players.length);
  const shuffledDeck = shuffle([...unShuffledDeck]);
  const playerIds = game.players.map((player) => player.userId);
  const hands = dealCards(shuffledDeck, playerIds);

  game.handsReady = hands;
  game.startingHandSize = hands[playerIds[0]]?.length || 0;
  game.currentTrick = [];
  game.trickSuit = null;
  game.trickPending = false;
  game.collectedHands = [];
  game.collectedByPlayer = playerIds.reduce((acc, playerId) => {
    acc[playerId] = [];
    return acc;
  }, {});

  emitHands(io, roomId, game);
}

function buildInitialPoints(players) {
  return players.reduce((acc, player) => {
    acc[player.userId] = 0;
    return acc;
  }, {});
}

function buildRankMap(standings) {
  return standings.reduce((acc, standing, index) => {
    acc[standing.userId] = index + 1;
    return acc;
  }, {});
}

function createRoundStats(game) {
  const ruleset = getRulesetDefinitionById(game.activeRulesetId, game.customRulesets);
  const previousPoints = { ...game.pointsByPlayer };

  game.roundStats = {
    roundId: `${game.roomId}-${game.roundNumber}`,
    roundNumber: game.roundNumber,
    startedAt: Date.now(),
    rulesetId: ruleset.id,
    rulesetLabel: ruleset.label,
    rulesetAbbreviation: ruleset.abbreviation,
    nv: Boolean(game.nvSelected),
    chooserId: game.chooserId,
    chooserName: game.players.find((player) => player.userId === game.chooserId)?.name || 'Player',
    previousPoints,
    previousRanks: buildRankMap(buildStandings(game, previousPoints)),
    tricks: []
  };
}

function finalizeRoundStats(game) {
  const stats = game.roundStats || {};
  const nextPoints = { ...game.pointsByPlayer };

  return {
    ...stats,
    durationMs: Date.now() - (stats.startedAt || Date.now()),
    scoreDeltas: game.players.reduce((acc, player) => {
      acc[player.userId] = (nextPoints[player.userId] || 0) - (stats.previousPoints?.[player.userId] || 0);
      return acc;
    }, {}),
    previousRanks: stats.previousRanks || {},
    nextRanks: buildRankMap(buildStandings(game, nextPoints)),
    nextPoints,
    tricks: stats.tricks || []
  };
}

function applyActiveRulesetToTrick({ game, playerId, handCards }) {
  const activeRuleset = !game.activeRulesetId
    ? null
    : getRulesetDefinitionById(game.activeRulesetId, game.customRulesets);

  if (!activeRuleset) {
    return { gameEnded: false, scoreDelta: 0 };
  }

  if (activeRuleset.type === 'end_game') {
    return { gameEnded: false, scoreDelta: 0, rawDelta: 0, componentDeltas: null };
  }

  const previousPoints = game.pointsByPlayer[playerId] || 0;
  const nonDiscardedCards = game.players.flatMap((player) => game.handsReady[player.userId] || []);
  const result = evaluateRulesetForTrick({
    rulesetId: game.activeRulesetId,
    playerCount: game.players.length,
    initialPoints: previousPoints,
    handCards,
    nonDiscardedCards,
    customRulesets: game.customRulesets
  });
  const multiplier = game.nvSelected ? 2 : 1;
  const scoreDelta = result.delta * multiplier;

  game.pointsByPlayer[playerId] = previousPoints + scoreDelta;
  return {
    gameEnded: Boolean(result.gameEnded),
    scoreDelta,
    rawDelta: result.delta,
    componentDeltas: result.componentDeltas || null
  };
}

function applyActiveRulesetAtRoundEnd(game) {
  const activeRuleset = !game?.activeRulesetId
    ? null
    : getRulesetDefinitionById(game.activeRulesetId, game.customRulesets);

  if (!activeRuleset || activeRuleset.type !== 'end_game') {
    return { applied: false, scoreDeltas: {} };
  }

  const scoreDeltas = {};
  const multiplier = game.nvSelected ? 2 : 1;

  for (const player of game.players) {
    const playerId = player.userId;
    const previousPoints = game.pointsByPlayer[playerId] || 0;
    const collectedCards = (game.collectedByPlayer?.[playerId] || []).flatMap((trick) =>
      trick.map((play) => play.card)
    );
    const result = evaluateRulesetForTrick({
      rulesetId: game.activeRulesetId,
      playerCount: game.players.length,
      initialPoints: previousPoints,
      handCards: collectedCards,
      nonDiscardedCards: [],
      customRulesets: game.customRulesets
    });
    const scoreDelta = result.delta * multiplier;

    game.pointsByPlayer[playerId] = previousPoints + scoreDelta;
    scoreDeltas[playerId] = scoreDelta;
  }

  return {
    applied: true,
    scoreDeltas
  };
}

function getLegalCardsForPlayer(game, playerId) {
  const hand = game.handsReady[playerId] || [];
  if (!game.trickSuit || game.currentTrick.length === 0) {
    return hand;
  }

  const matchingSuit = hand.filter((card) => card.split('-')[1] === game.trickSuit);
  return matchingSuit.length > 0 ? matchingSuit : hand;
}

function chooseFirstAvailableRule(game) {
  const eligible = getEligibleRuleIdsForPlayer(game, game.chooserId);
  return eligible[0] || null;
}

function finishBigGame(io, roomId, game) {
  clearGameTimer(game);
  game.status = 'finished';
  game.phase = 'finished';

  const standings = buildStandings(game);
  const gameFinishedVersion = bumpGameStateVersion(game);

  io.to(roomId).emit('game_finished', {
    winnerId: standings[0]?.userId || null,
    winnerName: standings[0]?.name || 'No winner',
    stateVersion: gameFinishedVersion,
    standings,
    playerPoints: buildPointTotals(game),
    collectedHandsByPlayer: buildCollectedHands(game),
    cardCounts: buildCardCounts(game),
    choiceState: serializeChoiceState(game)
  });
}

function startRulesetSelection(io, roomId, game, { dealFirst = false } = {}) {
  if (dealFirst) {
    dealNewRoundCards(io, roomId, game);
  }

  game.phase = 'choosing_ruleset';
  clearGameTimer(game);

  emitChoiceState(io, roomId, game, {
    cardCounts: buildCardCounts(game),
    playerPoints: buildPointTotals(game)
  });
}

function beginChooserTurn(io, roomId, game) {
  const nextChooser = findNextChooser(game, game.chooserCursor);
  if (!nextChooser) {
    finishBigGame(io, roomId, game);
    return false;
  }

  game.chooserCursor = nextChooser.cursor;
  game.chooserId = nextChooser.playerId;
  game.activeRulesetId = null;
  game.nvSelected = false;
  game.currentTrick = [];
  game.trickSuit = null;
  game.trickPending = false;
  game.handsReady = game.players.reduce((acc, player) => {
    acc[player.userId] = [];
    return acc;
  }, {});
  game.collectedHands = [];
  game.collectedByPlayer = game.players.reduce((acc, player) => {
    acc[player.userId] = [];
    return acc;
  }, {});

  if (game.nvAllowed) {
    game.phase = 'choosing_nv';
    clearGameTimer(game);
    emitChoiceState(io, roomId, game, {
      cardCounts: buildCardCounts(game),
      playerPoints: buildPointTotals(game)
    });
    return true;
  }

  game.nvSelected = false;
  startRulesetSelection(io, roomId, game, { dealFirst: true });
  return true;
}

function setNvChoiceForRound(io, roomId, game, playerId, nvSelected) {
  if (!game || game.phase !== 'choosing_nv') {
    return { error: 'NV choice is not active' };
  }

  if (playerId !== game.chooserId) {
    return { error: 'Only the choosing player can pick NV' };
  }

  clearGameTimer(game);
  game.nvSelected = Boolean(nvSelected);
  startRulesetSelection(io, roomId, game, { dealFirst: !game.nvSelected });
  return { success: true };
}

function selectRulesetForRound(io, roomId, game, playerId, rulesetId) {
  if (!game || game.phase !== 'choosing_ruleset') {
    return { error: 'Ruleset choice is not active' };
  }

  if (playerId !== game.chooserId) {
    return { error: 'Only the choosing player can choose the game' };
  }

  if (!getEligibleRuleIdsForPlayer(game, playerId).includes(rulesetId)) {
    return { error: 'That game is not available for this player' };
  }

  clearGameTimer(game);

  if (game.nvSelected && game.players.every((player) => (game.handsReady[player.userId] || []).length === 0)) {
    dealNewRoundCards(io, roomId, game);
  }

  game.usedChoices[playerId] = {
    ...(game.usedChoices[playerId] || {}),
    [rulesetId]: true
  };
  game.activeRulesetId = rulesetId;
  game.phase = 'playing_round';
  game.turnIndex = Math.max(0, game.players.findIndex((player) => player.userId === playerId));
  game.roundNumber += 1;
  createRoundStats(game);

  scheduleGameTimer(io, roomId, game, () => {
    const currentPlayer = game.players[game.turnIndex];
    const fallbackCard = getLegalCardsForPlayer(game, currentPlayer?.userId)[0];
    if (currentPlayer && fallbackCard) {
      playCardForPlayer(io, roomId, currentPlayer.userId, fallbackCard, { auto: true });
    }
  });

  const stateVersion = bumpGameStateVersion(game);
  io.to(roomId).emit('small_game_started', {
    message: `${game.roundStats.chooserName} has chosen ${getRulesetDefinitionById(rulesetId, game.customRulesets)?.label || 'a game'}${game.nvSelected ? ' (NV)!' : ''}`,
    choiceState: serializeChoiceState(game),
    currentTrick: game.currentTrick,
    turnIndex: game.turnIndex,
    trickSuit: game.trickSuit,
    stateVersion,
    cardCounts: buildCardCounts(game),
    playerPoints: buildPointTotals(game),
    collectedHandsByPlayer: buildCollectedHands(game),
    roundNumber: game.roundNumber
  });

  return { success: true };
}

function finishSmallGameRound(io, roomId, game) {
  clearGameTimer(game);
  game.phase = 'round_stats';
  const roundStats = finalizeRoundStats(game);
  game.lastRoundStats = roundStats;

  const matchComplete = !hasRemainingChoices(game);
  const stateVersion = bumpGameStateVersion(game);

  io.to(roomId).emit('round_finished', {
    roundStats,
    matchComplete,
    stateVersion,
    choiceState: serializeChoiceState(game),
    standings: buildStandings(game),
    playerPoints: buildPointTotals(game),
    collectedHandsByPlayer: buildCollectedHands(game),
    cardCounts: buildCardCounts(game)
  });

  if (matchComplete) {
    finishBigGame(io, roomId, game);
  }
}

function continueAfterRound(io, roomId, game) {
  if (!game || game.phase !== 'round_stats') {
    return { error: 'No round stats are waiting' };
  }

  game.chooserCursor = (game.chooserCursor + 1) % Math.max(game.chooserOrder.length, 1);
  return beginChooserTurn(io, roomId, game)
    ? { success: true }
    : { error: 'No available games remain' };
}

function removeMemberFromLobby(io, roomId, lobby, targetUserId, reason = 'Removed from room') {
  const outcome = removeWaitingLobbyMember(lobby, targetUserId);
  if (!outcome) {
    return null;
  }

  const { member } = outcome;
  clearPendingLobbyDisconnect(roomId, member.userId);
  io.to(member.socketId).emit('lobby_removed', { roomId, reason });
  io.sockets.sockets.get(member.socketId)?.leave(roomId);
  return member;
}

function abandonUserSession(io, socket, user) {
  const currentRoom = findCurrentRoomForUser(user);
  if (!currentRoom) {
    return { success: true };
  }

  const { roomId, room: lobby } = currentRoom;
  const member = getMemberByUserId(lobby, user.userId);
  clearPendingLobbyDisconnect(roomId, user.userId);
  socket.leave(roomId);

  if (!member) {
    return { success: true };
  }

  if (lobby.status !== 'waiting') {
    member.isConnected = false;
    const game = activeGames.get(roomId);
    const gamePlayer = game?.players.find((player) => player.userId === user.userId);
    if (gamePlayer) {
      gamePlayer.isConnected = false;
    }
    return { success: true };
  }

  const outcome = removeWaitingLobbyMember(lobby, user.userId);
  if (!outcome) {
    return { success: true };
  }

  if (outcome.shouldDeleteRoom) {
    closeWaitingLobby(io, roomId, lobby, {
      reason: 'The room closed because no active players remained.'
    });
    return { success: true };
  }

  const nextHost = outcome.nextHostId ? getMemberByUserId(lobby, outcome.nextHostId) : null;
  emitLobbyUpdate(
    io,
    roomId,
    lobby,
    outcome.hostChanged && nextHost
      ? `${getUserDisplayName(outcome.member)} left the room. ${getUserDisplayName(nextHost)} is now host.`
      : `${getUserDisplayName(outcome.member)} left the room.`
  );
  return { success: true };
}

function scheduleWaitingLobbyDisconnectCleanup(io, roomId, lobby, member, disconnectedSocketId) {
  clearPendingLobbyDisconnect(roomId, member.userId);
  member.isConnected = false;

  const timeoutId = setTimeout(() => {
    pendingLobbyDisconnects.delete(getLobbyDisconnectKey(roomId, member.userId));

    const currentLobby = lobbies.get(roomId);
    if (!currentLobby || currentLobby.status !== 'waiting') {
      return;
    }

    const currentMember = getMemberByUserId(currentLobby, member.userId);
    if (!currentMember || currentMember.socketId !== disconnectedSocketId || currentMember.isConnected) {
      return;
    }

    const outcome = removeWaitingLobbyMember(currentLobby, member.userId);
    if (!outcome) {
      return;
    }

    if (outcome.shouldDeleteRoom) {
      closeWaitingLobby(io, roomId, currentLobby, {
        reason: 'The room closed because no active players remained.'
      });
      return;
    }

    const nextHost = outcome.nextHostId ? getMemberByUserId(currentLobby, outcome.nextHostId) : null;
    emitLobbyUpdate(
      io,
      roomId,
      currentLobby,
      outcome.hostChanged && nextHost
        ? `${getUserDisplayName(outcome.member)} left the room. ${getUserDisplayName(nextHost)} is now host.`
        : `${getUserDisplayName(outcome.member)} left the room.`
    );
  }, DISCONNECT_GRACE_MS);

  timeoutId.unref?.();
  pendingLobbyDisconnects.set(getLobbyDisconnectKey(roomId, member.userId), timeoutId);
}

function removeWaitingLobbyMemberOnDisconnect(io, roomId, lobby, member) {
  const outcome = removeWaitingLobbyMember(lobby, member.userId);
  if (!outcome) {
    return;
  }

  if (outcome.shouldDeleteRoom) {
    closeWaitingLobby(io, roomId, lobby, {
      reason: 'The room closed because no active players remained.'
    });
    return;
  }

  const nextHost = outcome.nextHostId ? getMemberByUserId(lobby, outcome.nextHostId) : null;
  emitLobbyUpdate(
    io,
    roomId,
    lobby,
    outcome.hostChanged && nextHost
      ? `${getUserDisplayName(outcome.member)} left the room. ${getUserDisplayName(nextHost)} is now host.`
      : `${getUserDisplayName(outcome.member)} left the room.`
  );
}

function playCardForPlayer(io, roomId, playerId, card, { auto = false } = {}) {
  const game = activeGames.get(roomId);
  if (!game) {
    return { error: 'Game not found' };
  }

  if (game.phase !== 'playing_round') {
    return { error: 'Cards cannot be played right now' };
  }

  if (game.trickPending) {
    return { error: 'A trick is resolving' };
  }

  const pIndex = game.players.findIndex((player) => player.userId === playerId);
  if (pIndex === -1) {
    return { error: 'Spectators cannot play cards' };
  }

  if (pIndex !== game.turnIndex) {
    return { error: 'It is not your turn!' };
  }

  const hand = game.handsReady[playerId];
  if (!hand || !hand.includes(card)) {
    return { error: 'That card is not in your hand' };
  }

  if (game.currentTrick.length === 0) {
    const [, suit] = card.split('-');
    game.trickSuit = suit;
  } else {
    const [, playSuit] = card.split('-');
    if (playSuit !== game.trickSuit) {
      const hasSuit = hand.some((handCard) => handCard.split('-')[1] === game.trickSuit);
      if (hasSuit) {
        return { error: `You must play a card of suit ${SUIT_NAMES[game.trickSuit] || game.trickSuit}` };
      }
    }
  }

  clearGameTimer(game);

  const player = game.players[pIndex];
  game.handsReady[playerId] = hand.filter((entry) => entry !== card);
  game.currentTrick.push({
    playedBy: player.userId,
    playerName: player.name,
    card,
    auto
  });

  game.turnIndex = (game.turnIndex + 1) % game.players.length;
  const trickComplete = game.currentTrick.length === game.players.length;
  if (!trickComplete) {
    scheduleGameTimer(io, roomId, game, () => {
      const currentPlayer = game.players[game.turnIndex];
      const fallbackCard = getLegalCardsForPlayer(game, currentPlayer?.userId)[0];
      if (currentPlayer && fallbackCard) {
        playCardForPlayer(io, roomId, currentPlayer.userId, fallbackCard, { auto: true });
      }
    });
  }

  const gameUpdateVersion = bumpGameStateVersion(game);

  io.to(roomId).emit('game_update', {
    currentTrick: game.currentTrick,
    turnIndex: game.turnIndex,
    trickSuit: game.trickSuit,
    stateVersion: gameUpdateVersion,
    cardCounts: buildCardCounts(game),
    choiceState: serializeChoiceState(game),
    timerDeadline: game.timerDeadline
  });

  io.to(player.socketId).emit('hand_update', game.handsReady[playerId]);

  if (!trickComplete) {
    return { success: true };
  }

  game.trickPending = true;
  const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

  let winnerIndex = 0;
  let highestRank = -1;

  game.currentTrick.forEach((play, index) => {
    const [val, suit] = play.card.split('-');
    if (suit === game.trickSuit) {
      const rank = VALUES.indexOf(val);
      if (rank > highestRank) {
        highestRank = rank;
        winnerIndex = index;
      }
    }
  });

  const winningPlay = game.currentTrick[winnerIndex];
  game.collectedHands.push(game.currentTrick);
  game.collectedByPlayer[winningPlay.playedBy].push([...game.currentTrick]);
  const collectedHandCards = game.currentTrick.map((play) => play.card);
  const ruleResolution = applyActiveRulesetToTrick({
    game,
    playerId: winningPlay.playedBy,
    handCards: collectedHandCards
  });

  game.roundStats?.tricks.push({
    index: game.collectedHands.length,
    cards: [...game.currentTrick],
    takenBy: winningPlay.playedBy,
    takenByName: winningPlay.playerName,
    scoreDelta: ruleResolution.scoreDelta,
    rawDelta: ruleResolution.rawDelta,
    componentDeltas: ruleResolution.componentDeltas
  });

  game.turnIndex = game.players.findIndex((entry) => entry.userId === winningPlay.playedBy);
  const trickWonVersion = bumpGameStateVersion(game);

  io.to(roomId).emit('trick_won', {
    winnerName: winningPlay.playerName,
    winnerId: winningPlay.playedBy,
    trickSuit: game.trickSuit,
    scoreDelta: ruleResolution.scoreDelta,
    stateVersion: trickWonVersion,
    playerPoints: buildPointTotals(game),
    collectedHandsByPlayer: buildCollectedHands(game),
    cardCounts: buildCardCounts(game),
    choiceState: serializeChoiceState(game)
  });

  setTimeout(() => {
    game.currentTrick = [];
    game.trickSuit = null;
    game.trickPending = false;
    const allHandsEmpty = game.players.every(
      (entry) => (game.handsReady[entry.userId] || []).length === 0
    );
    if (allHandsEmpty) {
      applyActiveRulesetAtRoundEnd(game);
    }
    const gameShouldFinish = allHandsEmpty || ruleResolution.gameEnded;

    if (!gameShouldFinish) {
      scheduleGameTimer(io, roomId, game, () => {
        const currentPlayer = game.players[game.turnIndex];
        const fallbackCard = getLegalCardsForPlayer(game, currentPlayer?.userId)[0];
        if (currentPlayer && fallbackCard) {
          playCardForPlayer(io, roomId, currentPlayer.userId, fallbackCard, { auto: true });
        }
      });
    }

    const trickEndVersion = bumpGameStateVersion(game);

    io.to(roomId).emit('trick_end', {
      nextTurnIndex: game.turnIndex,
      collectedHandsCount: game.collectedHands.length,
      trickSuit: null,
      stateVersion: trickEndVersion,
      playerPoints: buildPointTotals(game),
      collectedHandsByPlayer: buildCollectedHands(game),
      cardCounts: buildCardCounts(game),
      gameFinished: gameShouldFinish,
      choiceState: serializeChoiceState(game)
    });

    if (gameShouldFinish) {
      finishSmallGameRound(io, roomId, game);
      return;
    }
  }, 1500);

  return { success: true };
}

function attachSocketManager(io) {
  io.on('connection', async (socket) => {
    console.log('User connected:', socket.id);

    try {
      const authenticatedAccount = await getAuthenticatedUserFromCookieHeader(socket.handshake.headers.cookie || '');
      if (authenticatedAccount) {
        const accountProfile = serializeAccount(authenticatedAccount);
        socketToUser.set(socket.id, accountProfile);
        console.log(`Socket ${socket.id} authenticated via account session as ${accountProfile.username}`);
      }
    } catch (error) {
      console.warn(`Socket ${socket.id} session lookup failed: ${error.message}`);
    }

    socket.on('authenticate', (userData, callback = () => {}) => {
      const currentUser = socketToUser.get(socket.id);
      if (currentUser && !currentUser.guest) {
        callback({ success: true, user: currentUser, source: 'account' });
        return;
      }

      const guestUser = normalizeGuestSocketUser(userData);
      if (!guestUser) {
        callback({ success: false, error: 'Invalid guest profile' });
        return;
      }

      socketToUser.set(socket.id, guestUser);
      console.log(`Socket ${socket.id} authenticated as guest ${guestUser.name}`);
      callback({ success: true, user: guestUser, source: 'guest' });
    });

    socket.on('restore_session', (_payload = {}, callback = () => {}) => {
      const user = socketToUser.get(socket.id);
      if (!user) {
        return callback({ success: false, error: 'Not authenticated' });
      }

      const restoredSession = restoreUserSession(io, socket, user);
      if (!restoredSession) {
        return callback({ success: true, restoredRoom: false });
      }

      callback({ success: true, restoredRoom: true, ...restoredSession });
    });

    socket.on('abandon_session', (_payload = {}, callback = () => {}) => {
      const user = socketToUser.get(socket.id);
      if (!user) {
        return callback({ success: true });
      }

      callback(abandonUserSession(io, socket, user));
    });

    // 1. Create a Lobby
    socket.on('create_lobby', async ({ rulesetId, roomName, visibility } = {}, callback = () => {}) => {
      const user = socketToUser.get(socket.id);
      if (!user) return callback({ error: 'Not authenticated' });

      const currentRoom = findCurrentRoomForUser(user);
      if (currentRoom) {
        return callback({ error: 'Leave your current room before creating another one' });
      }

      // Generate a short 6-letter room code
      const roomId = randomFriendCode();
      const selectedRulesets = { ...DEFAULT_RULESET_SELECTIONS };
      const hostMember = createLobbyMember(user, socket.id, { isReady: true, role: 'player' });
      const lobby = {
        roomId,
        roomName: sanitizeRoomName(roomName, user),
        visibility: sanitizeRoomVisibility(visibility),
        hostId: user.userId,
        players: [hostMember],
        spectators: [],
        rulesetId: rulesetId || null,
        customRulesets: [],
        selectedRulesets,
        rulesetPermissions: {
          [user.userId]: createDefaultPermissionsForPlayer()
        },
        nvAllowed: true,
        useTurnTimer: true,
        turnTimerSeconds: DEFAULT_TURN_TIMER_SECONDS,
        bannedUserIds: [],
        status: 'waiting'
      };
      ensureRulesetPermissionsForPlayers(lobby);
      socket.join(roomId);

      lobbies.set(roomId, lobby);

      console.log(`Room ${roomId} created by ${user.displayName || user.name}`);
      callback({ success: true, roomId, lobby: serializeLobby(lobbies.get(roomId)), assignedRole: 'player' });
    });

    socket.on('list_public_rooms', (_payload = {}, callback = () => {}) => {
      const user = socketToUser.get(socket.id);
      if (!user) return callback({ error: 'Not authenticated' });

      callback({
        success: true,
        rooms: listPublicRoomsForUser(user),
        currentRoomId: findCurrentRoomForUser(user)?.roomId || null
      });
    });

    // 2. Join a Lobby
    socket.on('join_lobby', ({ roomId, asSpectator = false } = {}, callback = () => {}) => {
      const user = socketToUser.get(socket.id);
      if (!user) return callback({ error: 'Not authenticated' });

      const normalizedRoomId = String(roomId || '').trim().toUpperCase();
      const currentRoom = findCurrentRoomForUser(user);
      if (currentRoom && currentRoom.roomId !== normalizedRoomId) {
        return callback({ error: 'Leave your current room before joining another one' });
      }

      const lobby = lobbies.get(normalizedRoomId);
      if (!lobby) return callback({ error: 'Lobby not found' });
      if (lobby.bannedUserIds?.includes(user.userId)) return callback({ error: 'You are banned from this room' });

      const existingPlayer = lobby.players.find((player) => player.socketId === socket.id || player.userId === user.userId);
      const existingSpectator = lobby.spectators.find((spectator) => spectator.socketId === socket.id || spectator.userId === user.userId);
      const game = activeGames.get(normalizedRoomId);

      if (!existingPlayer && !existingSpectator && lobby.status === 'playing' && !asSpectator) {
        return callback({
          error: 'Game already in progress',
          canSpectate: true,
          roomId: normalizedRoomId,
          roomName: lobby.roomName
        });
      }

      if (!['waiting', 'playing'].includes(lobby.status)) {
        return callback({ error: 'This room is not available right now' });
      }

      let assignment = {
        assignedRole: existingPlayer ? 'player' : 'spectator',
        autoSpectator: false
      };

      if (existingPlayer || existingSpectator) {
        clearPendingLobbyDisconnect(normalizedRoomId, user.userId);
        updateLobbyMemberSocket(lobby, user, socket.id);
        socket.join(normalizedRoomId);
        emitLobbyUpdate(io, normalizedRoomId, lobby);
      } else if (lobby.status === 'playing') {
        socket.join(normalizedRoomId);
        lobby.spectators.push(createLobbyMember(user, socket.id, {
          isReady: false,
          role: 'spectator'
        }));
        assignment = {
          assignedRole: 'spectator',
          autoSpectator: true
        };
        emitLobbyUpdate(io, normalizedRoomId, lobby);
      } else {
        socket.join(normalizedRoomId);
        assignment = addMemberToLobby(lobby, user, socket.id);
        emitLobbyUpdate(io, normalizedRoomId, lobby);
      }

      callback({
        success: true,
        roomId: normalizedRoomId,
        lobby: serializeLobby(lobby),
        game: game
          ? buildGameSessionSnapshot(normalizedRoomId, game, user.userId, { isSpectator: assignment.assignedRole === 'spectator' })
          : null,
        ...assignment
      });
    });

    socket.on('send_reaction', ({ roomId, emojiId } = {}, callback = () => {}) => {
      const user = socketToUser.get(socket.id);
      if (!user) {
        return callback({ error: 'Not authenticated' });
      }

      const normalizedRoomId = String(roomId || '').trim().toUpperCase();
      const currentRoom = findCurrentRoomForUser(user);
      if (!normalizedRoomId || !currentRoom || currentRoom.roomId !== normalizedRoomId) {
        return callback({ error: 'You are not in that room' });
      }

      if (!EMOJI_REACTION_IDS.has(String(emojiId || '').trim())) {
        return callback({ error: 'Unknown reaction' });
      }

      io.to(normalizedRoomId).emit('player_reaction', {
        roomId: normalizedRoomId,
        userId: user.userId,
        emojiId: String(emojiId).trim(),
        createdAt: Date.now(),
        player: {
          userId: user.userId,
          name: getUserDisplayName(user),
          avatarUrl: getAvatarSource(user)
        }
      });

      callback({ success: true });
    });

    // 3. Toggle Ready Status
    socket.on('toggle_ready', ({ roomId }, callback = () => {}) => {
      const lobby = lobbies.get(roomId);
      if (!lobby) return callback({ error: 'Lobby not found' });

      const player = lobby.players.find((entry) => entry.socketId === socket.id);
      if (!player) {
        return callback({ error: 'Spectators cannot ready up' });
      }

      player.isReady = !player.isReady;
      emitLobbyUpdate(io, roomId, lobby);
      callback({ success: true, lobby: serializeLobby(lobby), isReady: player.isReady });
    });

    socket.on('set_lobby_role', ({ roomId, role }, callback = () => {}) => {
      const lobby = lobbies.get(roomId);
      if (!lobby) return callback({ error: 'Lobby not found' });
      if (lobby.status !== 'waiting') return callback({ error: 'Game already in progress' });

      const user = socketToUser.get(socket.id);
      if (!user) return callback({ error: 'Not authenticated' });

      const roleUpdate = setLobbyMemberRole(lobby, socket.id, role);
      if (roleUpdate.error) {
        return callback({ error: roleUpdate.error });
      }

      if (lobby.hostId === user.userId && role === 'spectator') {
        lobby.hostId = getNextHostId(lobby);
      }

      if (roleUpdate.changed) {
        emitLobbyUpdate(io, roomId, lobby);
      }

      callback({
        success: true,
        assignedRole: roleUpdate.assignedRole,
        lobby: serializeLobby(lobby)
      });
    });

    socket.on('leave_lobby', ({ roomId }, callback = () => {}) => {
      const lobby = lobbies.get(roomId);
      const user = socketToUser.get(socket.id);

      if (!lobby) return callback({ error: 'Lobby not found' });
      if (!user) return callback({ error: 'Not authenticated' });
      if (lobby.status !== 'waiting') return callback({ error: 'You can only leave before the match starts' });

      const outcome = removeWaitingLobbyMember(lobby, user.userId);
      if (!outcome) return callback({ error: 'You are not in this lobby' });

      clearPendingLobbyDisconnect(roomId, user.userId);
      socket.leave(roomId);

      if (outcome.shouldDeleteRoom) {
        closeWaitingLobby(io, roomId, lobby, {
          reason: 'The room closed because no active players remained.'
        });
        return callback({
          success: true,
          roomDeleted: true,
          message: 'You left the room. It closed because no active players remained.'
        });
      }

      const nextHost = outcome.nextHostId ? getMemberByUserId(lobby, outcome.nextHostId) : null;
      emitLobbyUpdate(
        io,
        roomId,
        lobby,
        outcome.hostChanged && nextHost
          ? `${getUserDisplayName(outcome.member)} left the room. ${getUserDisplayName(nextHost)} is now host.`
          : `${getUserDisplayName(outcome.member)} left the room.`
      );

      callback({
        success: true,
        roomDeleted: false,
        nextHostId: outcome.nextHostId,
        message: outcome.hostChanged && nextHost
          ? `You left the room. ${getUserDisplayName(nextHost)} is now host.`
          : 'You left the room.'
      });
    });

    socket.on('update_room_settings', ({
      roomId,
      roomName,
      visibility,
      nvAllowed,
      useTurnTimer,
      turnTimerSeconds,
      selectedRulesets,
      rulesetPermissions
    }, callback = () => {}) => {
      const lobby = lobbies.get(roomId);
      const user = socketToUser.get(socket.id);

      if (!lobby) return callback({ error: 'Lobby not found' });
      if (!user) return callback({ error: 'Not authenticated' });
      if (lobby.status !== 'waiting') return callback({ error: 'Room settings can only be changed before the match starts' });
      if (lobby.hostId !== user.userId) return callback({ error: 'Only the host can change room settings' });

      lobby.roomName = sanitizeRoomName(roomName ?? lobby.roomName, user);
      lobby.visibility = sanitizeRoomVisibility(visibility ?? lobby.visibility);
      lobby.nvAllowed = typeof nvAllowed === 'boolean' ? nvAllowed : Boolean(lobby.nvAllowed);
      lobby.useTurnTimer = typeof useTurnTimer === 'boolean' ? useTurnTimer : (lobby.useTurnTimer ?? true);
      lobby.turnTimerSeconds = sanitizeTurnTimerSeconds(turnTimerSeconds ?? lobby.turnTimerSeconds);
      lobby.selectedRulesets = sanitizeRulesetSelections(selectedRulesets, lobby.customRulesets);
      lobby.rulesetPermissions = sanitizeRulesetPermissions(rulesetPermissions, lobby.players, lobby.selectedRulesets, lobby.customRulesets);
      emitLobbyUpdate(io, roomId, lobby);
      callback({ success: true, lobby: serializeLobby(lobby) });
    });

    socket.on('add_room_ruleset', ({ roomId, ruleset } = {}, callback = () => {}) => {
      const lobby = lobbies.get(roomId);
      const user = socketToUser.get(socket.id);

      if (!lobby) return callback({ error: 'Lobby not found' });
      if (!user) return callback({ error: 'Not authenticated' });
      if (!user.guest) return callback({ error: 'Only guest hosts can add room rulesets' });
      if (lobby.status !== 'waiting') return callback({ error: 'Room rulesets can only be added before the match starts' });
      if (lobby.hostId !== user.userId) return callback({ error: 'Only the host can add room rulesets' });

      const result = addCustomRulesetToLobby(lobby, ruleset);
      if (result.error) {
        return callback({ error: result.error });
      }

      emitLobbyUpdate(io, roomId, lobby, `${result.definition.label} added to the room`);
      callback({ success: true, ruleset: result.definition, lobby: serializeLobby(lobby) });
    });

    socket.on('update_room_ruleset', ({ roomId, rulesetId, ruleset } = {}, callback = () => {}) => {
      const lobby = lobbies.get(roomId);
      const user = socketToUser.get(socket.id);

      if (!lobby) return callback({ error: 'Lobby not found' });
      if (!user) return callback({ error: 'Not authenticated' });
      if (!user.guest) return callback({ error: 'Only guest hosts can edit room rulesets' });
      if (lobby.status !== 'waiting') return callback({ error: 'Room rulesets can only be edited before the match starts' });
      if (lobby.hostId !== user.userId) return callback({ error: 'Only the host can edit room rulesets' });

      const result = updateCustomRulesetInLobby(lobby, rulesetId, ruleset);
      if (result.error) {
        return callback({ error: result.error });
      }

      emitLobbyUpdate(io, roomId, lobby, `${result.definition.label} updated in the room`);
      callback({ success: true, ruleset: result.definition, lobby: serializeLobby(lobby) });
    });

    socket.on('delete_room_ruleset', ({ roomId, rulesetId } = {}, callback = () => {}) => {
      const lobby = lobbies.get(roomId);
      const user = socketToUser.get(socket.id);

      if (!lobby) return callback({ error: 'Lobby not found' });
      if (!user) return callback({ error: 'Not authenticated' });
      if (!user.guest) return callback({ error: 'Only guest hosts can delete room rulesets' });
      if (lobby.status !== 'waiting') return callback({ error: 'Room rulesets can only be deleted before the match starts' });
      if (lobby.hostId !== user.userId) return callback({ error: 'Only the host can delete room rulesets' });

      const result = deleteCustomRulesetFromLobby(lobby, rulesetId);
      if (result.error) {
        return callback({ error: result.error });
      }

      emitLobbyUpdate(io, roomId, lobby, `${result.definition.label} removed from the room`);
      callback({ success: true, deletedRulesetId: result.definition.id, lobby: serializeLobby(lobby) });
    });

    socket.on('transfer_host', ({ roomId, targetUserId }, callback = () => {}) => {
      const lobby = lobbies.get(roomId);
      const user = socketToUser.get(socket.id);

      if (!lobby) return callback({ error: 'Lobby not found' });
      if (!user) return callback({ error: 'Not authenticated' });
      if (lobby.status !== 'waiting') return callback({ error: 'Host transfer is only available before the match starts' });
      if (lobby.hostId !== user.userId) return callback({ error: 'Only the host can transfer host' });
      if (!getMemberByUserId(lobby, targetUserId)) return callback({ error: 'Target player not found' });

      lobby.hostId = targetUserId;
      emitLobbyUpdate(io, roomId, lobby, 'Host transferred');
      callback({ success: true, lobby: serializeLobby(lobby) });
    });

    socket.on('kick_member', ({ roomId, targetUserId }, callback = () => {}) => {
      const lobby = lobbies.get(roomId);
      const user = socketToUser.get(socket.id);

      if (!lobby) return callback({ error: 'Lobby not found' });
      if (!user) return callback({ error: 'Not authenticated' });
      if (lobby.status !== 'waiting') return callback({ error: 'Players can only be kicked before the match starts' });
      if (lobby.hostId !== user.userId) return callback({ error: 'Only the host can kick players' });
      if (targetUserId === lobby.hostId) return callback({ error: 'Transfer host before removing yourself' });

      const removed = removeMemberFromLobby(io, roomId, lobby, targetUserId, 'You were kicked from the room');
      if (!removed) return callback({ error: 'Target player not found' });

      emitLobbyUpdate(io, roomId, lobby, `${getUserDisplayName(removed)} was kicked`);
      callback({ success: true, lobby: serializeLobby(lobby) });
    });

    socket.on('ban_member', ({ roomId, targetUserId }, callback = () => {}) => {
      const lobby = lobbies.get(roomId);
      const user = socketToUser.get(socket.id);

      if (!lobby) return callback({ error: 'Lobby not found' });
      if (!user) return callback({ error: 'Not authenticated' });
      if (lobby.status !== 'waiting') return callback({ error: 'Players can only be banned before the match starts' });
      if (lobby.hostId !== user.userId) return callback({ error: 'Only the host can ban players' });
      if (targetUserId === lobby.hostId) return callback({ error: 'Transfer host before banning yourself' });

      if (!lobby.bannedUserIds.includes(targetUserId)) {
        lobby.bannedUserIds.push(targetUserId);
      }

      const removed = removeMemberFromLobby(io, roomId, lobby, targetUserId, 'You were banned from the room');
      if (!removed) return callback({ error: 'Target player not found' });

      emitLobbyUpdate(io, roomId, lobby, `${getUserDisplayName(removed)} was banned`);
      callback({ success: true, lobby: serializeLobby(lobby) });
    });

    socket.on('delete_lobby', ({ roomId }, callback = () => {}) => {
      const lobby = lobbies.get(roomId);
      const user = socketToUser.get(socket.id);

      if (!lobby) return callback({ error: 'Lobby not found' });
      if (!user) return callback({ error: 'Not authenticated' });
      if (lobby.status !== 'waiting') return callback({ error: 'Rooms can only be deleted before the match starts' });
      if (lobby.hostId !== user.userId) return callback({ error: 'Only the host can delete the room' });

      closeWaitingLobby(io, roomId, lobby, {
        reason: 'The host deleted the room',
        deletedBy: user.userId
      });
      callback({ success: true });
    });

    // 4. Start Game
    socket.on('start_game', async ({ roomId }, callback) => {
      const lobby = lobbies.get(roomId);
      const user = socketToUser.get(socket.id);
      const validationError = getStartGameValidationError(lobby, user);
      if (validationError) {
        return callback({ error: validationError });
      }

      lobby.status = 'playing';
      ensureRulesetPermissionsForPlayers(lobby);

      const playerIds = lobby.players.map((player) => player.userId);
      const chooserOrder = shuffle([...playerIds]);

      const gameState = {
        roomId,
        roomName: lobby.roomName,
        hostId: lobby.hostId,
        rulesetId: lobby.rulesetId,
        customRulesets: (lobby.customRulesets || []).map((definition) => ({ ...definition })),
        selectedRulesets: sanitizeRulesetSelections(lobby.selectedRulesets, lobby.customRulesets),
        rulesetPermissions: sanitizeRulesetPermissions(lobby.rulesetPermissions, lobby.players, lobby.selectedRulesets, lobby.customRulesets),
        nvAllowed: Boolean(lobby.nvAllowed),
        useTurnTimer: lobby.useTurnTimer !== false,
        turnTimerSeconds: sanitizeTurnTimerSeconds(lobby.turnTimerSeconds),
        players: lobby.players.map((player) => ({
          userId: player.userId,
          socketId: player.socketId,
          name: player.displayName || player.name,
          avatarUrl: getAvatarSource(player),
          isConnected: player.isConnected !== false
        })),
        status: 'playing',
        phase: 'initializing',
        chooserOrder,
        chooserCursor: 0,
        chooserId: null,
        usedChoices: playerIds.reduce((acc, playerId) => {
          acc[playerId] = {};
          return acc;
        }, {}),
        activeRulesetId: null,
        nvSelected: false,
        roundNumber: 0,
        handsReady: playerIds.reduce((acc, playerId) => {
          acc[playerId] = [];
          return acc;
        }, {}),
        stateVersion: 0,
        turnIndex: 0,
        trickPending: false,
        currentTrick: [], // cards played this round
        trickSuit: null,
        collectedHands: [], // History of hands collected
        pointsByPlayer: buildInitialPoints(lobby.players),
        collectedByPlayer: playerIds.reduce((acc, playerId) => {
          acc[playerId] = [];
          return acc;
        }, {}),
        roundStats: null,
        lastRoundStats: null,
        timerId: null,
        timerDeadline: null
      };

      activeGames.set(roomId, gameState);

      // Save game to DB initial state
      try {
        /*
        await Game.create({
          roomId,
          hostId: lobby.hostId,
          rulesetId: lobby.rulesetId,
          players: playerIds,
          state: {
            status: 'playing',
            hands: [],
            cards: hands,
            points: {},
            snapshot: {
              PLAYER_COUNT: lobby.players.length,
              INITIAL_POINTS: 0
            }
          }
        });
        */
        
        const gameStartedVersion = bumpGameStateVersion(gameState);

        // Notify players individually with their own cards (hide others)
        lobby.players.forEach((p, index) => {
          io.to(p.socketId).emit('game_started', {
            message: 'The game has begun!',
            hand: gameState.handsReady[p.userId] || [],
            playerIndex: index,
            isSpectator: false,
            turnIndex: 0,
            trickSuit: null,
            stateVersion: gameStartedVersion,
            cardCounts: buildCardCounts(gameState),
            playerPoints: buildPointTotals(gameState),
            collectedHandsByPlayer: buildCollectedHands(gameState),
            choiceState: serializeChoiceState(gameState),
            availableRulesets: getAvailableRulesets(gameState.customRulesets)
          });
        });

        lobby.spectators.forEach((spectator) => {
          io.to(spectator.socketId).emit('game_started', {
            message: 'The game has begun!',
            hand: [],
            playerIndex: -1,
            isSpectator: true,
            turnIndex: 0,
            trickSuit: null,
            stateVersion: gameStartedVersion,
            cardCounts: buildCardCounts(gameState),
            playerPoints: buildPointTotals(gameState),
            collectedHandsByPlayer: buildCollectedHands(gameState),
            choiceState: serializeChoiceState(gameState),
            availableRulesets: getAvailableRulesets(gameState.customRulesets)
          });
        });

        beginChooserTurn(io, roomId, gameState);
        
        callback({ success: true });
      } catch (err) {
        console.error('Failed to create game in DB:', err);
        callback({ error: 'Failed to start game due to DB error' });
      }
    });

    socket.on('set_nv_choice', ({ roomId, nvSelected }, callback = () => {}) => {
      const game = activeGames.get(roomId);
      const user = socketToUser.get(socket.id);
      if (!game) return callback({ error: 'Game not found' });
      if (!user) return callback({ error: 'Not authenticated' });

      const result = setNvChoiceForRound(io, roomId, game, user.userId, Boolean(nvSelected));
      if (result.error) {
        socket.emit('game_error', result.error);
      }
      callback(result);
    });

    socket.on('choose_ruleset', ({ roomId, rulesetId }, callback = () => {}) => {
      const game = activeGames.get(roomId);
      const user = socketToUser.get(socket.id);
      if (!game) return callback({ error: 'Game not found' });
      if (!user) return callback({ error: 'Not authenticated' });

      const result = selectRulesetForRound(io, roomId, game, user.userId, rulesetId);
      if (result.error) {
        socket.emit('game_error', result.error);
      }
      callback(result);
    });

    socket.on('continue_match', ({ roomId }, callback = () => {}) => {
      const game = activeGames.get(roomId);
      const user = socketToUser.get(socket.id);
      if (!game) return callback({ error: 'Game not found' });
      if (!user) return callback({ error: 'Not authenticated' });
      if (game.hostId !== user.userId) return callback({ error: 'Only the host can continue the match' });

      const result = continueAfterRound(io, roomId, game);
      if (result.error) {
        socket.emit('game_error', result.error);
      }
      callback(result);
    });

    // 5. Play Card
    socket.on('play_card', ({ roomId, card }) => {
      const user = socketToUser.get(socket.id);
      if (!user) return;

      const result = playCardForPlayer(io, roomId, user.userId, card);
      if (result.error) {
        socket.emit('game_error', result.error);
      }
    });

    // Disconnect Handle
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      const user = socketToUser.get(socket.id);
      if (user) {
        for (const [roomId, lobby] of lobbies.entries()) {
          const member = getAllLobbyMembers(lobby).find((entry) => entry.socketId === socket.id);
          if (!member) {
            continue;
          }

          member.isConnected = false;

          const game = activeGames.get(roomId);
          const gamePlayer = game?.players.find((player) => player.userId === member.userId);
          if (gamePlayer) {
            gamePlayer.isConnected = false;
          }

          if (lobby.status === 'waiting') {
            if (user.guest) {
              removeWaitingLobbyMemberOnDisconnect(io, roomId, lobby, member);
            } else {
              scheduleWaitingLobbyDisconnectCleanup(io, roomId, lobby, member, socket.id);
              ensureRulesetPermissionsForPlayers(lobby);
              emitLobbyUpdate(io, roomId, lobby);
            }
          }
        }
      }
      socketToUser.delete(socket.id);
    });
  });
}

module.exports = attachSocketManager;
module.exports.getStartGameValidationError = getStartGameValidationError;
module.exports.setLobbyMemberRole = setLobbyMemberRole;
module.exports.bumpGameStateVersion = bumpGameStateVersion;
module.exports.buildPublicRoomSummary = buildPublicRoomSummary;
module.exports.findNextChooser = findNextChooser;
module.exports.getEligibleRuleIdsForPlayer = getEligibleRuleIdsForPlayer;
module.exports.applyActiveRulesetAtRoundEnd = applyActiveRulesetAtRoundEnd;
module.exports.emitFriendStateUpdate = emitFriendStateUpdate;
module.exports.removeWaitingLobbyMember = removeWaitingLobbyMember;
module.exports.sanitizeRulesetPermissions = sanitizeRulesetPermissions;
module.exports.sanitizeTurnTimerSeconds = sanitizeTurnTimerSeconds;
module.exports.updateCustomRulesetInLobby = updateCustomRulesetInLobby;
module.exports.deleteCustomRulesetFromLobby = deleteCustomRulesetFromLobby;

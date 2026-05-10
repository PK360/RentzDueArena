const Game = require('./models/Game');
const Ruleset = require('./models/Ruleset');
const User = require('./models/User');
const { randomFriendCode } = require('./utils/helpers');
const { DEFAULT_PROFILE_PICTURE_PATH } = require('./src/lib/accountAssets');
const { buildFriendStatePayload } = require('./src/lib/friends');
const {
  MatchHistory,
  SavedGame,
  createMatchHistoryOnce,
  createSavedGameDocument,
  serializeSavedGameForLibrary
} = require('./src/lib/gamePersistence');
const {
  ABANDONMENT_TIMEOUT_MS,
  BOT_ACTION_DELAY_MS,
  BOT_TYPE_STANDARD,
  BOT_TYPE_TRAINER,
  DEFAULT_AUTO_BOT_REPLACEMENT_ENABLED,
  buildBotIdentity,
  chooseBotMove,
  evaluateTrainerPlayerMove,
  generateTrainerFinalReview,
  generateTrainerPreMoveComment,
  getAverageHumanElo,
  isBotPlayer,
  isTrainerBot
} = require('./src/lib/bots');
const {
  DEFAULT_ACCOUNT_ELO,
  buildCompetitiveSummaryForUser,
  calculateMultiplayerEloChanges,
  normalizeEloValue
} = require('./src/lib/elo');
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
const pendingGameAbandonments = new Map(); // roomId:userId -> timeout
let nextJoinOrder = 1;
const MIN_PLAYERS_TO_START = 2;
const MAX_ACTIVE_PLAYERS = 6;
const DEFAULT_ROOM_VISIBILITY = 'public';
const ROOM_VISIBILITIES = new Set(['public', 'private']);
const DEFAULT_TURN_TIMER_SECONDS = 45;
const TURN_TIMER_RANGE = { min: 15, max: 300 };
const DISCONNECT_GRACE_MS = ABANDONMENT_TIMEOUT_MS;
const ROOM_CUSTOM_RULESET_LIMIT = 20;
const ROOM_RULESET_NAME_MAX_LENGTH = 80;
const ROOM_RULESET_ABBREVIATION_MAX_LENGTH = 12;
const ROOM_RULESET_CODE_MAX_LENGTH = 20000;
const CHAT_MESSAGE_MAX_LENGTH = 400;
const CHAT_HISTORY_LIMIT = 120;
const RULESET_TYPES = new Set(['per_round', 'end_game']);
const EMOJI_REACTION_IDS = new Set(['grin', 'wink', 'laugh', 'shock', 'love', 'gg']);
const CHAT_SCOPES = new Set(['lobby', 'game']);
const TRAINING_MATCH_MODE = 'training';
const STANDARD_MATCH_MODE = 'standard';
const TRAINING_ROUNDS_RANGE = { min: 1, max: 15 };
const TRAINING_PLAYERS_RANGE = { min: 2, max: 6 };
const DEFAULT_TRAINER_MESSAGE_SETTINGS = Object.freeze({
  preMoveCommentaryEnabled: true,
  postMoveFeedbackEnabled: true
});
const SUIT_NAMES = {
  H: 'Hearts',
  D: 'Diamonds',
  C: 'Clubs',
  S: 'Spades'
};

function getMatchMode(entity) {
  return entity?.matchMode === TRAINING_MATCH_MODE ? TRAINING_MATCH_MODE : STANDARD_MATCH_MODE;
}

function isTrainingMatch(entity) {
  return getMatchMode(entity) === TRAINING_MATCH_MODE;
}

function serializeTrainingState(training = null) {
  if (!training?.enabled) {
    return null;
  }

  return {
    enabled: true,
    humanUserId: training.humanUserId || '',
    trainerUserId: training.trainerUserId || '',
    trainerElo: Number(training.trainerElo || 0),
    trainerRankName: training.trainerRankName || null,
    totalRounds: Number(training.totalRounds || 0),
    playerCount: Number(training.playerCount || 0),
    regularBotCount: Number(training.regularBotCount || 0),
    selectedRulesetId: training.selectedRulesetId || '',
    selectedRulesetLabel: training.selectedRulesetLabel || '',
    selectedRulesetSource: training.selectedRulesetSource || 'default',
    preMoveCommentaryEnabled: training.preMoveCommentaryEnabled !== false,
    postMoveFeedbackEnabled: training.postMoveFeedbackEnabled !== false
  };
}

function serializeTrainingFinalReview(finalReview = null) {
  if (!finalReview?.review) {
    return null;
  }

  return {
    review: String(finalReview.review || '').trim(),
    starRating: Math.max(0.5, Math.min(5, Number(finalReview.starRating || 3)))
  };
}

function getMaxTrainerEloForUser(user) {
  const viewerElo = typeof user?.elo === 'number'
    ? normalizeEloValue(user.elo, DEFAULT_ACCOUNT_ELO)
    : DEFAULT_ACCOUNT_ELO;

  return Math.max(10000, viewerElo);
}

function sanitizeTrainingRounds(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return TRAINING_ROUNDS_RANGE.min;
  }

  return Math.min(
    TRAINING_ROUNDS_RANGE.max,
    Math.max(TRAINING_ROUNDS_RANGE.min, Math.round(numberValue))
  );
}

function sanitizeTrainingPlayerCount(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return TRAINING_PLAYERS_RANGE.min;
  }

  return Math.min(
    TRAINING_PLAYERS_RANGE.max,
    Math.max(TRAINING_PLAYERS_RANGE.min, Math.round(numberValue))
  );
}

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
    autoBotReplacementEnabled: lobby?.autoBotReplacementEnabled ?? DEFAULT_AUTO_BOT_REPLACEMENT_ENABLED,
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
      guest: Boolean(player.guest),
      isBot: Boolean(player.isBot),
      connectionStatus: player.connectionStatus || (player.isConnected === false ? 'reconnecting' : 'connected'),
      replacementForUserId: player.replacementForUserId || null,
      replacementForName: player.replacementForName || null,
      elo: typeof player.elo === 'number' ? player.elo : null,
      rankName: player.rankName || null,
      rankTierKey: player.rankTierKey || null,
      eloDelta: game.lastEloDeltaByUserId?.[player.userId] ?? 0,
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
    seatIndex: Number.isInteger(user?.seatIndex) ? user.seatIndex : null,
    joinOrder: Number.isInteger(user?.joinOrder) ? user.joinOrder : nextJoinOrder++,
    isReady,
    role,
    isConnected: true,
    connectionStatus: user?.connectionStatus || 'connected'
  };
}

function syncLobbySeatIndexes(lobby) {
  lobby.players.forEach((player, index) => {
    player.seatIndex = index;
  });
}

function syncGameSeatIndexes(game) {
  game.players.forEach((player, index) => {
    player.seatIndex = index;
  });
}

function serializeLobby(lobby) {
  return {
    roomId: lobby.roomId,
    roomName: lobby.roomName,
    visibility: sanitizeRoomVisibility(lobby.visibility),
    matchMode: getMatchMode(lobby),
    training: serializeTrainingState(lobby.training),
    hostId: lobby.hostId,
    players: lobby.players,
    spectators: lobby.spectators,
    mutedChatUserIds: normalizeMutedChatUserIds(lobby.mutedChatUserIds),
    rulesetId: lobby.rulesetId,
    roomSettings: serializeRoomSettings(lobby),
    status: lobby.status,
    chatMessages: serializeChatMessages(lobby.chatMessages)
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

function getPendingGameAbandonmentKey(roomId, userId) {
  return `${roomId}:${userId}`;
}

function clearPendingGameAbandonment(roomId, userId) {
  const key = getPendingGameAbandonmentKey(roomId, userId);
  const timeoutId = pendingGameAbandonments.get(key);
  if (timeoutId) {
    clearTimeout(timeoutId);
    pendingGameAbandonments.delete(key);
  }
}

function getNextHostId(lobby) {
  const preferredHumanPlayer = [...lobby.players]
    .filter((player) => !isBotPlayer(player))
    .sort((left, right) => (left.joinOrder || Number.MAX_SAFE_INTEGER) - (right.joinOrder || Number.MAX_SAFE_INTEGER))[0];
  if (preferredHumanPlayer) {
    return preferredHumanPlayer.userId;
  }

  const preferredHumanSpectator = [...lobby.spectators]
    .filter((spectator) => !isBotPlayer(spectator))
    .sort((left, right) => (left.joinOrder || Number.MAX_SAFE_INTEGER) - (right.joinOrder || Number.MAX_SAFE_INTEGER))[0];
  if (preferredHumanSpectator) {
    return preferredHumanSpectator.userId;
  }

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

async function resolveTrainingRulesetForUser(user, selectedRulesetId) {
  const normalizedRulesetId = String(selectedRulesetId || '').trim();
  if (!normalizedRulesetId) {
    return { error: 'Choose a ruleset for training' };
  }

  const defaultDefinition = getRulesetDefinitionById(normalizedRulesetId);
  if (defaultDefinition) {
    return {
      selectedRulesetId: defaultDefinition.id,
      selectedRulesetLabel: defaultDefinition.label,
      selectedRulesetSource: 'default',
      customRulesets: []
    };
  }

  if (!user || user.guest) {
    return { error: 'Guests can only train with default rulesets' };
  }

  if (!/^[a-f\d]{24}$/i.test(normalizedRulesetId)) {
    return { error: 'Training ruleset not found' };
  }

  const [savedRulesetOwner, storedRuleset] = await Promise.all([
    User.findOne({
      _id: user.userId,
      savedRulesets: normalizedRulesetId
    }).select('_id').lean(),
    Ruleset.findById(normalizedRulesetId)
      .select('title shortName type code author')
      .lean()
  ]);

  if (!savedRulesetOwner || !storedRuleset) {
    return { error: 'Training ruleset not found in your saved library' };
  }

  const label = sanitizeRulesetTextField(storedRuleset.title, 'Saved Ruleset', ROOM_RULESET_NAME_MAX_LENGTH);
  const abbreviation = sanitizeRulesetTextField(
    storedRuleset.shortName,
    buildRulesetAbbreviationFallback(label),
    ROOM_RULESET_ABBREVIATION_MAX_LENGTH
  );
  const definition = {
    id: String(storedRuleset._id),
    label,
    abbreviation,
    type: storedRuleset.type === 'end_game' ? 'end_game' : 'per_round',
    code: String(storedRuleset.code || ''),
    source: 'library',
    enabledByDefault: true,
    createdBy: String(storedRuleset.author || user.userId),
    compiled: compileRuleset(String(storedRuleset.code || ''), storedRuleset.type === 'end_game' ? 'end_game' : 'per_round')
  };

  return {
    selectedRulesetId: definition.id,
    selectedRulesetLabel: definition.label,
    selectedRulesetSource: 'saved',
    customRulesets: [definition]
  };
}

async function validateTrainingSettings(payload = {}, user = null) {
  const playerElo = typeof user?.elo === 'number'
    ? normalizeEloValue(user.elo, DEFAULT_ACCOUNT_ELO)
    : DEFAULT_ACCOUNT_ELO;
  const maxTrainerElo = getMaxTrainerEloForUser(user);
  const trainerElo = normalizeEloValue(payload?.trainerElo, playerElo);
  const totalRounds = sanitizeTrainingRounds(payload?.totalRounds);
  const playerCount = sanitizeTrainingPlayerCount(payload?.playerCount);
  const rulesetResolution = await resolveTrainingRulesetForUser(user, payload?.selectedRulesetId);

  if (trainerElo > maxTrainerElo) {
    return {
      error: `Trainer ELO must be between 0 and ${maxTrainerElo}`
    };
  }

  if (totalRounds !== Number(payload?.totalRounds)) {
    return {
      error: `Training rounds must be between ${TRAINING_ROUNDS_RANGE.min} and ${TRAINING_ROUNDS_RANGE.max}`
    };
  }

  if (playerCount !== Number(payload?.playerCount)) {
    return {
      error: `Training player count must be between ${TRAINING_PLAYERS_RANGE.min} and ${TRAINING_PLAYERS_RANGE.max}`
    };
  }

  if (rulesetResolution.error) {
    return rulesetResolution;
  }

  return {
    trainerElo,
    totalRounds,
    playerCount,
    regularBotCount: Math.max(0, playerCount - 2),
    preMoveCommentaryEnabled: payload?.preMoveCommentaryEnabled !== false,
    postMoveFeedbackEnabled: payload?.postMoveFeedbackEnabled !== false,
    ...rulesetResolution
  };
}

function createBotLobbyMember(lobby, {
  replacementFor = null,
  botType = BOT_TYPE_STANDARD,
  fixedElo = null,
  displayName = '',
  description = '',
  trainerSettings = null
} = {}) {
  const seatIndex = lobby.players.length;
  const botIdentity = buildBotIdentity({
    roomId: lobby.roomId,
    seatIndex,
    players: lobby.players,
    replacementFor,
    botType,
    fixedElo,
    displayName,
    description,
    trainerSettings
  });

  return createLobbyMember(botIdentity, botIdentity.socketId, {
    isReady: true,
    role: 'player'
  });
}

function getNextHostCandidateId(lobby, { excludeUserId = null } = {}) {
  const players = lobby.players.filter((player) => player.userId !== excludeUserId);
  const spectators = lobby.spectators.filter((spectator) => spectator.userId !== excludeUserId);
  const preferredHumanPlayer = [...players]
    .filter((player) => !isBotPlayer(player))
    .sort((left, right) => (left.joinOrder || Number.MAX_SAFE_INTEGER) - (right.joinOrder || Number.MAX_SAFE_INTEGER))[0];
  if (preferredHumanPlayer) {
    return preferredHumanPlayer.userId;
  }

  const preferredHumanSpectator = [...spectators]
    .filter((spectator) => !isBotPlayer(spectator))
    .sort((left, right) => (left.joinOrder || Number.MAX_SAFE_INTEGER) - (right.joinOrder || Number.MAX_SAFE_INTEGER))[0];
  if (preferredHumanSpectator) {
    return preferredHumanSpectator.userId;
  }

  return players[0]?.userId || spectators[0]?.userId || null;
}

function setSeatConnectionState(member, nextStatus) {
  if (!member) {
    return;
  }

  member.connectionStatus = nextStatus || 'connected';
  member.isConnected = nextStatus === 'connected';
}

function migrateStateEntryKey(target, fromKey, toKey, fallbackFactory = null) {
  if (!target || !fromKey || !toKey || fromKey === toKey) {
    return target;
  }

  if (Object.prototype.hasOwnProperty.call(target, fromKey)) {
    target[toKey] = target[fromKey];
    delete target[fromKey];
    return target;
  }

  if (!Object.prototype.hasOwnProperty.call(target, toKey) && typeof fallbackFactory === 'function') {
    target[toKey] = fallbackFactory();
  }

  return target;
}

function migrateGameSeatIdentity(game, fromUserId, toUserId) {
  migrateStateEntryKey(game.handsReady, fromUserId, toUserId, () => []);
  migrateStateEntryKey(game.pointsByPlayer, fromUserId, toUserId, () => 0);
  migrateStateEntryKey(game.collectedByPlayer, fromUserId, toUserId, () => []);
  migrateStateEntryKey(game.usedChoices, fromUserId, toUserId, () => ({}));
  migrateStateEntryKey(game.rulesetPermissions, fromUserId, toUserId, () => createDefaultPermissionsForPlayer(game.customRulesets));
  migrateStateEntryKey(game.lastEloDeltaByUserId, fromUserId, toUserId, () => 0);

  game.chooserOrder = (game.chooserOrder || []).map((playerId) => (playerId === fromUserId ? toUserId : playerId));
  if (game.chooserId === fromUserId) {
    game.chooserId = toUserId;
  }
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

function normalizeChatContent(value) {
  const normalized = String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .trim();

  if (!normalized) {
    return '';
  }

  return normalized.slice(0, CHAT_MESSAGE_MAX_LENGTH);
}

function serializeChatSender(user, member = null) {
  const source = member || user || {};

  return {
    userId: source.userId || user?.userId || '',
    name: getUserDisplayName(source) || getUserDisplayName(user),
    displayName: getUserDisplayName(source) || getUserDisplayName(user),
    avatarUrl: getAvatarSource(source),
    guest: Boolean(source.guest ?? user?.guest),
    isBot: Boolean(source.isBot ?? user?.isBot)
  };
}

function serializeChatMessages(messages = []) {
  return (Array.isArray(messages) ? messages : []).map((message) => ({
    id: message.id,
    roomId: message.roomId,
    scope: message.scope,
    sender: {
      ...(message.sender || {})
    },
    content: message.content,
    createdAt: message.createdAt
  }));
}

function appendChatMessage(entity, message) {
  const history = Array.isArray(entity.chatMessages) ? entity.chatMessages : [];
  entity.chatMessages = [...history, message].slice(-CHAT_HISTORY_LIMIT);
  return message;
}

function emitGameActivity(io, roomId, message, { tone = 'info' } = {}) {
  if (!io || !roomId || !message) {
    return;
  }

  io.to(roomId).emit('game_activity', {
    id: `activity_${Date.now().toString(36)}_${randomFriendCode().toLowerCase()}`,
    message: String(message),
    tone,
    createdAt: new Date().toISOString()
  });
}

function createScopedChatMessage(roomId, scope, user, member, content) {
  return {
    id: `chat_${Date.now().toString(36)}_${randomFriendCode().toLowerCase()}`,
    roomId,
    scope,
    sender: serializeChatSender(user, member),
    content,
    createdAt: new Date().toISOString()
  };
}

function hasTrainerMessageBeenSent(game, dedupeKey) {
  if (!game || !dedupeKey) {
    return false;
  }

  game.trainerMessageKeys = game.trainerMessageKeys || new Set();
  return game.trainerMessageKeys.has(dedupeKey);
}

function markTrainerMessageSent(game, dedupeKey) {
  if (!game || !dedupeKey) {
    return;
  }

  game.trainerMessageKeys = game.trainerMessageKeys || new Set();
  game.trainerMessageKeys.add(dedupeKey);
}

function emitAutomatedGameChatMessage(io, roomId, game, speaker, content, { dedupeKey = '' } = {}) {
  const normalizedContent = normalizeChatContent(content);
  if (!io || !roomId || !game || !speaker || !normalizedContent) {
    return null;
  }

  if (dedupeKey && hasTrainerMessageBeenSent(game, dedupeKey)) {
    return null;
  }

  const message = appendChatMessage(
    game,
    createScopedChatMessage(roomId, 'game', speaker, speaker, normalizedContent)
  );
  if (dedupeKey) {
    markTrainerMessageSent(game, dedupeKey);
  }
  io.to(roomId).emit('chat_message', {
    scope: 'game',
    message
  });

  return message;
}

function normalizeMutedChatUserIds(value = []) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();

  return value.reduce((acc, entry) => {
    const userId = String(entry || '').trim();
    if (!userId || seen.has(userId)) {
      return acc;
    }

    seen.add(userId);
    acc.push(userId);
    return acc;
  }, []);
}

function isLobbyChatMuted(lobby, userId) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    return false;
  }

  return normalizeMutedChatUserIds(lobby?.mutedChatUserIds).includes(normalizedUserId);
}

function setLobbyChatMutedState(lobby, targetUserId, muted) {
  const normalizedUserId = String(targetUserId || '').trim();
  const nextMutedUserIds = normalizeMutedChatUserIds(lobby?.mutedChatUserIds);

  lobby.mutedChatUserIds = nextMutedUserIds;
  if (!normalizedUserId) {
    return { changed: false, muted: Boolean(muted) };
  }

  const alreadyMuted = nextMutedUserIds.includes(normalizedUserId);
  if (muted) {
    if (!alreadyMuted) {
      lobby.mutedChatUserIds = [...nextMutedUserIds, normalizedUserId];
      return { changed: true, muted: true };
    }

    return { changed: false, muted: true };
  }

  if (alreadyMuted) {
    lobby.mutedChatUserIds = nextMutedUserIds.filter((userId) => userId !== normalizedUserId);
    return { changed: true, muted: false };
  }

  return { changed: false, muted: false };
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
  member.accountCreatedAt = user.accountCreatedAt || member.accountCreatedAt || null;
  member.elo = typeof user.elo === 'number' ? user.elo : (member.elo ?? null);
  member.rankName = user.rankName || member.rankName || null;
  member.rankTierKey = user.rankTierKey || member.rankTierKey || null;
  member.favouriteRulesets = Array.isArray(user.favouriteRulesets)
    ? [...user.favouriteRulesets]
    : (member.favouriteRulesets || []);
  member.rulesetLoadout = Array.isArray(user.rulesetLoadout)
    ? [...user.rulesetLoadout]
    : (member.rulesetLoadout || []);
  member.isBot = Boolean(user.isBot ?? member.isBot);
  setSeatConnectionState(member, 'connected');
  return member;
}

function removeWaitingLobbyMember(lobby, targetUserId) {
  lobby.rulesetPermissions = lobby.rulesetPermissions || {};
  lobby.mutedChatUserIds = normalizeMutedChatUserIds(lobby.mutedChatUserIds);

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
  lobby.mutedChatUserIds = lobby.mutedChatUserIds.filter((userId) => userId !== member.userId);

  const remainingPlayerCount = lobby.players.length;
  const remainingMemberCount = getAllLobbyMembers(lobby).length;
  const shouldDeleteRoom = remainingPlayerCount === 0;

  if (previousHostId === member.userId) {
    lobby.hostId = getNextHostId(lobby);
  }

  syncLobbySeatIndexes(lobby);
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
      guest: Boolean(member.guest),
      isBot: Boolean(member.isBot)
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
      guest: Boolean(member.guest),
      isBot: Boolean(member.isBot)
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
  const accountProfile = {
    ...serializeAccount(user),
    ...(await buildCompetitiveSummaryForUser(user))
  };

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
    syncLobbySeatIndexes(lobby);
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

function addBotToLobby(lobby) {
  if (lobby.players.length >= MAX_ACTIVE_PLAYERS) {
    return { error: `All ${MAX_ACTIVE_PLAYERS} player seats are already taken` };
  }

  const botMember = createBotLobbyMember(lobby);
  lobby.players.push(botMember);
  syncLobbySeatIndexes(lobby);
  lobby.rulesetPermissions[botMember.userId] = createDefaultPermissionsForPlayer(lobby.customRulesets);
  ensureRulesetPermissionsForPlayers(lobby);

  return {
    success: true,
    botMember
  };
}

function removeBotFromLobby(lobby, targetUserId) {
  const botIndex = lobby.players.findIndex((player) => player.userId === targetUserId && isBotPlayer(player));
  if (botIndex === -1) {
    return { error: 'Bot player not found' };
  }

  const [removedBot] = lobby.players.splice(botIndex, 1);
  delete lobby.rulesetPermissions[removedBot.userId];
  syncLobbySeatIndexes(lobby);
  ensureRulesetPermissionsForPlayers(lobby);

  return {
    success: true,
    removedBot
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
    syncLobbySeatIndexes(lobby);
    lobby.rulesetPermissions[member.userId] = createDefaultPermissionsForPlayer(lobby.customRulesets);
    ensureRulesetPermissionsForPlayers(lobby);

    return { assignedRole: 'player', changed: true };
  }

  if (spectatorIndex !== -1) {
    return { assignedRole: 'spectator', changed: false };
  }

  const [member] = lobby.players.splice(playerIndex, 1);
  delete lobby.rulesetPermissions[member.userId];
  syncLobbySeatIndexes(lobby);
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

function isTrainingRoundLimitReached(game) {
  return Boolean(
    isTrainingMatch(game)
    && Number(game?.training?.totalRounds || 0) > 0
    && Number(game?.roundNumber || 0) >= Number(game.training.totalRounds || 0)
  );
}

function hasRemainingChoices(game) {
  if (isTrainingMatch(game)) {
    return !isTrainingRoundLimitReached(game);
  }

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
    matchMode: getMatchMode(game),
    training: serializeTrainingState(game.training),
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

function buildSpectatorVisibleHandState(game) {
  if (!game) {
    return {
      visibleHand: [],
      visiblePlayerId: null,
      visiblePlayerName: ''
    };
  }

  const currentPlayer = game.phase === 'playing_round'
    ? (game.players?.[game.turnIndex] || null)
    : (game.players?.find((player) => player.userId === game.chooserId) || null);
  if (!currentPlayer) {
    return {
      visibleHand: [],
      visiblePlayerId: null,
      visiblePlayerName: ''
    };
  }

  const visibleHand = [...(game.handsReady[currentPlayer.userId] || [])];
  if (visibleHand.length === 0) {
    return {
      visibleHand: [],
      visiblePlayerId: null,
      visiblePlayerName: ''
    };
  }

  return {
    visibleHand,
    visiblePlayerId: currentPlayer.userId,
    visiblePlayerName: currentPlayer.name || 'Current player'
  };
}

function buildGameSessionSnapshot(roomId, game, userId, { isSpectator = false } = {}) {
  const playerIndex = isSpectator
    ? -1
    : game.players.findIndex((player) => player.userId === userId);
  const effectivePlayer = playerIndex >= 0 ? game.players[playerIndex] : null;
  const gameFinished = game.status === 'finished' || game.phase === 'finished';
  const spectatorVisibleHandState = buildSpectatorVisibleHandState(game);

  return {
    roomId,
    matchMode: getMatchMode(game),
    training: serializeTrainingState(game.training),
    trainingFinalReview: serializeTrainingFinalReview(game.training?.finalReview),
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
    eloResults: game.lastEloResults || [],
    matchComplete: gameFinished || (game.phase === 'round_stats' && !hasRemainingChoices(game)),
    standings: buildStandings(game),
    startingHandSize: game.startingHandSize || 0,
    chatMessages: serializeChatMessages(game.chatMessages),
    spectatorVisibleHand: spectatorVisibleHandState.visibleHand,
    spectatorVisiblePlayerId: spectatorVisibleHandState.visiblePlayerId,
    spectatorVisiblePlayerName: spectatorVisibleHandState.visiblePlayerName
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
  clearPendingGameAbandonment(roomId, user.userId);
  socket.join(roomId);

  const game = activeGames.get(roomId);
  if (game) {
    const gamePlayer = game.players.find((player) => player.userId === user.userId);
    if (gamePlayer) {
      gamePlayer.socketId = socket.id;
      gamePlayer.name = getUserDisplayName(user);
      gamePlayer.guest = Boolean(user.guest);
      gamePlayer.avatarUrl = getAvatarSource(user) || gamePlayer.avatarUrl || DEFAULT_PROFILE_PICTURE_PATH;
      gamePlayer.banner = user.banner || gamePlayer.banner || '';
      gamePlayer.description = user.description || gamePlayer.description || '';
      gamePlayer.accountCreatedAt = user.accountCreatedAt || gamePlayer.accountCreatedAt || null;
      gamePlayer.elo = typeof user.elo === 'number' ? user.elo : (gamePlayer.elo ?? null);
      gamePlayer.rankName = user.rankName || gamePlayer.rankName || null;
      gamePlayer.rankTierKey = user.rankTierKey || gamePlayer.rankTierKey || null;
      gamePlayer.isBot = Boolean(user.isBot ?? gamePlayer.isBot);
      setSeatConnectionState(gamePlayer, 'connected');
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

function formatCardMoveLabel(card) {
  const [value = '', suit = ''] = String(card || '').split('-');
  return `${value}${SUIT_NAMES[suit] ? ` of ${SUIT_NAMES[suit]}` : ''}`.trim();
}

function buildLegalBotMoves(game, player) {
  if (!game || !player) {
    return { kind: null, legalMoves: [], ruleset: null };
  }

  if (game.phase === 'choosing_nv' && game.chooserId === player.userId) {
    return {
      kind: 'choose_nv',
      legalMoves: game.nvAllowed
        ? [
          { id: 'nv_no', label: 'Skip NV', value: false, description: 'Choose the normal game flow.' },
          { id: 'nv_yes', label: 'Choose NV', value: true, description: 'Choose the NV variant for this round.' }
        ]
        : [{ id: 'nv_no', label: 'Skip NV', value: false, description: 'NV is disabled in this room.' }],
      ruleset: null
    };
  }

  if (game.phase === 'choosing_ruleset' && game.chooserId === player.userId) {
    const ruleIds = getEligibleRuleIdsForPlayer(game, player.userId);
    return {
      kind: 'choose_ruleset',
      legalMoves: ruleIds
        .map((ruleId) => getRulesetDefinitionById(ruleId, game.customRulesets))
        .filter(Boolean)
        .map((rule) => ({
          id: rule.id,
          label: rule.label,
          description: `${rule.abbreviation || rule.label}${rule.type === 'end_game' ? ' end-game' : ''} ruleset.`
        })),
      ruleset: null
    };
  }

  if (game.phase === 'playing_round' && !game.trickPending) {
    const currentPlayer = game.players[game.turnIndex];
    if (!currentPlayer || currentPlayer.userId !== player.userId) {
      return { kind: null, legalMoves: [], ruleset: null };
    }

    const currentRuleset = getRulesetDefinitionById(game.activeRulesetId, game.customRulesets);
    const legalCards = getLegalCardsForPlayer(game, player.userId);
    return {
      kind: 'play_card',
      legalMoves: legalCards.map((card) => ({
        id: card,
        card,
        label: formatCardMoveLabel(card),
        description: `Play ${formatCardMoveLabel(card)}`
      })),
      ruleset: currentRuleset || null
    };
  }

  return { kind: null, legalMoves: [], ruleset: null };
}

function getTrainerPlayer(game) {
  return game?.players?.find((player) => isTrainerBot(player)) || null;
}

function getTrainingHumanPlayer(game) {
  const humanUserId = game?.training?.humanUserId || '';
  if (humanUserId) {
    return game?.players?.find((player) => player.userId === humanUserId) || null;
  }

  return game?.players?.find((player) => !isBotPlayer(player)) || null;
}

async function maybeSendTrainerPreMoveComment(io, roomId, game, trainerPlayer, selectedMove, legalMoves, ruleset) {
  if (
    !io
    || !roomId
    || !game
    || !trainerPlayer
    || !isTrainerBot(trainerPlayer)
    || game.training?.preMoveCommentaryEnabled === false
  ) {
    return null;
  }

  const dedupeKey = [
    'trainer-pre',
    game.roundNumber,
    trainerPlayer.userId,
    game.turnIndex,
    game.currentTrick.length,
    selectedMove?.id || selectedMove?.card || ''
  ].join(':');
  if (hasTrainerMessageBeenSent(game, dedupeKey)) {
    return null;
  }

  const comment = await generateTrainerPreMoveComment({
    gameState: game,
    trainerPlayer,
    legalMoves,
    selectedMove,
    ruleset
  });

  return emitAutomatedGameChatMessage(io, roomId, game, trainerPlayer, comment, {
    dedupeKey
  });
}

function maybeSendTrainerMoveFeedback(io, roomId, game, {
  humanPlayer,
  playedCard,
  legalMoves = [],
  ruleset,
  currentTrickBeforeMove = []
} = {}) {
  const trainerPlayer = getTrainerPlayer(game);
  if (
    !io
    || !roomId
    || !game
    || !trainerPlayer
    || !humanPlayer
    || isBotPlayer(humanPlayer)
    || game.training?.postMoveFeedbackEnabled === false
  ) {
    return;
  }

  const dedupeKey = [
    'trainer-post',
    game.roundNumber,
    humanPlayer.userId,
    playedCard,
    currentTrickBeforeMove.length
  ].join(':');
  if (hasTrainerMessageBeenSent(game, dedupeKey)) {
    return;
  }

  Promise.resolve()
    .then(async () => {
      const evaluation = await evaluateTrainerPlayerMove({
        gameState: game,
        trainerPlayer,
        humanPlayer,
        playedCard,
        legalMoves,
        ruleset,
        currentTrickBeforeMove
      });

      if (Number.isFinite(Number(evaluation?.rating))) {
        game.training.feedbackEntries = Array.isArray(game.training.feedbackEntries)
          ? game.training.feedbackEntries
          : [];
        game.training.feedbackEntries.push({
          roundNumber: game.roundNumber,
          playedCard,
          rating: Number(evaluation.rating),
          feedback: evaluation.feedback || '',
          commented: evaluation.shouldComment !== false
        });
      }

      if (!evaluation?.shouldComment || !evaluation.feedback) {
        return null;
      }

      return emitAutomatedGameChatMessage(io, roomId, game, trainerPlayer, evaluation.feedback, {
        dedupeKey
      });
    })
    .catch((error) => {
      console.warn(`Trainer feedback skipped for room ${roomId}: ${error.message}`);
    });
}

function clearPendingBotAction(game) {
  if (!game) {
    return;
  }

  if (game.botActionTimeoutId) {
    clearTimeout(game.botActionTimeoutId);
    game.botActionTimeoutId = null;
  }

  game.pendingBotActionKey = null;
}

function getPendingBotActionKey(game) {
  if (!game) {
    return null;
  }

  if (game.phase === 'choosing_nv' || game.phase === 'choosing_ruleset') {
    return `${game.phase}:${game.chooserId}:${game.stateVersion}:${game.roundNumber}`;
  }

  if (game.phase === 'playing_round' && !game.trickPending) {
    const currentPlayer = game.players[game.turnIndex];
    return currentPlayer
      ? `${game.phase}:${currentPlayer.userId}:${game.turnIndex}:${game.currentTrick.length}:${game.stateVersion}`
      : null;
  }

  return null;
}

function maybeTransferActiveGameHost(lobby, game, displacedUserId) {
  if (!lobby || !game) {
    return null;
  }

  if (lobby.hostId !== displacedUserId && game.hostId !== displacedUserId) {
    return null;
  }

  const nextHostId = getNextHostCandidateId(lobby, { excludeUserId: displacedUserId }) || lobby.hostId || game.hostId || null;
  if (nextHostId) {
    lobby.hostId = nextHostId;
    game.hostId = nextHostId;
  }

  return nextHostId;
}

function emitCurrentGameplayState(io, roomId, game) {
  if (!game) {
    return;
  }

  const stateVersion = bumpGameStateVersion(game);
  const spectatorVisibleHandState = buildSpectatorVisibleHandState(game);

  if (game.phase === 'playing_round') {
    io.to(roomId).emit('game_update', {
      currentTrick: game.currentTrick,
      turnIndex: game.turnIndex,
      trickSuit: game.trickSuit,
      stateVersion,
      cardCounts: buildCardCounts(game),
      choiceState: serializeChoiceState(game),
      spectatorVisibleHand: spectatorVisibleHandState.visibleHand,
      spectatorVisiblePlayerId: spectatorVisibleHandState.visiblePlayerId,
      spectatorVisiblePlayerName: spectatorVisibleHandState.visiblePlayerName,
      timerDeadline: game.timerDeadline
    });
    return;
  }

  io.to(roomId).emit('choice_state_update', {
    choiceState: serializeChoiceState(game),
    stateVersion,
    cardCounts: buildCardCounts(game),
    playerPoints: buildPointTotals(game),
    spectatorVisibleHand: spectatorVisibleHandState.visibleHand,
    spectatorVisiblePlayerId: spectatorVisibleHandState.visiblePlayerId,
    spectatorVisiblePlayerName: spectatorVisibleHandState.visiblePlayerName
  });
}

function removeActiveSpectatorFromLobby(lobby, targetUserId) {
  const spectatorIndex = lobby?.spectators?.findIndex((spectator) => spectator.userId === targetUserId) ?? -1;
  if (!lobby || spectatorIndex === -1) {
    return null;
  }

  const [spectator] = lobby.spectators.splice(spectatorIndex, 1);
  return spectator;
}

function removeSocketMemberFromRoom(io, roomId, member, reason = 'You left the room') {
  if (!io || !roomId || !member?.socketId || isBotPlayer(member)) {
    return;
  }

  clearPendingLobbyDisconnect(roomId, member.userId);
  clearPendingGameAbandonment(roomId, member.userId);
  io.to(member.socketId).emit('lobby_removed', { roomId, reason });
  io.sockets.sockets.get(member.socketId)?.leave(roomId);
}

function replaceActivePlayerWithBot(io, roomId, game, userId) {
  const lobby = lobbies.get(roomId);
  const playerIndex = game?.players.findIndex((player) => player.userId === userId && !isBotPlayer(player)) ?? -1;
  if (!game || !lobby || playerIndex === -1) {
    return null;
  }

  const displacedPlayer = game.players[playerIndex];
  const botPlayer = buildBotIdentity({
    roomId,
    seatIndex: displacedPlayer.seatIndex ?? playerIndex,
    players: game.players,
    replacementFor: displacedPlayer
  });
  const nextGamePlayer = {
    ...botPlayer,
    seatIndex: displacedPlayer.seatIndex ?? playerIndex,
    joinOrder: displacedPlayer.joinOrder,
    role: 'player',
    isReady: true
  };

  game.abandonedPlayers = {
    ...(game.abandonedPlayers || {}),
    [displacedPlayer.userId]: {
      userId: displacedPlayer.userId,
      name: displacedPlayer.name,
      seatIndex: displacedPlayer.seatIndex ?? playerIndex,
      abandonedAt: Date.now(),
      replacedByBotUserId: botPlayer.userId,
      replacedByBotName: botPlayer.name
    }
  };

  game.players[playerIndex] = nextGamePlayer;
  migrateGameSeatIdentity(game, displacedPlayer.userId, botPlayer.userId);
  syncGameSeatIndexes(game);

  const lobbyPlayerIndex = lobby.players.findIndex((player) => player.userId === displacedPlayer.userId);
  if (lobbyPlayerIndex !== -1) {
    const existingPermissions = lobby.rulesetPermissions?.[displacedPlayer.userId] || createDefaultPermissionsForPlayer(lobby.customRulesets);
    lobby.players[lobbyPlayerIndex] = {
      ...nextGamePlayer,
      socketId: botPlayer.socketId,
      joinOrder: displacedPlayer.joinOrder,
      isReady: true,
      role: 'player'
    };
    delete lobby.rulesetPermissions[displacedPlayer.userId];
    lobby.rulesetPermissions[botPlayer.userId] = existingPermissions;
    syncLobbySeatIndexes(lobby);
    ensureRulesetPermissionsForPlayers(lobby);
  }

  clearPendingGameAbandonment(roomId, displacedPlayer.userId);
  maybeTransferActiveGameHost(lobby, game, displacedPlayer.userId);
  emitLobbyUpdate(io, roomId, lobby);
  emitCurrentGameplayState(io, roomId, game);

  return {
    displacedPlayer,
    botPlayer: nextGamePlayer
  };
}

function markPlayerAbandonedDuringGame(io, roomId, game, userId, {
  replacementMessage = null,
  forceReplacement = false
} = {}) {
  const lobby = lobbies.get(roomId);
  const gamePlayer = game?.players.find((player) => player.userId === userId);
  if (!game || !lobby || !gamePlayer || isBotPlayer(gamePlayer)) {
    return null;
  }

  setSeatConnectionState(gamePlayer, 'abandoned');
  const lobbyPlayer = lobby.players.find((player) => player.userId === userId);
  if (lobbyPlayer) {
    setSeatConnectionState(lobbyPlayer, 'abandoned');
  }

  maybeTransferActiveGameHost(lobby, game, userId);
  emitLobbyUpdate(io, roomId, lobby);

  if (lobby.autoBotReplacementEnabled === false && !forceReplacement) {
    emitCurrentGameplayState(io, roomId, game);
    return {
      abandoned: true,
      replaced: false
    };
  }

  const replacement = replaceActivePlayerWithBot(io, roomId, game, userId);
  if (replacement) {
    if (replacementMessage) {
      emitGameActivity(io, roomId, replacementMessage, { tone: 'warning' });
    }
    void scheduleBotActionIfNeeded(io, roomId, game);
  }

  return {
    abandoned: true,
    replaced: Boolean(replacement),
    replacement
  };
}

function scheduleGameAbandonment(io, roomId, lobby, member, gamePlayer) {
  if (!lobby || !member || !gamePlayer || isBotPlayer(gamePlayer)) {
    return;
  }

  if ((gamePlayer.connectionStatus || 'connected') === 'reconnecting') {
    return;
  }

  clearPendingGameAbandonment(roomId, member.userId);
  setSeatConnectionState(member, 'reconnecting');
  setSeatConnectionState(gamePlayer, 'reconnecting');
  emitLobbyUpdate(io, roomId, lobby);
  emitGameActivity(io, roomId, `${getUserDisplayName(member)} disconnected. Waiting for reconnect...`, {
    tone: 'warning'
  });

  const timeoutId = setTimeout(() => {
    pendingGameAbandonments.delete(getPendingGameAbandonmentKey(roomId, member.userId));

    const currentLobby = lobbies.get(roomId);
    const currentGame = activeGames.get(roomId);
    const currentPlayer = currentGame?.players.find((player) => player.userId === member.userId);

    if (
      !currentLobby
      || !currentGame
      || currentGame.status === 'finished'
      || currentGame.phase === 'finished'
      || !currentPlayer
      || currentPlayer.isConnected
      || isBotPlayer(currentPlayer)
    ) {
      return;
    }

    emitGameActivity(io, roomId, `${getUserDisplayName(member)} did not reconnect in time.`, {
      tone: 'warning'
    });
    markPlayerAbandonedDuringGame(io, roomId, currentGame, member.userId, {
      replacementMessage: `${getUserDisplayName(member)} was replaced by a bot.`
    });
  }, ABANDONMENT_TIMEOUT_MS);

  timeoutId.unref?.();
  pendingGameAbandonments.set(getPendingGameAbandonmentKey(roomId, member.userId), timeoutId);
}

async function executeBotAction(io, roomId, game, actionKey) {
  if (!game || game.pendingBotActionKey !== actionKey) {
    return;
  }

  clearPendingBotAction(game);

  const currentPlayer = game.phase === 'playing_round'
    ? game.players[game.turnIndex]
    : game.players.find((player) => player.userId === game.chooserId);
  if (!currentPlayer || !isBotPlayer(currentPlayer)) {
    return;
  }

  const { kind, legalMoves, ruleset } = buildLegalBotMoves(game, currentPlayer);
  if (!kind) {
    return;
  }

  const decision = await chooseBotMove({
    roomId,
    kind,
    gameState: game,
    botPlayer: currentPlayer,
    legalMoves,
    ruleset
  });
  const selectedMove = decision.selectedMove;

  if (!selectedMove) {
    return;
  }

  if (kind === 'choose_nv') {
    setNvChoiceForRound(io, roomId, game, currentPlayer.userId, Boolean(selectedMove.value));
    return;
  }

  if (kind === 'choose_ruleset') {
    selectRulesetForRound(io, roomId, game, currentPlayer.userId, selectedMove.id);
    return;
  }

  if (kind === 'play_card' && isTrainerBot(currentPlayer)) {
    await maybeSendTrainerPreMoveComment(
      io,
      roomId,
      game,
      currentPlayer,
      selectedMove,
      legalMoves,
      ruleset
    );
  }

  playCardForPlayer(io, roomId, currentPlayer.userId, selectedMove.card || selectedMove.id, { auto: true });
}

function scheduleBotActionIfNeeded(io, roomId, game) {
  if (!game || game.status === 'finished' || game.phase === 'finished') {
    clearPendingBotAction(game);
    return false;
  }

  const currentPlayer = game.phase === 'playing_round'
    ? game.players[game.turnIndex]
    : game.players.find((player) => player.userId === game.chooserId);
  if (!currentPlayer || !isBotPlayer(currentPlayer)) {
    clearPendingBotAction(game);
    return false;
  }

  const actionKey = getPendingBotActionKey(game);
  if (!actionKey) {
    clearPendingBotAction(game);
    return false;
  }

  if (game.pendingBotActionKey === actionKey && game.botActionTimeoutId) {
    return true;
  }

  clearPendingBotAction(game);
  game.pendingBotActionKey = actionKey;
  game.botActionTimeoutId = setTimeout(() => {
    game.botActionTimeoutId = null;
    void executeBotAction(io, roomId, game, actionKey);
  }, BOT_ACTION_DELAY_MS);
  game.botActionTimeoutId.unref?.();
  return true;
}

function emitChoiceState(io, roomId, game, extra = {}) {
  const spectatorVisibleHandState = buildSpectatorVisibleHandState(game);
  io.to(roomId).emit('choice_state_update', {
    choiceState: serializeChoiceState(game),
    stateVersion: bumpGameStateVersion(game),
    spectatorVisibleHand: spectatorVisibleHandState.visibleHand,
    spectatorVisiblePlayerId: spectatorVisibleHandState.visiblePlayerId,
    spectatorVisiblePlayerName: spectatorVisibleHandState.visiblePlayerName,
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

function buildMatchKey(roomId) {
  return `${roomId}:${Date.now().toString(36)}:${randomFriendCode().toLowerCase()}`;
}

function buildGamePlayerFromLobbyPlayer(player, allPlayers) {
  return {
    userId: player.userId,
    socketId: player.socketId,
    seatIndex: player.seatIndex,
    joinOrder: player.joinOrder,
    name: player.displayName || player.name,
    avatarUrl: getAvatarSource(player),
    guest: Boolean(player.guest),
    isBot: Boolean(player.isBot),
    isTrainer: Boolean(player.isTrainer),
    botType: player.botType || (player.isTrainer ? BOT_TYPE_TRAINER : BOT_TYPE_STANDARD),
    banner: player.banner || '',
    description: player.description || '',
    accountCreatedAt: player.accountCreatedAt || null,
    elo: typeof player.elo === 'number' ? player.elo : null,
    rankName: player.rankName || null,
    rankTierKey: player.rankTierKey || null,
    isConnected: player.isConnected !== false,
    connectionStatus: player.connectionStatus || (player.isConnected === false ? 'reconnecting' : 'connected'),
    averageHumanElo: isBotPlayer(player) ? getAverageHumanElo(allPlayers) : null,
    replacementForUserId: player.replacementForUserId || null,
    replacementForName: player.replacementForName || null,
    trainerSettings: player.trainerSettings ? { ...player.trainerSettings } : null
  };
}

function buildGameStateFromLobby(lobby, { matchMode = STANDARD_MATCH_MODE, training = null } = {}) {
  const playerIds = lobby.players.map((player) => player.userId);
  const chooserOrder = shuffle([...playerIds]);

  return {
    roomId: lobby.roomId,
    roomName: lobby.roomName,
    matchMode,
    training: training?.enabled ? { ...training } : null,
    hostId: lobby.hostId,
    rulesetId: lobby.rulesetId,
    customRulesets: (lobby.customRulesets || []).map((definition) => ({ ...definition })),
    selectedRulesets: sanitizeRulesetSelections(lobby.selectedRulesets, lobby.customRulesets),
    rulesetPermissions: sanitizeRulesetPermissions(
      lobby.rulesetPermissions,
      lobby.players,
      lobby.selectedRulesets,
      lobby.customRulesets
    ),
    nvAllowed: Boolean(lobby.nvAllowed),
    autoBotReplacementEnabled: lobby.autoBotReplacementEnabled !== false,
    useTurnTimer: lobby.useTurnTimer !== false,
    turnTimerSeconds: sanitizeTurnTimerSeconds(lobby.turnTimerSeconds),
    players: lobby.players.map((player) => buildGamePlayerFromLobbyPlayer(player, lobby.players)),
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
    currentTrick: [],
    trickSuit: null,
    collectedHands: [],
    pointsByPlayer: buildInitialPoints(lobby.players),
    collectedByPlayer: playerIds.reduce((acc, playerId) => {
      acc[playerId] = [];
      return acc;
    }, {}),
    chatMessages: [],
    roundStats: null,
    lastRoundStats: null,
    lastEloResults: [],
    lastEloDeltaByUserId: {},
    eloUpdateStatus: 'idle',
    eloUpdatePromise: null,
    matchHistoryStatus: 'idle',
    matchHistoryPromise: null,
    lastMatchHistory: null,
    saveGameStatus: 'idle',
    saveGamePromise: null,
    matchKey: buildMatchKey(lobby.roomId),
    gameFinishedEventSent: false,
    botActionTimeoutId: null,
    pendingBotActionKey: null,
    roundContinueTimeoutId: null,
    abandonedPlayers: {},
    timerId: null,
    timerDeadline: null,
    trainerMessageKeys: new Set()
  };
}

function emitGameStartedToMembers(io, roomId, lobby, gameState) {
  const gameStartedVersion = bumpGameStateVersion(gameState);
  const spectatorVisibleHandState = buildSpectatorVisibleHandState(gameState);

  lobby.players.forEach((player, index) => {
    io.to(player.socketId).emit('game_started', {
      message: 'The game has begun!',
      hand: gameState.handsReady[player.userId] || [],
      startingHandSize: gameState.startingHandSize || 0,
      playerIndex: index,
      isSpectator: false,
      turnIndex: 0,
      trickSuit: null,
      stateVersion: gameStartedVersion,
      cardCounts: buildCardCounts(gameState),
      playerPoints: buildPointTotals(gameState),
      collectedHandsByPlayer: buildCollectedHands(gameState),
      choiceState: serializeChoiceState(gameState),
      availableRulesets: getAvailableRulesets(gameState.customRulesets),
      chatMessages: serializeChatMessages(gameState.chatMessages),
      spectatorVisibleHand: spectatorVisibleHandState.visibleHand,
      spectatorVisiblePlayerId: spectatorVisibleHandState.visiblePlayerId,
      spectatorVisiblePlayerName: spectatorVisibleHandState.visiblePlayerName
    });
  });

  lobby.spectators.forEach((spectator) => {
    io.to(spectator.socketId).emit('game_started', {
      message: 'The game has begun!',
      hand: [],
      startingHandSize: gameState.startingHandSize || spectatorVisibleHandState.visibleHand.length || 0,
      playerIndex: -1,
      isSpectator: true,
      turnIndex: 0,
      trickSuit: null,
      stateVersion: gameStartedVersion,
      cardCounts: buildCardCounts(gameState),
      playerPoints: buildPointTotals(gameState),
      collectedHandsByPlayer: buildCollectedHands(gameState),
      choiceState: serializeChoiceState(gameState),
      availableRulesets: getAvailableRulesets(gameState.customRulesets),
      chatMessages: serializeChatMessages(gameState.chatMessages),
      spectatorVisibleHand: spectatorVisibleHandState.visibleHand,
      spectatorVisiblePlayerId: spectatorVisibleHandState.visiblePlayerId,
      spectatorVisiblePlayerName: spectatorVisibleHandState.visiblePlayerName
    });
  });
}

function createEmptyHandsByPlayer(game) {
  return (game?.players || []).reduce((acc, player) => {
    acc[player.userId] = [];
    return acc;
  }, {});
}

function createEmptyCollectedByPlayer(game) {
  return (game?.players || []).reduce((acc, player) => {
    acc[player.userId] = [];
    return acc;
  }, {});
}

function buildTrainingRoundSummary(game, roundStats) {
  if (!isTrainingMatch(game) || !roundStats || !game?.training?.humanUserId) {
    return null;
  }

  const humanPlayer = getTrainingHumanPlayer(game);
  const trainerPlayer = getTrainerPlayer(game);
  const humanUserId = humanPlayer?.userId || game.training.humanUserId;
  const trainerUserId = trainerPlayer?.userId || game.training.trainerUserId || '';

  return {
    roundNumber: roundStats.roundNumber,
    rulesetId: roundStats.rulesetId,
    rulesetLabel: roundStats.rulesetLabel,
    humanScoreDelta: Number(roundStats.scoreDeltas?.[humanUserId] || 0),
    humanTricksWon: (roundStats.tricks || []).filter((trick) => trick.takenBy === humanUserId).length,
    trainerTricksWon: trainerUserId
      ? (roundStats.tricks || []).filter((trick) => trick.takenBy === trainerUserId).length
      : 0
  };
}

function startTrainingRoundGameplay(io, roomId, game, {
  announce = true,
  nvSelected = false
} = {}) {
  if (!game || !isTrainingMatch(game) || !game.training?.selectedRulesetId) {
    return { error: 'Training round cannot start right now' };
  }

  clearGameTimer(game);
  clearPendingBotAction(game);
  clearRoundAutoContinue(game);

  dealNewRoundCards(io, roomId, game);
  game.phase = 'playing_round';
  game.chooserId = game.training.humanUserId || getTrainingHumanPlayer(game)?.userId || null;
  game.activeRulesetId = game.training.selectedRulesetId;
  game.nvSelected = Boolean(nvSelected);
  game.turnIndex = Math.max(0, Number(game.turnIndex || 0) % Math.max(game.players.length, 1));
  game.roundNumber += 1;
  createRoundStats(game);

  scheduleGameTimer(io, roomId, game, () => {
    const currentPlayer = game.players[game.turnIndex];
    const fallbackCard = getLegalCardsForPlayer(game, currentPlayer?.userId)[0];
    if (currentPlayer && fallbackCard) {
      playCardForPlayer(io, roomId, currentPlayer.userId, fallbackCard, { auto: true });
    }
  });

  const message = announce
    ? `Training round ${game.roundNumber} of ${game.training.totalRounds}: ${game.training.selectedRulesetLabel}${game.nvSelected ? ' (NV)' : ''}`
    : '';
  const stateVersion = bumpGameStateVersion(game);
  const spectatorVisibleHandState = buildSpectatorVisibleHandState(game);

  io.to(roomId).emit('small_game_started', {
    message,
    choiceState: serializeChoiceState(game),
    currentTrick: game.currentTrick,
    turnIndex: game.turnIndex,
    trickSuit: game.trickSuit,
    stateVersion,
    cardCounts: buildCardCounts(game),
    playerPoints: buildPointTotals(game),
    collectedHandsByPlayer: buildCollectedHands(game),
    spectatorVisibleHand: spectatorVisibleHandState.visibleHand,
    spectatorVisiblePlayerId: spectatorVisibleHandState.visiblePlayerId,
    spectatorVisiblePlayerName: spectatorVisibleHandState.visiblePlayerName
  });

  void scheduleBotActionIfNeeded(io, roomId, game);
  return { success: true };
}

function startTrainingRound(io, roomId, game, { announce = true } = {}) {
  if (!game || !isTrainingMatch(game) || !game.training?.selectedRulesetId) {
    return { error: 'Training round cannot start right now' };
  }

  clearGameTimer(game);
  clearPendingBotAction(game);
  clearRoundAutoContinue(game);

  game.phase = 'choosing_nv';
  game.chooserId = game.training.humanUserId || getTrainingHumanPlayer(game)?.userId || null;
  game.activeRulesetId = game.training.selectedRulesetId;
  game.nvSelected = false;
  game.currentTrick = [];
  game.trickSuit = null;
  game.trickPending = false;
  game.handsReady = createEmptyHandsByPlayer(game);
  game.startingHandSize = 0;
  game.collectedHands = [];
  game.collectedByPlayer = createEmptyCollectedByPlayer(game);

  if (!game.nvAllowed) {
    return startTrainingRoundGameplay(io, roomId, game, {
      announce,
      nvSelected: false
    });
  }

  emitChoiceState(io, roomId, game, {
    cardCounts: buildCardCounts(game),
    playerPoints: buildPointTotals(game)
  });
  return { success: true };
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

function applyCompetitiveStateToMember(member, result) {
  if (!member || !result) {
    return;
  }

  member.elo = result.nextElo;
  member.rankName = result.rankName;
  member.rankTierKey = result.rankTierKey;
}

async function applyCompletedGameEloUpdates(io, roomId, game, standings) {
  if (!game) {
    return {
      applied: false,
      reason: 'missing-game',
      results: []
    };
  }

  if (isTrainingMatch(game)) {
    game.lastEloResults = [];
    game.lastEloDeltaByUserId = {};
    return {
      applied: false,
      reason: 'training-match',
      results: []
    };
  }

  if (game.eloUpdateStatus === 'applied') {
    return {
      applied: Array.isArray(game.lastEloResults) && game.lastEloResults.length > 0,
      reason: game.lastEloResults?.length ? null : 'already-processed',
      results: game.lastEloResults || []
    };
  }

  if (game.eloUpdateStatus === 'pending' && game.eloUpdatePromise) {
    return game.eloUpdatePromise;
  }

  game.eloUpdateStatus = 'pending';
  game.eloUpdatePromise = (async () => {
    const ratedPlayers = game.players.filter((player) => !player.guest && !player.isBot && player.userId);

    if (ratedPlayers.length < 2) {
      game.lastEloResults = [];
      game.lastEloDeltaByUserId = {};
      return {
        applied: false,
        reason: 'not-enough-rated-players',
        results: []
      };
    }

    const persistedUsers = await User.find({ _id: { $in: ratedPlayers.map((player) => player.userId) } });
    const usersById = new Map(persistedUsers.map((user) => [String(user._id), user]));
    const participants = ratedPlayers
      .map((player) => usersById.get(String(player.userId)))
      .filter(Boolean)
      .map((user) => ({
        userId: String(user._id),
        elo: user.elo
      }));

    if (participants.length < 2) {
      game.lastEloResults = [];
      game.lastEloDeltaByUserId = {};
      return {
        applied: false,
        reason: 'not-enough-existing-accounts',
        results: []
      };
    }

    const calculation = calculateMultiplayerEloChanges(participants, standings);
    if (!calculation.applied || calculation.results.length === 0) {
      game.lastEloResults = [];
      game.lastEloDeltaByUserId = {};
      return {
        applied: false,
        reason: calculation.reason || 'no-results',
        results: []
      };
    }

    const resultsByUserId = new Map(calculation.results.map((result) => [result.userId, result]));

    await User.bulkWrite(
      calculation.results.map((result) => ({
        updateOne: {
          filter: { _id: result.userId },
          update: { $set: { elo: result.nextElo } }
        }
      }))
    );

    game.lastEloResults = calculation.results;
    game.lastEloDeltaByUserId = calculation.results.reduce((acc, result) => {
      acc[result.userId] = result.delta;
      return acc;
    }, {});

    game.players.forEach((player) => {
      applyCompetitiveStateToMember(player, resultsByUserId.get(String(player.userId)));
    });

    const lobby = lobbies.get(roomId);
    if (lobby) {
      lobby.players.forEach((member) => {
        applyCompetitiveStateToMember(member, resultsByUserId.get(String(member.userId)));
      });
      lobby.spectators.forEach((member) => {
        applyCompetitiveStateToMember(member, resultsByUserId.get(String(member.userId)));
      });
      emitLobbyUpdate(io, roomId, lobby);
    }

    await Promise.all(
      calculation.results.map(async (result) => {
        const persistedUser = usersById.get(result.userId);
        if (!persistedUser) {
          return;
        }

        persistedUser.elo = result.nextElo;
        await emitFriendStateUpdate(io, persistedUser);
      })
    );

    return {
      applied: true,
      reason: null,
      results: calculation.results
    };
  })()
    .catch((error) => {
      console.error(`Failed to apply ELO updates for room ${roomId}:`, error);
      game.lastEloResults = [];
      game.lastEloDeltaByUserId = {};
      return {
        applied: false,
        reason: 'elo-update-failed',
        results: []
      };
    })
    .finally(() => {
      game.eloUpdateStatus = 'applied';
      game.eloUpdatePromise = null;
    });

  return game.eloUpdatePromise;
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

function buildNumberedStandings(game) {
  return buildStandings(game).map((standing, index) => ({
    ...standing,
    finalRank: index + 1
  }));
}

async function persistCompletedMatchHistory(game, standings) {
  if (!game) {
    return null;
  }

  if (isTrainingMatch(game)) {
    return null;
  }

  if (game.matchHistoryStatus === 'applied') {
    return game.lastMatchHistory || null;
  }

  if (game.matchHistoryStatus === 'pending' && game.matchHistoryPromise) {
    return game.matchHistoryPromise;
  }

  game.matchHistoryStatus = 'pending';
  game.matchHistoryPromise = createMatchHistoryOnce({
    game,
    standings,
    savedGameId: game.sourceSavedGameId || null
  })
    .catch((error) => {
      console.error(`Failed to write match history for ${game.matchKey}:`, error);
      return null;
    })
    .finally(() => {
      game.matchHistoryStatus = 'applied';
      game.matchHistoryPromise = null;
    });

  game.lastMatchHistory = await game.matchHistoryPromise;
  return game.lastMatchHistory;
}

function scheduleRoundAutoContinueIfNeeded(io, roomId, game) {
  if (!game || game.phase !== 'round_stats' || !game.hostId) {
    return false;
  }

  const remainingHumanPlayers = game.players.filter((player) => !player.guest && !player.isBot);
  if (remainingHumanPlayers.length > 0) {
    return false;
  }

  if (game.roundContinueTimeoutId) {
    clearTimeout(game.roundContinueTimeoutId);
  }

  game.roundContinueTimeoutId = setTimeout(() => {
    game.roundContinueTimeoutId = null;
    if (game.phase === 'round_stats') {
      continueAfterRound(io, roomId, game);
    }
  }, BOT_ACTION_DELAY_MS);
  game.roundContinueTimeoutId.unref?.();
  return true;
}

function clearRoundAutoContinue(game) {
  if (game?.roundContinueTimeoutId) {
    clearTimeout(game.roundContinueTimeoutId);
    game.roundContinueTimeoutId = null;
  }
}

function closeLiveGameSession(io, roomId, lobby, {
  reason = 'The match ended.',
  savedGame = null
} = {}) {
  const currentLobby = lobby || lobbies.get(roomId);
  const game = activeGames.get(roomId);

  if (game) {
    clearGameTimer(game);
    clearPendingBotAction(game);
    clearRoundAutoContinue(game);
    activeGames.delete(roomId);
  }

  if (!currentLobby) {
    return;
  }

  io.to(roomId).emit('live_game_session_closed', {
    roomId,
    reason,
    savedGame: savedGame ? serializeSavedGameForLibrary(savedGame) : null
  });

  getAllLobbyMembers(currentLobby).forEach((member) => {
    if (!isBotPlayer(member)) {
      io.sockets.sockets.get(member.socketId)?.leave(roomId);
    }
  });

  lobbies.delete(roomId);
}

async function finishBigGame(io, roomId, game) {
  if (!game || game.gameFinishInProgress || game.gameFinishedEventSent) {
    return;
  }

  game.gameFinishInProgress = true;
  try {
    clearGameTimer(game);
    clearPendingBotAction(game);
    clearRoundAutoContinue(game);
    game.players.forEach((player) => {
      clearPendingGameAbandonment(roomId, player.userId);
    });
    game.status = 'finished';
    game.phase = 'finished';

    if (isTrainingMatch(game)) {
      game.training.finalReview = await generateTrainerFinalReview({
        training: game.training,
        feedbackEntries: game.training.feedbackEntries || [],
        roundSummaries: game.training.roundSummaries || [],
        humanPlayer: getTrainingHumanPlayer(game),
        trainerPlayer: getTrainerPlayer(game)
      });
    }

    await applyCompletedGameEloUpdates(io, roomId, game, buildStandings(game));

    const standings = buildNumberedStandings(game);
    await persistCompletedMatchHistory(game, standings);
    if (game.sourceSavedGameId) {
      await SavedGame.updateOne(
        { _id: game.sourceSavedGameId },
        { $set: { status: 'completed', completedAt: new Date() } }
      );
    }
    const gameFinishedVersion = bumpGameStateVersion(game);
    game.gameFinishedEventSent = true;
    const spectatorVisibleHandState = buildSpectatorVisibleHandState(game);

    io.to(roomId).emit('game_finished', {
      winnerId: standings[0]?.userId || null,
      winnerName: standings[0]?.name || 'No winner',
      stateVersion: gameFinishedVersion,
      standings,
      eloResults: game.lastEloResults || [],
      playerPoints: buildPointTotals(game),
      collectedHandsByPlayer: buildCollectedHands(game),
      cardCounts: buildCardCounts(game),
      choiceState: serializeChoiceState(game),
      trainingFinalReview: serializeTrainingFinalReview(game.training?.finalReview),
      spectatorVisibleHand: spectatorVisibleHandState.visibleHand,
      spectatorVisiblePlayerId: spectatorVisibleHandState.visiblePlayerId,
      spectatorVisiblePlayerName: spectatorVisibleHandState.visiblePlayerName
    });
  } finally {
    game.gameFinishInProgress = false;
  }
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
  void scheduleBotActionIfNeeded(io, roomId, game);
}

function beginChooserTurn(io, roomId, game) {
  const nextChooser = findNextChooser(game, game.chooserCursor);
  if (!nextChooser) {
    void finishBigGame(io, roomId, game);
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
    void scheduleBotActionIfNeeded(io, roomId, game);
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
  clearPendingBotAction(game);
  game.nvSelected = Boolean(nvSelected);

  if (isTrainingMatch(game)) {
    return startTrainingRoundGameplay(io, roomId, game, {
      announce: true,
      nvSelected: game.nvSelected
    });
  }

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
  clearPendingBotAction(game);

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
  const spectatorVisibleHandState = buildSpectatorVisibleHandState(game);
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
    spectatorVisibleHand: spectatorVisibleHandState.visibleHand,
    spectatorVisiblePlayerId: spectatorVisibleHandState.visiblePlayerId,
    spectatorVisiblePlayerName: spectatorVisibleHandState.visiblePlayerName,
    roundNumber: game.roundNumber
  });

  void scheduleBotActionIfNeeded(io, roomId, game);

  return { success: true };
}

function finishSmallGameRound(io, roomId, game) {
  clearGameTimer(game);
  clearRoundAutoContinue(game);
  game.phase = 'round_stats';
  const roundStats = finalizeRoundStats(game);
  game.lastRoundStats = roundStats;
  if (isTrainingMatch(game)) {
    const roundSummary = buildTrainingRoundSummary(game, roundStats);
    if (roundSummary) {
      game.training.roundSummaries = Array.isArray(game.training.roundSummaries)
        ? game.training.roundSummaries
        : [];
      game.training.roundSummaries.push(roundSummary);
    }
  }
  const spectatorVisibleHandState = buildSpectatorVisibleHandState(game);

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
    cardCounts: buildCardCounts(game),
    spectatorVisibleHand: spectatorVisibleHandState.visibleHand,
    spectatorVisiblePlayerId: spectatorVisibleHandState.visiblePlayerId,
    spectatorVisiblePlayerName: spectatorVisibleHandState.visiblePlayerName
  });

  if (matchComplete) {
    void finishBigGame(io, roomId, game);
    return;
  }

  scheduleRoundAutoContinueIfNeeded(io, roomId, game);
}

function continueAfterRound(io, roomId, game) {
  if (!game || game.phase !== 'round_stats') {
    return { error: 'No round stats are waiting' };
  }

  clearPendingBotAction(game);
  clearRoundAutoContinue(game);

  if (isTrainingMatch(game)) {
    if (isTrainingRoundLimitReached(game)) {
      void finishBigGame(io, roomId, game);
      return { success: true };
    }

    return startTrainingRound(io, roomId, game);
  }

  game.chooserCursor = (game.chooserCursor + 1) % Math.max(game.chooserOrder.length, 1);
  return beginChooserTurn(io, roomId, game)
    ? { success: true }
    : { error: 'No available games remain' };
}

async function endGameFromStats(io, roomId, game) {
  const lobby = lobbies.get(roomId);
  if (!game || !lobby || game.phase !== 'round_stats') {
    return { error: 'The game can only be ended from round stats' };
  }

  await finishBigGame(io, roomId, game);
  closeLiveGameSession(io, roomId, lobby, {
    reason: 'The host ended the match.'
  });
  return { success: true };
}

async function saveAndQuitGame(io, roomId, game, ownerUserId) {
  const lobby = lobbies.get(roomId);
  if (!game || !lobby || game.phase !== 'round_stats') {
    return { error: 'Save & Quit is only available from round stats' };
  }

  if (isTrainingMatch(game)) {
    return { error: 'Save & Quit is disabled for training matches' };
  }

  if (game.saveGameStatus === 'pending' && game.saveGamePromise) {
    return game.saveGamePromise;
  }

  game.saveGameStatus = 'pending';
  game.saveGamePromise = (async () => {
    const savedGame = await createSavedGameDocument({
      ownerUserId,
      roomId,
      lobby,
      game
    });

    game.saveGameStatus = 'applied';
    game.savedGameId = String(savedGame._id);

    emitGameActivity(io, roomId, `${getUserDisplayName(lobby.players.find((player) => player.userId === ownerUserId) || { name: 'Host' })} saved the game and closed the live table.`, {
      tone: 'info'
    });
    closeLiveGameSession(io, roomId, lobby, {
      reason: 'The host saved this game and closed the live table.',
      savedGame
    });

    return {
      success: true,
      savedGame: serializeSavedGameForLibrary(savedGame)
    };
  })().catch((error) => {
    game.saveGameStatus = 'idle';
    console.error(`Failed to save game for room ${roomId}:`, error);
    return { error: 'Failed to save the current game' };
  }).finally(() => {
    game.saveGamePromise = null;
  });

  return game.saveGamePromise;
}

function cloneStateSnapshot(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function applyLiveUserIdentityToGamePlayer(gamePlayer, user, socketId) {
  if (!gamePlayer || !user) {
    return;
  }

  gamePlayer.socketId = socketId || gamePlayer.socketId;
  gamePlayer.name = getUserDisplayName(user);
  gamePlayer.displayName = getUserDisplayName(user);
  gamePlayer.guest = Boolean(user.guest);
  gamePlayer.avatarUrl = getAvatarSource(user) || gamePlayer.avatarUrl || DEFAULT_PROFILE_PICTURE_PATH;
  gamePlayer.banner = user.banner || gamePlayer.banner || '';
  gamePlayer.description = user.description || gamePlayer.description || '';
  gamePlayer.accountCreatedAt = user.accountCreatedAt || gamePlayer.accountCreatedAt || null;
  gamePlayer.elo = typeof user.elo === 'number' ? user.elo : (gamePlayer.elo ?? null);
  gamePlayer.rankName = user.rankName || gamePlayer.rankName || null;
  gamePlayer.rankTierKey = user.rankTierKey || gamePlayer.rankTierKey || null;
  gamePlayer.isBot = Boolean(user.isBot ?? gamePlayer.isBot);
  setSeatConnectionState(gamePlayer, 'connected');
}

function convertSavedGuestPlayersToBots(roomId, lobby, game) {
  if (!lobby || !game) {
    return;
  }

  game.players.forEach((player, index) => {
    if (!player?.guest || isBotPlayer(player)) {
      return;
    }

    const displacedPlayer = {
      ...player,
      name: player.displayName || player.name || `Guest ${index + 1}`
    };
    const botIdentity = buildBotIdentity({
      roomId,
      seatIndex: displacedPlayer.seatIndex ?? index,
      players: game.players,
      replacementFor: displacedPlayer
    });
    const replacementBot = {
      ...displacedPlayer,
      ...botIdentity,
      seatIndex: displacedPlayer.seatIndex ?? index,
      joinOrder: displacedPlayer.joinOrder,
      role: 'player',
      isReady: true,
      guest: false,
      replacementReason: 'saved-game-guest-resume'
    };

    game.players[index] = replacementBot;
    migrateGameSeatIdentity(game, displacedPlayer.userId, replacementBot.userId);

    const lobbyPlayerIndex = lobby.players.findIndex((member) => member.userId === displacedPlayer.userId);
    if (lobbyPlayerIndex !== -1) {
      const existingPermissions = lobby.rulesetPermissions?.[displacedPlayer.userId]
        || createDefaultPermissionsForPlayer(lobby.customRulesets);
      lobby.players[lobbyPlayerIndex] = {
        ...replacementBot,
        role: 'player',
        isReady: true
      };
      delete lobby.rulesetPermissions[displacedPlayer.userId];
      lobby.rulesetPermissions[replacementBot.userId] = existingPermissions;
    }
  });

  syncGameSeatIndexes(game);
  syncLobbySeatIndexes(lobby);
  ensureRulesetPermissionsForPlayers(lobby);
}

async function resumeSavedGameSession(io, socket, user, savedGameId) {
  if (!user || user.guest) {
    return { error: 'Only logged-in accounts can resume saved games' };
  }

  const normalizedSavedGameId = String(savedGameId || '').trim();
  if (!normalizedSavedGameId || !/^[a-f\d]{24}$/i.test(normalizedSavedGameId)) {
    return { error: 'Saved game not found' };
  }

  const currentRoom = findCurrentRoomForUser(user);
  if (currentRoom) {
    return { error: 'Leave your current room before resuming another saved game' };
  }

  const savedGame = await SavedGame.findOne({
    _id: normalizedSavedGameId,
    ownerUserId: user.userId,
    status: 'saved'
  }).lean();

  if (!savedGame) {
    return { error: 'Saved game not found or is no longer resumable' };
  }

  let roomId = randomFriendCode();
  while (lobbies.has(roomId)) {
    roomId = randomFriendCode();
  }

  const snapshot = cloneStateSnapshot(savedGame.snapshot || {});
  const lobbyPlayers = (Array.isArray(snapshot.players) ? snapshot.players : []).map((player) => createLobbyMember({
    ...player,
    name: player.displayName || player.name
  }, player.socketId || `${player.userId || 'player'}:saved`, {
    isReady: true,
    role: 'player'
  }));
  const lobbySpectators = (Array.isArray(snapshot.spectators) ? snapshot.spectators : [])
    .filter((spectator) => !spectator?.guest)
    .map((spectator) => createLobbyMember({
      ...spectator,
      name: spectator.displayName || spectator.name
    }, spectator.socketId || `${spectator.userId || 'spectator'}:saved`, {
      isReady: false,
      role: 'spectator'
    }));
  const lobby = {
    roomId,
    roomName: snapshot.roomName || savedGame.roomName || sanitizeRoomName(null, user),
    visibility: sanitizeRoomVisibility(snapshot.visibility),
    hostId: snapshot.hostId || user.userId,
    players: lobbyPlayers,
    spectators: lobbySpectators,
    rulesetId: snapshot.rulesetId || null,
    customRulesets: cloneStateSnapshot(snapshot.customRulesets || []) || [],
    selectedRulesets: sanitizeRulesetSelections(snapshot.selectedRulesets, snapshot.customRulesets),
    rulesetPermissions: sanitizeRulesetPermissions(
      snapshot.rulesetPermissions,
      lobbyPlayers,
      snapshot.selectedRulesets,
      snapshot.customRulesets
    ),
    nvAllowed: snapshot.nvAllowed !== false,
    autoBotReplacementEnabled: snapshot.autoBotReplacementEnabled !== false,
    useTurnTimer: snapshot.useTurnTimer !== false,
    turnTimerSeconds: sanitizeTurnTimerSeconds(snapshot.turnTimerSeconds),
    bannedUserIds: Array.isArray(snapshot.bannedUserIds) ? [...snapshot.bannedUserIds] : [],
    mutedChatUserIds: normalizeMutedChatUserIds(snapshot.mutedChatUserIds),
    chatMessages: [],
    status: 'playing'
  };

  syncLobbySeatIndexes(lobby);
  const game = {
    roomId,
    roomName: lobby.roomName,
    hostId: lobby.hostId,
    rulesetId: lobby.rulesetId,
    customRulesets: cloneStateSnapshot(snapshot.customRulesets || []) || [],
    selectedRulesets: sanitizeRulesetSelections(snapshot.selectedRulesets, snapshot.customRulesets),
    rulesetPermissions: sanitizeRulesetPermissions(
      snapshot.rulesetPermissions,
      lobby.players,
      snapshot.selectedRulesets,
      snapshot.customRulesets
    ),
    nvAllowed: lobby.nvAllowed,
    autoBotReplacementEnabled: lobby.autoBotReplacementEnabled,
    useTurnTimer: lobby.useTurnTimer,
    turnTimerSeconds: lobby.turnTimerSeconds,
    players: lobby.players.map((player) => ({
      ...cloneStateSnapshot(player),
      name: player.displayName || player.name
    })),
    status: 'playing',
    phase: snapshot.phase || 'round_stats',
    chooserOrder: cloneStateSnapshot(snapshot.chooserOrder || []) || [],
    chooserCursor: Number(snapshot.chooserCursor || 0),
    chooserId: snapshot.chooserId || null,
    usedChoices: cloneStateSnapshot(snapshot.usedChoices || {}) || {},
    activeRulesetId: snapshot.activeRulesetId || null,
    nvSelected: Boolean(snapshot.nvSelected),
    roundNumber: Number(snapshot.roundNumber || 0),
    handsReady: cloneStateSnapshot(snapshot.handsReady || {}) || {},
    stateVersion: Number(snapshot.stateVersion || 0),
    turnIndex: Number(snapshot.turnIndex || 0),
    trickPending: Boolean(snapshot.trickPending),
    currentTrick: cloneStateSnapshot(snapshot.currentTrick || []) || [],
    trickSuit: snapshot.trickSuit || null,
    collectedHands: cloneStateSnapshot(snapshot.collectedHands || []) || [],
    pointsByPlayer: cloneStateSnapshot(snapshot.pointsByPlayer || {}) || {},
    collectedByPlayer: cloneStateSnapshot(snapshot.collectedByPlayer || {}) || {},
    chatMessages: cloneStateSnapshot(snapshot.chatMessages || []) || [],
    roundStats: cloneStateSnapshot(snapshot.roundStats || null),
    lastRoundStats: cloneStateSnapshot(snapshot.lastRoundStats || null),
    lastEloResults: [],
    lastEloDeltaByUserId: {},
    eloUpdateStatus: 'idle',
    eloUpdatePromise: null,
    matchKey: snapshot.matchKey || `${roomId}:${Date.now().toString(36)}:${randomFriendCode().toLowerCase()}`,
    sourceSavedGameId: savedGame._id,
    gameFinishedEventSent: false,
    botActionTimeoutId: null,
    pendingBotActionKey: null,
    roundContinueTimeoutId: null,
    abandonedPlayers: cloneStateSnapshot(snapshot.abandonedPlayers || {}) || {},
    timerId: null,
    timerDeadline: null,
    matchHistoryStatus: 'idle',
    matchHistoryPromise: null,
    lastMatchHistory: null,
    saveGameStatus: 'idle',
    saveGamePromise: null,
    savedGameId: null
  };

  convertSavedGuestPlayersToBots(roomId, lobby, game);

  const hostMember = lobby.players.find((player) => player.userId === lobby.hostId)
    || lobby.spectators.find((spectator) => spectator.userId === lobby.hostId);
  if (!hostMember) {
    lobby.hostId = getNextHostId(lobby) || user.userId;
    game.hostId = lobby.hostId;
  }

  const ownerMember = lobby.players.find((player) => player.userId === user.userId)
    || lobby.spectators.find((spectator) => spectator.userId === user.userId);
  if (!ownerMember) {
    return { error: 'The saved game owner is no longer part of that game state' };
  }

  const resumeWrite = await SavedGame.updateOne(
    { _id: savedGame._id, status: 'saved' },
    { $set: { status: 'resumed', resumedAt: new Date() } }
  );
  if (!resumeWrite.matchedCount) {
    return { error: 'Saved game is no longer resumable' };
  }

  socket.join(roomId);
  updateLobbyMemberSocket(lobby, user, socket.id);
  const ownerGamePlayer = game.players.find((player) => player.userId === user.userId);
  applyLiveUserIdentityToGamePlayer(ownerGamePlayer, user, socket.id);
  game.hostId = lobby.hostId;
  if (lobby.hostId === user.userId) {
    game.hostId = user.userId;
  }

  game.startingHandSize = Math.max(
    0,
    ...game.players.map((player) => (game.handsReady[player.userId] || []).length)
  );

  lobbies.set(roomId, lobby);
  activeGames.set(roomId, game);

  emitLobbyUpdate(io, roomId, lobby, `${getUserDisplayName(user)} resumed a saved game.`);

  game.players.forEach((player) => {
    if (player.userId === user.userId || player.isBot) {
      return;
    }

    const member = lobby.players.find((entry) => entry.userId === player.userId);
    if (member) {
      scheduleGameAbandonment(io, roomId, lobby, member, player);
    }
  });

  if (game.phase === 'round_stats') {
    scheduleRoundAutoContinueIfNeeded(io, roomId, game);
  } else {
    void scheduleBotActionIfNeeded(io, roomId, game);
  }

  return {
    success: true,
    roomId,
    lobby: serializeLobby(lobby),
    game: buildGameSessionSnapshot(roomId, game, user.userId, {
      isSpectator: ownerMember.role === 'spectator'
    })
  };
}

async function createTrainingMatchSession(io, socket, user, trainingSettings) {
  if (!io || !socket || !user?.userId) {
    return { error: 'Not authenticated' };
  }

  const currentRoom = findCurrentRoomForUser(user);
  if (currentRoom) {
    return { error: 'Leave your current room before starting training' };
  }

  const validatedSettings = await validateTrainingSettings(trainingSettings, user);
  if (validatedSettings.error) {
    return validatedSettings;
  }

  let roomId = `TRN${randomFriendCode().slice(0, 3)}`;
  while (lobbies.has(roomId)) {
    roomId = `TRN${randomFriendCode().slice(0, 3)}`;
  }

  const selectedRulesets = Object.keys(sanitizeRulesetSelections({}, validatedSettings.customRulesets)).reduce((acc, ruleId) => {
    acc[ruleId] = ruleId === validatedSettings.selectedRulesetId;
    return acc;
  }, {});
  const hostMember = createLobbyMember(user, socket.id, {
    isReady: true,
    role: 'player'
  });
  const training = {
    enabled: true,
    humanUserId: user.userId,
    trainerUserId: '',
    trainerElo: validatedSettings.trainerElo,
    trainerRankName: buildBotIdentity({
      roomId,
      seatIndex: 1,
      players: [hostMember],
      botType: BOT_TYPE_TRAINER,
      fixedElo: validatedSettings.trainerElo
    }).rankName,
    totalRounds: validatedSettings.totalRounds,
    playerCount: validatedSettings.playerCount,
    regularBotCount: validatedSettings.regularBotCount,
    selectedRulesetId: validatedSettings.selectedRulesetId,
    selectedRulesetLabel: validatedSettings.selectedRulesetLabel,
    selectedRulesetSource: validatedSettings.selectedRulesetSource,
    preMoveCommentaryEnabled: validatedSettings.preMoveCommentaryEnabled,
    postMoveFeedbackEnabled: validatedSettings.postMoveFeedbackEnabled,
    feedbackEntries: [],
    roundSummaries: [],
    finalReview: null
  };
  const lobby = {
    roomId,
    roomName: `${getUserDisplayName(user)} Training`,
    visibility: 'private',
    matchMode: TRAINING_MATCH_MODE,
    training,
    hostId: user.userId,
    players: [hostMember],
    spectators: [],
    rulesetId: null,
    customRulesets: validatedSettings.customRulesets.map((definition) => ({ ...definition })),
    selectedRulesets,
    rulesetPermissions: {
      [user.userId]: createDefaultPermissionsForPlayer(validatedSettings.customRulesets)
    },
    nvAllowed: true,
    autoBotReplacementEnabled: true,
    useTurnTimer: true,
    turnTimerSeconds: DEFAULT_TURN_TIMER_SECONDS,
    bannedUserIds: [],
    mutedChatUserIds: [],
    chatMessages: [],
    status: 'playing'
  };

  const trainerMember = createBotLobbyMember(lobby, {
    botType: BOT_TYPE_TRAINER,
    fixedElo: validatedSettings.trainerElo,
    displayName: 'Trainer',
    description: 'Training-focused Rentz AI bot.',
    trainerSettings: {
      preMoveCommentaryEnabled: validatedSettings.preMoveCommentaryEnabled,
      postMoveFeedbackEnabled: validatedSettings.postMoveFeedbackEnabled
    }
  });
  lobby.players.push(trainerMember);
  for (let index = 0; index < validatedSettings.regularBotCount; index += 1) {
    lobby.players.push(createBotLobbyMember(lobby));
  }
  syncLobbySeatIndexes(lobby);
  ensureRulesetPermissionsForPlayers(lobby);

  training.trainerUserId = trainerMember.userId;
  training.trainerRankName = trainerMember.rankName;
  lobby.training = training;
  lobby.rulesetPermissions = lobby.players.reduce((acc, player) => {
    acc[player.userId] = Object.keys(selectedRulesets).reduce((ruleAcc, ruleId) => {
      ruleAcc[ruleId] = selectedRulesets[ruleId] === true;
      return ruleAcc;
    }, {});
    return acc;
  }, {});

  const game = buildGameStateFromLobby(lobby, {
    matchMode: TRAINING_MATCH_MODE,
    training
  });
  game.chooserOrder = [user.userId];
  game.training = training;

  socket.join(roomId);
  lobbies.set(roomId, lobby);
  activeGames.set(roomId, game);

  emitGameStartedToMembers(io, roomId, lobby, game);
  startTrainingRound(io, roomId, game);

  return {
    success: true,
    roomId,
    assignedRole: 'player',
    lobby: serializeLobby(lobby),
    game: buildGameSessionSnapshot(roomId, game, user.userId)
  };
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

function leaveSpectatingDuringActiveGame(io, roomId, lobby, user) {
  const spectator = removeActiveSpectatorFromLobby(lobby, user.userId);
  if (!spectator) {
    return { error: 'You are not spectating this match' };
  }

  removeSocketMemberFromRoom(io, roomId, spectator, 'You stopped spectating this game.');
  emitLobbyUpdate(io, roomId, lobby);
  emitGameActivity(io, roomId, `${getUserDisplayName(spectator)} left spectating.`, {
    tone: 'info'
  });

  return {
    success: true,
    message: 'You stopped spectating this game.'
  };
}

function endTrainingMatchFromDeparture(io, roomId, lobby, game, member, {
  reason = 'The training session ended.',
  message = 'The training session ended.'
} = {}) {
  if (!lobby || !game || !member || !isTrainingMatch(game)) {
    return { error: 'Training session not found' };
  }

  clearPendingGameAbandonment(roomId, member.userId);
  closeLiveGameSession(io, roomId, lobby, { reason });
  return {
    success: true,
    message
  };
}

function abandonActiveMatch(io, roomId, lobby, game, member) {
  const gamePlayer = game?.players.find((player) => player.userId === member?.userId);
  if (!lobby || !game || !member || !gamePlayer || isBotPlayer(gamePlayer)) {
    return { error: 'You are not an active player in this match' };
  }

  if (isTrainingMatch(game)) {
    return endTrainingMatchFromDeparture(io, roomId, lobby, game, member, {
      reason: `${getUserDisplayName(member)} ended the training session.`,
      message: 'Training session ended.'
    });
  }

  emitGameActivity(io, roomId, `${getUserDisplayName(member)} abandoned the match.`, {
    tone: 'warning'
  });

  const result = markPlayerAbandonedDuringGame(io, roomId, game, member.userId, {
    forceReplacement: true,
    replacementMessage: `${getUserDisplayName(member)} was replaced by a bot.`
  });

  removeSocketMemberFromRoom(io, roomId, member, 'You abandoned the current match.');
  return {
    success: true,
    ...result,
    message: 'You abandoned the current match.'
  };
}

function banMemberFromActiveGame(io, roomId, lobby, game, targetUserId) {
  const targetPlayer = lobby.players.find((player) => player.userId === targetUserId);
  const targetSpectator = lobby.spectators.find((spectator) => spectator.userId === targetUserId);
  const targetMember = targetPlayer || targetSpectator;

  if (!targetMember) {
    return { error: 'Target player not found' };
  }

  if (!lobby.bannedUserIds.includes(targetUserId)) {
    lobby.bannedUserIds.push(targetUserId);
  }

  if (targetSpectator) {
    removeActiveSpectatorFromLobby(lobby, targetUserId);
    removeSocketMemberFromRoom(io, roomId, targetSpectator, 'You were banned from the current game.');
    emitLobbyUpdate(io, roomId, lobby);
    emitGameActivity(io, roomId, `${getUserDisplayName(targetSpectator)} was banned from spectating.`, {
      tone: 'warning'
    });
    return { success: true, target: targetSpectator };
  }

  emitGameActivity(io, roomId, `${getUserDisplayName(targetPlayer)} was banned from the current game.`, {
    tone: 'warning'
  });
  const result = markPlayerAbandonedDuringGame(io, roomId, game, targetUserId, {
    forceReplacement: true,
    replacementMessage: `${getUserDisplayName(targetPlayer)} was replaced by a bot.`
  });
  removeSocketMemberFromRoom(io, roomId, targetPlayer, 'You were banned from the current game.');
  return {
    success: true,
    target: targetPlayer,
    ...result
  };
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
    const game = activeGames.get(roomId);
    const gamePlayer = game?.players.find((player) => player.userId === user.userId);
    if (game && gamePlayer) {
      if (isTrainingMatch(game) && !isBotPlayer(gamePlayer)) {
        return endTrainingMatchFromDeparture(io, roomId, lobby, game, member, {
          reason: `${getUserDisplayName(member)} left the training session.`,
          message: 'Training session ended.'
        });
      }

      scheduleGameAbandonment(io, roomId, lobby, member, gamePlayer);
    } else {
      setSeatConnectionState(member, 'reconnecting');
      emitLobbyUpdate(io, roomId, lobby);
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
  setSeatConnectionState(member, 'reconnecting');

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

  const currentRuleset = getRulesetDefinitionById(game.activeRulesetId, game.customRulesets);
  const currentTrickBeforeMove = [...(game.currentTrick || [])];
  const trainerFeedbackContext = isTrainingMatch(game) && !isBotPlayer(game.players[pIndex])
    ? {
      humanPlayer: game.players[pIndex],
      playedCard: card,
      legalMoves: getLegalCardsForPlayer(game, playerId).map((legalCard) => ({
        id: legalCard,
        card: legalCard,
        label: formatCardMoveLabel(legalCard)
      })),
      ruleset: currentRuleset,
      currentTrickBeforeMove
    }
    : null;

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
  clearPendingBotAction(game);

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
  const spectatorVisibleHandState = buildSpectatorVisibleHandState(game);

  io.to(roomId).emit('game_update', {
    currentTrick: game.currentTrick,
    turnIndex: game.turnIndex,
    trickSuit: game.trickSuit,
    stateVersion: gameUpdateVersion,
    cardCounts: buildCardCounts(game),
    choiceState: serializeChoiceState(game),
    spectatorVisibleHand: spectatorVisibleHandState.visibleHand,
    spectatorVisiblePlayerId: spectatorVisibleHandState.visiblePlayerId,
    spectatorVisiblePlayerName: spectatorVisibleHandState.visiblePlayerName,
    timerDeadline: game.timerDeadline
  });

  io.to(player.socketId).emit('hand_update', game.handsReady[playerId]);

  if (trainerFeedbackContext) {
    maybeSendTrainerMoveFeedback(io, roomId, game, trainerFeedbackContext);
  }

  if (!trickComplete) {
    void scheduleBotActionIfNeeded(io, roomId, game);
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
  const nextSpectatorVisibleHandState = buildSpectatorVisibleHandState(game);

  io.to(roomId).emit('trick_won', {
    winnerName: winningPlay.playerName,
    winnerId: winningPlay.playedBy,
    trickSuit: game.trickSuit,
    scoreDelta: ruleResolution.scoreDelta,
    stateVersion: trickWonVersion,
    playerPoints: buildPointTotals(game),
    collectedHandsByPlayer: buildCollectedHands(game),
    cardCounts: buildCardCounts(game),
    choiceState: serializeChoiceState(game),
    spectatorVisibleHand: nextSpectatorVisibleHandState.visibleHand,
    spectatorVisiblePlayerId: nextSpectatorVisibleHandState.visiblePlayerId,
    spectatorVisiblePlayerName: nextSpectatorVisibleHandState.visiblePlayerName
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
    const nextSpectatorVisibleHandState = buildSpectatorVisibleHandState(game);

    io.to(roomId).emit('trick_end', {
      nextTurnIndex: game.turnIndex,
      collectedHandsCount: game.collectedHands.length,
      trickSuit: null,
      stateVersion: trickEndVersion,
      playerPoints: buildPointTotals(game),
      collectedHandsByPlayer: buildCollectedHands(game),
      cardCounts: buildCardCounts(game),
      gameFinished: gameShouldFinish,
      choiceState: serializeChoiceState(game),
      spectatorVisibleHand: nextSpectatorVisibleHandState.visibleHand,
      spectatorVisiblePlayerId: nextSpectatorVisibleHandState.visiblePlayerId,
      spectatorVisiblePlayerName: nextSpectatorVisibleHandState.visiblePlayerName
    });

    if (gameShouldFinish) {
      finishSmallGameRound(io, roomId, game);
      return;
    }

    void scheduleBotActionIfNeeded(io, roomId, game);
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
        autoBotReplacementEnabled: DEFAULT_AUTO_BOT_REPLACEMENT_ENABLED,
        useTurnTimer: true,
        turnTimerSeconds: DEFAULT_TURN_TIMER_SECONDS,
        bannedUserIds: [],
        mutedChatUserIds: [],
        chatMessages: [],
        status: 'waiting'
      };
      syncLobbySeatIndexes(lobby);
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
        clearPendingGameAbandonment(normalizedRoomId, user.userId);
        updateLobbyMemberSocket(lobby, user, socket.id);
        const currentGamePlayer = game?.players.find((player) => player.userId === user.userId);
        if (currentGamePlayer) {
          currentGamePlayer.socketId = socket.id;
          setSeatConnectionState(currentGamePlayer, 'connected');
        }
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

    socket.on('send_chat_message', ({ roomId, scope, content } = {}, callback = () => {}) => {
      const user = socketToUser.get(socket.id);
      if (!user) {
        return callback({ error: 'Not authenticated' });
      }

      const normalizedRoomId = String(roomId || '').trim().toUpperCase();
      const normalizedScope = String(scope || '').trim().toLowerCase();
      if (!normalizedRoomId || !CHAT_SCOPES.has(normalizedScope)) {
        return callback({ error: 'Chat target is invalid' });
      }

      const normalizedContent = normalizeChatContent(content);
      if (!normalizedContent) {
        return callback({ error: 'Write a message before sending it' });
      }

      const lobby = lobbies.get(normalizedRoomId);
      if (!lobby) {
        return callback({ error: 'Lobby not found' });
      }

      const member = getMemberByUserId(lobby, user.userId);
      if (!member) {
        return callback({ error: 'You are not in that room' });
      }

      if (isLobbyChatMuted(lobby, user.userId)) {
        return callback({ error: 'Chat muted by the host for this room right now.' });
      }

      if (normalizedScope === 'game') {
        const game = activeGames.get(normalizedRoomId);
        if (!game) {
          return callback({ error: 'Game chat is not available right now' });
        }

        const message = appendChatMessage(
          game,
          createScopedChatMessage(normalizedRoomId, normalizedScope, user, member, normalizedContent)
        );
        io.to(normalizedRoomId).emit('chat_message', {
          scope: normalizedScope,
          message
        });
        return callback({ success: true, message });
      }

      const message = appendChatMessage(
        lobby,
        createScopedChatMessage(normalizedRoomId, normalizedScope, user, member, normalizedContent)
      );
      io.to(normalizedRoomId).emit('chat_message', {
        scope: normalizedScope,
        message
      });
      callback({ success: true, message });
    });

    socket.on('set_chat_mute', ({ roomId, targetUserId, muted } = {}, callback = () => {}) => {
      const user = socketToUser.get(socket.id);
      if (!user) {
        return callback({ error: 'Not authenticated' });
      }

      const normalizedRoomId = String(roomId || '').trim().toUpperCase();
      const normalizedTargetUserId = String(targetUserId || '').trim();
      if (!normalizedRoomId || !normalizedTargetUserId) {
        return callback({ error: 'Chat mute target is invalid' });
      }

      const lobby = lobbies.get(normalizedRoomId);
      if (!lobby) {
        return callback({ error: 'Lobby not found' });
      }

      const actingMember = getMemberByUserId(lobby, user.userId);
      if (!actingMember) {
        return callback({ error: 'You are not in that room' });
      }

      if (lobby.hostId !== user.userId) {
        return callback({ error: 'Only the host can mute chat' });
      }

      if (normalizedTargetUserId === user.userId) {
        return callback({ error: 'Hosts cannot mute themselves' });
      }

      const targetMember = getMemberByUserId(lobby, normalizedTargetUserId);
      if (!targetMember) {
        return callback({ error: 'Target player not found' });
      }

      const outcome = setLobbyChatMutedState(lobby, normalizedTargetUserId, muted !== false);
      if (outcome.changed) {
        emitLobbyUpdate(
          io,
          normalizedRoomId,
          lobby,
          outcome.muted
            ? `${getUserDisplayName(targetMember)} was muted in chat.`
            : `${getUserDisplayName(targetMember)} was unmuted in chat.`
        );
      } else {
        emitLobbyUpdate(io, normalizedRoomId, lobby);
      }

      callback({
        success: true,
        muted: outcome.muted,
        targetUserId: normalizedTargetUserId,
        lobby: serializeLobby(lobby)
      });
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
      autoBotReplacementEnabled,
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
      lobby.autoBotReplacementEnabled = typeof autoBotReplacementEnabled === 'boolean'
        ? autoBotReplacementEnabled
        : (lobby.autoBotReplacementEnabled ?? DEFAULT_AUTO_BOT_REPLACEMENT_ENABLED);
      lobby.useTurnTimer = typeof useTurnTimer === 'boolean' ? useTurnTimer : (lobby.useTurnTimer ?? true);
      lobby.turnTimerSeconds = sanitizeTurnTimerSeconds(turnTimerSeconds ?? lobby.turnTimerSeconds);
      lobby.selectedRulesets = sanitizeRulesetSelections(selectedRulesets, lobby.customRulesets);
      lobby.rulesetPermissions = sanitizeRulesetPermissions(rulesetPermissions, lobby.players, lobby.selectedRulesets, lobby.customRulesets);
      emitLobbyUpdate(io, roomId, lobby);
      callback({ success: true, lobby: serializeLobby(lobby) });
    });

    socket.on('add_bot_to_lobby', ({ roomId }, callback = () => {}) => {
      const lobby = lobbies.get(roomId);
      const user = socketToUser.get(socket.id);

      if (!lobby) return callback({ error: 'Lobby not found' });
      if (!user) return callback({ error: 'Not authenticated' });
      if (lobby.status !== 'waiting') return callback({ error: 'Bots can only be added before the match starts' });
      if (lobby.hostId !== user.userId) return callback({ error: 'Only the host can add bots' });

      const result = addBotToLobby(lobby);
      if (result.error) {
        return callback({ error: result.error });
      }

      emitLobbyUpdate(io, roomId, lobby);
      callback({
        success: true,
        bot: result.botMember,
        lobby: serializeLobby(lobby)
      });
    });

    socket.on('remove_bot_from_lobby', ({ roomId, targetUserId }, callback = () => {}) => {
      const lobby = lobbies.get(roomId);
      const user = socketToUser.get(socket.id);

      if (!lobby) return callback({ error: 'Lobby not found' });
      if (!user) return callback({ error: 'Not authenticated' });
      if (lobby.status !== 'waiting') return callback({ error: 'Bots can only be removed before the match starts' });
      if (lobby.hostId !== user.userId) return callback({ error: 'Only the host can remove bots' });

      const result = removeBotFromLobby(lobby, targetUserId);
      if (result.error) {
        return callback({ error: result.error });
      }

      emitLobbyUpdate(io, roomId, lobby);
      callback({
        success: true,
        removedBotUserId: result.removedBot.userId,
        lobby: serializeLobby(lobby)
      });
    });

    socket.on('replace_player_with_bot', ({ roomId, targetUserId }, callback = () => {}) => {
      const lobby = lobbies.get(roomId);
      const game = activeGames.get(roomId);
      const user = socketToUser.get(socket.id);

      if (!lobby) return callback({ error: 'Lobby not found' });
      if (!game) return callback({ error: 'Game not found' });
      if (!user) return callback({ error: 'Not authenticated' });
      if (lobby.hostId !== user.userId) return callback({ error: 'Only the host can replace players with bots' });

      const targetPlayer = game.players.find((player) => player.userId === targetUserId);
      if (!targetPlayer || isBotPlayer(targetPlayer)) {
        return callback({ error: 'Target player not found' });
      }

      if ((targetPlayer.connectionStatus || 'connected') !== 'abandoned') {
        return callback({ error: 'Only abandoned players can be replaced manually' });
      }

      const replacement = replaceActivePlayerWithBot(io, roomId, game, targetUserId);
      if (!replacement) {
        return callback({ error: 'Unable to replace that player right now' });
      }

      void scheduleBotActionIfNeeded(io, roomId, game);
      callback({
        success: true,
        lobby: serializeLobby(lobby),
        replacedUserId: targetUserId,
        botUserId: replacement.botPlayer.userId
      });
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
      const game = activeGames.get(roomId);
      const user = socketToUser.get(socket.id);

      if (!lobby) return callback({ error: 'Lobby not found' });
      if (!user) return callback({ error: 'Not authenticated' });
      if (lobby.hostId !== user.userId) return callback({ error: 'Only the host can ban players' });
      if (targetUserId === lobby.hostId) return callback({ error: 'Transfer host before banning yourself' });

      if (lobby.status === 'playing') {
        if (!game) return callback({ error: 'Game not found' });
        const result = banMemberFromActiveGame(io, roomId, lobby, game, targetUserId);
        if (result?.error) {
          return callback({ error: result.error });
        }

        callback({ success: true, lobby: serializeLobby(lobby) });
        return;
      }

      if (lobby.status !== 'waiting') return callback({ error: 'Players can only be banned before the match starts' });

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
    socket.on('start_game', async ({ roomId }, callback = () => {}) => {
      const lobby = lobbies.get(roomId);
      const user = socketToUser.get(socket.id);
      const validationError = getStartGameValidationError(lobby, user);
      if (validationError) {
        return callback({ error: validationError });
      }

      lobby.status = 'playing';
      syncLobbySeatIndexes(lobby);
      ensureRulesetPermissionsForPlayers(lobby);

      const gameState = buildGameStateFromLobby(lobby, {
        matchMode: STANDARD_MATCH_MODE
      });

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

        emitGameStartedToMembers(io, roomId, lobby, gameState);

        beginChooserTurn(io, roomId, gameState);

        callback({ success: true });
      } catch (err) {
        console.error('Failed to create game in DB:', err);
        callback({ error: 'Failed to start game due to DB error' });
      }
    });

    socket.on('start_training_match', async (payload = {}, callback = () => {}) => {
      const user = socketToUser.get(socket.id);
      if (!user) {
        return callback({ error: 'Not authenticated' });
      }

      try {
        callback(await createTrainingMatchSession(io, socket, user, payload));
      } catch (error) {
        console.error('Failed to start training match:', error);
        callback({ error: 'Failed to start the training match right now' });
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

    socket.on('end_game', async ({ roomId }, callback = () => {}) => {
      const game = activeGames.get(roomId);
      const user = socketToUser.get(socket.id);
      if (!game) return callback({ error: 'Game not found' });
      if (!user) return callback({ error: 'Not authenticated' });
      if (game.hostId !== user.userId) return callback({ error: 'Only the host can end the match' });

      const result = await endGameFromStats(io, roomId, game);
      if (result.error) {
        socket.emit('game_error', result.error);
      }
      callback(result);
    });

    socket.on('save_and_quit', async ({ roomId }, callback = () => {}) => {
      const game = activeGames.get(roomId);
      const user = socketToUser.get(socket.id);
      if (!game) return callback({ error: 'Game not found' });
      if (!user) return callback({ error: 'Not authenticated' });
      if (user.guest) return callback({ error: 'Only logged-in hosts can save games to the Library' });
      if (game.hostId !== user.userId) return callback({ error: 'Only the host can save and quit the match' });

      const result = await saveAndQuitGame(io, roomId, game, user.userId);
      if (result.error) {
        socket.emit('game_error', result.error);
      }
      callback(result);
    });

    socket.on('abandon_match', ({ roomId }, callback = () => {}) => {
      const lobby = lobbies.get(roomId);
      const game = activeGames.get(roomId);
      const user = socketToUser.get(socket.id);

      if (!lobby) return callback({ error: 'Lobby not found' });
      if (!game) return callback({ error: 'Game not found' });
      if (!user) return callback({ error: 'Not authenticated' });

      const member = lobby.players.find((player) => player.userId === user.userId);
      if (!member) {
        return callback({ error: 'You are not an active player in this match' });
      }

      const result = abandonActiveMatch(io, roomId, lobby, game, member);
      if (result.error) {
        return callback(result);
      }

      callback(result);
    });

    socket.on('leave_spectating', ({ roomId }, callback = () => {}) => {
      const lobby = lobbies.get(roomId);
      const user = socketToUser.get(socket.id);

      if (!lobby) return callback({ error: 'Lobby not found' });
      if (!user) return callback({ error: 'Not authenticated' });

      const result = leaveSpectatingDuringActiveGame(io, roomId, lobby, user);
      if (result.error) {
        return callback(result);
      }

      callback(result);
    });

    socket.on('resume_saved_game', async ({ savedGameId } = {}, callback = () => {}) => {
      const user = socketToUser.get(socket.id);
      if (!user) return callback({ error: 'Not authenticated' });

      const result = await resumeSavedGameSession(io, socket, user, savedGameId);
      if (result.error) {
        return callback({ error: result.error });
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

          const game = activeGames.get(roomId);
          const gamePlayer = game?.players.find((player) => player.userId === member.userId);

          if (lobby.status === 'waiting') {
            if (user.guest) {
              removeWaitingLobbyMemberOnDisconnect(io, roomId, lobby, member);
            } else {
              scheduleWaitingLobbyDisconnectCleanup(io, roomId, lobby, member, socket.id);
              ensureRulesetPermissionsForPlayers(lobby);
              emitLobbyUpdate(io, roomId, lobby);
            }
          } else if (game && gamePlayer) {
            if (isTrainingMatch(game) && !isBotPlayer(gamePlayer)) {
              endTrainingMatchFromDeparture(io, roomId, lobby, game, member, {
                reason: `${getUserDisplayName(member)} disconnected, so the training session ended.`,
                message: 'Training session ended.'
              });
            } else {
              scheduleGameAbandonment(io, roomId, lobby, member, gamePlayer);
            }
          } else {
            setSeatConnectionState(member, 'reconnecting');
            emitLobbyUpdate(io, roomId, lobby);
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
module.exports.setLobbyChatMutedState = setLobbyChatMutedState;
module.exports.sanitizeRulesetPermissions = sanitizeRulesetPermissions;
module.exports.sanitizeTurnTimerSeconds = sanitizeTurnTimerSeconds;
module.exports.updateCustomRulesetInLobby = updateCustomRulesetInLobby;
module.exports.deleteCustomRulesetFromLobby = deleteCustomRulesetFromLobby;
module.exports.addBotToLobby = addBotToLobby;
module.exports.removeBotFromLobby = removeBotFromLobby;
module.exports.applyCompletedGameEloUpdates = applyCompletedGameEloUpdates;
module.exports.abandonActiveMatch = abandonActiveMatch;
module.exports.createTrainingMatchSession = createTrainingMatchSession;
module.exports.persistCompletedMatchHistory = persistCompletedMatchHistory;
module.exports.setNvChoiceForRound = setNvChoiceForRound;
module.exports.validateTrainingSettings = validateTrainingSettings;

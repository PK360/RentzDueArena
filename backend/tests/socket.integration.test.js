const { io: createClient } = require('socket.io-client');

const { __testHelpers } = require('../socketManager');
const { createTestGuestProfile } = require('./helpers/builders');
const { startSocketTestServer } = require('./helpers/socketTestServer');

const { activeGames } = __testHelpers;

function waitForEvent(socket, eventName, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      socket.off(eventName, handleEvent);
      reject(new Error(`Timed out waiting for socket event '${eventName}'`));
    }, timeoutMs);

    function handleEvent(payload) {
      clearTimeout(timeoutId);
      resolve(payload);
    }

    socket.once(eventName, handleEvent);
  });
}

function emitWithAck(socket, eventName, payload = {}, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Timed out waiting for ack from '${eventName}'`));
    }, timeoutMs);

    socket.emit(eventName, payload, (response) => {
      clearTimeout(timeoutId);
      resolve(response);
    });
  });
}

function connectClient(url) {
  return new Promise((resolve, reject) => {
    const client = createClient(url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false
    });

    client.once('connect', () => resolve(client));
    client.once('connect_error', reject);
  });
}

describe('socket smoke flows', () => {
  let serverHandle;
  const clients = [];

  beforeAll(async () => {
    serverHandle = await startSocketTestServer();
  });

  afterEach(async () => {
    activeGames.clear();
    while (clients.length > 0) {
      const client = clients.pop();
      client.disconnect();
    }
  });

  afterAll(async () => {
    await serverHandle.close();
  });

  test('a second client can join a lobby and the host receives the lobby update', async () => {
    const hostSocket = await connectClient(serverHandle.url);
    const guestSocket = await connectClient(serverHandle.url);
    clients.push(hostSocket, guestSocket);

    const hostProfile = createTestGuestProfile({ userId: 'guest-host', name: 'Host Guest' });
    const guestProfile = createTestGuestProfile({ userId: 'guest-joiner', name: 'Joiner Guest' });

    const hostAuth = await emitWithAck(hostSocket, 'authenticate', hostProfile);
    const guestAuth = await emitWithAck(guestSocket, 'authenticate', guestProfile);
    expect(hostAuth.success).toBe(true);
    expect(guestAuth.success).toBe(true);

    const createResponse = await emitWithAck(hostSocket, 'create_lobby', {});
    expect(createResponse.success).toBe(true);

    const lobbyUpdatePromise = waitForEvent(hostSocket, 'lobby_update');
    const joinResponse = await emitWithAck(guestSocket, 'join_lobby', {
      roomId: createResponse.roomId
    });
    const lobbyUpdate = await lobbyUpdatePromise;

    expect(joinResponse.success).toBe(true);
    expect(joinResponse.roomId).toBe(createResponse.roomId);
    expect(lobbyUpdate.roomId).toBe(createResponse.roomId);
    expect(lobbyUpdate.players).toHaveLength(2);
    expect(lobbyUpdate.players.map((player) => player.userId)).toEqual([
      hostProfile.userId,
      guestProfile.userId
    ]);
  });

  test('play_card emits game updates for a legal move and game_error for an illegal turn', async () => {
    const hostSocket = await connectClient(serverHandle.url);
    const guestSocket = await connectClient(serverHandle.url);
    clients.push(hostSocket, guestSocket);

    const hostProfile = createTestGuestProfile({ userId: 'play-host', name: 'Host Player' });
    const guestProfile = createTestGuestProfile({ userId: 'play-guest', name: 'Guest Player' });

    await emitWithAck(hostSocket, 'authenticate', hostProfile);
    await emitWithAck(guestSocket, 'authenticate', guestProfile);

    const createResponse = await emitWithAck(hostSocket, 'create_lobby', {});
    await emitWithAck(guestSocket, 'join_lobby', { roomId: createResponse.roomId });

    activeGames.set(createResponse.roomId, {
      roomId: createResponse.roomId,
      phase: 'playing_round',
      status: 'playing',
      players: [
        { userId: hostProfile.userId, name: hostProfile.name, socketId: hostSocket.id, isBot: false },
        { userId: guestProfile.userId, name: guestProfile.name, socketId: guestSocket.id, isBot: false }
      ],
      turnIndex: 0,
      currentPlayerId: hostProfile.userId,
      trickPending: false,
      trickSuit: null,
      currentTrick: [],
      handsReady: {
        [hostProfile.userId]: ['A-hearts', '2-clubs'],
        [guestProfile.userId]: ['K-hearts', '3-clubs']
      },
      collectedHands: [],
      collectedByPlayer: {
        [hostProfile.userId]: [],
        [guestProfile.userId]: []
      },
      pointsByPlayer: {
        [hostProfile.userId]: 0,
        [guestProfile.userId]: 0
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
    });

    const invalidTurnPromise = waitForEvent(guestSocket, 'game_error');
    guestSocket.emit('play_card', {
      roomId: createResponse.roomId,
      card: 'K-hearts'
    });
    await expect(invalidTurnPromise).resolves.toBe('It is not your turn!');

    const gameUpdatePromise = waitForEvent(hostSocket, 'game_update');
    const handUpdatePromise = waitForEvent(hostSocket, 'hand_update');
    hostSocket.emit('play_card', {
      roomId: createResponse.roomId,
      card: 'A-hearts'
    });

    const [gameUpdate, handUpdate] = await Promise.all([
      gameUpdatePromise,
      handUpdatePromise
    ]);

    expect(gameUpdate.currentPlayerId).toBe(guestProfile.userId);
    expect(gameUpdate.turnIndex).toBe(1);
    expect(gameUpdate.currentTrick).toHaveLength(1);
    expect(handUpdate).toEqual(['2-clubs']);
  });
});

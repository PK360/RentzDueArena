const test = require('node:test');
const assert = require('node:assert');

const {
  serializeMatchHistoryForLibrary,
  serializeSavedGameForLibrary
} = require('../src/lib/gamePersistence');

test('serializeSavedGameForLibrary exposes saved-game preview data for the library', () => {
  const savedGame = {
    _id: '507f191e810c19729de86011',
    ownerUserId: '507f191e810c19729de86012',
    roomName: 'Friday Table',
    savedAt: new Date('2026-05-01T10:00:00.000Z'),
    roundsFinished: 4,
    leaderUserId: 'player-1',
    leaderName: 'Alice',
    leaderPoints: 22,
    snapshot: {
      players: [
        { userId: 'player-1', name: 'Alice' },
        { userId: 'player-2', name: 'Bob', isBot: true }
      ],
      customRulesets: [],
      selectedRulesets: { whist: true, queens: true },
      usedChoices: {
        'player-1': { whist: true }
      },
      phase: 'round_stats'
    }
  };

  const serialized = serializeSavedGameForLibrary(savedGame);

  assert.strictEqual(serialized.ownerUserId, '507f191e810c19729de86012');
  assert.strictEqual(serialized.roomName, 'Friday Table');
  assert.strictEqual(serialized.roundsFinished, 4);
  assert.strictEqual(serialized.leaderName, 'Alice');
  assert.strictEqual(serialized.players.length, 2);
  assert.ok(serialized.availableRulesets.some((rule) => rule.id === 'whist'));
  assert.strictEqual(serialized.selectedRulesets.whist, true);
  assert.strictEqual(serialized.usedChoices['player-1'].whist, true);
});

test('serializeMatchHistoryForLibrary returns the viewer summary alongside final standings', () => {
  const matchHistory = {
    _id: '507f191e810c19729de86021',
    roomName: 'Ranked Night',
    completedAt: new Date('2026-05-02T12:00:00.000Z'),
    roundsPlayed: 8,
    winnerUserId: 'player-1',
    winnerName: 'Alice',
    standings: [
      { userId: 'player-1', name: 'Alice', finalRank: 1, points: 40 },
      { userId: 'player-2', name: 'Bob', finalRank: 2, points: 18 }
    ],
    userSummaries: [
      {
        userId: 'player-2',
        finalRank: 2,
        eloDelta: -12,
        previousRankName: 'Devoted Rentz Player',
        nextRankName: 'Starting-out Rentz Rookie',
        rankChanged: true
      }
    ]
  };

  const serialized = serializeMatchHistoryForLibrary(matchHistory, 'player-2');

  assert.strictEqual(serialized.roomName, 'Ranked Night');
  assert.strictEqual(serialized.roundsPlayed, 8);
  assert.strictEqual(serialized.winnerName, 'Alice');
  assert.strictEqual(serialized.standings.length, 2);
  assert.strictEqual(serialized.viewerSummary.userId, 'player-2');
  assert.strictEqual(serialized.viewerSummary.eloDelta, -12);
  assert.strictEqual(serialized.viewerSummary.rankChanged, true);
});

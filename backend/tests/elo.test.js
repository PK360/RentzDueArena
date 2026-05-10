const test = require('node:test');
const assert = require('node:assert');

const {
  calculateMultiplayerEloChanges,
  getRankNameFromElo
} = require('../src/lib/elo');

test('maps exact ELO boundaries to the required rank names', () => {
  assert.strictEqual(getRankNameFromElo(0), 'Starting-out Rentz Rookie');
  assert.strictEqual(getRankNameFromElo(999), 'Starting-out Rentz Rookie');
  assert.strictEqual(getRankNameFromElo(1000), 'Devoted Rentz Player');
  assert.strictEqual(getRankNameFromElo(1999), 'Devoted Rentz Player');
  assert.strictEqual(getRankNameFromElo(2000), 'Practising Rentz Expert');
  assert.strictEqual(getRankNameFromElo(3999), 'Practising Rentz Expert');
  assert.strictEqual(getRankNameFromElo(4000), 'Grand Rentz Master');
  assert.strictEqual(getRankNameFromElo(5999), 'Grand Rentz Master');
  assert.strictEqual(getRankNameFromElo(6000), 'Divine Rentz Envoy');
  assert.strictEqual(getRankNameFromElo(7999), 'Divine Rentz Envoy');
  assert.strictEqual(getRankNameFromElo(8000), 'Ennead of Rentz Member');
  assert.strictEqual(getRankNameFromElo(9999), 'Ennead of Rentz Member');
  assert.strictEqual(getRankNameFromElo(10000), 'Ancestral Rentz God');
  assert.strictEqual(getRankNameFromElo(15432), 'Ancestral Rentz God');
});

test('uses classic 1v1 ELO deltas at the default K-factor', () => {
  const result = calculateMultiplayerEloChanges(
    [
      { userId: 'p-1', elo: 500 },
      { userId: 'p-2', elo: 500 }
    ],
    [
      { userId: 'p-1', points: 100, tricksWon: 3 },
      { userId: 'p-2', points: 80, tricksWon: 2 }
    ]
  );

  assert.strictEqual(result.applied, true);
  assert.deepStrictEqual(
    result.results.map((entry) => ({ userId: entry.userId, delta: entry.delta, nextElo: entry.nextElo })),
    [
      { userId: 'p-1', delta: 16, nextElo: 516 },
      { userId: 'p-2', delta: -16, nextElo: 484 }
    ]
  );
});

test('treats equal final results as ties', () => {
  const result = calculateMultiplayerEloChanges(
    [
      { userId: 'p-1', elo: 900 },
      { userId: 'p-2', elo: 900 }
    ],
    [
      { userId: 'p-1', points: 50, tricksWon: 2 },
      { userId: 'p-2', points: 50, tricksWon: 2 }
    ]
  );

  assert.strictEqual(result.applied, true);
  assert.deepStrictEqual(result.results.map((entry) => entry.delta), [0, 0]);
});

test('higher-rated players gain less for expected wins and lose more for upsets', () => {
  const favoriteWins = calculateMultiplayerEloChanges(
    [
      { userId: 'favorite', elo: 1200 },
      { userId: 'challenger', elo: 400 }
    ],
    [
      { userId: 'favorite', points: 100, tricksWon: 4 },
      { userId: 'challenger', points: 10, tricksWon: 0 }
    ]
  );
  const upsetWin = calculateMultiplayerEloChanges(
    [
      { userId: 'favorite', elo: 1200 },
      { userId: 'challenger', elo: 400 }
    ],
    [
      { userId: 'challenger', points: 100, tricksWon: 4 },
      { userId: 'favorite', points: 10, tricksWon: 0 }
    ]
  );

  const favoriteWinDelta = favoriteWins.results.find((entry) => entry.userId === 'favorite')?.delta;
  const favoriteLossDelta = upsetWin.results.find((entry) => entry.userId === 'favorite')?.delta;

  assert.ok(favoriteWinDelta >= 0);
  assert.ok(favoriteWinDelta < 16);
  assert.ok(favoriteLossDelta < 0);
  assert.ok(Math.abs(favoriteLossDelta) > Math.abs(favoriteWinDelta));
});

test('multiplayer pairwise changes stay balanced to zero overall', () => {
  const result = calculateMultiplayerEloChanges(
    [
      { userId: 'p-1', elo: 500 },
      { userId: 'p-2', elo: 650 },
      { userId: 'p-3', elo: 900 }
    ],
    [
      { userId: 'p-2', points: 120, tricksWon: 4 },
      { userId: 'p-3', points: 90, tricksWon: 3 },
      { userId: 'p-1', points: 20, tricksWon: 1 }
    ]
  );

  assert.strictEqual(result.applied, true);
  assert.strictEqual(result.results.reduce((sum, entry) => sum + entry.delta, 0), 0);
  assert.strictEqual(result.results.find((entry) => entry.userId === 'p-2')?.delta > 0, true);
  assert.strictEqual(result.results.find((entry) => entry.userId === 'p-1')?.delta < 0, true);
});

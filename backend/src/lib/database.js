const mongoose = require('mongoose');
const { migrateUsersMissingElo } = require('./elo');

const DEFAULT_MONGODB_URI = 'mongodb://127.0.0.1:27017/rentz-arena';
const READY_STATE_LABELS = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting'
};

let activeConnectionPromise = null;
let userIndexReconciliationPromise = null;

function getMongoUri() {
  return process.env.MONGODB_URI || DEFAULT_MONGODB_URI;
}

function getDatabaseStatus() {
  const { connection } = mongoose;

  return {
    readyState: connection.readyState,
    state: READY_STATE_LABELS[connection.readyState] || 'unknown',
    name: connection.name || null,
    host: connection.host || null
  };
}

async function connectToMongo() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (activeConnectionPromise) {
    await activeConnectionPromise;
    return mongoose.connection;
  }

  activeConnectionPromise = mongoose
    .connect(getMongoUri(), {
      serverSelectionTimeoutMS: Number(
        process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 5000
      )
    })
    .finally(() => {
      activeConnectionPromise = null;
    });

  await activeConnectionPromise;
  await reconcileUserIndexes();
  await reconcileUserRatings();
  return mongoose.connection;
}

async function reconcileUserIndexes() {
  if (userIndexReconciliationPromise) {
    await userIndexReconciliationPromise;
    return;
  }

  userIndexReconciliationPromise = (async () => {
    const User = require('../../models/User');
    const collection = User.collection;
    const existingIndexes = await collection.indexes();
    const obsoleteUniqueEmailIndex = existingIndexes.find((index) => (
      index?.name === 'email_1'
      && index?.unique
      && index?.key
      && Object.keys(index.key).length === 1
      && index.key.email === 1
    ));

    if (obsoleteUniqueEmailIndex) {
      await collection.dropIndex(obsoleteUniqueEmailIndex.name);
      console.warn('Dropped obsolete users.email_1 unique index during MongoDB startup reconciliation.');
    }

    await User.syncIndexes();
  })().finally(() => {
    userIndexReconciliationPromise = null;
  });

  await userIndexReconciliationPromise;
}

async function reconcileUserRatings() {
  const migratedUsers = await migrateUsersMissingElo();

  if (migratedUsers > 0) {
    console.log(`Initialized default ELO for ${migratedUsers} existing account${migratedUsers === 1 ? '' : 's'}.`);
  }
}

async function disconnectFromMongo() {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  await mongoose.disconnect();
}

module.exports = {
  connectToMongo,
  disconnectFromMongo,
  getDatabaseStatus,
  getMongoUri
};

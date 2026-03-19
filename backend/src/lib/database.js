const mongoose = require('mongoose');

const DEFAULT_MONGODB_URI = 'mongodb://127.0.0.1:27017/rentz-arena';
const READY_STATE_LABELS = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting'
};

let activeConnectionPromise = null;

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
  return mongoose.connection;
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

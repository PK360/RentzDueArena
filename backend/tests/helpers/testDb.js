const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const ForumPost = require('../../models/ForumPost');
const MatchHistory = require('../../models/MatchHistory');
const Notification = require('../../models/Notification');
const Ruleset = require('../../models/Ruleset');
const SavedGame = require('../../models/SavedGame');
const User = require('../../models/User');

let mongoServer = null;

async function connectTestDb() {
  if (!mongoServer) {
    mongoServer = await MongoMemoryServer.create({
      instance: {
        dbName: 'rentz-arena-test',
        ip: '127.0.0.1',
        port: 27018,
        portGeneration: false
      }
    });
  }

  process.env.MONGODB_URI = mongoServer.getUri();
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 1000
    });
  }

  await Promise.all([
    User.syncIndexes(),
    ForumPost.syncIndexes(),
    Notification.syncIndexes(),
    Ruleset.syncIndexes(),
    SavedGame.syncIndexes(),
    MatchHistory.syncIndexes()
  ]);
  return mongoose.connection;
}

async function clearTestDb() {
  if (mongoose.connection.readyState !== 1) {
    return;
  }

  const { collections } = mongoose.connection;

  await Promise.all(
    Object.values(collections).map(async (collection) => {
      try {
        await collection.deleteMany({});
      } catch (error) {
        if (/ns does not exist/i.test(String(error?.message || ''))) {
          return;
        }

        throw error;
      }
    })
  );
}

async function closeTestDb() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }

  delete process.env.MONGODB_URI;
}

module.exports = {
  closeTestDb,
  clearTestDb,
  connectTestDb
};

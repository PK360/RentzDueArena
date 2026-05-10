const mongoose = require('mongoose');

const savedGameSchema = new mongoose.Schema({
  ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: {
    type: String,
    enum: ['saved', 'resumed', 'completed', 'ended'],
    default: 'saved',
    index: true
  },
  matchKey: { type: String, required: true, index: true },
  roomName: { type: String, default: '' },
  originalRoomId: { type: String, default: '' },
  hostUserId: { type: String, default: '' },
  hostName: { type: String, default: '' },
  roundsFinished: { type: Number, default: 0 },
  leaderUserId: { type: String, default: '' },
  leaderName: { type: String, default: '' },
  leaderPoints: { type: Number, default: 0 },
  savedAt: { type: Date, default: Date.now, index: true },
  resumedAt: { type: Date, default: null },
  endedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  snapshot: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true });

savedGameSchema.index({ ownerUserId: 1, status: 1, savedAt: -1 });

module.exports = mongoose.model('SavedGame', savedGameSchema);

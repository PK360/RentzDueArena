const mongoose = require('mongoose');

const matchHistorySchema = new mongoose.Schema({
  matchKey: { type: String, required: true, unique: true, index: true },
  participantUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }],
  roomName: { type: String, default: '' },
  completedAt: { type: Date, default: Date.now, index: true },
  roundsPlayed: { type: Number, default: 0 },
  winnerUserId: { type: String, default: '' },
  winnerName: { type: String, default: '' },
  eloApplied: { type: Boolean, default: false },
  standings: { type: [mongoose.Schema.Types.Mixed], default: [] },
  eloResults: { type: [mongoose.Schema.Types.Mixed], default: [] },
  userSummaries: { type: [mongoose.Schema.Types.Mixed], default: [] },
  sourceSavedGameId: { type: mongoose.Schema.Types.ObjectId, ref: 'SavedGame', default: null }
}, { timestamps: true });

matchHistorySchema.index({ participantUserIds: 1, completedAt: -1 });

module.exports = mongoose.model('MatchHistory', matchHistorySchema);

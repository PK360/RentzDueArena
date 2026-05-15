const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: {
    type: String,
    enum: ['friend_request', 'game_invite', 'resume_rejoin', 'forum_comment', 'forum_rating'],
    required: true,
    index: true
  },
  category: {
    type: String,
    enum: ['friend_requests', 'game_invites', 'forum'],
    required: true,
    index: true
  },
  dedupeKey: {
    type: String,
    required: true,
    trim: true
  },
  actor: {
    userId: { type: String, default: '' },
    username: { type: String, default: '' },
    avatarUrl: { type: String, default: '' }
  },
  entity: { type: mongoose.Schema.Types.Mixed, default: {} },
  redirect: { type: mongoose.Schema.Types.Mixed, default: null },
  display: { type: mongoose.Schema.Types.Mixed, default: {} },
  actionState: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'resolved'],
    default: 'pending',
    index: true
  },
  readAt: { type: Date, default: null, index: true }
}, { timestamps: true });

notificationSchema.index({ recipientUserId: 1, dedupeKey: 1 }, { unique: true });
notificationSchema.index({ recipientUserId: 1, updatedAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);

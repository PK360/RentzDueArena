const mongoose = require('mongoose');

const {
  MAX_FORUM_TEXT_LENGTH,
  normalizeObjectIdArray
} = require('../src/lib/forum');

const forumMediaSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2048
  },
  kind: {
    type: String,
    enum: ['image', 'gif'],
    default: 'image'
  },
  mimeType: {
    type: String,
    default: '',
    trim: true,
    maxlength: 100
  }
}, { _id: false });

const attachedRulesetSchema = new mongoose.Schema({
  ruleset: { type: mongoose.Schema.Types.ObjectId, ref: 'Ruleset', required: true },
  id: { type: String, required: true, trim: true, maxlength: 120 },
  label: { type: String, required: true, trim: true, maxlength: 120 },
  abbreviation: { type: String, default: '', trim: true, maxlength: 24 },
  type: { type: String, enum: ['per_round', 'end_game'], default: 'per_round' },
  code: { type: String, default: '' }
}, { _id: false });

const forumPostSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  parentPost: { type: mongoose.Schema.Types.ObjectId, ref: 'ForumPost', default: null, index: true },
  rootPost: { type: mongoose.Schema.Types.ObjectId, ref: 'ForumPost', default: null, index: true },
  text: {
    type: String,
    default: '',
    trim: true,
    maxlength: MAX_FORUM_TEXT_LENGTH
  },
  media: { type: forumMediaSchema, default: null },
  attachedRuleset: { type: attachedRulesetSchema, default: null },
  likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  bookmarkedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  shareCount: { type: Number, default: 0, min: 0 },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

forumPostSchema.index({ text: 'text' });
forumPostSchema.index({ parentPost: 1, createdAt: 1 });
forumPostSchema.index({ rootPost: 1, createdAt: 1 });

forumPostSchema.pre('validate', function normalizeForumPost(next) {
  try {
    this.text = String(this.text || '').trim();
    this.likedBy = normalizeObjectIdArray(this.likedBy);
    this.bookmarkedBy = normalizeObjectIdArray(this.bookmarkedBy);

    if (!this.parentPost) {
      this.parentPost = null;
      this.rootPost = null;
    } else if (!this.rootPost) {
      this.rootPost = this.parentPost;
    }

    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model('ForumPost', forumPostSchema);

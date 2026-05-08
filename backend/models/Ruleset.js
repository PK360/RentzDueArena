const mongoose = require('mongoose');

const rulesetRatingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  value: { type: Number, required: true, min: 0.5, max: 5 }
}, { _id: false });

const rulesetSchema = new mongoose.Schema({
  title: { type: String, required: true },
  shortName: { type: String, default: '' },
  titleLower: { type: String, default: '', index: true },
  description: { type: String, default: '' },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['per_round', 'end_game'], required: true },
  code: { type: String, required: true },
  contentHash: { type: String, default: '', index: true },
  tags: { type: [String], default: [] },
  ratings: { type: [rulesetRatingSchema], default: [] },
  upvoteCount: { type: Number, default: 0 },
  downloadCount: { type: Number, default: 0 },
  isPublic: { type: Boolean, default: false }
}, { timestamps: true });

rulesetSchema.index({ author: 1, contentHash: 1 }, { unique: true, sparse: true });

rulesetSchema.pre('validate', function normalizeRulesetFields(next) {
  this.title = String(this.title || '').trim();
  this.shortName = String(this.shortName || '').trim();
  this.titleLower = this.title.toLowerCase();
  this.description = String(this.description || '').trim();
  this.code = String(this.code || '');
  this.contentHash = String(this.contentHash || '').trim();

  const uniqueRatings = [];
  const seenUsers = new Set();
  (Array.isArray(this.ratings) ? this.ratings : []).forEach((rating) => {
    const userId = String(rating?.user || '');
    if (!mongoose.isValidObjectId(userId) || seenUsers.has(userId)) {
      return;
    }

    seenUsers.add(userId);
    uniqueRatings.push({
      user: userId,
      value: Number(rating.value)
    });
  });
  this.ratings = uniqueRatings;
  next();
});

module.exports = mongoose.model('Ruleset', rulesetSchema);

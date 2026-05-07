const mongoose = require('mongoose');
const {
  MAX_FAVOURITE_RULESETS,
  MAX_RULESET_LOADOUT,
  normalizeRulesetIndexes
} = require('../src/lib/accountRulesets');

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,24}$/;
const ASSET_FIELD_MAX_LENGTH = 2048;
const DESCRIPTION_MAX_LENGTH = 280;

function isAllowedAssetValue(value) {
  if (!value) {
    return true;
  }

  return /^(https?:\/\/|\/|data:image\/)/i.test(value);
}

function normalizeRelationshipReferenceList(values, selfId = '') {
  const seen = new Set();

  return (Array.isArray(values) ? values : [])
    .map((value) => {
      if (!value) {
        return '';
      }

      if (typeof value === 'string') {
        return value;
      }

      if (value instanceof mongoose.Types.ObjectId) {
        return String(value);
      }

      return String(value._id || value.id || value.userId || '');
    })
    .filter((value) => mongoose.isValidObjectId(value))
    .filter((value) => value && value !== selfId)
    .filter((value) => {
      if (seen.has(value)) {
        return false;
      }

      seen.add(value);
      return true;
    });
}

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 24,
    match: USERNAME_PATTERN
  },
  usernameLower: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  displayName: { type: String, required: true, trim: true },
  friendCode: { type: String, required: true, unique: true, index: true },
  passwordHash: { type: String, required: true },
  profilePicture: {
    type: String,
    default: '',
    trim: true,
    maxlength: ASSET_FIELD_MAX_LENGTH,
    validate: {
      validator: isAllowedAssetValue,
      message: 'Profile picture must be an http(s), root-relative, or data image URL'
    }
  },
  banner: {
    type: String,
    default: '',
    trim: true,
    maxlength: ASSET_FIELD_MAX_LENGTH,
    validate: {
      validator: isAllowedAssetValue,
      message: 'Banner must be an http(s), root-relative, or data image URL'
    }
  },
  description: {
    type: String,
    default: '',
    trim: true,
    maxlength: DESCRIPTION_MAX_LENGTH
  },
  accountCreatedAt: { type: Date, default: Date.now },
  favouriteRulesets: {
    type: [Number],
    default: [],
    validate: {
      validator(value) {
        return value.length <= MAX_FAVOURITE_RULESETS;
      },
      message: `Favourite rulesets can contain at most ${MAX_FAVOURITE_RULESETS} entries`
    }
  },
  rulesetLoadout: {
    type: [Number],
    default: [],
    validate: {
      validator(value) {
        return value.length <= MAX_RULESET_LOADOUT;
      },
      message: `Ruleset loadout can contain at most ${MAX_RULESET_LOADOUT} entries`
    }
  },
  lastSeenAt: { type: Date, default: null },
  passwordResetRequestedAt: { type: Date, default: null },
  sessionVersion: { type: Number, default: 0 },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  incomingFriendRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  outgoingFriendRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  savedRulesets: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Ruleset' }],
  createdRulesets: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Ruleset' }],
}, { timestamps: true });

userSchema.pre('validate', function normalizeAccountFields(next) {
  try {
    this.username = String(this.username || '').trim();
    this.usernameLower = this.username.toLowerCase();
    this.displayName = this.username;
    this.profilePicture = String(this.profilePicture || '').trim();
    this.banner = String(this.banner || '').trim();
    this.description = String(this.description || '').trim();
    this.favouriteRulesets = normalizeRulesetIndexes(this.favouriteRulesets, {
      maxItems: MAX_FAVOURITE_RULESETS,
      fieldName: 'favouriteRulesets'
    });
    this.rulesetLoadout = normalizeRulesetIndexes(this.rulesetLoadout, {
      maxItems: MAX_RULESET_LOADOUT,
      fieldName: 'rulesetLoadout'
    });
    const selfId = this._id ? String(this._id) : '';
    this.friends = normalizeRelationshipReferenceList(this.friends, selfId);
    this.incomingFriendRequests = normalizeRelationshipReferenceList(this.incomingFriendRequests, selfId);
    this.outgoingFriendRequests = normalizeRelationshipReferenceList(this.outgoingFriendRequests, selfId);
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model('User', userSchema);

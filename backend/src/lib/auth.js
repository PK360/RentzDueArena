const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const util = require('util');

const User = require('../../models/User');
const { normalizeRelationshipIds } = require('./friends');
const { getRankNameFromElo, getRankTierForElo, normalizeEloValue } = require('./elo');

const scryptAsync = util.promisify(crypto.scrypt);

const SESSION_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'rentz_session';
const SESSION_TTL_DAYS = Math.max(1, Number(process.env.AUTH_SESSION_TTL_DAYS || 30));
const SESSION_MAX_AGE_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
const JWT_SECRET = process.env.AUTH_JWT_SECRET || 'development-only-auth-secret';

function getCookieSettings() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE_MS,
    path: '/'
  };
}

function parseCookieHeader(cookieHeader = '') {
  return String(cookieHeader || '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((acc, entry) => {
      const separatorIndex = entry.indexOf('=');
      if (separatorIndex === -1) {
        return acc;
      }

      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      if (key) {
        acc[key] = decodeURIComponent(value);
      }
      return acc;
    }, {});
}

function readSessionTokenFromCookieHeader(cookieHeader = '') {
  const cookies = parseCookieHeader(cookieHeader);
  return cookies[SESSION_COOKIE_NAME] || null;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(password, salt, 64);
  return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

async function verifyPassword(password, passwordHash) {
  const [algorithm, salt, hash] = String(passwordHash || '').split('$');
  if (algorithm !== 'scrypt' || !salt || !hash) {
    return false;
  }

  const derivedKey = await scryptAsync(password, salt, 64);
  const expectedBuffer = Buffer.from(hash, 'hex');

  if (expectedBuffer.length !== derivedKey.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, derivedKey);
}

function signSessionToken(user) {
  return jwt.sign(
    {
      sub: String(user._id),
      sv: Number(user.sessionVersion || 0)
    },
    JWT_SECRET,
    { expiresIn: `${SESSION_TTL_DAYS}d` }
  );
}

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE_NAME, token, getCookieSettings());
}

function clearSessionCookie(res) {
  const { maxAge, ...cookieSettings } = getCookieSettings();
  void maxAge;
  res.clearCookie(SESSION_COOKIE_NAME, cookieSettings);
}

function getSessionPayloadFromCookieHeader(cookieHeader = '') {
  const token = readSessionTokenFromCookieHeader(cookieHeader);
  if (!token) {
    return null;
  }

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

async function getAuthenticatedUserFromCookieHeader(cookieHeader = '') {
  const payload = getSessionPayloadFromCookieHeader(cookieHeader);
  if (!payload?.sub) {
    return null;
  }

  const user = await User.findById(payload.sub);
  if (!user || Number(user.sessionVersion || 0) !== Number(payload.sv || 0)) {
    return null;
  }

  return user;
}

async function getAuthenticatedUserFromRequest(req) {
  return getAuthenticatedUserFromCookieHeader(req?.headers?.cookie || '');
}

function serializeAccount(user) {
  if (!user) {
    return null;
  }

  return {
    id: String(user._id),
    userId: String(user._id),
    username: user.username,
    name: user.username,
    displayName: user.username,
    guest: false,
    profilePicture: user.profilePicture || '',
    avatarUrl: user.profilePicture || '',
    banner: user.banner || '',
    description: user.description || '',
    elo: normalizeEloValue(user.elo),
    rankName: getRankNameFromElo(user.elo),
    rankTierKey: getRankTierForElo(user.elo).key,
    favouriteRulesets: Array.isArray(user.favouriteRulesets) ? user.favouriteRulesets : [],
    rulesetLoadout: Array.isArray(user.rulesetLoadout) ? user.rulesetLoadout : [],
    accountCreatedAt: user.accountCreatedAt || user.createdAt || null,
    friendCode: user.friendCode || null,
    friends: normalizeRelationshipIds(user.friends),
    incomingFriendRequests: normalizeRelationshipIds(user.incomingFriendRequests),
    outgoingFriendRequests: normalizeRelationshipIds(user.outgoingFriendRequests),
    muteAllNotifications: Boolean(user.muteAllNotifications),
    mutedForumThreadNotificationIds: Array.isArray(user.mutedForumThreadNotificationIds)
      ? user.mutedForumThreadNotificationIds.map((value) => String(value))
      : []
  };
}

async function persistSession(res, user) {
  user.lastSeenAt = new Date();
  await user.save();
  setSessionCookie(res, signSessionToken(user));
}

module.exports = {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  getAuthenticatedUserFromCookieHeader,
  getAuthenticatedUserFromRequest,
  hashPassword,
  parseCookieHeader,
  persistSession,
  readSessionTokenFromCookieHeader,
  serializeAccount,
  setSessionCookie,
  signSessionToken,
  verifyPassword
};

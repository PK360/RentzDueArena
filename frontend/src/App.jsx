import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Ban,
  BarChart3,
  Bot,
  Bookmark,
  Check,
  Clock,
  Copy,
  Crown,
  Download,
  Droplet,
  FileCode2,
  Globe2,
  Heart,
  Home,
  ImagePlus,
  Info,
  Library,
  Lock,
  LogIn,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  SendHorizontal,
  Settings,
  Sparkles,
  Star,
  Swords,
  Trash2,
  Trophy,
  Upload,
  UserRound,
  Users,
  Users2,
  X
} from 'lucide-react';
import clsx from 'clsx';
import { io } from 'socket.io-client';

const socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
  autoConnect: false,
  withCredentials: true
});

const SUIT_SYMBOLS = {
  H: '♥',
  D: '♦',
  C: '♣',
  S: '♠'
};

const SUIT_NAMES = {
  H: 'Hearts',
  D: 'Diamonds',
  C: 'Clubs',
  S: 'Spades'
};

const CARD_VALUE_NAMES = {
  A: 'Ace',
  K: 'King',
  Q: 'Queen',
  J: 'Jack',
  '10': 'Ten',
  '9': 'Nine',
  '8': 'Eight',
  '7': 'Seven',
  '6': 'Six',
  '5': 'Five',
  '4': 'Four',
  '3': 'Three',
  '2': 'Two'
};

const CARD_ASSET_VALUE_NAMES = {
  A: 'ace',
  K: 'king',
  Q: 'queen',
  J: 'jack',
  '10': '10',
  '9': '9',
  '8': '8',
  '7': '7',
  '6': '6',
  '5': '5',
  '4': '4',
  '3': '3',
  '2': '2'
};
const CARD_ASSET_SUIT_NAMES = {
  H: 'hearts',
  D: 'diamonds',
  C: 'clubs',
  S: 'spades'
};
const ILLUSTRATED_FACE_CARD_VALUES = new Set(['J', 'Q', 'K']);
const JOKER_CARD_LABELS = {
  black_joker: 'Black Joker',
  red_joker: 'Red Joker'
};
const CARD_ASSET_BASE_PATH = `${import.meta.env.BASE_URL}cards/`;
const CARD_ASSET_ASPECT_RATIO = 167.0869141 / 242.6669922;
const MAX_ACTIVITY_FEED_ITEMS = 60;
const CHAT_MESSAGE_MAX_LENGTH = 400;
const TABLE_CHAT_BUBBLE_MAX_LENGTH = 120;
const TABLE_CHAT_BUBBLE_DURATION_MS = 4200;
const TRICK_CARD_CENTER_BOX_PERCENT = 3.2;
const TRICK_CARD_ROTATION_LIMIT_DEGREES = 18;
const HAND_CARD_MAX_ADVANCE_RATIO = 0.76;
const HAND_CARD_MIN_ADVANCE_RATIO = 0.42;
const HAND_CARD_SIZE_SCALE = 0.95;
const HAND_CARD_MIN_HEIGHT_PX = 44;
const HAND_CARD_MAX_HEIGHT_PX = 108;
const HAND_CARD_MEASURE_MIN_WIDTH_PX = 140;
const HAND_CARD_MEASURE_MIN_HEIGHT_PX = 42;
const MIN_PLAYERS_TO_START = 2;
const MAX_ACTIVE_PLAYERS = 6;
const ROOM_RULESET_OPTIONS = [
  { id: 'kingOfHearts', label: 'King of Hearts', abbreviation: 'K♥' },
  { id: 'diamonds', label: 'Diamonds', abbreviation: '♦' },
  { id: 'queens', label: 'Queens', abbreviation: 'Q' },
  { id: 'tenOfClubs', label: '10 of Clubs', abbreviation: '10♣' },
  { id: 'whist', label: 'Whist', abbreviation: 'W' },
  { id: 'levate', label: 'Levate', abbreviation: 'L' },
  { id: 'totalPlus', label: 'Total Plus', abbreviation: 'T+' },
  { id: 'totalMinus', label: 'Total Minus', abbreviation: 'T-' }
];
const ACCOUNT_RULESET_OPTIONS = ROOM_RULESET_OPTIONS.map((option, index) => ({
  ...option,
  index
}));
const DEFAULT_REGISTER_PROFILE_PREVIEW = '/media/defaults/default-profile.gif';
const DEFAULT_REGISTER_BANNER_PREVIEW = '/media/defaults/default-banner.jpeg';
const EMOJI_REACTION_REGISTRY = Object.freeze([
  { id: 'grin', label: 'Grin', glyph: '😄', animationClassName: 'is-bounce' },
  { id: 'wink', label: 'Wink', glyph: '😉', animationClassName: 'is-wiggle' },
  { id: 'laugh', label: 'Laugh', glyph: '😂', animationClassName: 'is-spin-pop' },
  { id: 'shock', label: 'Shock', glyph: '😱', animationClassName: 'is-pop' },
  { id: 'love', label: 'Love', glyph: '😍', animationClassName: 'is-pulse' },
  { id: 'gg', label: 'GG', glyph: '🥳', animationClassName: 'is-sway' }
]);
const EMOJI_REACTION_MAP = Object.freeze(
  Object.fromEntries(EMOJI_REACTION_REGISTRY.map((entry) => [entry.id, entry]))
);
const EMOJI_REACTION_DURATION_MS = 3200;
const DEFAULT_ROOM_RULESET_SELECTIONS = Object.freeze(
  ROOM_RULESET_OPTIONS.reduce((acc, option) => {
    acc[option.id] = true;
    return acc;
  }, {})
);
const DEFAULT_ROOM_VISIBILITY = 'public';
const TURN_TIMER_RANGE = { min: 15, max: 300, defaultValue: 45 };
const DEFAULT_ACCOUNT_ELO = 500;
const TRAINER_ELO_SOFT_MAX = 10000;
const TRAINING_ROUNDS_RANGE = { min: 1, max: 15, defaultValue: 1 };
const TRAINING_PLAYERS_RANGE = { min: 2, max: 6, defaultValue: 2 };
const MATCH_MODE_STANDARD = 'standard';
const MATCH_MODE_TRAINING = 'training';
const RULESET_TYPE_OPTIONS = new Set(['per_round', 'end_game']);
const RENTZ_METADATA_KEYS = new Set(['long_name', 'short_name', 'title', 'name', 'abbreviation', 'abbr', 'type']);
const EDITOR_BOT_CATEGORY_DEFINITIONS = Object.freeze([
  { key: 'riskRewardBalance', label: 'Risk/reward balance' },
  { key: 'comebackPotential', label: 'Comeback potential' },
  { key: 'claritySimplicity', label: 'Clarity / simplicity' },
  { key: 'scoringBalance', label: 'Scoring balance' },
  { key: 'playerAgency', label: 'Player agency' },
  { key: 'interactionQuality', label: 'Interaction quality' }
]);

const VALUE_ORDER = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUIT_ORDER = ['H', 'S', 'D', 'C'];
const STORAGE_KEYS = {
  theme: 'rentz-theme',
  fontScale: 'rentz-font-scale',
  pageZoom: 'rentz-page-zoom',
  guestProfile: 'rentz-guest-profile'
};
const FONT_SCALE_RANGE = { min: 70, max: 130, step: 5, defaultValue: 100 };
const PAGE_ZOOM_RANGE = { min: 100, max: 125, step: 5, defaultValue: 100 };

function createStepValues(min, max, step) {
  const values = [];

  for (let value = min; value <= max; value += step) {
    values.push(value);
  }

  return values;
}

function getStepAlignedMidpoint(min, max, step) {
  const midpoint = (min + max) / 2;
  const steppedMidpoint = Math.round((midpoint - min) / step) * step + min;
  return Math.min(max, Math.max(min, steppedMidpoint));
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampScoreToTenth(value, fallback = 0) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return clampScoreToTenth(fallback, 0);
  }

  return Math.max(0, Math.min(10, Math.round(numericValue * 10) / 10));
}

function buildRulesetShortNameFallback(longName) {
  return Array.from(String(longName || 'Ruleset').replace(/\s+/g, '')).slice(0, 4).join('') || 'R';
}

function normalizeRulesetType(type) {
  return RULESET_TYPE_OPTIONS.has(type) ? type : 'per_round';
}

function sanitizeEditorJudgeText(value, fallback = '', maxLength = 500) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return fallback;
  }

  return text.slice(0, maxLength);
}

function sanitizeEditorJudgeList(values = [], fallback = []) {
  const list = Array.isArray(values) ? values : [];
  const sanitized = list
    .map((value) => sanitizeEditorJudgeText(value, '', 220))
    .filter(Boolean);

  return sanitized.length > 0 ? sanitized.slice(0, 6) : fallback;
}

function normalizeEditorJudgeReview(review = null) {
  if (!review || typeof review !== 'object') {
    return null;
  }

  const categoryRatings = EDITOR_BOT_CATEGORY_DEFINITIONS.reduce((acc, category) => {
    const entry = review.categoryRatings?.[category.key] || {};
    acc[category.key] = {
      score: clampScoreToTenth(entry.score, 0),
      explanation: sanitizeEditorJudgeText(entry.explanation, 'No extra detail was provided for this category yet.', 220)
    };
    return acc;
  }, {});
  const categoryAverage = EDITOR_BOT_CATEGORY_DEFINITIONS
    .reduce((sum, category) => sum + categoryRatings[category.key].score, 0) / EDITOR_BOT_CATEGORY_DEFINITIONS.length;

  return {
    overallScore: clampScoreToTenth(review.overallScore, categoryAverage),
    categoryRatings,
    rulesetSummary: sanitizeEditorJudgeText(review.rulesetSummary, 'The ruleset review summary is unavailable right now.', 500),
    constructiveReview: sanitizeEditorJudgeText(review.constructiveReview, 'The Editor Bot did not provide a longer review this time.', 500),
    recommendations: sanitizeEditorJudgeList(review.recommendations, []),
    warnings: sanitizeEditorJudgeList(review.warnings, []),
    reviewSource: review.reviewSource === 'fallback' ? 'fallback' : review.reviewSource === 'heuristic' ? 'heuristic' : 'ai',
    diagnostics: Array.isArray(review.diagnostics)
      ? review.diagnostics.map((entry) => ({
        attempt: sanitizeEditorJudgeText(entry?.attempt, 'unknown', 80),
        elapsedMs: Math.max(0, Math.round(Number(entry?.elapsedMs) || 0)),
        success: entry?.success === true,
        stage: sanitizeEditorJudgeText(entry?.stage, 'unknown', 80),
        error: sanitizeEditorJudgeText(entry?.error, '', 220),
        rawPreview: sanitizeEditorJudgeText(entry?.rawPreview, '', 280)
      }))
      : []
  };
}

function normalizeRentzMetadataKey(key) {
  return String(key || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function parseRentzMetadataLine(line) {
  const match = String(line || '').trim().match(/^(?:#\s*)?([^:=#]+?)\s*[:=]\s*(.*)$/);
  if (!match) {
    return null;
  }

  const key = normalizeRentzMetadataKey(match[1]);
  if (!RENTZ_METADATA_KEYS.has(key)) {
    return null;
  }

  return {
    key,
    value: match[2].trim()
  };
}

function parseRentzRulesetText(sourceText) {
  const normalizedText = String(sourceText || '').replace(/\r\n/g, '\n');
  const lines = normalizedText.split('\n');
  const metadata = {};
  let index = 0;
  let hasRentzHeader = false;

  if (/^(?:#\s*)?Rentz Arena Ruleset\s*$/i.test(lines[0]?.trim() || '')) {
    hasRentzHeader = true;
    index = 1;
  }

  const metadataStartIndex = index;
  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (!trimmed || trimmed === '#') {
      index += 1;
      break;
    }

    if (/^-{3,}$/.test(trimmed)) {
      index += 1;
      break;
    }

    const metadataEntry = parseRentzMetadataLine(lines[index]);
    if (!metadataEntry) {
      break;
    }

    metadata[metadataEntry.key] = metadataEntry.value;
    index += 1;
  }

  const hasLeadingMetadata = index > metadataStartIndex;

  if (!hasRentzHeader && !hasLeadingMetadata) {
    let titleIndex = 0;
    while (titleIndex < lines.length && !lines[titleIndex].trim()) {
      titleIndex += 1;
    }

    const typeLine = lines[titleIndex + 1]?.trim() || '';
    const typeMatch = typeLine.match(/^type:\s*([\w-]+)\s*$/i);
    if (lines[titleIndex]?.trim() && typeMatch) {
      const longName = lines[titleIndex].trim();
      return {
        longName,
        shortName: buildRulesetShortNameFallback(longName),
        type: normalizeRulesetType(typeMatch[1]),
        code: lines.slice(titleIndex + 2).join('\n').trim()
      };
    }
  }

  const code = (hasRentzHeader || hasLeadingMetadata)
    ? lines.slice(index).join('\n').trim()
    : normalizedText.trim();
  const longName = metadata.long_name || metadata.title || metadata.name || 'Imported Ruleset';
  const shortName = metadata.short_name || metadata.abbreviation || metadata.abbr || buildRulesetShortNameFallback(longName);

  return {
    longName,
    shortName,
    type: normalizeRulesetType(metadata.type),
    code
  };
}

function formatRentzRuleset({ longName, shortName, type, code }) {
  const resolvedLongName = String(longName || '').trim() || 'Untitled Ruleset';
  const resolvedShortName = String(shortName || '').trim() || buildRulesetShortNameFallback(resolvedLongName);

  return [
    `# long_name: ${resolvedLongName}`,
    `# short_name: ${resolvedShortName}`,
    `# type: ${normalizeRulesetType(type)}`,
    '#',
    String(code || '').trim(),
    ''
  ].join('\n');
}

function buildRulesetDownloadName(longName) {
  const slug = String(longName || 'ruleset')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return `${slug || 'ruleset'}.rentz`;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error || 'Request failed';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function serializeFileUpload(file) {
  if (!file) {
    return null;
  }

  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
    reader.readAsDataURL(file);
  });

  return {
    name: file.name,
    type: file.type,
    size: file.size,
    data
  };
}

function normalizeRoomSettings(roomSettings) {
  const availableRulesets = roomSettings?.availableRulesets?.length
    ? roomSettings.availableRulesets.map((option) => ({
      ...option,
      abbreviation: option.abbreviation || ROOM_RULESET_OPTIONS.find((fallback) => fallback.id === option.id)?.abbreviation || option.label
    }))
    : ROOM_RULESET_OPTIONS;
  const selectedRulesets = availableRulesets.reduce((acc, option) => {
    acc[option.id] = typeof roomSettings?.selectedRulesets?.[option.id] === 'boolean'
      ? roomSettings.selectedRulesets[option.id]
      : (Object.prototype.hasOwnProperty.call(DEFAULT_ROOM_RULESET_SELECTIONS, option.id)
        ? DEFAULT_ROOM_RULESET_SELECTIONS[option.id]
        : option.enabledByDefault !== false);
    return acc;
  }, {});
  const rulesetPermissions = roomSettings?.rulesetPermissions && typeof roomSettings.rulesetPermissions === 'object'
    ? roomSettings.rulesetPermissions
    : {};

  return {
    availableRulesets,
    selectedRulesets,
    rulesetPermissions,
    nvAllowed: roomSettings?.nvAllowed ?? true,
    autoBotReplacementEnabled: roomSettings?.autoBotReplacementEnabled ?? true,
    useTurnTimer: roomSettings?.useTurnTimer ?? true,
    turnTimerSeconds: clampNumber(
      Number(roomSettings?.turnTimerSeconds ?? TURN_TIMER_RANGE.defaultValue),
      TURN_TIMER_RANGE.min,
      TURN_TIMER_RANGE.max
    ),
    visibility: roomSettings?.visibility || DEFAULT_ROOM_VISIBILITY,
    roomName: roomSettings?.roomName || ''
  };
}

function getMatchModeValue(value) {
  return value === MATCH_MODE_TRAINING ? MATCH_MODE_TRAINING : MATCH_MODE_STANDARD;
}

function normalizeTrainingState(training = null) {
  if (!training?.enabled) {
    return null;
  }

  return {
    enabled: true,
    humanUserId: training.humanUserId || '',
    trainerUserId: training.trainerUserId || '',
    trainerElo: normalizeTrainerEloValue(training.trainerElo, DEFAULT_ACCOUNT_ELO),
    trainerRankName: training.trainerRankName || 'Starting-out Rentz Rookie',
    totalRounds: clampNumber(
      Math.round(Number(training.totalRounds || TRAINING_ROUNDS_RANGE.defaultValue)),
      TRAINING_ROUNDS_RANGE.min,
      TRAINING_ROUNDS_RANGE.max
    ),
    playerCount: clampNumber(
      Math.round(Number(training.playerCount || TRAINING_PLAYERS_RANGE.defaultValue)),
      TRAINING_PLAYERS_RANGE.min,
      TRAINING_PLAYERS_RANGE.max
    ),
    regularBotCount: Math.max(0, Math.round(Number(training.regularBotCount || 0))),
    selectedRulesetId: training.selectedRulesetId || '',
    selectedRulesetLabel: training.selectedRulesetLabel || '',
    selectedRulesetSource: training.selectedRulesetSource || 'default',
    preMoveCommentaryEnabled: training.preMoveCommentaryEnabled !== false,
    postMoveFeedbackEnabled: training.postMoveFeedbackEnabled !== false
  };
}

function normalizeTrainingFinalReview(review = null) {
  if (!review?.review) {
    return null;
  }

  return {
    review: String(review.review || '').trim(),
    starRating: clampNumber(Number(review.starRating || 3), 0.5, 5)
  };
}

function normalizeTrainerEloValue(value, fallback = DEFAULT_ACCOUNT_ELO) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return Math.max(0, Math.round(fallback));
  }

  return Math.max(0, Math.round(numericValue));
}

function getTrainerDefaultElo(profile = null) {
  return normalizeTrainerEloValue(getPlayerRating(profile), DEFAULT_ACCOUNT_ELO);
}

function getTrainerMaxElo(profile = null) {
  return Math.max(TRAINER_ELO_SOFT_MAX, getTrainerDefaultElo(profile));
}

function getTrainerRankName(elo) {
  const normalizedElo = normalizeTrainerEloValue(elo);
  if (normalizedElo >= 10000) {
    return 'Ancestral Rentz God';
  }
  if (normalizedElo >= 8000) {
    return 'Ennead of Rentz Member';
  }
  if (normalizedElo >= 6000) {
    return 'Divine Rentz Envoy';
  }
  if (normalizedElo >= 4000) {
    return 'Grand Rentz Master';
  }
  if (normalizedElo >= 2000) {
    return 'Practising Rentz Expert';
  }
  if (normalizedElo >= 1000) {
    return 'Devoted Rentz Player';
  }

  return 'Starting-out Rentz Rookie';
}

function createTrainingSetup(profile = null) {
  return {
    trainerElo: getTrainerDefaultElo(profile),
    selectedRulesetId: '',
    preMoveCommentaryEnabled: true,
    postMoveFeedbackEnabled: true,
    totalRounds: TRAINING_ROUNDS_RANGE.defaultValue,
    playerCount: TRAINING_PLAYERS_RANGE.defaultValue
  };
}

function createFallbackAccountRulesetCatalog() {
  return ACCOUNT_RULESET_OPTIONS.map((option) => ({
    ...option,
    type: 'per_round',
    code: [
      '# Ruleset preview unavailable on the client.',
      '# The server ruleset catalog should replace this fallback automatically.'
    ].join('\n')
  }));
}

function createAccountEditForm(user = null) {
  return {
    username: user?.username || '',
    description: user?.description || '',
    profilePictureFile: null,
    profilePicturePreview: user?.avatarUrl || DEFAULT_REGISTER_PROFILE_PREVIEW,
    bannerFile: null,
    bannerPreview: user?.banner || DEFAULT_REGISTER_BANNER_PREVIEW
  };
}

function revokeObjectPreview(url) {
  if (String(url || '').startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

function createForumDraft() {
  return {
    text: '',
    mediaFile: null,
    mediaPreview: '',
    attachedRulesetIndex: ''
  };
}

function createEmptyForumSearchState() {
  return {
    hasResultsTab: false,
    query: '',
    loading: false,
    activeView: 'posts',
    posts: [],
    users: [],
    friends: []
  };
}

function createEmptyLibraryState() {
  return {
    loading: false,
    savedRulesets: [],
    savedGames: [],
    matchHistory: [],
    bookmarkedRulesetPosts: []
  };
}

function replaceForumEntryInTree(entries, nextEntry) {
  return entries.map((entry) => {
    if (entry.id === nextEntry.id) {
      return {
        ...entry,
        ...nextEntry,
        replies: entry.replies || []
      };
    }

    if (!entry.replies?.length) {
      return entry;
    }

    return {
      ...entry,
      replies: replaceForumEntryInTree(entry.replies, nextEntry)
    };
  });
}

function appendForumReplyInTree(entries, parentId, reply) {
  return entries.map((entry) => {
    if (entry.id === parentId) {
      const nextReplies = [...(entry.replies || []), reply].sort(
        (left, right) => new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime()
      );

      return {
        ...entry,
        replyCount: Math.max(entry.replyCount || 0, nextReplies.length),
        replies: nextReplies
      };
    }

    if (!entry.replies?.length) {
      return entry;
    }

    return {
      ...entry,
      replies: appendForumReplyInTree(entry.replies, parentId, reply)
    };
  });
}

function removeForumEntryFromTree(entries, targetId) {
  const nextEntries = [];

  entries.forEach((entry) => {
    if (entry.id === targetId) {
      return;
    }

    const nextReplies = Array.isArray(entry.replies)
      ? removeForumEntryFromTree(entry.replies, targetId)
      : entry.replies;

    nextEntries.push({
      ...entry,
      replies: nextReplies,
      replyCount: Array.isArray(nextReplies) ? nextReplies.length : (entry.replyCount || 0)
    });
  });

  return nextEntries;
}

function formatForumTimestamp(value) {
  if (!value) {
    return 'Just now';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Just now';
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatForumRatingLabel(value) {
  return typeof value === 'number' ? `${value.toFixed(1)} avg` : 'No rating yet';
}

function normalizeChatMessageContent(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .split('\u0000').join('')
    .trim()
    .slice(0, CHAT_MESSAGE_MAX_LENGTH);
}

function normalizeMutedChatUserIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
    )
  );
}

function getBubbleTimestampValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (!value) {
    return 0;
  }

  const parsedValue = new Date(value).getTime();
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function getTableChatBubbleCopy(content) {
  const normalizedContent = normalizeChatMessageContent(content);
  if (normalizedContent.length <= TABLE_CHAT_BUBBLE_MAX_LENGTH) {
    return normalizedContent;
  }

  return `${normalizedContent.slice(0, TABLE_CHAT_BUBBLE_MAX_LENGTH - 1).trimEnd()}…`;
}

function normalizeChatMessage(message, fallbackScope = 'lobby') {
  if (!message?.id) {
    return null;
  }

  const content = normalizeChatMessageContent(message.content);
  if (!content) {
    return null;
  }

  return {
    id: String(message.id),
    roomId: String(message.roomId || ''),
    scope: String(message.scope || fallbackScope || 'lobby'),
    sender: {
      userId: String(message.sender?.userId || ''),
      name: getPlayerName(message.sender),
      displayName: getPlayerName(message.sender),
      avatarUrl: getPlayerAvatarSource(message.sender),
      guest: Boolean(message.sender?.guest)
    },
    content,
    createdAt: message.createdAt || new Date().toISOString()
  };
}

function normalizeChatMessages(messages, scope = 'lobby') {
  const seen = new Set();

  return (Array.isArray(messages) ? messages : [])
    .map((message) => normalizeChatMessage(message, scope))
    .filter(Boolean)
    .filter((message) => {
      if (seen.has(message.id)) {
        return false;
      }

      seen.add(message.id);
      return true;
    })
    .sort((left, right) => new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime());
}

function appendChatMessage(currentMessages, nextMessage) {
  const normalizedMessage = normalizeChatMessage(nextMessage, nextMessage?.scope || 'lobby');
  if (!normalizedMessage) {
    return currentMessages;
  }

  const existingIndex = currentMessages.findIndex((message) => message.id === normalizedMessage.id);
  if (existingIndex === -1) {
    return [...currentMessages, normalizedMessage];
  }

  const nextMessages = [...currentMessages];
  nextMessages[existingIndex] = normalizedMessage;
  return nextMessages;
}

function hashString(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createSeededRandom(seedValue) {
  let seed = hashString(seedValue) || 1;

  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function getTrickCardPlacement(play, index) {
  const nextRandom = createSeededRandom([
    play.card,
    play.playedBy || '',
    play.playerName || '',
    index
  ].join(':'));

  return {
    left: 50 + ((nextRandom() - 0.5) * TRICK_CARD_CENTER_BOX_PERCENT),
    top: 50 + ((nextRandom() - 0.5) * TRICK_CARD_CENTER_BOX_PERCENT),
    rotation: (nextRandom() - 0.5) * TRICK_CARD_ROTATION_LIMIT_DEGREES * 2
  };
}

function readStoredPreference(key, fallback, allowedValues) {
  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const storedValue = window.localStorage.getItem(key);
    if (storedValue == null) {
      return fallback;
    }

    if (typeof fallback === 'number') {
      const parsedValue = Number(storedValue);
      return allowedValues.includes(parsedValue) ? parsedValue : fallback;
    }

    return allowedValues.includes(storedValue) ? storedValue : fallback;
  } catch {
    return fallback;
  }
}

function storeGuestProfile(profile, { roomId = null } = {}) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (!profile?.userId || !profile?.name || roomId) {
      window.sessionStorage.removeItem(STORAGE_KEYS.guestProfile);
    }
  } catch {
    // Ignore storage failures in restricted environments.
  }
}

function updateStoredGuestRoom(roomId) {
  void roomId;
}

function readRecoverableGuestSessionForCurrentNavigation() {
  storeGuestProfile(null);
  return null;
}

function parseCard(cardString) {
  const [value, suit] = cardString.split('-');
  return { value, suit };
}

function getCardAssetPath(cardString) {
  if (JOKER_CARD_LABELS[cardString]) {
    return `${CARD_ASSET_BASE_PATH}${cardString}.svg`;
  }

  const { value, suit } = parseCard(cardString);
  const suffix = ILLUSTRATED_FACE_CARD_VALUES.has(value) ? '2' : '';

  return `${CARD_ASSET_BASE_PATH}${CARD_ASSET_VALUE_NAMES[value]}_of_${CARD_ASSET_SUIT_NAMES[suit]}${suffix}.svg`;
}

function getCardLabel(cardString) {
  if (JOKER_CARD_LABELS[cardString]) {
    return JOKER_CARD_LABELS[cardString];
  }

  const { value, suit } = parseCard(cardString);
  return `${CARD_VALUE_NAMES[value]} of ${SUIT_NAMES[suit]}`;
}

function sortCards(cards) {
  return [...cards].sort((leftCard, rightCard) => {
    const left = parseCard(leftCard);
    const right = parseCard(rightCard);

    const suitDiff = SUIT_ORDER.indexOf(left.suit) - SUIT_ORDER.indexOf(right.suit);
    if (suitDiff !== 0) {
      return suitDiff;
    }

    return VALUE_ORDER.indexOf(left.value) - VALUE_ORDER.indexOf(right.value);
  });
}

function getPlayerName(player) {
  return player?.name || player?.displayName || 'Player';
}

function isBotPlayer(player) {
  return Boolean(player?.isBot);
}

function getPlayerInitials(player) {
  const name = getPlayerName(player).trim();
  if (!name) {
    return 'P';
  }

  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function getPlayerAvatarSource(player) {
  return (
    player?.avatarUrl ||
    player?.avatar ||
    player?.profileImageUrl ||
    player?.profileImage ||
    player?.image ||
    DEFAULT_REGISTER_PROFILE_PREVIEW
  );
}

function createEmptyFriendState() {
  return {
    friends: [],
    incomingRequests: [],
    outgoingRequests: []
  };
}

function normalizeRelationshipIds(values) {
  const seen = new Set();

  return (Array.isArray(values) ? values : [])
    .map((value) => {
      if (!value) {
        return '';
      }

      if (typeof value === 'string') {
        return value;
      }

      return String(value.userId || value.id || value._id || '');
    })
    .filter(Boolean)
    .filter((value) => {
      if (seen.has(value)) {
        return false;
      }

      seen.add(value);
      return true;
    });
}

function getPlayerUserId(player) {
  return String(player?.userId || player?.id || '').trim();
}

function getFriendRelationshipStatus(viewer, target) {
  const targetUserId = getPlayerUserId(target);

  if (!targetUserId) {
    return {
      code: 'unavailable',
      label: 'Profile unavailable',
      canSendRequest: false
    };
  }

  if (isBotPlayer(target)) {
    return {
      code: 'bot-player',
      label: 'AI bot',
      canSendRequest: false
    };
  }

  if (target?.guest) {
    return {
      code: 'guest-user',
      label: 'Guest user',
      canSendRequest: false
    };
  }

  if (!viewer?.userId || viewer?.guest) {
    return {
      code: 'login-required',
      label: 'Log in to send a friend request',
      canSendRequest: false
    };
  }

  if (viewer.userId === targetUserId) {
    return {
      code: 'self',
      label: 'This is you',
      canSendRequest: false
    };
  }

  const friendIds = new Set(normalizeRelationshipIds(viewer.friends));
  const incomingIds = new Set(normalizeRelationshipIds(viewer.incomingFriendRequests));
  const outgoingIds = new Set(normalizeRelationshipIds(viewer.outgoingFriendRequests));

  if (friendIds.has(targetUserId)) {
    return {
      code: 'friends',
      label: 'Already friends',
      canSendRequest: false,
      canRemoveFriend: true
    };
  }

  if (outgoingIds.has(targetUserId)) {
    return {
      code: 'outgoing-pending',
      label: 'Request sent',
      canSendRequest: false,
      canCancelOutgoing: true
    };
  }

  if (incomingIds.has(targetUserId)) {
    return {
      code: 'incoming-pending',
      label: 'Sent you a request',
      canSendRequest: false,
      canAcceptRequest: true,
      canRejectRequest: true
    };
  }

  return {
    code: 'not-friends',
    label: 'Send Friend Request',
    canSendRequest: true
  };
}

function buildGuestProfileSummary(player) {
  return {
    userId: getPlayerUserId(player),
    username: getPlayerName(player),
    name: getPlayerName(player),
    displayName: getPlayerName(player),
    guest: true,
    profilePicture: getPlayerAvatarSource(player),
    avatarUrl: getPlayerAvatarSource(player),
    banner: '',
    description: player?.description || 'This player is using a guest profile.',
    elo: null,
    rankName: 'Guest',
    accountCreatedAt: null,
    favouriteRulesets: [],
    rulesetLoadout: []
  };
}

function buildBotProfileSummary(player) {
  return {
    userId: getPlayerUserId(player),
    username: getPlayerName(player),
    name: getPlayerName(player),
    displayName: getPlayerName(player),
    guest: false,
    isBot: true,
    isTrainer: Boolean(player?.isTrainer),
    profilePicture: getPlayerAvatarSource(player),
    avatarUrl: getPlayerAvatarSource(player),
    banner: '',
    description: player?.description || 'Computer-controlled Rentz player.',
    elo: getPlayerRating(player) ?? 500,
    rankName: player?.rankName || 'Starting-out Rentz Rookie',
    accountCreatedAt: null,
    favouriteRulesets: [],
    rulesetLoadout: [],
    replacementForName: player?.replacementForName || null,
    averageHumanElo: player?.averageHumanElo ?? null
  };
}

function getPlayerConnectionStatus(player) {
  if (player?.connectionStatus) {
    return player.connectionStatus;
  }

  if (typeof player?.isConnected === 'boolean') {
    return player.isConnected ? 'connected' : 'reconnecting';
  }

  return 'connected';
}

function getPlayerConnectionLabel(player) {
  const status = getPlayerConnectionStatus(player);
  if (status === 'reconnecting') {
    return 'Reconnecting';
  }

  if (status === 'abandoned') {
    return 'Abandoned';
  }

  return '';
}

function PlayerNameLabel({ player, isLocal = false, className = '', nameClassName = '', suffixClassName = '', trainerTagOnly = false }) {
  const connectionLabel = getPlayerConnectionLabel(player);
  const botBadgeLabel = player?.isTrainer ? 'Trainer' : 'AI';
  const botBadgeClassName = player?.isTrainer
    ? 'border-emerald-200/80 bg-emerald-100/85 text-emerald-950'
    : 'border-sky-200/80 bg-sky-100/85 text-sky-900';
  const shouldShowTrainerTagOnly = trainerTagOnly && player?.isTrainer;

  return (
    <span className={clsx('rentz-player-name-label', className)}>
      {!shouldShowTrainerTagOnly ? (
        <span className={clsx('rentz-player-name-value', nameClassName)}>
          {getPlayerName(player)}
        </span>
      ) : null}
      {isLocal && !shouldShowTrainerTagOnly ? (
        <span className={clsx('rentz-player-name-self', suffixClassName)}>(You)</span>
      ) : null}
      {isBotPlayer(player) ? (
        <span className={clsx('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em]', botBadgeClassName)}>
          {botBadgeLabel}
        </span>
      ) : null}
      {connectionLabel ? (
        <span className="inline-flex items-center rounded-full border border-amber-200/80 bg-amber-100/85 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-amber-900">
          {connectionLabel}
        </span>
      ) : null}
    </span>
  );
}

function getPlayerRating(player) {
  return player?.elo ?? player?.rating ?? player?.mmr ?? player?.rank ?? null;
}

function getPlayerCompetitiveLabel(player) {
  if (isBotPlayer(player)) {
    const rating = getPlayerRating(player);
    if (player?.isTrainer) {
      return rating == null ? 'Trainer ELO 500' : `Trainer ELO ${rating}`;
    }

    return rating == null ? 'AI ELO 500' : `AI ELO ${rating}`;
  }

  if (player?.guest) {
    return 'Guest';
  }

  const rating = getPlayerRating(player);
  return rating == null ? 'ELO --' : `ELO ${rating}`;
}

function getPlayerPoints(player) {
  return player?.points ?? player?.score ?? player?.totalPoints ?? null;
}

function getPlayerPresence(player) {
  if (isBotPlayer(player)) {
    return true;
  }

  if (typeof player?.isConnected === 'boolean') {
    return player.isConnected;
  }

  if (typeof player?.connected === 'boolean') {
    return player.connected;
  }

  return Boolean(player?.socketId || player?.userId);
}

function formatMetaValue(value, fallback = '--') {
  if (value == null || value === '') {
    return fallback;
  }

  return `${value}`;
}

function formatScoreDeltaText(scoreDelta) {
  if (typeof scoreDelta !== 'number' || scoreDelta === 0) {
    return '';
  }

  return `${scoreDelta >= 0 ? '+' : ''}${scoreDelta}`;
}

function formatDuration(ms = 0) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getRankDelta(previousRank, nextRank) {
  if (!previousRank || !nextRank) {
    return '—';
  }

  const delta = previousRank - nextRank;
  if (delta > 0) {
    return `+${delta}`;
  }
  if (delta < 0) {
    return `${delta}`;
  }
  return '0';
}

function formatMarkingSuit(trickSuit) {
  if (!trickSuit) {
    return 'Waiting...';
  }

  return `${SUIT_NAMES[trickSuit].toUpperCase()} ${SUIT_SYMBOLS[trickSuit]}`;
}

function AvatarFace({
  player,
  alt,
  wrapperClassName,
  imageClassName,
  fallbackClassName
}) {
  const preferredSource = getPlayerAvatarSource(player);
  const [imageSource, setImageSource] = useState(preferredSource);

  useEffect(() => {
    setImageSource(preferredSource);
  }, [preferredSource]);

  return (
    <div className={wrapperClassName}>
      {imageSource ? (
        <img
          src={imageSource}
          alt={alt}
          className={imageClassName}
          onError={() => {
            if (imageSource !== DEFAULT_REGISTER_PROFILE_PREVIEW) {
              setImageSource(DEFAULT_REGISTER_PROFILE_PREVIEW);
              return;
            }

            setImageSource('');
          }}
        />
      ) : (
        <div className={fallbackClassName}>{getPlayerInitials(player)}</div>
      )}
    </div>
  );
}

function EmojiReactionBubble({ player, reaction, placement = 'left', className = '' }) {
  const reactionDefinition = reaction?.emojiId ? EMOJI_REACTION_MAP[reaction.emojiId] || null : null;

  if (!reactionDefinition) {
    return null;
  }

  return (
    <div
      className={clsx('rentz-reaction-bubble', placement === 'right' && 'is-right', className)}
      role="status"
      aria-live="polite"
      aria-label={`${getPlayerName(player)} reacted with ${reactionDefinition.label}`}
    >
      <span className={clsx('rentz-reaction-bubble-emoji', reactionDefinition.animationClassName)}>
        {reactionDefinition.glyph}
      </span>
      <span className="rentz-reaction-bubble-tail" aria-hidden="true" />
    </div>
  );
}

function ChatTableBubble({ player, message, placement = 'left', className = '' }) {
  const bubbleCopy = getTableChatBubbleCopy(message?.content);

  if (!bubbleCopy) {
    return null;
  }

  return (
    <div
      className={clsx('rentz-reaction-bubble rentz-chat-table-bubble', placement === 'right' && 'is-right', className)}
      role="status"
      aria-live="polite"
      aria-label={`${getPlayerName(player)} says ${bubbleCopy}`}
    >
      <span className="rentz-chat-table-bubble-copy">{bubbleCopy}</span>
      <span className="rentz-reaction-bubble-tail" aria-hidden="true" />
    </div>
  );
}

function TablePresenceBubble({ player, reaction = null, chatBubble = null, placement = 'left', className = '' }) {
  const reactionTimestamp = getBubbleTimestampValue(reaction?.createdAt);
  const chatTimestamp = getBubbleTimestampValue(chatBubble?.createdAt);

  if (chatTimestamp > reactionTimestamp) {
    return <ChatTableBubble player={player} message={chatBubble} placement={placement} className={className} />;
  }

  if (reaction) {
    return <EmojiReactionBubble player={player} reaction={reaction} placement={placement} className={className} />;
  }

  if (chatBubble) {
    return <ChatTableBubble player={player} message={chatBubble} placement={placement} className={className} />;
  }

  return null;
}

function MobileReactionSpotlight({ player, reaction = null, chatBubble = null }) {
  if (!player || (!reaction && !chatBubble)) {
    return null;
  }

  return (
    <div className="rentz-mobile-reaction-spotlight" role="status" aria-live="polite">
      <div className="rentz-mobile-reaction-player">
        <div className="rentz-avatar-wrap rentz-mobile-reaction-avatar-wrap">
          <TablePresenceBubble
            player={player}
            reaction={reaction}
            chatBubble={chatBubble}
            className="is-spotlight"
          />
          <div className="rentz-avatar-shell rentz-mobile-reaction-avatar-shell">
            <AvatarFace
              player={player}
              alt={`${getPlayerName(player)} avatar`}
              wrapperClassName="h-full w-full"
              imageClassName="rentz-avatar-image"
              fallbackClassName="rentz-avatar-fallback"
            />
          </div>
        </div>
        <div className="rentz-mobile-reaction-name">{getPlayerName(player)}</div>
      </div>
    </div>
  );
}

function canPlayCard({ card, hand, trickSuit, isMyTurn, trickPending, isRoundActive = true }) {
  if (!isRoundActive || !isMyTurn || trickPending) {
    return false;
  }

  if (!trickSuit) {
    return true;
  }

  const { suit } = parseCard(card);
  if (suit === trickSuit) {
    return true;
  }

  return !hand.some((handCard) => parseCard(handCard).suit === trickSuit);
}

function getDesktopSeatOrder(players) {
  if (!players.length) {
    return [];
  }

  return [...players];
}

function getDesktopSeatLayoutMetrics({ playerCount, stageRect, boardRect, stageTightness = 0 }) {
  if (!playerCount) {
    return null;
  }

  const boardCenterX = boardRect.left - stageRect.left + (boardRect.width / 2);
  const boardCenterY = boardRect.top - stageRect.top + (boardRect.height / 2);
  const stageMinDimension = Math.min(stageRect.width, stageRect.height);
  const tightZoomFactor = clampNumber(stageTightness, 0, 1);
  const seatFootprintScale = 1 - (tightZoomFactor * 0.18);
  const seatFootprintX = clampNumber(stageMinDimension * 0.15 * seatFootprintScale, 92, 142);
  const seatFootprintY = clampNumber(stageMinDimension * 0.2 * seatFootprintScale, 104, 168);
  const seatHalfWidth = seatFootprintX / 2;
  const seatHalfHeight = seatFootprintY / 2;
  const padding = {
    left: clampNumber((stageRect.width * 0.042) - (tightZoomFactor * 10), 14, 52),
    right: clampNumber((stageRect.width * 0.042) - (tightZoomFactor * 10), 14, 52),
    top: clampNumber((stageRect.height * 0.022) - (tightZoomFactor * 7), 4, 24),
    bottom: clampNumber((stageRect.height * 0.026) - (tightZoomFactor * 8), 6, 26)
  };
  const boardTop = boardRect.top - stageRect.top;
  const boardBottom = boardRect.bottom - stageRect.top;
  const spaceAboveBoard = Math.max(0, boardTop - padding.top);
  const spaceBelowBoard = Math.max(0, stageRect.height - padding.bottom - boardBottom);
  const upwardCenterShift = clampNumber(
    ((spaceAboveBoard - spaceBelowBoard) * 0.42) + (stageRect.height * 0.035),
    0,
    stageRect.height * 0.16
  );
  const centerX = boardCenterX;
  const centerY = boardCenterY - upwardCenterShift;
  const angles = playerCount === 1
    ? [-Math.PI / 2]
    : Array.from({ length: playerCount }, (_, index) => (-Math.PI / 2) + (index * ((Math.PI * 2) / playerCount)));
  const maxRadiusX = Math.max(
    0,
    Math.min(
      centerX - padding.left - seatHalfWidth,
      stageRect.width - padding.right - centerX - seatHalfWidth
    )
  );
  const maxRadiusY = Math.max(
    0,
    Math.min(
      centerY - padding.top - seatHalfHeight,
      stageRect.height - padding.bottom - centerY - seatHalfHeight
    )
  );
  const maxRadiusTop = Math.max(0, centerY - padding.top - seatHalfHeight);
  const maxRadiusBottom = Math.max(0, stageRect.height - padding.bottom - centerY - seatHalfHeight);
  const preferredRadiusX = (boardRect.width / 2) + seatHalfWidth + clampNumber(stageRect.width * 0.104, 76, 134) + (clampNumber(stageRect.width * 0.072, 28, 76) * tightZoomFactor);
  const preferredRadiusY = (boardRect.height / 2) + seatHalfHeight + clampNumber(stageRect.height * 0.205, 112, 196) + (clampNumber(stageRect.height * 0.11, 42, 92) * tightZoomFactor);
  const minimumRadiusX = (boardRect.width / 2) + seatHalfWidth + clampNumber(stageRect.width * 0.068, 52, 98);
  const minimumRadiusY = (boardRect.height / 2) + seatHalfHeight + clampNumber(stageRect.height * 0.13, 76, 134);

  return {
    angles,
    centerX,
    centerY,
    maxRadiusX,
    maxRadiusY,
    maxRadiusTop,
    maxRadiusBottom,
    minimumRadiusX,
    minimumRadiusY,
    padding,
    preferredRadiusX,
    preferredRadiusY
  };
}

function getDesktopStageTightness({ playerCount, stageRect, boardRect }) {
  const baseMetrics = getDesktopSeatLayoutMetrics({
    playerCount,
    stageRect,
    boardRect,
    stageTightness: 0
  });

  if (!baseMetrics) {
    return 0;
  }

  const horizontalCompression = clampNumber(
    (baseMetrics.preferredRadiusX - baseMetrics.maxRadiusX) / Math.max(baseMetrics.preferredRadiusX, 1),
    0,
    1
  );
  const verticalCompression = clampNumber(
    (baseMetrics.preferredRadiusY - baseMetrics.maxRadiusY) / Math.max(baseMetrics.preferredRadiusY, 1),
    0,
    1
  );

  return clampNumber(Math.max(horizontalCompression * 2.1, verticalCompression * 2.8), 0, 1);
}

function buildDesktopSeatLayout({ playerCount, stageRect, boardRect, stageTightness = 0 }) {
  const layoutMetrics = getDesktopSeatLayoutMetrics({
    playerCount,
    stageRect,
    boardRect,
    stageTightness
  });

  if (!layoutMetrics) {
    return [];
  }

  const tightZoomFactor = clampNumber(stageTightness, 0, 1);
  const radiusX = Math.max(
    Math.min(layoutMetrics.preferredRadiusX, layoutMetrics.maxRadiusX),
    Math.min(layoutMetrics.minimumRadiusX, layoutMetrics.maxRadiusX)
  );
  const baseRadiusY = Math.max(
    Math.min(layoutMetrics.preferredRadiusY, layoutMetrics.maxRadiusY),
    Math.min(layoutMetrics.minimumRadiusY, layoutMetrics.maxRadiusY)
  );
  const expandedRadiusY = baseRadiusY + ((layoutMetrics.maxRadiusY - baseRadiusY) * (0.26 + (tightZoomFactor * 0.68)));
  const symmetricRadiusY = clampNumber(
    expandedRadiusY,
    Math.min(layoutMetrics.minimumRadiusY, layoutMetrics.maxRadiusY),
    layoutMetrics.maxRadiusY
  );
  const radiusYTop = clampNumber(
    symmetricRadiusY + ((layoutMetrics.maxRadiusTop - symmetricRadiusY) * (0.72 + (tightZoomFactor * 0.18))),
    Math.min(layoutMetrics.minimumRadiusY, layoutMetrics.maxRadiusTop),
    layoutMetrics.maxRadiusTop
  );
  const radiusYBottom = clampNumber(
    symmetricRadiusY + ((layoutMetrics.maxRadiusBottom - symmetricRadiusY) * (0.32 + (tightZoomFactor * 0.12))),
    Math.min(layoutMetrics.minimumRadiusY, layoutMetrics.maxRadiusBottom),
    layoutMetrics.maxRadiusBottom
  );

  return layoutMetrics.angles.map((angle) => {
    const rawX = layoutMetrics.centerX + (Math.cos(angle) * radiusX);
    const verticalRadius = Math.sin(angle) < 0 ? radiusYTop : radiusYBottom;
    const rawY = layoutMetrics.centerY + (Math.sin(angle) * verticalRadius);

    return {
      x: clampNumber(rawX, layoutMetrics.padding.left, stageRect.width - layoutMetrics.padding.right),
      y: clampNumber(rawY, layoutMetrics.padding.top, stageRect.height - layoutMetrics.padding.bottom),
      angle
    };
  });
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'absolute';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand('copy');
  document.body.removeChild(textArea);
}

function Card({ cardString, onClick, disabled, ghosted = false, compact = false, title = '', variant = 'default' }) {
  if (!cardString) {
    return null;
  }

  const cardLabel = getCardLabel(cardString);
  const cardAssetPath = getCardAssetPath(cardString);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : (onClick ? 0 : -1)}
      title={title}
      aria-label={cardLabel}
      className={clsx(
        'relative isolate flex shrink-0 overflow-hidden bg-transparent p-0 transition-[transform,box-shadow,filter,opacity] duration-200',
        variant === 'trick'
          ? 'rounded-[0.22rem]'
          : variant === 'hand'
            ? 'rounded-none'
            : 'rounded-[0.34rem]',
        variant === 'trick' || variant === 'hand'
          ? 'h-full w-full'
          : compact
            ? 'h-[3.85rem] w-[2.6rem] sm:h-[4.3rem] sm:w-[2.9rem] md:h-[4.75rem] md:w-[3.2rem]'
            : 'h-[5.2rem] w-[3.45rem] sm:h-[5.95rem] sm:w-[3.95rem] md:h-[8rem] md:w-[5.2rem] lg:h-[8.7rem] lg:w-[5.65rem]',
        disabled && ghosted
          ? 'cursor-not-allowed opacity-40 saturate-0'
          : disabled
            ? 'cursor-default opacity-90'
            : 'cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_18px_28px_-16px_rgba(0,0,0,0.4)]'
      )}
      style={{
        boxShadow: '0 10px 18px rgba(0, 0, 0, 0.12)'
      }}
    >
      <img
        src={cardAssetPath}
        alt=""
        aria-hidden="true"
        draggable="false"
        className={clsx(
          'block h-full w-full select-none',
          variant === 'hand' ? 'object-fill' : 'object-contain'
        )}
      />
    </button>
  );
}

function ThemeTray({ themes, theme, onThemeChange, mobile = false }) {
  return (
    <div
      className={clsx(
        'relative z-40',
        mobile ? 'flex gap-2 overflow-x-auto p-2' : 'grid grid-cols-1 gap-2.5 p-0 sm:grid-cols-2'
      )}
    >
      {themes.map((themeOption) => (
        <button
          type="button"
          key={themeOption.id}
          onClick={() => onThemeChange(themeOption.id)}
          className={clsx(
            'theme-chip relative z-10',
            theme === themeOption.id ? 'theme-chip-active scale-[1.02]' : 'text-[var(--text-secondary)]'
          )}
        >
          {themeOption.label}
        </button>
      ))}
    </div>
  );
}

function SettingsSlider({ title, description, min, max, step, value, defaultValue, onChange }) {
  const midpointValue = getStepAlignedMidpoint(min, max, step);

  return (
    <section className="glass-panel p-5 sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="text-xl font-display font-black text-[var(--text-primary)] sm:text-2xl">{title}</h4>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="status-pill w-fit px-4 py-2">{value}%</div>
          <button
            type="button"
            onClick={() => onChange(defaultValue)}
            className="rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="rounded-[1.4rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] px-4 py-4 sm:px-5">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="settings-slider"
          aria-label={title}
        />
        <div className="mt-3 flex items-center justify-between gap-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--text-secondary)] sm:text-xs">
          <span>{min}%</span>
          <span>{midpointValue}%</span>
          <span>{max}%</span>
        </div>
        <p className="mt-3 text-xs font-semibold leading-6 text-[var(--text-secondary)]">
          {description}
        </p>
      </div>
    </section>
  );
}

function ChromePanelHeader({ title, accent = 'neutral' }) {
  return (
    <div className="rentz-panel-header">
      <div className="rentz-panel-dots" aria-hidden="true">
        <span className="is-red" />
        <span className="is-yellow" />
        <span className="is-green" />
      </div>
      <h4 className={clsx('rentz-panel-title', accent === 'light' && 'text-white')}>{title}</h4>
    </div>
  );
}

function RentzSeatCluster({
  player,
  seatRole = 'top',
  isCurrent = false,
  isWinner = false,
  isLocal = false,
  showElo = true,
  showStats = true,
  cardCount = 0,
  tricksWon = 0,
  points = null,
  mobileHero = false,
  reaction = null,
  chatBubble = null,
  reactionPlacement = 'left',
  onEmojiClick,
  onProfileAction = null
}) {
  const isConnected = getPlayerPresence(player);
  const showTurnMarker = isCurrent && !mobileHero;

  return (
    <article data-seat-player-id={player.userId}
      className={clsx(
        'rentz-seat-cluster',
        `rentz-seat-cluster-${seatRole}`,
        mobileHero && 'rentz-seat-cluster-hero',
        isWinner && 'is-winner',
        showTurnMarker && 'is-current'
      )}
    >
      {showTurnMarker && (
        <div
          className="rentz-seat-turn-marker"
          aria-label={`${getPlayerName(player)} is the current player`}
        />
      )}

      {onProfileAction ? (
        <button
          type="button"
          onClick={(event) => onProfileAction(event, player)}
          className="rentz-seat-name-button"
          title={`Open actions for ${getPlayerName(player)}`}
        >
          <PlayerNameLabel
            player={player}
            isLocal={isLocal}
            className="rentz-seat-name"
            trainerTagOnly
          />
        </button>
      ) : (
        <PlayerNameLabel
          player={player}
          isLocal={isLocal}
          className="rentz-seat-name"
          trainerTagOnly
        />
      )}

      <div className="rentz-avatar-wrap">
        <TablePresenceBubble
          player={player}
          reaction={reaction}
          chatBubble={chatBubble}
          placement={reactionPlacement}
        />
        {isLocal && onEmojiClick && (
          <button
            type="button"
            onClick={(event) => onEmojiClick(event, player)}
            className="rentz-emoji-button"
            title={`Open emoji reaction menu for ${getPlayerName(player)}`}
            aria-label={`Open emoji reaction menu for ${getPlayerName(player)}`}
          >
            🙂
          </button>
        )}
        <span
          className={clsx('rentz-presence-dot', isConnected ? 'is-online' : 'is-offline')}
          title={isConnected ? 'Present in room' : 'Not currently connected'}
        />

        {onProfileAction ? (
          <button
            type="button"
            onClick={(event) => onProfileAction(event, player)}
            className="rentz-seat-avatar-trigger"
            title={`Open actions for ${getPlayerName(player)}`}
          >
            <div className="rentz-avatar-shell">
              <AvatarFace
                player={player}
                alt={`${getPlayerName(player)} avatar`}
                wrapperClassName="h-full w-full"
                imageClassName="rentz-avatar-image"
                fallbackClassName="rentz-avatar-fallback"
              />

              {showElo && (
                <div className="rentz-elo-badge">
                  <Trophy className="h-3 w-3" />
                  <span>{getPlayerCompetitiveLabel(player)}</span>
                </div>
              )}
            </div>
          </button>
        ) : (
          <div className="rentz-avatar-shell">
            <AvatarFace
              player={player}
              alt={`${getPlayerName(player)} avatar`}
              wrapperClassName="h-full w-full"
              imageClassName="rentz-avatar-image"
              fallbackClassName="rentz-avatar-fallback"
            />

            {showElo && (
              <div className="rentz-elo-badge">
                <Trophy className="h-3 w-3" />
                <span>{getPlayerCompetitiveLabel(player)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {showStats && (
        <div className="rentz-seat-stats">
          <div className="rentz-seat-stat">
            <span className="rentz-seat-stat-value">{tricksWon}</span>
            <span className="rentz-seat-stat-label">hands</span>
          </div>
          <div className="rentz-seat-stat">
            <span className="rentz-seat-stat-value">{formatMetaValue(points)}</span>
            <span className="rentz-seat-stat-label">points</span>
          </div>
          <div className="rentz-seat-stat">
            <span className="rentz-seat-stat-value">{cardCount}</span>
            <span className="rentz-seat-stat-label">cards</span>
          </div>
        </div>
      )}
    </article>
  );
}

function CompactPlayerRow({ player, isCurrent, isLocal, cardCount, tricksWon, points, onProfileAction = null }) {
  const identityContent = (
    <>
      <AvatarFace
        player={player}
        alt={`${getPlayerName(player)} avatar`}
        wrapperClassName="rentz-player-row-avatar"
        imageClassName="rentz-player-row-avatar-image"
        fallbackClassName="rentz-player-row-avatar-fallback"
      />
      <div className="rentz-player-row-copy">
        <PlayerNameLabel
          player={player}
          isLocal={isLocal}
          className="rentz-player-row-name"
        />
        <div className="rentz-player-row-meta">
          <span>{getPlayerCompetitiveLabel(player)}</span>
          <span>{cardCount} cards</span>
          <span>{tricksWon} hands</span>
          <span>{formatMetaValue(points)} pts</span>
        </div>
      </div>
    </>
  );

  return (
    <div data-seat-player-id={player?.userId} className={clsx('rentz-player-row', isCurrent && 'is-current')}>
      {onProfileAction ? (
        <button
          type="button"
          onClick={(event) => onProfileAction(event, player)}
          className="rentz-player-row-main"
          title={`Open actions for ${getPlayerName(player)}`}
        >
          {identityContent}
        </button>
      ) : (
        <div className="rentz-player-row-main is-static">
          {identityContent}
        </div>
      )}
    </div>
  );
}

function DesktopPlayerCard({ player, isCurrent, isLocal, cardCount, tricksWon, points, onProfileAction = null }) {
  return (
    <article className={clsx('rentz-desktop-player-card', isCurrent && 'is-current', isLocal && 'is-local')}>
      {onProfileAction ? (
        <button
          type="button"
          onClick={(event) => onProfileAction(event, player)}
          className="rentz-desktop-player-card-identity"
          title={`Open actions for ${getPlayerName(player)}`}
        >
          <div className="rentz-desktop-player-card-top">
            <div className="rentz-desktop-player-card-avatar">
              <AvatarFace
                player={player}
                alt={`${getPlayerName(player)} avatar`}
                wrapperClassName="h-full w-full"
                imageClassName="rentz-desktop-player-card-avatar-image"
                fallbackClassName="rentz-desktop-player-card-avatar-fallback"
              />
            </div>
            <div className="rentz-desktop-player-card-copy">
              <PlayerNameLabel
                player={player}
                isLocal={isLocal}
                className="rentz-desktop-player-card-name"
              />
              <div className="rentz-desktop-player-card-rating">
                {getPlayerCompetitiveLabel(player)} <span aria-hidden="true">★</span>
              </div>
              <div className="rentz-desktop-player-card-stats">
                <span>{cardCount} cards</span>
                <span>{tricksWon} hands</span>
                <span>{formatMetaValue(points)} pts</span>
              </div>
            </div>
          </div>
        </button>
      ) : (
        <div className="rentz-desktop-player-card-top">
          <div className="rentz-desktop-player-card-avatar">
            <AvatarFace
              player={player}
              alt={`${getPlayerName(player)} avatar`}
              wrapperClassName="h-full w-full"
              imageClassName="rentz-desktop-player-card-avatar-image"
              fallbackClassName="rentz-desktop-player-card-avatar-fallback"
            />
          </div>
          <div className="rentz-desktop-player-card-copy">
            <PlayerNameLabel
              player={player}
              isLocal={isLocal}
              className="rentz-desktop-player-card-name"
            />
            <div className="rentz-desktop-player-card-rating">
              {getPlayerCompetitiveLabel(player)} <span aria-hidden="true">★</span>
            </div>
            <div className="rentz-desktop-player-card-stats">
              <span>{cardCount} cards</span>
              <span>{tricksWon} hands</span>
              <span>{formatMetaValue(points)} pts</span>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function TrickBoard({ currentTrick, trickPending, trickWinnerId, boardRef }) {
  const [flightPaths, setFlightPaths] = useState(null);

  useLayoutEffect(() => {
    if (trickPending && trickWinnerId && currentTrick.length > 0) {
      const timer = window.setTimeout(() => {
        let targetEl = null;

        const mobileHeroEl = document.querySelector('.rentz-mobile-hero .rentz-seat-cluster');
        if (mobileHeroEl && window.getComputedStyle(mobileHeroEl.parentElement).display !== 'none') {
          targetEl = mobileHeroEl;
        } else {
          targetEl = document.querySelector(`.rentz-desktop-seats [data-seat-player-id="${trickWinnerId}"]`);
        }

        if (targetEl && boardRef.current) {
          const boardRect = boardRef.current.getBoundingClientRect();
          const targetRect = targetEl.getBoundingClientRect();

          const flightX = targetRect.left + targetRect.width / 2 - (boardRect.left + boardRect.width / 2);
          const flightY = targetRect.top + targetRect.height / 2 - (boardRect.top + boardRect.height / 2);

          setFlightPaths({ x: flightX, y: flightY });
        }
      }, 50);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => setFlightPaths(null), 0);
    return () => window.clearTimeout(timer);
  }, [boardRef, trickPending, trickWinnerId, currentTrick.length]);

  return (
    <section
      ref={boardRef}
      className={clsx('rentz-trick-board', trickPending && 'is-pending')}
      aria-label="Central trick board"
    >
      {(currentTrick || []).map((play, index) => {
        const placement = getTrickCardPlacement(play, index);
        const isFlying = flightPaths !== null;

        return (
          <div
            key={`${play.playedBy || play.playerName || 'player'}-${play.card}-${index}`}
            className="rentz-trick-card"
            style={{
              left: `${placement.left}%`,
              top: `${placement.top}%`,
              transform: isFlying
                ? `translate(calc(-50% + ${flightPaths.x}px), calc(-50% + ${flightPaths.y}px)) scale(0.3)`
                : `translate(-50%, -50%) rotate(${placement.rotation}deg)`,
              transition: isFlying ? `transform 0.8s cubic-bezier(0.4, 0.0, 0.2, 1), opacity 0.25s ease 0.8s` : 'none',
              opacity: isFlying ? 0 : 1,
              zIndex: index + 1
            }}
          >
            <div className="rentz-trick-card-content">
              <Card cardString={play.card} compact disabled variant="trick" />
            </div>
          </div>
        );
      })}
    </section>
  );
}

function CollectedHandsView({ players, collectedHandsByPlayer, myPlayerId }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {players.map((player) => {
        const tricks = collectedHandsByPlayer[player.userId] || [];
        const isMe = player.userId === myPlayerId;

        return (
          <section key={player.userId} className="glass-panel p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-xl font-display font-black text-[var(--text-primary)]">
                  {getPlayerName(player)} {isMe ? '(You)' : ''}
                </h4>
                <p className="text-sm font-semibold text-[var(--text-secondary)]">
                  {tricks.length} collected hand{tricks.length === 1 ? '' : 's'}
                </p>
              </div>
              <div className="status-pill px-3 py-2">{tricks.length}</div>
            </div>

            {tricks.length === 0 ? (
              <div className="rounded-[1.3rem] border border-dashed border-[var(--glass-border)] bg-[var(--surface-subtle)] p-5 text-sm font-semibold text-[var(--text-secondary)]">
                No hands collected yet.
              </div>
            ) : (
              <div className="space-y-3">
                {tricks.map((trick, trickIndex) => (
                  <div key={`${player.userId}-${trickIndex}`} className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-subtle)] p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span className="text-sm font-extrabold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                        Hand {trickIndex + 1}
                      </span>
                      <span className="text-xs font-bold text-[var(--text-secondary)]">
                        Won by {getPlayerName(player)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {trick.map((play, playIndex) => (
                        <div key={`${player.userId}-${trickIndex}-${playIndex}`} className="flex flex-col items-center gap-1">
                          <Card cardString={play.card} compact disabled />
                          <span className="max-w-[4.5rem] truncate text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                            {play.playerName}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ModalShell({
  title,
  eyebrow,
  onClose,
  children,
  footer,
  wide = false,
  headerAside = null,
  afterPanel = null,
  overlayClassName = '',
  panelClassName = '',
  bodyClassName = ''
}) {
  return (
    <div className={clsx('rentz-modal-overlay fixed inset-0 z-[80] flex items-center justify-center px-4 py-6', overlayClassName)}>
      <div className={clsx('rentz-modal-panel glass-panel flex max-h-[82vh] w-full flex-col rounded-[2rem] p-5 sm:p-6', wide ? 'max-w-6xl' : 'max-w-3xl', panelClassName)}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 pr-2">
            {eyebrow && (
              <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--text-secondary)]">
                {eyebrow}
              </div>
            )}
            <h3 className="mt-2 break-words pr-1 text-2xl font-display font-black text-[var(--text-primary)] sm:text-3xl">
              {title}
            </h3>
          </div>
          {headerAside}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] p-2 text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className={clsx('mt-5 min-h-0 flex-1 overflow-y-auto pr-1', bodyClassName)} data-rentz-modal-scroll="y">
          {children}
        </div>
        {footer && <div className="mt-5 shrink-0">{footer}</div>}
      </div>
      {afterPanel}
    </div>
  );
}

function ToggleCheck({ checked, disabled = false, onChange, label, compact = false }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={clsx(
        'rentz-toggle-check',
        checked && 'is-checked',
        disabled && 'is-disabled',
        compact && 'is-compact'
      )}
    >
      <span className="rentz-toggle-check-mark" aria-hidden="true">
        <Check className="h-3.5 w-3.5" strokeWidth={3.2} />
      </span>
    </button>
  );
}

function StatsOverlay({
  stats,
  players,
  onClose,
  onContinue,
  onEndGame,
  onSaveQuit,
  canContinue,
  canEndGame,
  canSaveQuit,
  actionBusy = '',
  matchComplete
}) {
  if (!stats) {
    return null;
  }

  const playersById = new Map(players.map((player) => [player.userId, player]));
  const rankingRows = players.map((player) => {
    const previousRank = stats.previousRanks?.[player.userId];
    const nextRank = stats.nextRanks?.[player.userId];
    const previousPoints = stats.previousPoints?.[player.userId] || 0;
    const nextPoints = stats.nextPoints?.[player.userId] || 0;
    const scoreDelta = stats.scoreDeltas?.[player.userId] || 0;

    return {
      player,
      previousRank,
      nextRank,
      previousPoints,
      nextPoints,
      scoreDelta
    };
  }).sort((left, right) => {
    const leftRank = left.nextRank || 999;
    const rightRank = right.nextRank || 999;
    return leftRank - rightRank;
  });

  return (
    <ModalShell
      title={matchComplete ? 'Final Stats' : 'Round Stats'}
      eyebrow={`${stats.rulesetLabel || 'Ruleset'}${stats.nv ? ' (NV)' : ''}`}
      wide
      footer={(
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          {!matchComplete && !canContinue && !canEndGame && !canSaveQuit ? (
            <div className="rounded-[1.1rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] px-4 py-3 text-sm font-semibold text-[var(--text-secondary)] sm:mr-auto">
              Waiting for the host to continue, end, or save the match.
            </div>
          ) : null}
          {canContinue && !matchComplete && (
            <button
              type="button"
              onClick={onContinue}
              disabled={actionBusy !== ''}
              className="frutiger-button px-5 py-3 text-sm uppercase tracking-[0.14em] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {actionBusy === 'continue' ? 'Continuing...' : 'Continue Match'}
            </button>
          )}
          {canEndGame && !matchComplete ? (
            <button
              type="button"
              onClick={onEndGame}
              disabled={actionBusy !== ''}
              className="rounded-[1.3rem] border border-amber-200/80 bg-amber-100/85 px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-amber-950 transition hover:bg-amber-200/80 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {actionBusy === 'end' ? 'Ending...' : 'End Game'}
            </button>
          ) : null}
          {canSaveQuit && !matchComplete ? (
            <button
              type="button"
              onClick={onSaveQuit}
              disabled={actionBusy !== ''}
              className="rounded-[1.3rem] border border-sky-200/80 bg-sky-100/85 px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-sky-950 transition hover:bg-sky-200/80 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {actionBusy === 'save' ? 'Saving...' : 'Save & Quit'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
          >
            Hide
          </button>
        </div>
      )}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="rounded-[1.4rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="status-pill px-4 py-3">Time {formatDuration(stats.durationMs)}</div>
            <div className="status-pill px-4 py-3">Game {stats.rulesetAbbreviation || stats.rulesetLabel}</div>
            <div className="status-pill px-4 py-3">{stats.nv ? 'NV x2' : 'Normal'}</div>
          </div>

          <div className="mt-4 space-y-3">
            {rankingRows.map(({ player, previousRank, nextRank, previousPoints, nextPoints, scoreDelta }) => (
              <div key={player.userId} className="flex items-center justify-between gap-3 rounded-[1.15rem] border border-[var(--glass-border)] bg-[var(--surface-subtle)] px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-base font-black text-[var(--text-primary)]">{getPlayerName(player)}</div>
                  <div className="text-xs font-bold text-[var(--text-secondary)]">
                    Rank {previousRank || '—'} → {nextRank || '—'} ({getRankDelta(previousRank, nextRank)})
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em]">
                    <span className="rounded-full bg-slate-200/85 px-3 py-1 text-slate-700">
                      Current {previousPoints}
                    </span>
                    <span className="rounded-full bg-sky-200/80 px-3 py-1 text-sky-900">
                      Final {nextPoints}
                    </span>
                  </div>
                </div>
                <div className={clsx('text-lg font-black', scoreDelta >= 0 ? 'text-emerald-700' : 'text-red-700')}>
                  {scoreDelta >= 0 ? '+' : ''}{scoreDelta}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[1.4rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="text-lg font-display font-black text-[var(--text-primary)]">Taken Hands</h4>
            <div className="status-pill px-3 py-2">{stats.tricks?.length || 0}</div>
          </div>
          <div className="grid max-h-[46vh] gap-3 overflow-y-auto pr-1" data-rentz-modal-scroll="y">
            {(stats.tricks || []).length === 0 ? (
              <div className="rounded-[1.2rem] border border-dashed border-[var(--glass-border)] bg-[var(--surface-subtle)] p-4 text-sm font-semibold text-[var(--text-secondary)]">
                No hands were taken in this round.
              </div>
            ) : stats.tricks.map((trick) => (
              <div key={`${stats.roundId}-${trick.index}`} className="rounded-[1.2rem] border border-[var(--glass-border)] bg-[var(--surface-subtle)] p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">Hand {trick.index}</span>
                  {trick.scoreDelta !== 0 && (
                    <span className={clsx('rounded-full px-3 py-1 text-xs font-black', trick.scoreDelta >= 0 ? 'bg-emerald-200/80 text-emerald-900' : 'bg-red-200/80 text-red-900')}>
                      {formatScoreDeltaText(trick.scoreDelta)}
                    </span>
                  )}
                </div>
                <div className="mb-3 text-sm font-bold text-[var(--text-secondary)]">
                  Taken by {getPlayerName(playersById.get(trick.takenBy)) || trick.takenByName}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(trick.cards || []).map((play, index) => (
                    <div key={`${trick.index}-${play.card}-${index}`} className="flex flex-col items-center gap-1">
                      <Card cardString={play.card} compact disabled />
                      <span className="max-w-[4.5rem] truncate text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-secondary)]">
                        {play.playerName}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </ModalShell>
  );
}

function App() {
  const [theme, setTheme] = useState(() =>
    readStoredPreference(
      STORAGE_KEYS.theme,
      'theme-frutiger-lime',
      ['theme-frutiger-lime', 'theme-dark-glass', 'theme-light-gloss', 'theme-colorful-aero']
    )
  );
  const [fontScale, setFontScale] = useState(() =>
    readStoredPreference(
      STORAGE_KEYS.fontScale,
      FONT_SCALE_RANGE.defaultValue / 100,
      createStepValues(FONT_SCALE_RANGE.min, FONT_SCALE_RANGE.max, FONT_SCALE_RANGE.step).map((value) => value / 100)
    )
  );
  const [pageZoom, setPageZoom] = useState(() =>
    readStoredPreference(
      STORAGE_KEYS.pageZoom,
      PAGE_ZOOM_RANGE.defaultValue / 100,
      createStepValues(PAGE_ZOOM_RANGE.min, PAGE_ZOOM_RANGE.max, PAGE_ZOOM_RANGE.step).map((value) => value / 100)
    )
  );
  const [activeTab, setActiveTab] = useState('play');
  const [isMobileMoreOpen, setIsMobileMoreOpen] = useState(false);
  const [playView, setPlayView] = useState('table');

  const [inLobby, setInLobby] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [players, setPlayers] = useState([]);
  const [spectators, setSpectators] = useState([]);
  const [lobbyHostId, setLobbyHostId] = useState('');
  const [roomSettings, setRoomSettings] = useState(() => normalizeRoomSettings());
  const [draftRoomSettings, setDraftRoomSettings] = useState(() => normalizeRoomSettings());
  const [isRoomSettingsOpen, setIsRoomSettingsOpen] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomVisibility, setRoomVisibility] = useState(DEFAULT_ROOM_VISIBILITY);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomVisibility, setNewRoomVisibility] = useState(DEFAULT_ROOM_VISIBILITY);
  const [isPublicBrowserOpen, setIsPublicBrowserOpen] = useState(false);
  const [publicRooms, setPublicRooms] = useState([]);
  const [publicRoomsLoading, setPublicRoomsLoading] = useState(false);
  const [matchMode, setMatchMode] = useState(MATCH_MODE_STANDARD);
  const [trainingState, setTrainingState] = useState(null);
  const [trainingFinalReview, setTrainingFinalReview] = useState(null);
  const [isTrainingSetupOpen, setIsTrainingSetupOpen] = useState(false);
  const [trainingSetup, setTrainingSetup] = useState(() => createTrainingSetup());
  const [trainingStartBusy, setTrainingStartBusy] = useState(false);
  const [trainingValidationMessage, setTrainingValidationMessage] = useState('');
  const [trainingReturnBusy, setTrainingReturnBusy] = useState(false);
  const [guestNameInput, setGuestNameInput] = useState('');
  const [guestProfile, setGuestProfile] = useState(null);
  const [recoverableGuestSession, setRecoverableGuestSession] = useState(() => readRecoverableGuestSessionForCurrentNavigation());
  const [isRecoveryPromptOpen, setIsRecoveryPromptOpen] = useState(() => Boolean(recoverableGuestSession?.profile));
  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [friendState, setFriendState] = useState(() => createEmptyFriendState());
  const [authView, setAuthView] = useState('login');
  const [authBusyAction, setAuthBusyAction] = useState('');
  const [authFeedback, setAuthFeedback] = useState('');
  const [loginForm, setLoginForm] = useState({
    username: '',
    password: ''
  });
  const [registerForm, setRegisterForm] = useState({
    username: '',
    password: '',
    profilePictureFile: null,
    profilePicturePreview: '',
    bannerFile: null,
    bannerPreview: '',
    description: ''
  });
  const [forgotPasswordUsername, setForgotPasswordUsername] = useState('');
  const [accountEditMode, setAccountEditMode] = useState(false);
  const [accountEditForm, setAccountEditForm] = useState(() => createAccountEditForm(null));
  const [accountRulesetCatalog, setAccountRulesetCatalog] = useState(() => createFallbackAccountRulesetCatalog());
  const [accountRulesetPicker, setAccountRulesetPicker] = useState(null);
  const [accountRulesetBusyField, setAccountRulesetBusyField] = useState('');
  const [accountImagePreview, setAccountImagePreview] = useState(null);

  const [gameStarted, setGameStarted] = useState(false);
  const [isSpectatingGame, setIsSpectatingGame] = useState(false);
  const [gameFinished, setGameFinished] = useState(false);
  const [trickPending, setTrickPending] = useState(false);
  const [hand, setHand] = useState([]);
  const [spectatorVisibleHand, setSpectatorVisibleHand] = useState([]);
  const [, setSpectatorVisiblePlayerId] = useState('');
  const [spectatorVisiblePlayerName, setSpectatorVisiblePlayerName] = useState('');
  const [startingHandSize, setStartingHandSize] = useState(0);
  const [cardCounts, setCardCounts] = useState({});
  const [currentTrick, setCurrentTrick] = useState([]);
  const [trickSuit, setTrickSuit] = useState(null);
  const [turnIndex, setTurnIndex] = useState(0);
  const [myIndex, setMyIndex] = useState(-1);
  const [animatingWinner, setAnimatingWinner] = useState(null);
  const [trickWinnerId, setTrickWinnerId] = useState(null);
  const [collectedHandsByPlayer, setCollectedHandsByPlayer] = useState({});
  const [choiceState, setChoiceState] = useState(null);
  const [latestRoundStats, setLatestRoundStats] = useState(null);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [matchCompletePending, setMatchCompletePending] = useState(false);
  const [roundActionBusy, setRoundActionBusy] = useState('');
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const [localTimerDeadline, setLocalTimerDeadline] = useState(null);
  const [activityFeed, setActivityFeed] = useState([]);
  const [roomChatMessages, setRoomChatMessages] = useState([]);
  const [gameChatMessages, setGameChatMessages] = useState([]);
  const [chatDrafts, setChatDrafts] = useState({ lobby: '', game: '' });
  const [chatBusyScope, setChatBusyScope] = useState('');
  const [mutedChatUserIds, setMutedChatUserIds] = useState([]);
  const [isDesktopChatOpen, setIsDesktopChatOpen] = useState(false);
  const [desktopChatUnread, setDesktopChatUnread] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [finalStandings, setFinalStandings] = useState([]);
  const [topPrompts, setTopPrompts] = useState([]);
  const [turnTimerNotice, setTurnTimerNotice] = useState('');
  const [isSpectatorPopoverOpen, setIsSpectatorPopoverOpen] = useState(false);
  const [playerActionMenu, setPlayerActionMenu] = useState(null);
  const [playerProfileModal, setPlayerProfileModal] = useState(null);
  const [playerProfileLoading, setPlayerProfileLoading] = useState(false);
  const [rankLeaderboardModal, setRankLeaderboardModal] = useState(null);
  const [friendActionBusyTargetId, setFriendActionBusyTargetId] = useState('');
  const [chatMuteBusyTargetId, setChatMuteBusyTargetId] = useState('');
  const [pendingSpectatorJoin, setPendingSpectatorJoin] = useState(null);
  const [rulesetPreview, setRulesetPreview] = useState(null);
  const [banNoticeModal, setBanNoticeModal] = useState(null);
  const [roomStartBlockedModal, setRoomStartBlockedModal] = useState(null);
  const [leaveMatchConfirmModal, setLeaveMatchConfirmModal] = useState(null);
  const [savedGameRulesetTableModal, setSavedGameRulesetTableModal] = useState(null);
  const [emojiPickerState, setEmojiPickerState] = useState(null);
  const [activeReactions, setActiveReactions] = useState({});
  const [activeChatBubbles, setActiveChatBubbles] = useState({});
  const [mobileReactionSpotlight, setMobileReactionSpotlight] = useState(null);
  const [mobileChatSpotlight, setMobileChatSpotlight] = useState(null);
  const [desktopSeatLayout, setDesktopSeatLayout] = useState([]);
  const [desktopStageTightness, setDesktopStageTightness] = useState(0);
  const [handSpreadMetrics, setHandSpreadMetrics] = useState(null);
  const [hoveredCardIndex, setHoveredCardIndex] = useState(null);
  const [pendingPlayCard, setPendingPlayCard] = useState(null);
  const topPromptTimeoutsRef = useRef(new Map());
  const gameEventTimeoutsRef = useRef(new Set());
  const latestGameStateVersionRef = useRef(0);
  const startingHandSizeRef = useRef(0);
  const activeProfileRef = useRef(null);
  const isPublicBrowserOpenRef = useRef(false);
  const mobileNavRef = useRef(null);
  const tableStageRef = useRef(null);
  const cardBoardRef = useRef(null);
  const handScrollRef = useRef(null);
  const choiceHandScrollRef = useRef(null);
  const editorImportInputRef = useRef(null);
  const roomImportInputRef = useRef(null);
  const accountAvatarInputRef = useRef(null);
  const accountBannerInputRef = useRef(null);
  const descriptionTextareaRef = useRef(null);
  const spectatorPopoverRef = useRef(null);
  const playerActionMenuRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const showReactionBubbleRef = useRef(() => {});
  const showChatTableBubbleRef = useRef(() => {});
  const desktopChatOpenRef = useRef(false);
  const activeChatScopeRef = useRef('');
  const turnTimerWarningStateRef = useRef({ deadline: null, halfShown: false, quarterShown: false });
  const turnTimerNoticeTimeoutRef = useRef(null);
  const reactionTimeoutsRef = useRef(new Map());
  const chatBubbleTimeoutsRef = useRef(new Map());
  const mobileReactionSpotlightTimeoutRef = useRef(null);
  const mobileChatSpotlightTimeoutRef = useRef(null);
  const forumReplyPreviewUrlsRef = useRef([]);
  const desktopChatListRef = useRef(null);
  const roomChatListRef = useRef(null);
  const gameChatListRef = useRef(null);

  const [editorTitle, setEditorTitle] = useState('My House Rules');
  const [editorShortName, setEditorShortName] = useState('MHR');
  const [editorType, setEditorType] = useState('per_round');
  const [editorCode, setEditorCode] = useState(
    'if(HEART_KING)\n  add(-100)\n  game_end()\nendif'
  );
  const [editorRoomRulesetId, setEditorRoomRulesetId] = useState(null);
  const [editorStatus, setEditorStatus] = useState('');
  const [editorAst, setEditorAst] = useState(null);
  const [editorJudgeBusy, setEditorJudgeBusy] = useState(false);
  const [editorJudgeError, setEditorJudgeError] = useState('');
  const [editorJudgeReview, setEditorJudgeReview] = useState(null);
  const [editorJudgeSignature, setEditorJudgeSignature] = useState('');
  const [ruleDrafts, setRuleDrafts] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem('rentz-rule-drafts') || '[]');
    } catch {
      return [];
    }
  });
  const [forumFeed, setForumFeed] = useState([]);
  const [forumFeedLoading, setForumFeedLoading] = useState(false);
  const [forumView, setForumView] = useState('feed');
  const [forumThread, setForumThread] = useState(null);
  const [forumThreadLoading, setForumThreadLoading] = useState(false);
  const [forumComposerDraft, setForumComposerDraft] = useState(() => createForumDraft());
  const [forumComposerBusy, setForumComposerBusy] = useState(false);
  const [isForumComposerOpen, setIsForumComposerOpen] = useState(false);
  const [forumReplyDrafts, setForumReplyDrafts] = useState({});
  const [forumReplyBusyId, setForumReplyBusyId] = useState('');
  const [forumReplyTarget, setForumReplyTarget] = useState(null);
  const [forumDeleteTarget, setForumDeleteTarget] = useState(null);
  const [forumActionBusyKey, setForumActionBusyKey] = useState('');
  const [forumRulesetSaveTarget, setForumRulesetSaveTarget] = useState(null);
  const [forumRatingPreview, setForumRatingPreview] = useState(null);
  const [forumSearchInput, setForumSearchInput] = useState('');
  const [forumSearchState, setForumSearchState] = useState(() => createEmptyForumSearchState());
  const [libraryState, setLibraryState] = useState(() => createEmptyLibraryState());
  const [librarySavedGameBusyId, setLibrarySavedGameBusyId] = useState('');
  const [savedCustomRulesets, setSavedCustomRulesets] = useState([]);
  const [editorSaveBusy, setEditorSaveBusy] = useState(false);

  useEffect(() => {
    document.body.className = theme;
    document.documentElement.classList.remove(
      'theme-frutiger-lime',
      'theme-dark-glass',
      'theme-light-gloss',
      'theme-colorful-aero'
    );
    document.documentElement.classList.add(theme);

    try {
      window.localStorage.setItem(STORAGE_KEYS.theme, theme);
    } catch {
      // Ignore storage failures in restricted environments.
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty('--app-font-scale', `${fontScale}`);

    try {
      window.localStorage.setItem(STORAGE_KEYS.fontScale, `${fontScale}`);
    } catch {
      // Ignore storage failures in restricted environments.
    }
  }, [fontScale]);

  useEffect(() => {
    document.documentElement.style.setProperty('--page-zoom', `${pageZoom}`);

    try {
      window.localStorage.setItem(STORAGE_KEYS.pageZoom, `${pageZoom}`);
    } catch {
      // Ignore storage failures in restricted environments.
    }
  }, [pageZoom]);

  useEffect(() => {
    try {
      window.localStorage.setItem('rentz-rule-drafts', JSON.stringify(ruleDrafts));
    } catch {
      // Ignore storage failures in restricted environments.
    }
  }, [ruleDrafts]);

  useEffect(() => () => {
    revokeObjectPreview(registerForm.profilePicturePreview);
    revokeObjectPreview(registerForm.bannerPreview);
  }, [registerForm.bannerPreview, registerForm.profilePicturePreview]);

  useEffect(() => () => {
    revokeObjectPreview(accountEditForm.profilePicturePreview);
    revokeObjectPreview(accountEditForm.bannerPreview);
  }, [accountEditForm.bannerPreview, accountEditForm.profilePicturePreview]);

  useEffect(() => () => {
    revokeObjectPreview(forumComposerDraft.mediaPreview);
  }, [forumComposerDraft.mediaPreview]);

  useEffect(() => {
    forumReplyPreviewUrlsRef.current = Object.values(forumReplyDrafts)
      .map((draft) => draft?.mediaPreview || '')
      .filter(Boolean);
  }, [forumReplyDrafts]);

  useEffect(() => () => {
    forumReplyPreviewUrlsRef.current.forEach((previewUrl) => revokeObjectPreview(previewUrl));
  }, []);

  useEffect(() => {
    desktopChatOpenRef.current = isDesktopChatOpen;
  }, [isDesktopChatOpen]);

  useEffect(() => {
    const nextScope = gameStarted && !gameFinished ? 'game' : (inLobby ? 'lobby' : '');
    activeChatScopeRef.current = nextScope;
  }, [gameFinished, gameStarted, inLobby]);

  useEffect(() => {
    if (isDesktopChatOpen) {
      setDesktopChatUnread(0);
    }
  }, [isDesktopChatOpen]);

  useEffect(() => {
    setDesktopChatUnread(0);
  }, [gameFinished, gameStarted, inLobby, roomId]);

  useEffect(() => {
    if (desktopChatListRef.current && isDesktopChatOpen) {
      desktopChatListRef.current.scrollTop = desktopChatListRef.current.scrollHeight;
    }
  }, [gameChatMessages.length, isDesktopChatOpen, roomChatMessages.length]);

  useEffect(() => {
    if (roomChatListRef.current) {
      roomChatListRef.current.scrollTop = roomChatListRef.current.scrollHeight;
    }
  }, [roomChatMessages.length]);

  useEffect(() => {
    if (gameChatListRef.current) {
      gameChatListRef.current.scrollTop = gameChatListRef.current.scrollHeight;
    }
  }, [gameChatMessages.length]);

  const clearGuestIdentity = () => {
    storeGuestProfile(null);
    setRecoverableGuestSession(null);
    setIsRecoveryPromptOpen(false);
    setGuestProfile(null);
  };

  const applyAuthenticatedUser = (user) => {
    const authenticated = Boolean(user?.userId);
    activeProfileRef.current = authenticated ? user : guestProfile;
    setIsAuthenticated(authenticated);
    setUserProfile(authenticated ? user : null);
    setFriendState((current) => (authenticated ? current : createEmptyFriendState()));
    if (!authenticated) {
      setRankLeaderboardModal(null);
    }

    if (authenticated) {
      clearGuestIdentity();
      setGuestNameInput('');
    }
  };

  const refreshSocketSession = () => {
    if (socket.connected) {
      socket.disconnect();
    }

    socket.connect();
  };

  async function loadFriendState({ suppressErrors = false } = {}) {
    if (!isAuthenticated) {
      setFriendState(createEmptyFriendState());
      return createEmptyFriendState();
    }

    try {
      const response = await requestJson('/api/auth/friends/state');
      const nextUser = response?.user || null;
      const nextFriendState = response?.friendState || createEmptyFriendState();

      if (nextUser?.userId) {
        applyAuthenticatedUser(nextUser);
      }
      setFriendState(nextFriendState);
      return nextFriendState;
    } catch (error) {
      if (!suppressErrors) {
        setAuthFeedback(error.message || 'Unable to load friend requests right now.');
      }
      throw error;
    }
  }

  function refreshPublicRooms() {
    if (!activeProfile) {
      showErrorMessage('Choose a guest name or sign in before browsing rooms.');
      return;
    }

    setPublicRoomsLoading(true);
    socket.emit('authenticate', activeProfile);
    socket.emit('list_public_rooms', {}, (response) => {
      setPublicRoomsLoading(false);

      if (response?.error) {
        showErrorMessage(response.error);
        return;
      }

      setPublicRooms(response?.rooms || []);
    });
  }

  function openPlayerActionMenu(event, player, source = 'identity') {
    if (!player) {
      return;
    }

    const currentTargetRect = event?.currentTarget?.getBoundingClientRect?.() || null;
    const eventTargetRect = event?.target?.getBoundingClientRect?.() || null;
    const rect = currentTargetRect?.width
      ? currentTargetRect
      : (eventTargetRect?.width ? eventTargetRect : null);
    const shouldUsePopover = Boolean(rect);

    setPlayerActionMenu({
      player,
      source,
      mode: shouldUsePopover ? 'popover' : 'bottom-sheet',
      anchorRect: rect
    });
  }

  async function openPlayerProfileModal(playerOrProfile) {
    if (!playerOrProfile) {
      return;
    }

    const targetUserId = getPlayerUserId(playerOrProfile);
    if (isBotPlayer(playerOrProfile)) {
      setPlayerProfileLoading(false);
      setPlayerProfileModal(buildBotProfileSummary(playerOrProfile));
      return;
    }

    if (playerOrProfile.guest) {
      setPlayerProfileLoading(false);
      setPlayerProfileModal(buildGuestProfileSummary(playerOrProfile));
      return;
    }

    if (!targetUserId) {
      showTopPrompt('This profile is not available right now.', 'error');
      return;
    }

    setPlayerProfileLoading(true);
    setPlayerProfileModal({
      userId: targetUserId,
      username: getPlayerName(playerOrProfile),
      name: getPlayerName(playerOrProfile),
      displayName: getPlayerName(playerOrProfile),
      guest: false,
      avatarUrl: getPlayerAvatarSource(playerOrProfile),
      profilePicture: getPlayerAvatarSource(playerOrProfile),
      banner: playerOrProfile.banner || '',
      description: playerOrProfile.description || '',
      elo: getPlayerRating(playerOrProfile),
      rankName: playerOrProfile.rankName || '',
      accountCreatedAt: playerOrProfile.accountCreatedAt || null
    });

    try {
      const response = await requestJson(`/api/auth/profiles/${encodeURIComponent(targetUserId)}`);
      setPlayerProfileModal(response?.profile || null);
    } catch (error) {
      setPlayerProfileModal(null);
      showTopPrompt(error.message || 'Unable to load that profile right now.', 'error');
    } finally {
      setPlayerProfileLoading(false);
    }
  }

  async function runFriendAction(action, targetUserId, successMessage = '', { updateProfileModal = false } = {}) {
    if (!targetUserId) {
      return false;
    }

    setFriendActionBusyTargetId(targetUserId);

    try {
      const response = await requestJson(`/api/auth/friends/${action}`, {
        method: 'POST',
        body: JSON.stringify({ targetUserId })
      });

      if (response?.user?.userId) {
        applyAuthenticatedUser(response.user);
      }
      if (response?.friendState) {
        setFriendState(response.friendState);
      }
      if (
        updateProfileModal
        && response?.profile
        && getPlayerUserId(playerProfileModal) === targetUserId
      ) {
        setPlayerProfileModal(response.profile);
      }
      if (successMessage || response?.message) {
        showTopPrompt(successMessage || response.message, 'success');
      }
      if (isPublicBrowserOpenRef.current) {
        refreshPublicRooms();
      }
      return true;
    } catch (error) {
      showTopPrompt(error.message || 'That friend action could not be completed.', 'error');
      return false;
    } finally {
      setFriendActionBusyTargetId('');
    }
  }

  useEffect(() => {
    let cancelled = false;

    const loadCurrentAccount = async () => {
      setAuthLoading(true);

      try {
        const response = await requestJson('/api/auth/me');
        if (cancelled) {
          return;
        }

        applyAuthenticatedUser(response?.authenticated ? response.user : null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        applyAuthenticatedUser(null);
        setAuthFeedback(error.message || 'Unable to load the current account.');
      } finally {
        if (!cancelled) {
          setAuthLoading(false);
        }
      }
    };

    void loadCurrentAccount();

    return () => {
      cancelled = true;
    };
    // The bootstrap runs once; `applyAuthenticatedUser` only uses stable setters and the current guest snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (!accountEditMode || !descriptionTextareaRef.current) {
      return;
    }

    descriptionTextareaRef.current.style.height = '0px';
    descriptionTextareaRef.current.style.height = `${descriptionTextareaRef.current.scrollHeight}px`;
  }, [accountEditMode, accountEditForm.description]);

  useEffect(() => {
    let cancelled = false;

    const loadAccountRulesetCatalog = async () => {
      try {
        const response = await requestJson('/api/auth/account-rulesets');
        if (cancelled || !Array.isArray(response?.rulesets) || response.rulesets.length === 0) {
          return;
        }

        setAccountRulesetCatalog(response.rulesets);
      } catch {
        // Keep the local fallback catalog if the request fails.
      }
    };

    void loadAccountRulesetCatalog();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void loadForumFeed({ suppressErrors: true });
    // Forum feed sorting depends on the live auth/friends snapshot, so we refresh on those changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, userProfile?.userId, (userProfile?.friends || []).join(',')]);

  useEffect(() => {
    void loadLibraryData({ suppressErrors: true });
    // Library content is account-scoped, so it refreshes when auth identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, userProfile?.userId]);

  useEffect(() => {
    if (activeTab !== 'library' || !isAuthenticated) {
      return;
    }

    void loadLibraryData({ suppressErrors: true });
    // Re-entering the Library should always rehydrate account-scoped sections.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isAuthenticated, userProfile?.userId]);

  useEffect(() => {
    if (!forumSearchState.hasResultsTab || !forumSearchState.query) {
      return;
    }

    void runForumSearch(forumSearchState.query, { activateTab: false });
    // Search results should be rehydrated when the viewer identity changes, without retabbing the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, userProfile?.userId]);

  useEffect(() => {
    isPublicBrowserOpenRef.current = isPublicBrowserOpen;
  }, [isPublicBrowserOpen]);

  useEffect(() => {
    let cancelled = false;

    if (!isAuthenticated) {
      setFriendState(createEmptyFriendState());
      return undefined;
    }

    const loadCurrentFriendState = async () => {
      try {
        const nextFriendState = await loadFriendState({ suppressErrors: true });
        if (cancelled) {
          return;
        }

        setFriendState(nextFriendState);
      } catch {
        if (!cancelled) {
          setAuthFeedback((current) => current || 'Unable to load friend requests right now.');
        }
      }
    };

    void loadCurrentFriendState();

    return () => {
      cancelled = true;
    };
    // Friend bootstrap should rerun only when auth state flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  function applySpectatorVisibleHandState(payload = null) {
    const nextVisibleHand = Array.isArray(payload?.spectatorVisibleHand) ? payload.spectatorVisibleHand : [];
    const nextStartingHandSize = Math.max(
      Number(payload?.startingHandSize || 0),
      nextVisibleHand.length
    );

    if (nextStartingHandSize > startingHandSizeRef.current) {
      startingHandSizeRef.current = nextStartingHandSize;
      setStartingHandSize((current) => Math.max(current, nextStartingHandSize));
    }

    setSpectatorVisibleHand(nextVisibleHand);
    setSpectatorVisiblePlayerId(payload?.spectatorVisiblePlayerId || '');
    setSpectatorVisiblePlayerName(payload?.spectatorVisiblePlayerName || '');
  }

  function applyMatchMetadata(source = null, fallback = null) {
    const hasMatchMetadata = Boolean(
      source?.matchMode
      || source?.training
      || fallback?.matchMode
      || fallback?.training
    );
    if (!hasMatchMetadata) {
      return;
    }

    const nextTraining = normalizeTrainingState(source?.training || fallback?.training || null);
    setMatchMode(getMatchModeValue(source?.matchMode || fallback?.matchMode || (nextTraining ? MATCH_MODE_TRAINING : MATCH_MODE_STANDARD)));
    setTrainingState(nextTraining);
  }

  function applyRestoredSession(response) {
    if (!response?.success || !response.roomId || !response.lobby) {
      return;
    }

    const restoredGame = response.game || null;
    const restoredHand = restoredGame?.hand || [];
    applyMatchMetadata(restoredGame || response.lobby, response.lobby);
    setTrainingFinalReview(normalizeTrainingFinalReview(restoredGame?.trainingFinalReview));
    setTrainingReturnBusy(false);

    updateStoredGuestRoom(response.roomId);
    setRoomId(response.roomId);
    setInLobby(true);
    setActiveTab('play');
    setIsPublicBrowserOpen(false);
    setIsRoomSettingsOpen(false);
    setPlayers(response.lobby.players || []);
    setSpectators(response.lobby.spectators || []);
    setLobbyHostId(response.lobby.hostId || '');
    setMutedChatUserIds(normalizeMutedChatUserIds(response.lobby.mutedChatUserIds));
    const nextRoomSettings = normalizeRoomSettings(response.lobby.roomSettings);
    setRoomSettings(nextRoomSettings);
    setDraftRoomSettings(nextRoomSettings);
    setRoomName(response.lobby.roomName || nextRoomSettings.roomName || '');
    setRoomVisibility(response.lobby.visibility || nextRoomSettings.visibility || DEFAULT_ROOM_VISIBILITY);
    setActivityFeed([]);
    setRoomChatMessages(normalizeChatMessages(response.lobby.chatMessages, 'lobby'));
    setGameChatMessages(restoredGame?.chatMessages ? normalizeChatMessages(restoredGame.chatMessages, 'game') : []);
    setErrorMsg('');
    setRoundActionBusy('');

    if (!restoredGame) {
      setTrainingFinalReview(null);
      setGameStarted(false);
      setIsSpectatingGame(false);
      setGameFinished(false);
      setChoiceState(null);
      setHand([]);
      applySpectatorVisibleHandState(null);
      setStartingHandSize(0);
      startingHandSizeRef.current = 0;
      setLatestRoundStats(null);
      setIsStatsOpen(false);
      setMatchCompletePending(false);
      setFinalStandings([]);
      return;
    }

    const restoredStartingHandSize = restoredGame.startingHandSize || restoredHand.length;
    startingHandSizeRef.current = restoredStartingHandSize;
    setGameStarted(Boolean(restoredGame.gameStarted));
    setIsSpectatingGame(Boolean(restoredGame.isSpectator));
    setGameFinished(Boolean(restoredGame.gameFinished));
    setTrickPending(Boolean(restoredGame.trickPending));
    setPlayView('table');
    setHand(restoredHand);
    applySpectatorVisibleHandState(restoredGame);
    setStartingHandSize(restoredStartingHandSize);
    setMyIndex(typeof restoredGame.playerIndex === 'number' ? restoredGame.playerIndex : -1);
    setTurnIndex(restoredGame.turnIndex || 0);
    setTrickSuit(restoredGame.trickSuit || null);
    setCardCounts(restoredGame.cardCounts || {});
    setCollectedHandsByPlayer(restoredGame.collectedHandsByPlayer || {});
    setCurrentTrick(restoredGame.currentTrick || []);
    setPendingPlayCard(null);
    setAnimatingWinner(null);
    setTrickWinnerId(null);
    setChoiceState(restoredGame.choiceState || null);
    setLatestRoundStats(restoredGame.latestRoundStats || null);
    setIsStatsOpen(Boolean(restoredGame.latestRoundStats && restoredGame.choiceState?.phase === 'round_stats'));
    setMatchCompletePending(Boolean(restoredGame.matchComplete));
    setFinalStandings(restoredGame.standings || []);
    applyPlayerPoints(restoredGame.playerPoints);
    if (typeof restoredGame.stateVersion === 'number') {
      latestGameStateVersionRef.current = restoredGame.stateVersion;
    }
  }

  function resetActiveRoomState() {
    const defaultRoomSettings = normalizeRoomSettings();

    if (turnTimerNoticeTimeoutRef.current) {
      window.clearTimeout(turnTimerNoticeTimeoutRef.current);
      turnTimerNoticeTimeoutRef.current = null;
    }

    updateStoredGuestRoom(null);
    latestGameStateVersionRef.current = 0;
    startingHandSizeRef.current = 0;
    setMatchMode(MATCH_MODE_STANDARD);
    setTrainingState(null);
    setTrainingFinalReview(null);
    setInLobby(false);
    setGameStarted(false);
    setIsSpectatingGame(false);
    setGameFinished(false);
    setRoomId('');
    setRoomName('');
    setRoomVisibility(DEFAULT_ROOM_VISIBILITY);
    setPlayers([]);
    setSpectators([]);
    setLobbyHostId('');
    setRoomSettings(defaultRoomSettings);
    setDraftRoomSettings(defaultRoomSettings);
    setChoiceState(null);
    setHand([]);
    applySpectatorVisibleHandState(null);
    setStartingHandSize(0);
    setMyIndex(-1);
    setTurnIndex(0);
    setTrickSuit(null);
    setCardCounts({});
    setCollectedHandsByPlayer({});
    setCurrentTrick([]);
    setPendingPlayCard(null);
    setAnimatingWinner(null);
    setTrickWinnerId(null);
    setPlayView('table');
    setActivityFeed([]);
    setRoomChatMessages([]);
    setGameChatMessages([]);
    setChatDrafts({ lobby: '', game: '' });
    setChatBusyScope('');
    setMutedChatUserIds([]);
    setIsDesktopChatOpen(false);
    setDesktopChatUnread(0);
    setErrorMsg('');
    setFinalStandings([]);
    setTopPrompts([]);
    setTurnTimerNotice('');
    setLocalTimerDeadline(null);
    setIsSpectatorPopoverOpen(false);
    setPlayerActionMenu(null);
    setPlayerProfileModal(null);
    setPlayerProfileLoading(false);
    setChatMuteBusyTargetId('');
    setPendingSpectatorJoin(null);
    setRulesetPreview(null);
    setRoomStartBlockedModal(null);
    setLeaveMatchConfirmModal(null);
    reactionTimeoutsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    reactionTimeoutsRef.current.clear();
    chatBubbleTimeoutsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    chatBubbleTimeoutsRef.current.clear();
    setActiveReactions({});
    setActiveChatBubbles({});
    setEmojiPickerState(null);
    if (mobileReactionSpotlightTimeoutRef.current) {
      window.clearTimeout(mobileReactionSpotlightTimeoutRef.current);
      mobileReactionSpotlightTimeoutRef.current = null;
    }
    if (mobileChatSpotlightTimeoutRef.current) {
      window.clearTimeout(mobileChatSpotlightTimeoutRef.current);
      mobileChatSpotlightTimeoutRef.current = null;
    }
    setMobileReactionSpotlight(null);
    setMobileChatSpotlight(null);
    setLatestRoundStats(null);
    setIsStatsOpen(false);
    setMatchCompletePending(false);
    setRoundActionBusy('');
    setIsRoomSettingsOpen(false);
    setIsTrainingSetupOpen(false);
    setTrainingValidationMessage('');
    setTrainingStartBusy(false);
    setTrainingReturnBusy(false);
    setTrainingSetup(createTrainingSetup(activeProfileRef.current));
    setEditorRoomRulesetId(null);
    setSavedGameRulesetTableModal(null);
  }

  useEffect(() => {
    const promptTimeouts = topPromptTimeoutsRef.current;
    const gameEventTimeouts = gameEventTimeoutsRef.current;

    const clearScheduledGameEventTimeouts = () => {
      gameEventTimeouts.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      gameEventTimeouts.clear();
    };

    const registerGameStateVersion = (nextVersion, { reset = false } = {}) => {
      if (typeof nextVersion !== 'number') {
        if (reset) {
          latestGameStateVersionRef.current = 0;
        }
        return latestGameStateVersionRef.current;
      }

      latestGameStateVersionRef.current = reset
        ? nextVersion
        : Math.max(latestGameStateVersionRef.current, nextVersion);

      return latestGameStateVersionRef.current;
    };

    const scheduleVersionedGameStateUpdate = (stateVersion, callback) => {
      registerGameStateVersion(stateVersion);

      const timeoutId = window.setTimeout(() => {
        gameEventTimeouts.delete(timeoutId);

        if (typeof stateVersion === 'number' && stateVersion < latestGameStateVersionRef.current) {
          return;
        }

        callback();
      }, 1050);

      gameEventTimeouts.add(timeoutId);
    };

    const authenticateAndRestoreSession = () => {
      const profile = activeProfileRef.current;
      const restoreSession = () => {
        socket.emit('restore_session', {}, (response) => {
          if (response?.success) {
            applyRestoredSession(response);
          }
        });
      };

      if (!profile?.userId) {
        restoreSession();
        return;
      }

      socket.emit('authenticate', profile, restoreSession);
    };

    socket.connect();
    socket.on('connect', authenticateAndRestoreSession);
    if (socket.connected) {
      authenticateAndRestoreSession();
    }

    socket.on('lobby_update', (lobby) => {
      applyMatchMetadata(lobby);
      const { players: lobbyPlayers, spectators: lobbySpectators, hostId: nextHostId } = lobby || {};
      setPlayers(lobbyPlayers || []);
      setSpectators(lobbySpectators || []);
      setLobbyHostId(nextHostId || '');
      setMutedChatUserIds(normalizeMutedChatUserIds(lobby?.mutedChatUserIds));
      const nextRoomSettings = normalizeRoomSettings(lobby?.roomSettings);
      setRoomSettings(nextRoomSettings);
      setDraftRoomSettings(nextRoomSettings);
      setRoomName(lobby?.roomName || nextRoomSettings.roomName || '');
      setRoomVisibility(lobby?.visibility || nextRoomSettings.visibility || DEFAULT_ROOM_VISIBILITY);
      setRoomChatMessages(normalizeChatMessages(lobby?.chatMessages, 'lobby'));
    });

    socket.on('game_started', ({ hand: nextHand, playerIndex, isSpectator, turnIndex: nextTurnIndex, cardCounts: nextCardCounts, playerPoints: nextPlayerPoints, trickSuit: nextTrickSuit, collectedHandsByPlayer: nextCollectedHands, stateVersion, choiceState: nextChoiceState, chatMessages: nextChatMessages, spectatorVisibleHand: nextSpectatorVisibleHand, spectatorVisiblePlayerId: nextSpectatorVisiblePlayerId, spectatorVisiblePlayerName: nextSpectatorVisiblePlayerName, startingHandSize: nextStartingHandSize }) => {
      clearScheduledGameEventTimeouts();
      registerGameStateVersion(stateVersion, { reset: true });
      applyMatchMetadata(nextChoiceState);
      setTrainingFinalReview(null);
      setTrainingReturnBusy(false);
      const resolvedHand = nextHand || [];
      const resolvedStartingHandSize = nextStartingHandSize || resolvedHand.length || (nextSpectatorVisibleHand || []).length;
      startingHandSizeRef.current = resolvedStartingHandSize;
      setGameStarted(true);
      setIsSpectatingGame(Boolean(isSpectator));
      setGameFinished(false);
      setTrickPending(false);
      setPlayView('table');
      setHand(resolvedHand);
      applySpectatorVisibleHandState({
        spectatorVisibleHand: nextSpectatorVisibleHand,
        spectatorVisiblePlayerId: nextSpectatorVisiblePlayerId,
        spectatorVisiblePlayerName: nextSpectatorVisiblePlayerName
      });
      setStartingHandSize(resolvedStartingHandSize);
      setMyIndex(typeof playerIndex === 'number' ? playerIndex : -1);
      setTurnIndex(nextTurnIndex);
      setTrickSuit(nextTrickSuit || null);
      setCardCounts(nextCardCounts || {});
      setCollectedHandsByPlayer(nextCollectedHands || {});
      setCurrentTrick([]);
      setPendingPlayCard(null);
      setAnimatingWinner(null);
      setTrickWinnerId(null);
      setActivityFeed([]);
      setGameChatMessages(normalizeChatMessages(nextChatMessages, 'game'));
      setFinalStandings([]);
      setChoiceState(nextChoiceState || null);
      setLatestRoundStats(null);
      setIsStatsOpen(false);
      setMatchCompletePending(false);
      applyPlayerPoints(nextPlayerPoints);
    });

    socket.on('choice_state_update', ({ choiceState: nextChoiceState, cardCounts: nextCardCounts, playerPoints: nextPlayerPoints, stateVersion, spectatorVisibleHand: nextSpectatorVisibleHand, spectatorVisiblePlayerId: nextSpectatorVisiblePlayerId, spectatorVisiblePlayerName: nextSpectatorVisiblePlayerName }) => {
      registerGameStateVersion(stateVersion);
      applyMatchMetadata(nextChoiceState);
      setChoiceState(nextChoiceState || null);
      applySpectatorVisibleHandState({
        spectatorVisibleHand: nextSpectatorVisibleHand,
        spectatorVisiblePlayerId: nextSpectatorVisiblePlayerId,
        spectatorVisiblePlayerName: nextSpectatorVisiblePlayerName
      });
      if (nextChoiceState?.phase && nextChoiceState.phase !== 'round_stats') {
        setIsStatsOpen(false);
        setMatchCompletePending(false);
      }
      if (nextCardCounts) {
        setCardCounts(nextCardCounts);
      }
      applyPlayerPoints(nextPlayerPoints);
    });

    socket.on('small_game_started', ({ message, choiceState: nextChoiceState, currentTrick: nextTrick, turnIndex: nextTurnIndex, trickSuit: nextTrickSuit, cardCounts: nextCardCounts, playerPoints: nextPlayerPoints, collectedHandsByPlayer: nextCollectedHands, stateVersion, spectatorVisibleHand: nextSpectatorVisibleHand, spectatorVisiblePlayerId: nextSpectatorVisiblePlayerId, spectatorVisiblePlayerName: nextSpectatorVisiblePlayerName }) => {
      registerGameStateVersion(stateVersion);
      applyMatchMetadata(nextChoiceState);
      setChoiceState(nextChoiceState || null);
      applySpectatorVisibleHandState({
        spectatorVisibleHand: nextSpectatorVisibleHand,
        spectatorVisiblePlayerId: nextSpectatorVisiblePlayerId,
        spectatorVisiblePlayerName: nextSpectatorVisiblePlayerName
      });
      setIsStatsOpen(false);
      setMatchCompletePending(false);
      setCurrentTrick(nextTrick || []);
      setTurnIndex(nextTurnIndex || 0);
      setTrickSuit(nextTrickSuit || null);
      setTrickPending(false);
      setAnimatingWinner(null);
      setTrickWinnerId(null);
      if (nextCardCounts) {
        setCardCounts(nextCardCounts);
      }
      if (nextCollectedHands) {
        setCollectedHandsByPlayer(nextCollectedHands);
      }
      applyPlayerPoints(nextPlayerPoints);
      if (message) {
        setActivityFeed((current) => [message, ...current].slice(0, MAX_ACTIVITY_FEED_ITEMS));
        showTopPrompt(message, 'success');
      }
    });

    socket.on('game_update', ({ currentTrick: nextTrick, turnIndex: nextTurnIndex, trickSuit: nextTrickSuit, cardCounts: nextCardCounts, stateVersion, choiceState: nextChoiceState, spectatorVisibleHand: nextSpectatorVisibleHand, spectatorVisiblePlayerId: nextSpectatorVisiblePlayerId, spectatorVisiblePlayerName: nextSpectatorVisiblePlayerName }) => {
      registerGameStateVersion(stateVersion);
      applyMatchMetadata(nextChoiceState);
      setCurrentTrick(nextTrick);
      setTurnIndex(nextTurnIndex);
      setTrickSuit(nextTrickSuit || null);
      setTrickPending(false);
      setAnimatingWinner(null);
      setTrickWinnerId(null);
      applySpectatorVisibleHandState({
        spectatorVisibleHand: nextSpectatorVisibleHand,
        spectatorVisiblePlayerId: nextSpectatorVisiblePlayerId,
        spectatorVisiblePlayerName: nextSpectatorVisiblePlayerName
      });
      if (nextChoiceState) {
        setChoiceState(nextChoiceState);
      }
      if (nextCardCounts) {
        setCardCounts(nextCardCounts);
      }
    });

    socket.on('hand_update', (nextHand) => {
      const resolvedHand = nextHand || [];
      if (resolvedHand.length > 0 && startingHandSizeRef.current === 0) {
        startingHandSizeRef.current = resolvedHand.length;
        setStartingHandSize(resolvedHand.length);
      }
      setHand(resolvedHand);
    });

    socket.on('trick_won', ({ winnerName, winnerId, scoreDelta, collectedHandsByPlayer: nextCollectedHands, cardCounts: nextCardCounts, playerPoints: nextPlayerPoints, stateVersion, choiceState: nextChoiceState, spectatorVisibleHand: nextSpectatorVisibleHand, spectatorVisiblePlayerId: nextSpectatorVisiblePlayerId, spectatorVisiblePlayerName: nextSpectatorVisiblePlayerName }) => {
      registerGameStateVersion(stateVersion);
      applyMatchMetadata(nextChoiceState);
      setAnimatingWinner(winnerName);
      setTrickWinnerId(winnerId);
      setTrickPending(true);
      applySpectatorVisibleHandState({
        spectatorVisibleHand: nextSpectatorVisibleHand,
        spectatorVisiblePlayerId: nextSpectatorVisiblePlayerId,
        spectatorVisiblePlayerName: nextSpectatorVisiblePlayerName
      });
      if (nextChoiceState) {
        setChoiceState(nextChoiceState);
      }
      scheduleVersionedGameStateUpdate(stateVersion, () => {
        if (nextCollectedHands) {
          setCollectedHandsByPlayer(nextCollectedHands);
        }
        if (nextCardCounts) {
          setCardCounts(nextCardCounts);
        }
        applyPlayerPoints(nextPlayerPoints);
        setActivityFeed((current) => [`${winnerName} took the hand${formatScoreDeltaText(scoreDelta) ? ` (${formatScoreDeltaText(scoreDelta)})` : ''}.`, ...current].slice(0, MAX_ACTIVITY_FEED_ITEMS));
      });
    });

    socket.on('trick_end', ({ nextTurnIndex, trickSuit: nextTrickSuit, collectedHandsByPlayer: nextCollectedHands, cardCounts: nextCardCounts, playerPoints: nextPlayerPoints, gameFinished: finished, stateVersion, choiceState: nextChoiceState, spectatorVisibleHand: nextSpectatorVisibleHand, spectatorVisiblePlayerId: nextSpectatorVisiblePlayerId, spectatorVisiblePlayerName: nextSpectatorVisiblePlayerName }) => {
      applyMatchMetadata(nextChoiceState);
      scheduleVersionedGameStateUpdate(stateVersion, () => {
        setTurnIndex(nextTurnIndex);
        setCurrentTrick([]);
        setAnimatingWinner(null);
        if (!finished) {
          setTrickWinnerId(null);
        }
        setTrickSuit(nextTrickSuit || null);
        setTrickPending(Boolean(finished));
        if (nextCollectedHands) {
          setCollectedHandsByPlayer(nextCollectedHands);
        }
        if (nextCardCounts) {
          setCardCounts(nextCardCounts);
        }
        if (nextChoiceState) {
          setChoiceState(nextChoiceState);
        }
        applySpectatorVisibleHandState({
          spectatorVisibleHand: nextSpectatorVisibleHand,
          spectatorVisiblePlayerId: nextSpectatorVisiblePlayerId,
          spectatorVisiblePlayerName: nextSpectatorVisiblePlayerName
        });
        applyPlayerPoints(nextPlayerPoints);
      });
    });

    socket.on('round_finished', ({ roundStats, matchComplete, standings, choiceState: nextChoiceState, collectedHandsByPlayer: nextCollectedHands, cardCounts: nextCardCounts, playerPoints: nextPlayerPoints, stateVersion, spectatorVisibleHand: nextSpectatorVisibleHand, spectatorVisiblePlayerId: nextSpectatorVisiblePlayerId, spectatorVisiblePlayerName: nextSpectatorVisiblePlayerName }) => {
      applyMatchMetadata(nextChoiceState);
      scheduleVersionedGameStateUpdate(stateVersion, () => {
        const shouldShowTrainerFinalReview = Boolean(
          matchComplete
          && nextChoiceState?.matchMode === MATCH_MODE_TRAINING
        );
        setRoundActionBusy('');
        setLatestRoundStats(roundStats || null);
        setIsStatsOpen(shouldShowTrainerFinalReview ? false : Boolean(roundStats));
        setMatchCompletePending(shouldShowTrainerFinalReview ? false : Boolean(matchComplete));
        setChoiceState(nextChoiceState || null);
        setTrickPending(false);
        setCurrentTrick([]);
        if (standings) {
          setFinalStandings(standings);
        }
        if (nextCollectedHands) {
          setCollectedHandsByPlayer(nextCollectedHands);
        }
        if (nextCardCounts) {
          setCardCounts(nextCardCounts);
        }
        applySpectatorVisibleHandState({
          spectatorVisibleHand: nextSpectatorVisibleHand,
          spectatorVisiblePlayerId: nextSpectatorVisiblePlayerId,
          spectatorVisiblePlayerName: nextSpectatorVisiblePlayerName
        });
        applyPlayerPoints(nextPlayerPoints);
      });
    });

    socket.on('game_finished', ({ winnerId, winnerName, standings, collectedHandsByPlayer: nextCollectedHands, cardCounts: nextCardCounts, playerPoints: nextPlayerPoints, stateVersion, choiceState: nextChoiceState, trainingFinalReview: nextTrainingFinalReview, spectatorVisibleHand: nextSpectatorVisibleHand, spectatorVisiblePlayerId: nextSpectatorVisiblePlayerId, spectatorVisiblePlayerName: nextSpectatorVisiblePlayerName }) => {
      applyMatchMetadata(nextChoiceState);
      scheduleVersionedGameStateUpdate(stateVersion, () => {
        const normalizedTrainingReview = normalizeTrainingFinalReview(nextTrainingFinalReview);
        setRoundActionBusy('');
        setGameFinished(true);
        setTrickPending(false);
        setTrickWinnerId(winnerId);
        setAnimatingWinner(null);
        setFinalStandings(standings || []);
        setChoiceState(nextChoiceState || null);
        setMatchCompletePending(Boolean(!normalizedTrainingReview));
        setIsStatsOpen(Boolean(!normalizedTrainingReview));
        setTrainingFinalReview(normalizedTrainingReview);
        setTrainingReturnBusy(false);
        if (nextCollectedHands) {
          setCollectedHandsByPlayer(nextCollectedHands);
        }
        if (nextCardCounts) {
          setCardCounts(nextCardCounts);
        }
        applySpectatorVisibleHandState({
          spectatorVisibleHand: nextSpectatorVisibleHand,
          spectatorVisiblePlayerId: nextSpectatorVisiblePlayerId,
          spectatorVisiblePlayerName: nextSpectatorVisiblePlayerName
        });
        applyPlayerPoints(nextPlayerPoints);
        setActivityFeed((current) => [`Game finished. ${winnerName} won the final hand.`, ...current].slice(0, MAX_ACTIVITY_FEED_ITEMS));
      });
    });

    socket.on('game_activity', ({ message, tone }) => {
      if (!message) {
        return;
      }

      setActivityFeed((current) => [message, ...current].slice(0, MAX_ACTIVITY_FEED_ITEMS));
      showTopPrompt(message, tone === 'warning' ? 'info' : tone === 'error' ? 'error' : 'info');
    });

    socket.on('chat_message', ({ scope, message }) => {
      const normalizedMessage = normalizeChatMessage(message, scope || 'lobby');
      if (!normalizedMessage) {
        return;
      }

      if (normalizedMessage.scope === 'game') {
        setGameChatMessages((current) => appendChatMessage(current, normalizedMessage));
        showChatTableBubbleRef.current(normalizedMessage);
      } else {
        setRoomChatMessages((current) => appendChatMessage(current, normalizedMessage));
      }

      if (
        normalizedMessage.scope === activeChatScopeRef.current
        && !desktopChatOpenRef.current
        && normalizedMessage.sender?.userId
        && normalizedMessage.sender.userId !== activeProfileRef.current?.userId
      ) {
        setDesktopChatUnread((current) => current + 1);
      }
    });

    socket.on('lobby_removed', ({ reason }) => {
      const normalizedReason = String(reason || '');
      const wasBanned = normalizedReason.toLowerCase().includes('banned');
      resetActiveRoomState();
      if (wasBanned) {
        setBanNoticeModal({
          title: 'Removed From Game',
          message: normalizedReason || 'You were banned from this game. You cannot rejoin this game.'
        });
        return;
      }

      showTopPrompt(reason || 'You were removed from the room.', 'error');
    });

    socket.on('lobby_deleted', ({ reason, deletedBy }) => {
      resetActiveRoomState();
      showTopPrompt(
        deletedBy === activeProfileRef.current?.userId ? 'Room deleted.' : (reason || 'The room was deleted.'),
        deletedBy === activeProfileRef.current?.userId ? 'info' : 'error'
      );
    });

    socket.on('live_game_session_closed', ({ reason, savedGame }) => {
      const shouldOpenLibrary = Boolean(
        savedGame
        && savedGame.ownerUserId
        && savedGame.ownerUserId === activeProfileRef.current?.userId
      );

      resetActiveRoomState();
      if (shouldOpenLibrary) {
        setActiveTab('library');
        void loadLibraryData({ suppressErrors: true });
      }
      showTopPrompt(reason || 'The live match session closed.', 'info');
    });

    socket.on('game_error', (message) => {
      setErrorMsg(message);
      window.setTimeout(() => setErrorMsg(''), 3000);
    });

    socket.on('friend_state_update', ({ user, friendState: nextFriendState, shouldRefreshPublicRooms }) => {
      if (user?.userId) {
        applyAuthenticatedUser(user);
      }

      if (nextFriendState) {
        setFriendState(nextFriendState);
      }

      if (shouldRefreshPublicRooms && isPublicBrowserOpenRef.current && activeProfileRef.current) {
        setPublicRoomsLoading(true);
        socket.emit('authenticate', activeProfileRef.current);
        socket.emit('list_public_rooms', {}, (response) => {
          setPublicRoomsLoading(false);

          if (response?.error) {
            return;
          }

          setPublicRooms(response?.rooms || []);
        });
      }
    });

    socket.on('player_reaction', (payload) => {
      showReactionBubbleRef.current(payload || {});
    });

    return () => {
      promptTimeouts.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      promptTimeouts.clear();
      clearScheduledGameEventTimeouts();

      socket.off('connect', authenticateAndRestoreSession);
      socket.off('lobby_update');
      socket.off('game_started');
      socket.off('choice_state_update');
      socket.off('small_game_started');
      socket.off('game_update');
      socket.off('hand_update');
      socket.off('trick_won');
      socket.off('trick_end');
      socket.off('round_finished');
      socket.off('game_finished');
      socket.off('game_activity');
      socket.off('chat_message');
      socket.off('lobby_removed');
      socket.off('lobby_deleted');
      socket.off('live_game_session_closed');
      socket.off('game_error');
      socket.off('friend_state_update');
      socket.off('player_reaction');
    };
    // Socket listeners are registered once; reconnect auth reads the live profile from a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isSpectatorPopoverOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (spectatorPopoverRef.current?.contains(event.target)) {
        return;
      }

      setIsSpectatorPopoverOpen(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsSpectatorPopoverOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSpectatorPopoverOpen]);

  useEffect(() => {
    if (!emojiPickerState) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (emojiPickerRef.current?.contains(event.target)) {
        return;
      }

      setEmojiPickerState(null);
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setEmojiPickerState(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [emojiPickerState]);

  useEffect(() => {
    if (!playerActionMenu) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (playerActionMenuRef.current?.contains(event.target)) {
        return;
      }

      setPlayerActionMenu(null);
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setPlayerActionMenu(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [playerActionMenu]);

  useEffect(() => () => {
    reactionTimeoutsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    reactionTimeoutsRef.current.clear();
    chatBubbleTimeoutsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    chatBubbleTimeoutsRef.current.clear();
    if (mobileReactionSpotlightTimeoutRef.current) {
      window.clearTimeout(mobileReactionSpotlightTimeoutRef.current);
      mobileReactionSpotlightTimeoutRef.current = null;
    }
    if (mobileChatSpotlightTimeoutRef.current) {
      window.clearTimeout(mobileChatSpotlightTimeoutRef.current);
      mobileChatSpotlightTimeoutRef.current = null;
    }
  }, []);

  const showTopPrompt = (message, tone = 'info') => {
    const promptId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setTopPrompts((current) => [...current, { id: promptId, message, tone }]);

    const timeoutId = window.setTimeout(() => {
      setTopPrompts((current) => current.filter((prompt) => prompt.id !== promptId));
      topPromptTimeoutsRef.current.delete(promptId);
    }, 1200);

    topPromptTimeoutsRef.current.set(promptId, timeoutId);
  };

  const applyPlayerPoints = (playerPoints) => {
    if (!playerPoints || typeof playerPoints !== 'object') {
      return;
    }

    setPlayers((current) => current.map((player) => ({
      ...player,
      points: Object.prototype.hasOwnProperty.call(playerPoints, player.userId)
        ? playerPoints[player.userId]
        : (player.points ?? 0)
    })));
  };

  const applyLobbyState = (lobby) => {
    applyMatchMetadata(lobby);
    setPlayers(lobby?.players || []);
    setSpectators(lobby?.spectators || []);
    setLobbyHostId(lobby?.hostId || '');
    setMutedChatUserIds(normalizeMutedChatUserIds(lobby?.mutedChatUserIds));
    const nextRoomSettings = normalizeRoomSettings(lobby?.roomSettings);
    setRoomSettings(nextRoomSettings);
    setDraftRoomSettings(nextRoomSettings);
    setRoomName(lobby?.roomName || nextRoomSettings.roomName || '');
    setRoomVisibility(lobby?.visibility || nextRoomSettings.visibility || DEFAULT_ROOM_VISIBILITY);
    setRoomChatMessages(normalizeChatMessages(lobby?.chatMessages, 'lobby'));
  };

  const populateEditorFromRuleset = (ruleset, { linkedRoomRulesetId = null, switchToEditor = false } = {}) => {
    if (!ruleset) {
      return;
    }

    const resolvedLongName = ruleset.longName || ruleset.label || 'Untitled Ruleset';
    setEditorTitle(resolvedLongName);
    setEditorShortName(ruleset.shortName || ruleset.abbreviation || buildRulesetShortNameFallback(resolvedLongName));
    setEditorType(normalizeRulesetType(ruleset.type));
    setEditorCode(ruleset.code || '');
    setEditorAst(null);
    setEditorStatus(linkedRoomRulesetId ? 'Editing room ruleset.' : 'Ruleset loaded into the editor.');
    setEditorRoomRulesetId(linkedRoomRulesetId);
    if (switchToEditor) {
      setActiveTab('editor');
    }
  };

  const joinLobbyRequest = (targetRoomId, { asSpectator = false } = {}) => {
    if (!activeProfile) {
      showErrorMessage('Choose a guest name or sign in before joining a room.');
      setActiveTab('play');
      return;
    }

    const normalizedRoomId = String(targetRoomId || '').trim().toUpperCase();
    if (!normalizedRoomId) {
      return;
    }

    socket.emit('authenticate', activeProfile);
    socket.emit('join_lobby', { roomId: normalizedRoomId, asSpectator }, (response) => {
      if (response?.success) {
        setPendingSpectatorJoin(null);
        updateStoredGuestRoom(response.roomId);
        applyRestoredSession({
          success: true,
          roomId: response.roomId,
          lobby: response.lobby,
          game: response.game || null
        });
        if (response.autoSpectator) {
          showTopPrompt(
            asSpectator
              ? `You joined ${response.lobby?.roomName || response.roomId} as a spectator.`
              : `All ${MAX_ACTIVE_PLAYERS} player seats are full. You joined as a spectator.`,
            'info'
          );
        }
        return;
      }

      if (response?.canSpectate) {
        setPendingSpectatorJoin({
          roomId: response.roomId || normalizedRoomId,
          roomName: response.roomName || response.roomId || normalizedRoomId
        });
        return;
      }

      if (response?.error === 'Game already in progress') {
        showTopPrompt(response.error, 'error');
        return;
      }

      if (response?.error) {
        showErrorMessage(response.error);
      }
    });
  };

  const showErrorMessage = (message) => {
    setErrorMsg(message);
    window.setTimeout(() => setErrorMsg(''), 3000);
  };

  const recoverableGuestProfile = recoverableGuestSession?.profile || null;
  const recoverableGuestRoomId = recoverableGuestSession?.roomId || null;

  const createSessionProfile = (name, guest = false) => ({
    userId: Math.random().toString(36).slice(2, 10),
    name,
    guest
  });

  const handleGuestContinue = () => {
    const trimmedName = guestNameInput.trim();
    if (!trimmedName) {
      return;
    }

    const profile = createSessionProfile(trimmedName, true);
    storeGuestProfile(profile);
    socket.emit('authenticate', profile);
    setGuestProfile(profile);
    setRecoverableGuestSession(null);
    setIsRecoveryPromptOpen(false);
    setActiveTab('play');
  };

  const handleRejoinRecoverableSession = () => {
    if (!recoverableGuestProfile?.userId) {
      setIsRecoveryPromptOpen(false);
      return;
    }

    storeGuestProfile(recoverableGuestProfile, { roomId: recoverableGuestRoomId });
    setGuestProfile(recoverableGuestProfile);
    setGuestNameInput(recoverableGuestProfile.name || '');
    setRecoverableGuestSession(null);
    setIsRecoveryPromptOpen(false);
    setActiveTab('play');

    socket.emit('authenticate', recoverableGuestProfile);
    socket.emit('restore_session', {}, (response) => {
      if (response?.success && response.restoredRoom !== false && response.lobby) {
        applyRestoredSession(response);
        return;
      }

      showTopPrompt(
        recoverableGuestRoomId
          ? 'Rejoined player session. Previous room is no longer available.'
          : 'Rejoined player session.',
        recoverableGuestRoomId ? 'error' : 'info'
      );
    });
  };

  const handleStartFreshSession = () => {
    const nextName = recoverableGuestProfile?.name || guestNameInput.trim() || 'Player';
    const profile = createSessionProfile(nextName, true);

    if (recoverableGuestProfile?.userId) {
      socket.emit('authenticate', recoverableGuestProfile);
      socket.emit('abandon_session', {});
    }

    storeGuestProfile(profile);
    setGuestProfile(profile);
    setGuestNameInput(nextName);
    setRecoverableGuestSession(null);
    setIsRecoveryPromptOpen(false);
    setActiveTab('play');
    socket.emit('authenticate', profile);
  };

  const handleRegisterImageChange = (field, previewField, label, event) => {
    const file = event.target.files?.[0] || null;

    if (!file) {
      setRegisterForm((current) => ({
        ...current,
        [field]: null,
        [previewField]: ''
      }));
      return;
    }

    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'].includes(file.type)) {
      showErrorMessage(`${label} must be a PNG, JPEG, WebP, or GIF image.`);
      event.target.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showErrorMessage(`${label} must be 2 MB or smaller.`);
      event.target.value = '';
      return;
    }

    const nextPreview = URL.createObjectURL(file);
    setRegisterForm((current) => {
      revokeObjectPreview(current[previewField]);

      return {
        ...current,
        [field]: file,
        [previewField]: nextPreview
      };
    });
  };

  const replaceAccountEditForm = (nextUser) => {
    setAccountEditForm((current) => {
      revokeObjectPreview(current.profilePicturePreview);
      revokeObjectPreview(current.bannerPreview);
      return createAccountEditForm(nextUser);
    });
  };

  const openAccountEditMode = () => {
    replaceAccountEditForm(userProfile);
    setAuthFeedback('');
    setAccountEditMode(true);
  };

  const canMutateAccountProfile = () => {
    if (inLobby || gameStarted) {
      showErrorMessage('Leave the current room before editing this account.');
      return false;
    }

    return true;
  };

  const openRankLeaderboardModal = async ({
    targetUserId = '',
    fallbackRankName = 'Current Rank',
    sourceLabel = 'rank'
  } = {}) => {
    const resolvedTargetUserId = String(targetUserId || userProfile?.userId || '').trim();
    if (!resolvedTargetUserId) {
      showTopPrompt('This rank leaderboard is not available right now.', 'error');
      return;
    }

    setRankLeaderboardModal({
      loading: true,
      error: '',
      currentUserId: userProfile?.userId || null,
      highlightedUserId: resolvedTargetUserId,
      rankName: fallbackRankName,
      rankTierKey: '',
      rankMinElo: null,
      rankMaxElo: null,
      sourceLabel,
      entries: []
    });

    try {
      const response = await requestJson(`/api/auth/leaderboard/rank/${encodeURIComponent(resolvedTargetUserId)}`);
      setRankLeaderboardModal({
        loading: false,
        error: '',
        ...(response?.leaderboard || {}),
        sourceLabel,
        entries: Array.isArray(response?.leaderboard?.entries) ? response.leaderboard.entries : []
      });
    } catch (error) {
      setRankLeaderboardModal((current) => ({
        ...(current || {}),
        loading: false,
        error: error.message || 'Unable to load this leaderboard right now.',
        entries: []
      }));
    }
  };

  const getAccountRulesetDefinition = (index) => {
    return accountRulesetCatalog.find((option) => option.index === index) || null;
  };

  const persistAccountProfileUpdate = async (payload, { busyAction = 'account-save', successMessage = '' } = {}) => {
    setAuthBusyAction(busyAction);
    setAuthFeedback('');

    try {
      const response = await requestJson('/api/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });

      applyAuthenticatedUser(response.user);
      refreshSocketSession();

      if (successMessage) {
        showTopPrompt(successMessage, 'success');
      }

      return response.user;
    } catch (error) {
      setAuthFeedback(error.message || 'Unable to update the account.');
      throw error;
    } finally {
      setAuthBusyAction('');
    }
  };

  const persistAccountRulesetIndexes = async (fieldName, nextIndexes) => {
    setAccountRulesetBusyField(fieldName);
    setAuthFeedback('');

    try {
      const response = await requestJson('/api/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ [fieldName]: nextIndexes })
      });

      applyAuthenticatedUser(response.user);
      return response.user;
    } catch (error) {
      setAuthFeedback(error.message || 'Unable to update that ruleset section.');
      throw error;
    } finally {
      setAccountRulesetBusyField('');
    }
  };

  const handleSaveAccountEdits = async (event) => {
    event?.preventDefault?.();

    if (!canMutateAccountProfile()) {
      return;
    }

    try {
      const updatedUser = await persistAccountProfileUpdate({
        username: accountEditForm.username,
        description: accountEditForm.description
      }, {
        busyAction: 'account-save',
        successMessage: 'Account profile updated.'
      });

      replaceAccountEditForm(updatedUser);
      setAccountEditMode(false);
    } catch {
      // The request helper already surfaced a readable error.
    }
  };

  const handleCancelAccountEdits = () => {
    replaceAccountEditForm(userProfile);
    setAccountEditMode(false);
    setAuthFeedback('');
 };

  const handleAccountAssetUpload = async (fieldName, label, file) => {
    if (!canMutateAccountProfile() || !file) {
      return;
    }

    try {
      const upload = await serializeFileUpload(file);
      const payload = fieldName === 'profilePicture'
        ? { profilePictureUpload: upload }
        : { bannerUpload: upload };
      const updatedUser = await persistAccountProfileUpdate(payload, {
        busyAction: `${fieldName}-upload`,
        successMessage: `${label} updated.`
      });

      replaceAccountEditForm(updatedUser);
    } catch {
      // The request helper already surfaced a readable error.
    }
  };

  const handleDirectAccountImageChange = async (fieldName, label, event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';

    if (!file) {
      return;
    }

    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'].includes(file.type)) {
      setAuthFeedback(`${label} must be a PNG, JPEG, WebP, or GIF image.`);
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setAuthFeedback(`${label} must be 2 MB or smaller.`);
      return;
    }

    await handleAccountAssetUpload(fieldName, label, file);
  };

  const handleAccountRulesetPreview = (index) => {
    const definition = getAccountRulesetDefinition(index);
    if (!definition) {
      return;
    }

    setRulesetPreview({
      label: definition.label,
      abbreviation: definition.abbreviation,
      type: definition.type || 'per_round',
      code: definition.code || [
        '# Preview placeholder',
        '# A full code listing is not available for this ruleset yet.'
      ].join('\n')
    });
  };

  const handleAccountRulesetOpenInEditor = (index) => {
    const definition = getAccountRulesetDefinition(index);
    if (!definition) {
      return;
    }

    populateEditorFromRuleset({
      longName: definition.label,
      shortName: definition.abbreviation,
      type: definition.type || 'per_round',
      code: definition.code || [
        '# Editor placeholder',
        `# Start from this ${definition.label} profile preset here.`
      ].join('\n')
    }, {
      linkedRoomRulesetId: null,
      switchToEditor: true
    });
  };

  const openAccountRulesetPicker = (fieldName, limit) => {
    setAccountRulesetPicker({ fieldName, limit });
  };

  const handleAddAccountRuleset = async (fieldName, index) => {
    const currentIndexes = Array.isArray(userProfile?.[fieldName]) ? userProfile[fieldName] : [];
    if (currentIndexes.includes(index)) {
      return;
    }

    try {
      await persistAccountRulesetIndexes(fieldName, [...currentIndexes, index]);
      setAccountRulesetPicker(null);
    } catch {
      // The request helper already surfaced a readable error.
    }
  };

  const handleRemoveAccountRuleset = async (fieldName, index) => {
    const currentIndexes = Array.isArray(userProfile?.[fieldName]) ? userProfile[fieldName] : [];

    try {
      await persistAccountRulesetIndexes(
        fieldName,
        currentIndexes.filter((entry) => entry !== index)
      );
    } catch {
      // The request helper already surfaced a readable error.
    }
  };

  const syncForumPostEverywhere = (nextPost) => {
    if (!nextPost?.id) {
      return;
    }

    setForumFeed((current) => replaceForumEntryInTree(current, nextPost));
    setForumThread((current) => {
      if (!current?.selected) {
        return current;
      }

      return {
        ...current,
        parents: Array.isArray(current.parents)
          ? current.parents.map((parent) => (parent.id === nextPost.id ? { ...parent, ...nextPost, replies: [] } : parent))
          : current.parents,
        selected: current.selected.id === nextPost.id
          ? nextPost
          : {
            ...current.selected,
            replies: replaceForumEntryInTree(current.selected.replies || [], nextPost)
          }
      };
    });
    setForumSearchState((current) => ({
      ...current,
      posts: current.posts.map((post) => (
        post.id === nextPost.id
          ? {
            ...post,
            ...nextPost,
            replies: post.replies || []
          }
          : post
      ))
    }));
    setLibraryState((current) => ({
      ...current,
      bookmarkedRulesetPosts: current.bookmarkedRulesetPosts.map((post) => (
        post.id === nextPost.id
          ? {
            ...post,
            ...nextPost,
            replies: []
          }
          : post
      ))
    }));
  };

  const removeForumPostEverywhere = (postId) => {
    if (!postId) {
      return;
    }

    setForumFeed((current) => removeForumEntryFromTree(current, postId));
    setForumThread((current) => {
      if (!current?.selected) {
        return current;
      }

      if (current.selected.id === postId) {
        return null;
      }

      return {
        ...current,
        parents: Array.isArray(current.parents)
          ? current.parents.filter((parent) => parent.id !== postId)
          : current.parents,
        selected: {
          ...current.selected,
          replies: removeForumEntryFromTree(current.selected.replies || [], postId)
        }
      };
    });
    setForumSearchState((current) => ({
      ...current,
      posts: current.posts.filter((post) => post.id !== postId)
    }));
    setLibraryState((current) => ({
      ...current,
      bookmarkedRulesetPosts: current.bookmarkedRulesetPosts.filter((post) => post.id !== postId)
    }));
  };

  const loadForumFeed = async ({ suppressErrors = false } = {}) => {
    setForumFeedLoading(true);

    try {
      const response = await requestJson('/api/forum/feed');
      setForumFeed(Array.isArray(response?.posts) ? response.posts : []);
    } catch (error) {
      if (!suppressErrors) {
        showTopPrompt(error.message || 'Unable to load Rentz Forum right now.', 'error');
      }
    } finally {
      setForumFeedLoading(false);
    }
  };

  const resetForumComposerDraft = () => {
    setForumComposerDraft((current) => {
      revokeObjectPreview(current.mediaPreview);
      return createForumDraft();
    });
  };

  const loadLibraryData = async ({ suppressErrors = false } = {}) => {
    if (!isAuthenticated) {
      setLibraryState(createEmptyLibraryState());
      setSavedCustomRulesets([]);
      return;
    }

    setLibraryState((current) => ({ ...current, loading: true }));

    try {
      const response = await requestJson('/api/forum/library');
      const savedRulesets = Array.isArray(response?.savedRulesets) ? response.savedRulesets : [];
      setLibraryState({
        loading: false,
        savedRulesets,
        savedGames: Array.isArray(response?.savedGames) ? response.savedGames : [],
        matchHistory: Array.isArray(response?.matchHistory) ? response.matchHistory : [],
        bookmarkedRulesetPosts: Array.isArray(response?.bookmarkedRulesetPosts) ? response.bookmarkedRulesetPosts : []
      });
      setSavedCustomRulesets(savedRulesets);
    } catch (error) {
      setLibraryState((current) => ({ ...current, loading: false }));
      if (!suppressErrors) {
        showTopPrompt(error.message || 'Unable to load your library right now.', 'error');
      }
    }
  };

  const loadForumThread = async (postId, { suppressErrors = false, switchTab = false } = {}) => {
    if (!postId) {
      return;
    }

    setForumThreadLoading(true);

    if (switchTab) {
      setActiveTab('ruleset-rater');
    }

    try {
      const response = await requestJson(`/api/forum/posts/${encodeURIComponent(postId)}/thread`);
      setForumThread(response?.thread || null);
      setForumView('thread');
    } catch (error) {
      if (error?.status === 404) {
        setForumThread(null);
        setForumView('thread');
      } else if (!suppressErrors) {
        showTopPrompt(error.message || 'Unable to load that thread right now.', 'error');
      }
    } finally {
      setForumThreadLoading(false);
    }
  };

  const updateChatDraft = (scope, value) => {
    if (!scope) {
      return;
    }

    setChatDrafts((current) => ({
      ...current,
      [scope]: String(value || '').slice(0, CHAT_MESSAGE_MAX_LENGTH)
    }));
  };

  const handleSendChatMessage = async (scope) => {
    if (!scope || !roomId || !inLobby) {
      return;
    }

    if (!activeProfile) {
      showTopPrompt('Choose a guest name or sign in before chatting.', 'info');
      return;
    }

    if (activeProfile?.userId && mutedChatUserIds.includes(activeProfile.userId)) {
      showTopPrompt('Chat muted by the host for this room right now.', 'error');
      return;
    }

    const content = normalizeChatMessageContent(chatDrafts[scope]);
    if (!content) {
      showTopPrompt('Write a message before sending it.', 'info');
      return;
    }

    setChatBusyScope(scope);

    try {
      await new Promise((resolve, reject) => {
        socket.emit('send_chat_message', { roomId, scope, content }, (response) => {
          if (response?.error) {
            reject(new Error(response.error));
            return;
          }

          resolve(response);
        });
      });

      setChatDrafts((current) => ({
        ...current,
        [scope]: ''
      }));
    } catch (error) {
      showTopPrompt(error.message || 'Unable to send that chat message right now.', 'error');
    } finally {
      setChatBusyScope('');
    }
  };

  const handleSetChatMute = async (targetUserId, muted) => {
    const normalizedTargetUserId = String(targetUserId || '').trim();
    if (!roomId || !amIHost || !normalizedTargetUserId) {
      return false;
    }

    setChatMuteBusyTargetId(normalizedTargetUserId);

    try {
      const response = await new Promise((resolve, reject) => {
        socket.emit('set_chat_mute', { roomId, targetUserId: normalizedTargetUserId, muted }, (result) => {
          if (result?.error) {
            reject(new Error(result.error));
            return;
          }

          resolve(result);
        });
      });

      if (response?.lobby) {
        applyLobbyState(response.lobby);
      }

      setPlayerActionMenu(null);
      showTopPrompt(
        muted ? 'Player chat muted for this room.' : 'Player chat unmuted for this room.',
        'info'
      );
      return true;
    } catch (error) {
      showTopPrompt(error.message || 'Unable to update chat mute right now.', 'error');
      return false;
    } finally {
      setChatMuteBusyTargetId('');
    }
  };

  const updateForumReplyDraft = (postId, updater) => {
    setForumReplyDrafts((current) => {
      const existingDraft = current[postId] || createForumDraft();
      const nextDraft = typeof updater === 'function'
        ? updater(existingDraft)
        : { ...existingDraft, ...updater };

      return {
        ...current,
        [postId]: nextDraft
      };
    });
  };

  const resetForumReplyDraft = (postId) => {
    setForumReplyDrafts((current) => {
      const nextDrafts = { ...current };
      revokeObjectPreview(nextDrafts[postId]?.mediaPreview);
      delete nextDrafts[postId];
      return nextDrafts;
    });
  };

  const handleForumComposerMediaChange = (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';

    if (!file) {
      return;
    }

    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'].includes(file.type)) {
      showTopPrompt('Forum media must be a PNG, JPEG, WebP, or GIF image.', 'error');
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      showTopPrompt('Forum media must be 4 MB or smaller.', 'error');
      return;
    }

    const nextPreview = URL.createObjectURL(file);
    setForumComposerDraft((current) => {
      revokeObjectPreview(current.mediaPreview);
      return {
        ...current,
        mediaFile: file,
        mediaPreview: nextPreview
      };
    });
  };

  const handleForumReplyMediaChange = (postId, event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';

    if (!file) {
      return;
    }

    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'].includes(file.type)) {
      showTopPrompt('Reply media must be a PNG, JPEG, WebP, or GIF image.', 'error');
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      showTopPrompt('Reply media must be 4 MB or smaller.', 'error');
      return;
    }

    const nextPreview = URL.createObjectURL(file);
    updateForumReplyDraft(postId, (current) => {
      revokeObjectPreview(current.mediaPreview);
      return {
        ...current,
        mediaFile: file,
        mediaPreview: nextPreview
      };
    });
  };

  const submitForumPost = async ({ draft, parentPostId = '' }) => {
    const payload = {
      text: draft.text,
      attachedRuleset: draft.attachedRulesetIndex === '' || draft.attachedRulesetIndex == null
        ? null
        : { rulesetId: String(draft.attachedRulesetIndex) }
    };

    if (draft.mediaFile) {
      payload.mediaUpload = await serializeFileUpload(draft.mediaFile);
    }

    if (parentPostId) {
      payload.parentPostId = parentPostId;
    }

    return requestJson('/api/forum/posts', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  };

  const handleSubmitForumComposer = async (event) => {
    event?.preventDefault?.();

    if (!isAuthenticated) {
      setActiveTab('login');
      showTopPrompt('Log in to post on Rentz Forum.', 'info');
      return;
    }

    setForumComposerBusy(true);

    try {
      const response = await submitForumPost({ draft: forumComposerDraft });
      if (response?.post) {
        setForumFeed((current) => [response.post, ...current]);
      }
      resetForumComposerDraft();
      setIsForumComposerOpen(false);
      showTopPrompt('Post published.', 'success');
    } catch (error) {
      showTopPrompt(error.message || 'Unable to publish that post.', 'error');
    } finally {
      setForumComposerBusy(false);
    }
  };

  const handleSubmitForumReply = async (parentPostId) => {
    if (!parentPostId) {
      return;
    }

    if (!isAuthenticated) {
      setActiveTab('login');
      showTopPrompt('Log in to reply on Rentz Forum.', 'info');
      return;
    }

    const draft = forumReplyDrafts[parentPostId] || createForumDraft();
    setForumReplyBusyId(parentPostId);

    try {
      const response = await submitForumPost({
        draft,
        parentPostId
      });

      if (response?.post) {
        setForumFeed((current) => appendForumReplyInTree(current, parentPostId, response.post));
        setForumThread((current) => {
          if (!current?.selected) {
            return current;
          }

          if (current.selected.id === parentPostId) {
            return {
              ...current,
              selected: {
                ...current.selected,
                replies: [...(current.selected.replies || []), response.post]
              }
            };
          }

          return {
            ...current,
            selected: {
              ...current.selected,
              replies: appendForumReplyInTree(current.selected.replies || [], parentPostId, response.post)
            }
          };
        });
      }
      resetForumReplyDraft(parentPostId);
      setForumReplyTarget(null);
      showTopPrompt('Reply posted.', 'success');
    } catch (error) {
      showTopPrompt(error.message || 'Unable to publish that reply.', 'error');
    } finally {
      setForumReplyBusyId('');
    }
  };

  const handleForumEntryAction = async (postId, action, {
    successMessage,
    loginPrompt,
    nextBusyKey = `${postId}:${action}`
  } = {}) => {
    if (!postId) {
      return false;
    }

    if (!isAuthenticated) {
      setActiveTab('login');
      showTopPrompt(loginPrompt || 'Log in to use that Rentz Forum action.', 'info');
      return false;
    }

    setForumActionBusyKey(nextBusyKey);

    try {
      const response = await requestJson(`/api/forum/posts/${encodeURIComponent(postId)}/${action}`, {
        method: 'POST'
      });

      if (response?.post) {
        syncForumPostEverywhere(response.post);
        if (action === 'bookmark' && response.post.attachedRuleset) {
          void loadLibraryData({ suppressErrors: true });
        }
      }

      if (successMessage) {
        showTopPrompt(successMessage, 'success');
      }
      return true;
    } catch (error) {
      showTopPrompt(error.message || 'That forum action could not be completed.', 'error');
      return false;
    } finally {
      setForumActionBusyKey('');
    }
  };

  const handleDeleteForumPost = async () => {
    if (!forumDeleteTarget?.id) {
      return;
    }

    if (!isAuthenticated) {
      setActiveTab('login');
      showTopPrompt('Log in to delete your own Rentz Forum posts.', 'info');
      return;
    }

    const deletingPostId = forumDeleteTarget.id;
    const wasSelectedThreadEntry = forumThread?.selected?.id === deletingPostId;
    setForumActionBusyKey(`${deletingPostId}:delete`);

    try {
      const response = await requestJson(`/api/forum/posts/${encodeURIComponent(deletingPostId)}`, {
        method: 'DELETE'
      });
      const deletedWasParentPreview = Array.isArray(forumThread?.parents)
        && forumThread.parents.some((parent) => parent.id === deletingPostId);

      if (forumReplyTarget?.id === deletingPostId) {
        setForumReplyTarget(null);
      }

      removeForumPostEverywhere(deletingPostId);

      if (wasSelectedThreadEntry) {
        if (response?.parentPostId) {
          await loadForumThread(response.parentPostId, { suppressErrors: true });
        } else {
          setForumView('feed');
          setForumThread(null);
          await loadForumFeed({ suppressErrors: true });
        }
      } else if (deletedWasParentPreview && forumThread?.selected?.id) {
        await loadForumThread(forumThread.selected.id, { suppressErrors: true });
      }

      setForumDeleteTarget(null);
      showTopPrompt('Post deleted.', 'success');
    } catch (error) {
      showTopPrompt(error.message || 'Unable to delete that forum post.', 'error');
    } finally {
      setForumActionBusyKey('');
    }
  };

  const handleForumCopyRulesetToEditor = async (postId) => {
    if (!postId) {
      return;
    }

    setForumActionBusyKey(`${postId}:copy-ruleset`);

    try {
      const response = await requestJson(`/api/forum/posts/${encodeURIComponent(postId)}/copy-ruleset`, {
        method: 'POST'
      });

      if (!response?.ruleset) {
        throw new Error('That ruleset attachment is unavailable right now.');
      }

      populateEditorFromRuleset({
        longName: response.ruleset.title || response.ruleset.label,
        shortName: response.ruleset.abbreviation,
        type: response.ruleset.type,
        code: response.ruleset.code
      }, {
        linkedRoomRulesetId: null,
        switchToEditor: true
      });
      showTopPrompt(`${response.ruleset.label} copied to the editor.`, 'success');
    } catch (error) {
      showTopPrompt(error.message || 'Unable to copy that ruleset into the editor.', 'error');
    } finally {
      setForumActionBusyKey('');
    }
  };

  const openForumRulesetSaveChoice = (post) => {
    if (!post?.id) {
      return;
    }

    if (!isAuthenticated) {
      setActiveTab('login');
      showTopPrompt('Log in to save attached rulesets to your profile.', 'info');
      return;
    }

    setForumRulesetSaveTarget(post);
  };

  const handleForumPreviewRuleset = async (postId) => {
    if (!postId) {
      return;
    }

    setForumActionBusyKey(`${postId}:preview-ruleset`);

    try {
      const response = await requestJson(`/api/forum/posts/${encodeURIComponent(postId)}/copy-ruleset`, {
        method: 'POST'
      });

      if (!response?.ruleset) {
        throw new Error('That ruleset preview is unavailable right now.');
      }

      setRulesetPreview({
        label: response.ruleset.title || response.ruleset.label,
        abbreviation: response.ruleset.shortName || response.ruleset.abbreviation,
        type: response.ruleset.type,
        code: response.ruleset.code
      });
    } catch (error) {
      showTopPrompt(error.message || 'Unable to preview that ruleset right now.', 'error');
    } finally {
      setForumActionBusyKey('');
    }
  };

  const handleForumSaveRulesetToProfile = async () => {
    if (!forumRulesetSaveTarget?.id) {
      return;
    }

    setForumActionBusyKey(`${forumRulesetSaveTarget.id}:save-ruleset`);

    try {
      const response = await requestJson(`/api/forum/posts/${encodeURIComponent(forumRulesetSaveTarget.id)}/save-ruleset`, {
        method: 'POST'
      });

      await loadLibraryData({ suppressErrors: true });
      setForumRulesetSaveTarget(null);
      showTopPrompt(response?.message || 'Ruleset saved to your profile library.', 'success');
    } catch (error) {
      showTopPrompt(error.message || 'Unable to save that ruleset to your profile.', 'error');
    } finally {
      setForumActionBusyKey('');
    }
  };

  const handleForumRateRuleset = async (postId, value) => {
    if (!postId) {
      return;
    }

    if (!isAuthenticated) {
      setActiveTab('login');
      showTopPrompt('Log in to rate attached rulesets.', 'info');
      return;
    }

    setForumActionBusyKey(`${postId}:rate-ruleset`);

    try {
      const response = await requestJson(`/api/forum/posts/${encodeURIComponent(postId)}/rate-ruleset`, {
        method: 'POST',
        body: JSON.stringify({ value })
      });

      if (response?.post) {
        syncForumPostEverywhere(response.post);
      }
    } catch (error) {
      showTopPrompt(error.message || 'Unable to update that ruleset rating.', 'error');
    } finally {
      setForumRatingPreview((current) => (current?.postId === postId ? null : current));
      setForumActionBusyKey('');
    }
  };

  const handleSaveEditorRulesetToProfile = async () => {
    if (!isAuthenticated) {
      setActiveTab('login');
      showTopPrompt('Log in to save custom rulesets to your profile library.', 'info');
      return;
    }

    setEditorSaveBusy(true);

    try {
      const payload = getEditorRulesetPayload();
      const response = await requestJson('/api/rulesets/save-to-profile', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (response?.ruleset) {
        setSavedCustomRulesets((current) => {
          const existingIndex = current.findIndex((ruleset) => ruleset.id === response.ruleset.id);
          if (existingIndex === -1) {
            return [response.ruleset, ...current];
          }

          const nextRulesets = [...current];
          nextRulesets[existingIndex] = response.ruleset;
          return nextRulesets;
        });
        setLibraryState((current) => ({
          ...current,
          savedRulesets: (() => {
            const existingIndex = current.savedRulesets.findIndex((ruleset) => ruleset.id === response.ruleset.id);
            if (existingIndex === -1) {
              return [response.ruleset, ...current.savedRulesets];
            }

            const nextRulesets = [...current.savedRulesets];
            nextRulesets[existingIndex] = response.ruleset;
            return nextRulesets;
          })()
        }));
      }

      setEditorStatus(response?.message || 'Ruleset saved to your profile library.');
      showTopPrompt(response?.message || 'Ruleset saved to your profile library.', 'success');
    } catch (error) {
      setEditorStatus(error.message || 'Unable to save that ruleset.');
      showTopPrompt(error.message || 'Unable to save that ruleset to your profile.', 'error');
    } finally {
      setEditorSaveBusy(false);
    }
  };

  const runForumSearch = async (query, { activateTab = true } = {}) => {
    const trimmedQuery = String(query || '').trim();

    if (!trimmedQuery) {
      showTopPrompt('Type something into the search bar first.', 'info');
      return;
    }

    setForumSearchState((current) => ({
      ...current,
      hasResultsTab: true,
      query: trimmedQuery,
      loading: true
    }));

    if (activateTab) {
      setActiveTab('search-results');
    }

    try {
      const response = await requestJson(`/api/forum/search?q=${encodeURIComponent(trimmedQuery)}`);
      setForumSearchState((current) => ({
        ...current,
        hasResultsTab: true,
        query: response?.query || trimmedQuery,
        loading: false,
        posts: Array.isArray(response?.posts) ? response.posts : [],
        users: Array.isArray(response?.users) ? response.users : [],
        friends: Array.isArray(response?.friends) ? response.friends : []
      }));
    } catch (error) {
      setForumSearchState((current) => ({
        ...current,
        hasResultsTab: true,
        query: trimmedQuery,
        loading: false,
        posts: [],
        users: [],
        friends: []
      }));
      showTopPrompt(error.message || 'Unable to load those search results right now.', 'error');
    }
  };

  const handleForumSearchSubmit = async (event) => {
    event?.preventDefault?.();
    await runForumSearch(forumSearchInput);
  };

  const handleLoginSubmit = async (event) => {
    event.preventDefault();

    if (inLobby || gameStarted) {
      showErrorMessage('Leave the current room before signing into another account.');
      return;
    }

    setAuthBusyAction('login');
    setAuthFeedback('');

    try {
      const response = await requestJson('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(loginForm)
      });

      applyAuthenticatedUser(response.user);
      setLoginForm({ username: '', password: '' });
      setActiveTab('play');
      refreshSocketSession();
      showTopPrompt(`Signed in as ${response.user.username}.`, 'success');
    } catch (error) {
      setAuthFeedback(error.message || 'Unable to sign in.');
    } finally {
      setAuthBusyAction('');
    }
  };

  const handleRegisterSubmit = async (event) => {
    event.preventDefault();

    if (inLobby || gameStarted) {
      showErrorMessage('Leave the current room before creating an account.');
      return;
    }

    setAuthBusyAction('register');
    setAuthFeedback('');

    try {
      const profilePictureUpload = await serializeFileUpload(registerForm.profilePictureFile);
      const bannerUpload = await serializeFileUpload(registerForm.bannerFile);
      const response = await requestJson('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username: registerForm.username,
          password: registerForm.password,
          description: registerForm.description,
          profilePictureUpload,
          bannerUpload
        })
      });

      applyAuthenticatedUser(response.user);
      if (registerForm.profilePicturePreview) {
        URL.revokeObjectURL(registerForm.profilePicturePreview);
      }
      if (registerForm.bannerPreview) {
        URL.revokeObjectURL(registerForm.bannerPreview);
      }
      setRegisterForm({
        username: '',
        password: '',
        profilePictureFile: null,
        profilePicturePreview: '',
        bannerFile: null,
        bannerPreview: '',
        description: ''
      });
      setActiveTab('play');
      refreshSocketSession();
      showTopPrompt(`Account ${response.user.username} is ready to play.`, 'success');
    } catch (error) {
      setAuthFeedback(error.message || 'Unable to create the account.');
    } finally {
      setAuthBusyAction('');
    }
  };

  const handleForgotPasswordSubmit = async (event) => {
    event?.preventDefault?.();
    setAuthBusyAction('forgot-password');
    setAuthFeedback('');

    try {
      const response = await requestJson('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ username: forgotPasswordUsername })
      });

      setAuthFeedback(response.message || 'Password reset placeholder submitted.');
    } catch (error) {
      setAuthFeedback(error.message || 'Unable to submit the reset request.');
    } finally {
      setAuthBusyAction('');
    }
  };

  const handleLogout = async () => {
    if (inLobby || gameStarted) {
      setErrorMsg('Leave the current room before switching players.');
      window.setTimeout(() => setErrorMsg(''), 3000);
      return;
    }

    setAuthBusyAction('logout');
    setAuthFeedback('');

    try {
      await requestJson('/api/auth/logout', {
        method: 'POST'
      });

      applyAuthenticatedUser(null);
      setActiveTab('login');
      refreshSocketSession();
      showTopPrompt('Signed out.', 'info');
    } catch (error) {
      setAuthFeedback(error.message || 'Unable to sign out.');
    } finally {
      setAuthBusyAction('');
    }
  };

  const handleGuestReset = () => {
    if (inLobby || gameStarted) {
      setErrorMsg('Leave the current room before changing your guest name.');
      window.setTimeout(() => setErrorMsg(''), 3000);
      return;
    }

    setGuestNameInput(guestProfile?.name || '');
    clearGuestIdentity();
    setActiveTab('play');
  };

  const handleCreateLobby = () => {
    if (!activeProfile) {
      showErrorMessage('Choose a guest name or sign in before creating a room.');
      setActiveTab('play');
      return;
    }

    socket.emit('authenticate', activeProfile);
    socket.emit('create_lobby', {
      roomName: newRoomName,
      visibility: newRoomVisibility
    }, (response) => {
      if (response.success) {
        updateStoredGuestRoom(response.roomId);
        setRoomId(response.roomId);
        setInLobby(true);
        setGameStarted(false);
        setIsSpectatingGame(false);
        setGameFinished(false);
        setFinalStandings([]);
        setIsPublicBrowserOpen(false);
        applyLobbyState(response.lobby);
      } else if (response.error) {
        showErrorMessage(response.error);
      }
    });
  };

  const handleJoinLobby = () => {
    if (!joinInput.trim()) {
      return;
    }

    joinLobbyRequest(joinInput);
  };

  const handleOpenTrainingSetup = () => {
    if (inLobby || gameStarted) {
      showTopPrompt('Leave the current room before starting a training match.', 'error');
      return;
    }

    if (!activeProfile) {
      showErrorMessage('Choose a guest name or sign in before starting training.');
      setActiveTab('play');
      return;
    }

    if (isAuthenticated && !libraryState.loading && savedCustomRulesets.length === 0) {
      void loadLibraryData({ suppressErrors: true });
    }

    setTrainingSetup(createTrainingSetup(activeProfile));
    setTrainingValidationMessage('');
    setIsTrainingSetupOpen(true);
  };

  const handleStartTrainingMatch = () => {
    if (!activeProfile) {
      showErrorMessage('Choose a guest name or sign in before starting training.');
      setActiveTab('play');
      return;
    }

    if (!trainingSetup.selectedRulesetId) {
      setTrainingValidationMessage('Choose a ruleset for training before starting.');
      return;
    }

    setTrainingStartBusy(true);
    setTrainingValidationMessage('');

    socket.emit('authenticate', activeProfile);
    socket.emit('start_training_match', {
      trainerElo: trainingSetup.trainerElo,
      selectedRulesetId: trainingSetup.selectedRulesetId,
      preMoveCommentaryEnabled: trainingSetup.preMoveCommentaryEnabled,
      postMoveFeedbackEnabled: trainingSetup.postMoveFeedbackEnabled,
      totalRounds: trainingSetup.totalRounds,
      playerCount: trainingSetup.playerCount
    }, (response) => {
      setTrainingStartBusy(false);

      if (response?.success) {
        setIsTrainingSetupOpen(false);
        setTrainingValidationMessage('');
        applyRestoredSession(response);
        showTopPrompt('Training table ready.', 'success');
        return;
      }

      setTrainingValidationMessage(response?.error || 'Unable to start the training match right now.');
    });
  };

  const getEditorRulesetPayload = () => {
    const longName = editorTitle.trim() || 'Untitled Ruleset';

    return {
      longName,
      shortName: editorShortName.trim() || buildRulesetShortNameFallback(longName),
      type: normalizeRulesetType(editorType),
      code: editorCode
    };
  };

  const buildEditorRulesetSignature = (rulesetPayload = getEditorRulesetPayload()) => JSON.stringify({
    longName: String(rulesetPayload.longName || '').trim(),
    shortName: String(rulesetPayload.shortName || '').trim(),
    type: normalizeRulesetType(rulesetPayload.type),
    code: String(rulesetPayload.code || '')
  });

  const handleCompileRules = async () => {
    try {
      setEditorStatus('Compiling ruleset...');
      const response = await fetch('/api/rulesets/compile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          code: editorCode,
          type: editorType
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to compile ruleset');
      }

      setEditorAst(data.ast);
      setEditorStatus('Ruleset compiled successfully.');
    } catch (error) {
      setEditorStatus(error.message);
      setEditorAst(null);
    }
  };

  const handleJudgeRulesetWithAi = async () => {
    const rulesetPayload = getEditorRulesetPayload();
    const signature = buildEditorRulesetSignature(rulesetPayload);

    if (!rulesetPayload.code.trim()) {
      const message = 'Write a ruleset before asking the Editor Bot to judge it.';
      setEditorJudgeError(message);
      setEditorStatus(message);
      setEditorJudgeReview(null);
      return;
    }

    try {
      setEditorJudgeBusy(true);
      setEditorJudgeError('');
      setEditorStatus('Judging ruleset with Editor Bot...');

      const response = await fetch('/api/rulesets/judge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(rulesetPayload)
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        if (data?.compiler?.ast) {
          setEditorAst(data.compiler.ast);
        } else if (data?.compiler?.status === 'error') {
          setEditorAst(null);
        }

        throw new Error(data?.error || 'Unable to judge this ruleset right now.');
      }

      const normalizedReview = normalizeEditorJudgeReview(data?.review);
      if (!normalizedReview) {
        throw new Error('Editor Bot returned an unreadable review.');
      }

      if (data?.compiler?.ast) {
        setEditorAst(data.compiler.ast);
      }

      setEditorJudgeReview(normalizedReview);
      setEditorJudgeSignature(signature);
      setEditorStatus(
        normalizedReview.reviewSource === 'ai'
          ? 'Ruleset compiled and judged by the Editor Bot.'
          : 'Ruleset compiled. The Editor Bot review is using the local fallback right now.'
      );
    } catch (error) {
      setEditorJudgeError(error.message || 'Unable to judge this ruleset right now.');
      setEditorStatus(error.message || 'Unable to judge this ruleset right now.');
    } finally {
      setEditorJudgeBusy(false);
    }
  };

  const handleSaveDraft = () => {
    const payload = getEditorRulesetPayload();
    const nextDraft = {
      id: `${Date.now()}`,
      title: payload.longName,
      shortName: payload.shortName,
      type: payload.type,
      code: payload.code,
      updatedAt: new Date().toISOString()
    };

    setRuleDrafts((current) => [nextDraft, ...current.filter((draft) => draft.title !== nextDraft.title)].slice(0, 10));
    setEditorStatus('Draft saved locally.');
  };

  const handleDownloadRentzRuleset = () => {
    const payload = getEditorRulesetPayload();
    const fileText = formatRentzRuleset(payload);
    const blob = new Blob([fileText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = buildRulesetDownloadName(payload.longName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setEditorStatus('Ruleset downloaded as .rentz.');
  };

  const readRentzFileFromInput = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return null;
    }

    const sourceText = await file.text();
    const ruleset = parseRentzRulesetText(sourceText);
    if (!ruleset.code.trim()) {
      throw new Error('Imported .rentz file does not contain ruleset code');
    }

    return ruleset;
  };

  const handleImportRentzToEditor = async (event) => {
    try {
      const importedRuleset = await readRentzFileFromInput(event);
      if (!importedRuleset) {
        return;
      }

      populateEditorFromRuleset(importedRuleset);
    } catch (error) {
      setEditorStatus(error.message);
      setEditorAst(null);
    }
  };

  const saveRulesetToCurrentRoom = (rulesetPayload, { updateEditorStatus = false, roomRulesetId = editorRoomRulesetId } = {}) => {
    if (!activeProfile?.guest || !inLobby || !amIHost || gameStarted) {
      const message = 'Only a guest host can manage room rulesets before the match starts.';
      if (updateEditorStatus) {
        setEditorStatus(message);
      }
      showErrorMessage(message);
      return;
    }

    if (updateEditorStatus) {
      setEditorStatus(roomRulesetId ? 'Compiling and updating ruleset...' : 'Compiling and applying ruleset...');
    }

    socket.emit('authenticate', activeProfile);
    socket.emit(roomRulesetId ? 'update_room_ruleset' : 'add_room_ruleset', {
      roomId,
      ...(roomRulesetId ? { rulesetId: roomRulesetId } : {}),
      ruleset: rulesetPayload
    }, (response) => {
      if (response?.error) {
        if (updateEditorStatus) {
          setEditorStatus(response.error);
          setEditorAst(null);
        }
        showErrorMessage(response.error);
        return;
      }

      if (response?.lobby) {
        applyLobbyState(response.lobby);
      }

      if (response?.ruleset?.id) {
        setEditorRoomRulesetId(response.ruleset.id);
      }

      if (updateEditorStatus) {
        setEditorStatus(roomRulesetId ? 'Ruleset updated in the current room.' : 'Ruleset added to the current room.');
      }
      showTopPrompt(`${rulesetPayload.longName || 'Ruleset'} ${roomRulesetId ? 'updated in' : 'added to'} the room.`, 'success');
    });
  };

  const handleApplyEditorRulesetToRoom = () => {
    saveRulesetToCurrentRoom(getEditorRulesetPayload(), { updateEditorStatus: true });
  };

  const handleImportRentzToRoom = async (event) => {
    try {
      const importedRuleset = await readRentzFileFromInput(event);
      if (!importedRuleset) {
        return;
      }

      saveRulesetToCurrentRoom(importedRuleset, { roomRulesetId: null });
    } catch (error) {
      showErrorMessage(error.message);
    }
  };

  const handleCopyRoomCode = async () => {
    if (!roomId) {
      return;
    }

    try {
      await copyTextToClipboard(roomId);
      showTopPrompt(`Room code ${roomId} copied to clipboard.`, 'success');
    } catch {
      showTopPrompt('Could not copy the room code right now.', 'error');
    }
  };

  const toggleReady = () => {
    socket.emit('toggle_ready', { roomId }, (response) => {
      if (response?.error) {
        showErrorMessage(response.error);
        return;
      }

      if (response?.lobby) {
        applyLobbyState(response.lobby);
      }
    });
  };

  const setLobbyRole = (role) => {
    socket.emit('set_lobby_role', { roomId, role }, (response) => {
      if (response?.error) {
        showErrorMessage(response.error);
        return;
      }

      if (response?.lobby) {
        applyLobbyState(response.lobby);
      }

      showTopPrompt(
        role === 'player' ? 'You moved into the active player seats.' : 'You are now spectating this lobby.',
        role === 'player' ? 'success' : 'info'
      );
    });
  };

  const openPublicRoomBrowser = () => {
    setIsPublicBrowserOpen(true);
    refreshPublicRooms();
  };

  const joinPublicRoom = (targetRoomId) => {
    if (inLobby || gameStarted) {
      showTopPrompt('Leave your current room before joining another one.', 'error');
      return;
    }

    joinLobbyRequest(targetRoomId);
  };

  const handleOpenRoomSettings = () => {
    setDraftRoomSettings(roomSettings);
    setIsRoomSettingsOpen(true);
  };

  const handleRoomRulesetToggle = (ruleId) => {
    setDraftRoomSettings((current) => {
      const nextEnabled = !current.selectedRulesets[ruleId];
      const nextRulesetPermissions = { ...(current.rulesetPermissions || {}) };

      players.forEach((player) => {
        nextRulesetPermissions[player.userId] = {
          ...(nextRulesetPermissions[player.userId] || {}),
          [ruleId]: nextEnabled
        };
      });

      return {
        ...current,
        selectedRulesets: {
          ...current.selectedRulesets,
          [ruleId]: nextEnabled
        },
        rulesetPermissions: nextRulesetPermissions
      };
    });
  };

  const handlePlayerRulesetPermissionToggle = (playerId, ruleId) => {
    setDraftRoomSettings((current) => ({
      ...current,
      rulesetPermissions: {
        ...current.rulesetPermissions,
        [playerId]: {
          ...(current.rulesetPermissions?.[playerId] || {}),
          [ruleId]: !(current.rulesetPermissions?.[playerId]?.[ruleId] ?? true)
        }
      }
    }));
  };

  const handleSaveRoomSettings = () => {
    socket.emit('update_room_settings', {
      roomId,
      roomName: draftRoomSettings.roomName,
      visibility: draftRoomSettings.visibility,
      nvAllowed: draftRoomSettings.nvAllowed,
      autoBotReplacementEnabled: draftRoomSettings.autoBotReplacementEnabled,
      useTurnTimer: draftRoomSettings.useTurnTimer,
      turnTimerSeconds: draftRoomSettings.turnTimerSeconds,
      selectedRulesets: draftRoomSettings.selectedRulesets,
      rulesetPermissions: draftRoomSettings.rulesetPermissions
    }, (response) => {
      if (response?.error) {
        showErrorMessage(response.error);
        return;
      }

      if (response?.lobby) {
        applyLobbyState(response.lobby);
      }

      setIsRoomSettingsOpen(false);
      showTopPrompt('Room settings updated.', 'success');
    });
  };

  const handleAddBotToLobby = () => new Promise((resolve) => {
    socket.emit('add_bot_to_lobby', { roomId }, (response) => {
      if (response?.error) {
        showErrorMessage(response.error);
        resolve(false);
        return;
      }

      if (response?.lobby) {
        applyLobbyState(response.lobby);
      }

      showTopPrompt('Bot added to the room.', 'success');
      resolve(true);
    });
  });

  const handleRemoveBotFromLobby = (targetUserId) => new Promise((resolve) => {
    socket.emit('remove_bot_from_lobby', { roomId, targetUserId }, (response) => {
      if (response?.error) {
        showErrorMessage(response.error);
        resolve(false);
        return;
      }

      if (response?.lobby) {
        applyLobbyState(response.lobby);
      }

      showTopPrompt('Bot removed from the room.', 'info');
      resolve(true);
    });
  });

  const handleReplacePlayerWithBot = (targetUserId) => new Promise((resolve) => {
    socket.emit('replace_player_with_bot', { roomId, targetUserId }, (response) => {
      if (response?.error) {
        showErrorMessage(response.error);
        resolve(false);
        return;
      }

      if (response?.lobby) {
        applyLobbyState(response.lobby);
      }

      showTopPrompt('Abandoned player replaced with a bot.', 'success');
      resolve(true);
    });
  });

  const handleTransferHost = (targetUserId) => {
    socket.emit('transfer_host', { roomId, targetUserId }, (response) => {
      if (response?.error) {
        showErrorMessage(response.error);
        return;
      }
      if (response?.lobby) {
        applyLobbyState(response.lobby);
      }
      showTopPrompt('Host transferred.', 'success');
    });
  };

  const handleKickMember = (targetUserId) => {
    socket.emit('kick_member', { roomId, targetUserId }, (response) => {
      if (response?.error) {
        showErrorMessage(response.error);
        return;
      }
      if (response?.lobby) {
        applyLobbyState(response.lobby);
      }
      showTopPrompt('Player kicked.', 'info');
    });
  };

  const handleBanMember = (targetUserId) => {
    socket.emit('ban_member', { roomId, targetUserId }, (response) => {
      if (response?.error) {
        showErrorMessage(response.error);
        return;
      }
      if (response?.lobby) {
        applyLobbyState(response.lobby);
      }
      showTopPrompt('Player banned.', 'info');
    });
  };

  const handleDeleteRoom = () => {
    socket.emit('delete_lobby', { roomId }, (response) => {
      if (response?.error) {
        showErrorMessage(response.error);
        return;
      }
      resetActiveRoomState();
    });
  };

  const handleLeaveRoom = () => {
    if (gameStarted) {
      if (isSpectatingGame) {
        socket.emit('leave_spectating', { roomId }, (response) => {
          if (response?.error) {
            showErrorMessage(response.error);
            return;
          }

          resetActiveRoomState();
          showTopPrompt(response?.message || 'You stopped spectating the match.', 'info');
        });
        return;
      }

      setLeaveMatchConfirmModal({
        title: isTrainingMatch ? 'End Training' : 'Abandon Match',
        message: isTrainingMatch
          ? 'Leaving now will end this training session immediately. Continue?'
          : 'Leaving now will immediately abandon your seat and let the server replace you with a bot if needed. Continue?',
        confirmLabel: isTrainingMatch ? 'End Training' : 'Abandon Match'
      });
      return;
    }

    socket.emit('leave_lobby', { roomId }, (response) => {
      if (response?.error) {
        showErrorMessage(response.error);
        return;
      }

      resetActiveRoomState();
      showTopPrompt(response?.message || 'You left the room.', response?.roomDeleted ? 'info' : 'success');
    });
  };

  const handleConfirmLeaveMatch = () => {
    setTrainingReturnBusy(true);
    socket.emit('abandon_match', { roomId }, (response) => {
      setTrainingReturnBusy(false);
      if (response?.error) {
        showErrorMessage(response.error);
        return;
      }

      setLeaveMatchConfirmModal(null);
      if (isTrainingMatch) {
        setActiveTab('play');
        return;
      }

      resetActiveRoomState();
      showTopPrompt(response?.message || 'You abandoned the match.', 'info');
    });
  };

  const handleReturnToPlayFromTrainingReview = () => {
    setTrainingReturnBusy(true);
    socket.emit('abandon_match', { roomId }, (response) => {
      setTrainingReturnBusy(false);
      if (response?.error) {
        showErrorMessage(response.error);
        return;
      }

      setTrainingFinalReview(null);
      setActiveTab('play');
    });
  };

  const handleNvChoice = (nvSelected) => {
    socket.emit('set_nv_choice', { roomId, nvSelected }, (response) => {
      if (response?.error) {
        showErrorMessage(response.error);
      }
    });
  };

  const handleChooseRuleset = (rulesetId) => {
    socket.emit('choose_ruleset', { roomId, rulesetId }, (response) => {
      if (response?.error) {
        showErrorMessage(response.error);
      }
    });
  };

  const handleContinueMatch = () => {
    setRoundActionBusy('continue');
    socket.emit('continue_match', { roomId }, (response) => {
      setRoundActionBusy('');
      if (response?.error) {
        showErrorMessage(response.error);
        return;
      }
      setIsStatsOpen(false);
      setMatchCompletePending(false);
    });
  };

  const handleEndGame = () => {
    setRoundActionBusy('end');
    socket.emit('end_game', { roomId }, (response) => {
      setRoundActionBusy('');
      if (response?.error) {
        showErrorMessage(response.error);
      }
    });
  };

  const handleSaveAndQuit = () => {
    setRoundActionBusy('save');
    socket.emit('save_and_quit', { roomId }, (response) => {
      setRoundActionBusy('');
      if (response?.error) {
        showErrorMessage(response.error);
      }
    });
  };

  const handleResumeSavedGame = (savedGameId) => {
    if (!savedGameId) {
      return;
    }

    setLibrarySavedGameBusyId(savedGameId);
    socket.emit('resume_saved_game', { savedGameId }, (response) => {
      setLibrarySavedGameBusyId('');
      if (response?.error) {
        showErrorMessage(response.error);
        return;
      }

      applyRestoredSession(response);
      setSavedGameRulesetTableModal(null);
      showTopPrompt(`Resumed ${response?.lobby?.roomName || 'saved match'}.`, 'success');
      void loadLibraryData({ suppressErrors: true });
    });
  };

  const handleEndSavedGame = async (savedGameId) => {
    if (!savedGameId) {
      return;
    }

    setLibrarySavedGameBusyId(savedGameId);
    try {
      const response = await requestJson(`/api/games/saved/${encodeURIComponent(savedGameId)}/end`, {
        method: 'POST'
      });
      let refreshedAccount = null;
      try {
        const accountResponse = await requestJson('/api/auth/me');
        refreshedAccount = accountResponse?.authenticated ? accountResponse.user : null;
      } catch {
        // The saved-game action already succeeded, so a profile refresh miss should stay silent.
      }
      setSavedGameRulesetTableModal((current) => (current?.id === savedGameId ? null : current));
      setLibraryState((current) => ({
        ...current,
        savedGames: current.savedGames.filter((entry) => entry.id !== savedGameId)
      }));
      if (refreshedAccount) {
        applyAuthenticatedUser(refreshedAccount);
      }
      await loadLibraryData({ suppressErrors: true });
      showTopPrompt(response?.message || 'Saved game ended.', 'info');
    } catch (error) {
      showTopPrompt(error.message || 'Unable to end that saved game right now.', 'error');
    } finally {
      setLibrarySavedGameBusyId('');
    }
  };

  const showRoomStartBlockedModal = (unreadyPlayers = players.filter((player) => !player.isReady)) => {
    const playerNames = unreadyPlayers.map((player) => getPlayerName(player));
    setRoomStartBlockedModal({
      playerNames,
      count: playerNames.length
    });
  };

  const startGame = () => {
    if (players.length < MIN_PLAYERS_TO_START) {
      showTopPrompt(`At least ${MIN_PLAYERS_TO_START} active players are required to start the game.`, 'error');
      return;
    }

    const unreadyPlayers = players.filter((player) => !player.isReady);
    if (unreadyPlayers.length > 0) {
      showRoomStartBlockedModal(unreadyPlayers);
      return;
    }

    socket.emit('start_game', { roomId }, (response) => {
      if (response?.error === 'Not all players are ready') {
        showRoomStartBlockedModal();
        return;
      }

      if (response.error) {
        showErrorMessage(response.error);
      }
    });
  };

  const applyTheme = (nextTheme) => {
    setTheme(nextTheme);
  };

  const navItems = [
    { id: 'play', label: 'Play', icon: Home },
    { id: 'library', label: 'Library', icon: Library },
    { id: 'ruleset-rater', label: 'Rentz Forum', icon: Users2 },
    { id: 'editor', label: 'Editor', icon: FileCode2 },
    { id: 'login', label: isAuthenticated ? 'Account' : 'Login', icon: isAuthenticated ? UserRound : LogIn },
    ...(forumSearchState.hasResultsTab ? [{ id: 'search-results', label: 'Search results', icon: Search }] : [])
  ];
  const mobilePrimaryNavIds = new Set(['play', 'library', 'login']);
  const mobilePrimaryNavItems = navItems.filter((item) => mobilePrimaryNavIds.has(item.id));
  const mobileMoreNavItems = navItems.filter((item) => !mobilePrimaryNavIds.has(item.id));
  const isMobileMoreActive = mobileMoreNavItems.some((item) => item.id === activeTab);
  const activeNavItem = navItems.find((item) => item.id === activeTab) || null;
  const activeTabLabel = activeNavItem?.label
    || ({
      settings: 'Settings',
      guide: 'Guide'
    }[activeTab] || activeTab);

  const handleNavSelect = (tabId) => {
    setActiveTab(tabId);
    setIsMobileMoreOpen(false);
  };

  const themes = [
    { id: 'theme-frutiger-lime', label: 'Frutiger Lime' },
    { id: 'theme-dark-glass', label: 'Dark Glass' },
    { id: 'theme-light-gloss', label: 'Light Gloss' },
    { id: 'theme-colorful-aero', label: 'Colorful Aero' }
  ];

  const activeProfile = isAuthenticated ? userProfile : guestProfile;
  activeProfileRef.current = activeProfile;
  isPublicBrowserOpenRef.current = isPublicBrowserOpen;
  const trainerSliderMax = getTrainerMaxElo(activeProfile);
  const trainerRankName = getTrainerRankName(trainingSetup.trainerElo);
  const trainingDefaultRulesets = ROOM_RULESET_OPTIONS.map((option) => ({
    id: option.id,
    label: option.label,
    abbreviation: option.abbreviation,
    source: 'default'
  }));
  const trainingSavedRulesets = isAuthenticated
    ? savedCustomRulesets.map((ruleset) => ({
      id: ruleset.id,
      label: ruleset.longName || ruleset.label || ruleset.title || 'Saved Ruleset',
      abbreviation: ruleset.shortName || ruleset.abbreviation || buildRulesetShortNameFallback(ruleset.longName || ruleset.label || ruleset.title || 'Saved Ruleset'),
      source: 'saved'
    }))
    : [];
  const trainingSelectedRegularBots = Math.max(0, trainingSetup.playerCount - 2);
  const trainingStartDisabled = trainingStartBusy || !trainingSetup.selectedRulesetId;
  const activeLobbyPlayer = players.find(
    (player) => player.socketId === socket.id || player.userId === activeProfile?.userId
  );
  const mySpectatorProfile = spectators.find(
    (spectator) => spectator.socketId === socket.id || spectator.userId === activeProfile?.userId
  );
  const myPlayerId = players[myIndex]?.userId || activeLobbyPlayer?.userId || activeProfile?.userId;
  const myPlayer = players[myIndex] || activeLobbyPlayer || null;
  const amIHost = inLobby && lobbyHostId === activeProfile?.userId;
  const canAddGuestRoomRulesets = Boolean(activeProfile?.guest && amIHost && !gameStarted);
  const isTrainingMatch = matchMode === MATCH_MODE_TRAINING;
  const amIReady = inLobby && !!activeLobbyPlayer?.isReady;
  const amISpectator = inLobby && !!mySpectatorProfile;
  const activeChatScope = gameStarted && !gameFinished ? 'game' : (inLobby ? 'lobby' : '');
  const activeChatMessages = activeChatScope === 'game' ? gameChatMessages : roomChatMessages;
  const activeChatTitle = activeChatScope === 'game' ? 'Game Chat' : 'Room Chat';
  const isMyTurn = gameStarted && !gameFinished && myIndex === turnIndex;
  const currentFriendRelationship = playerProfileModal
    ? getFriendRelationshipStatus(userProfile, playerProfileModal)
    : null;
  const currentProfileTargetId = getPlayerUserId(playerProfileModal);
  const nextTurnPlayer = players[turnIndex];
  const currentChooser = players.find((player) => player.userId === choiceState?.chooserId) || null;
  const amIChooser = Boolean(choiceState?.chooserId && choiceState.chooserId === myPlayerId);
  const isChoosingNv = gameStarted && choiceState?.phase === 'choosing_nv';
  const isChoosingRuleset = gameStarted && choiceState?.phase === 'choosing_ruleset';
  const isPlayingRound = gameStarted && !gameFinished && choiceState?.phase === 'playing_round';
  const isRoundStatsPhase = gameStarted && !gameFinished && choiceState?.phase === 'round_stats';
  const isRoundSetupPhase = gameStarted && !gameFinished && !isPlayingRound && !isRoundStatsPhase;
  const currentGameOptions = choiceState?.availableRulesets?.length
    ? choiceState.availableRulesets
    : roomSettings.availableRulesets;
  const activeRulesetId = choiceState?.activeRulesetId || latestRoundStats?.rulesetId || null;
  const activeRulesetDefinition = currentGameOptions.find((option) => option.id === activeRulesetId)
    || roomSettings.availableRulesets.find((option) => option.id === activeRulesetId)
    || null;
  const currentGameLabel = activeRulesetDefinition?.label
    || latestRoundStats?.rulesetLabel
    || 'Waiting...';
  const currentGameShortLabel = activeRulesetDefinition?.abbreviation
    || latestRoundStats?.rulesetAbbreviation
    || currentGameLabel;
  const trainerPlayer = players.find((player) => player?.isTrainer) || null;
  const hasActiveModal = Boolean(
    (isRecoveryPromptOpen && recoverableGuestProfile) ||
    isRoomSettingsOpen ||
    isTrainingSetupOpen ||
    trainingFinalReview ||
    playerProfileModal ||
    rankLeaderboardModal ||
    banNoticeModal ||
    leaveMatchConfirmModal ||
    pendingSpectatorJoin ||
    rulesetPreview ||
    savedGameRulesetTableModal ||
    isChoosingNv ||
    isChoosingRuleset ||
    (isStatsOpen && latestRoundStats)
  );
  const canContinueRoundFromStats = Boolean(
    amIHost &&
    latestRoundStats &&
    choiceState?.phase === 'round_stats' &&
    !matchCompletePending &&
    !gameFinished
  );
  const canManageRoundStats = canContinueRoundFromStats;
  const activeRoundTimerDeadline = isPlayingRound ? localTimerDeadline : null;
  const turnTimerRemainingMs = activeRoundTimerDeadline
    ? Math.max(0, activeRoundTimerDeadline - timerNow)
    : 0;
  const turnTimerRemainingSeconds = activeRoundTimerDeadline
    ? Math.max(0, Math.ceil(turnTimerRemainingMs / 1000))
    : 0;
  const turnTimerTotalSeconds = roomSettings.turnTimerSeconds || TURN_TIMER_RANGE.defaultValue;
  const turnTimerProgress = activeRoundTimerDeadline
    ? clampNumber(turnTimerRemainingMs / Math.max(turnTimerTotalSeconds * 1000, 1), 0, 1)
    : 0;
  const turnTimerWarningStage = !activeRoundTimerDeadline
    ? 'normal'
    : turnTimerRemainingSeconds <= 5
      ? 'low'
      : turnTimerProgress <= 0.25
        ? 'quarter'
        : turnTimerProgress <= 0.5
          ? 'half'
          : 'normal';
  const fontScalePercent = Math.round(fontScale * 100);
  const pageZoomPercent = Math.round(pageZoom * 100);
  const isTurnLocked = gameStarted && !gameFinished && (!isPlayingRound || !isMyTurn || trickPending || isChoosingNv || isChoosingRuleset);
  const activeSeatsRemaining = Math.max(0, MAX_ACTIVE_PLAYERS - players.length);
  const areActiveSeatsFull = players.length >= MAX_ACTIVE_PLAYERS;
  const selectedRoomRuleLabels = roomSettings.availableRulesets
    .filter((option) => roomSettings.selectedRulesets[option.id])
    .map((option) => option.abbreviation || option.label);
  const isViewingEditableRoomRuleset = Boolean(
    editorRoomRulesetId && roomSettings.availableRulesets.some((option) => option.id === editorRoomRulesetId)
  );
  const playableCards = hand.reduce((acc, card) => {
    acc[card] = canPlayCard({
      card,
      hand,
      trickSuit,
      isMyTurn,
      trickPending,
      isRoundActive: isPlayingRound
    });
    return acc;
  }, {});

  const renderPlayerActionTrigger = (player, {
    elementKey = null,
    className = '',
    title = '',
    children,
    disabled = false
  } = {}) => (
    <button
      key={elementKey}
      type="button"
      disabled={disabled}
      onClick={(event) => openPlayerActionMenu(event, player)}
      className={clsx('rentz-player-action-trigger', className)}
      title={title || `Interact with ${getPlayerName(player)}`}
    >
      {children}
    </button>
  );

  const renderPlayerActionMenu = () => {
    if (!playerActionMenu?.player) {
      return null;
    }

    const relationship = getFriendRelationshipStatus(userProfile, playerActionMenu.player);
    const targetUserId = getPlayerUserId(playerActionMenu.player);
    const busy = friendActionBusyTargetId === targetUserId;
    const isChatMuteBusy = chatMuteBusyTargetId === targetUserId;
    const isSelfProfile = Boolean(targetUserId && targetUserId === activeProfile?.userId);
    const canModerateChat = Boolean(
      inLobby
      && amIHost
      && targetUserId
      && !isBotPlayer(playerActionMenu.player)
      && !isSelfProfile
      && [...players, ...spectators].some((member) => member.userId === targetUserId)
    );
    const isTargetChatMuted = Boolean(targetUserId && mutedChatUserIds.includes(targetUserId));
    const canRemoveBot = Boolean(inLobby && amIHost && !gameStarted && isBotPlayer(playerActionMenu.player));
    const canBanMember = Boolean(
      inLobby
      && amIHost
      && targetUserId
      && !isSelfProfile
      && !isBotPlayer(playerActionMenu.player)
      && [...players, ...spectators].some((member) => member.userId === targetUserId)
    );
    const canReplaceAbandonedPlayer = Boolean(
      inLobby
      && amIHost
      && gameStarted
      && !isBotPlayer(playerActionMenu.player)
      && getPlayerConnectionStatus(playerActionMenu.player) === 'abandoned'
    );
    const menuWidth = Math.min(280, Math.max(220, window.innerWidth - 24));
    const estimatedMenuHeight = 248;
    const rect = playerActionMenu.anchorRect;
    const desktopLeft = rect
      ? Math.min(
        Math.max(12, rect.left + (rect.width / 2) - (menuWidth / 2)),
        window.innerWidth - menuWidth - 12
      )
      : 12;
    const preferredTop = rect ? rect.bottom + 10 : 12;
    const fallbackTop = rect ? rect.top - estimatedMenuHeight - 10 : 12;
    const desktopTop = rect
      ? (preferredTop + estimatedMenuHeight <= window.innerHeight - 12
        ? preferredTop
        : Math.max(12, fallbackTop))
      : 12;

    return (
      <div className="fixed inset-0 z-[78]">
        <div
          ref={playerActionMenuRef}
          className={clsx(
            'rentz-player-action-menu',
            playerActionMenu.mode === 'bottom-sheet' && 'is-bottom-sheet'
          )}
          style={playerActionMenu.mode === 'bottom-sheet'
            ? undefined
            : {
              left: `${desktopLeft}px`,
              top: `${desktopTop}px`,
              width: `${menuWidth}px`
            }}
        >
          <div className="rentz-player-action-menu-header">
            <div className="rentz-player-action-menu-avatar seat-avatar h-12 w-12 text-sm">
              {getPlayerAvatarSource(playerActionMenu.player) ? (
                <img src={getPlayerAvatarSource(playerActionMenu.player)} alt="" className="h-full w-full rounded-full object-cover" />
              ) : (
                getPlayerInitials(playerActionMenu.player)
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-base font-black text-[var(--text-primary)]">
                {getPlayerName(playerActionMenu.player)}
              </div>
              <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                {relationship.label}
              </div>
            </div>
          </div>

          <div className="rentz-player-action-menu-buttons">
            <button
              type="button"
              onClick={() => {
                setPlayerActionMenu(null);
                void openPlayerProfileModal(playerActionMenu.player);
              }}
              className="rentz-player-action-menu-button"
            >
              <UserRound className="h-4 w-4" />
              View Profile
            </button>

            {canModerateChat ? (
              <button
                type="button"
                disabled={isChatMuteBusy}
                onClick={async () => {
                  const success = await handleSetChatMute(targetUserId, !isTargetChatMuted);
                  if (success) {
                    setPlayerActionMenu(null);
                  }
                }}
                className="rentz-player-action-menu-button"
              >
                {isTargetChatMuted ? <MessageCircle className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                {isChatMuteBusy
                  ? (isTargetChatMuted ? 'Unmuting...' : 'Muting...')
                  : (isTargetChatMuted ? 'Unmute Chat' : 'Mute Chat')}
              </button>
            ) : null}

            {canRemoveBot ? (
              <button
                type="button"
                onClick={async () => {
                  const success = await handleRemoveBotFromLobby(targetUserId);
                  if (success) {
                    setPlayerActionMenu(null);
                  }
                }}
                className="rentz-player-action-menu-button"
              >
                <Trash2 className="h-4 w-4" />
                Remove Bot
              </button>
            ) : null}

            {canBanMember ? (
              <button
                type="button"
                onClick={() => {
                  handleBanMember(targetUserId);
                  setPlayerActionMenu(null);
                }}
                className="rentz-player-action-menu-button"
              >
                <Ban className="h-4 w-4" />
                Ban From Game
              </button>
            ) : null}

            {canReplaceAbandonedPlayer ? (
              <button
                type="button"
                onClick={async () => {
                  const success = await handleReplacePlayerWithBot(targetUserId);
                  if (success) {
                    setPlayerActionMenu(null);
                  }
                }}
                className="rentz-player-action-menu-button"
              >
                <Bot className="h-4 w-4" />
                Replace With Bot
              </button>
            ) : null}

            {relationship.canSendRequest ? (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const success = await runFriendAction(
                    'request',
                    getPlayerUserId(playerActionMenu.player),
                    'Friend request sent.'
                  );
                  if (success) {
                    setPlayerActionMenu(null);
                  }
                }}
                className="rentz-player-action-menu-button is-accent"
              >
                <Plus className="h-4 w-4" />
                {busy ? 'Sending...' : 'Send Friend Request'}
              </button>
            ) : relationship.code === 'login-required' ? (
              <button
                type="button"
                onClick={() => {
                  setPlayerActionMenu(null);
                  setActiveTab('login');
                  showTopPrompt('Log in to send friend requests.', 'info');
                }}
                className="rentz-player-action-menu-button is-accent"
              >
                <LogIn className="h-4 w-4" />
                Log In to Add Friend
              </button>
            ) : (
              <div className="rentz-player-action-menu-status">
                {relationship.label}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderReadonlyProfileRulesetDeck = ({
    profile,
    title,
    fieldName,
    limit,
    emptyLabel,
    isLoading = false
  }) => {
    const indexes = Array.isArray(profile?.[fieldName]) ? profile[fieldName] : [];
    const slots = Array.from({ length: limit }, (_, slotIndex) => indexes[slotIndex] ?? null);
    const filledCount = slots.filter((index) => index != null).length;
    const cardShellClassName = 'relative flex min-h-[13.25rem] w-full min-w-0 flex-col overflow-hidden rounded-[1.45rem] box-border p-4';
    const gridClassName = limit === 5
      ? 'grid grid-cols-1 justify-start gap-3 sm:grid-cols-2 md:grid-cols-3 lg:[grid-template-columns:repeat(5,var(--ruleset-card-width))]'
      : 'grid grid-cols-1 justify-start gap-3 sm:grid-cols-2 md:grid-cols-3 lg:[grid-template-columns:repeat(3,var(--ruleset-card-width))]';
    const gridStyle = {
      '--ruleset-card-width': '11rem'
    };

    return (
      <section className="rounded-[1.45rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h4 className="text-xl font-display font-black text-[var(--text-primary)]">{title}</h4>
          <div className="status-pill px-3 py-2">{filledCount}/{limit}</div>
        </div>

        <div className="overflow-x-auto pb-1">
          <div className={gridClassName} style={gridStyle}>
            {slots.map((index, slotIndex) => {
              const definition = index == null ? null : getAccountRulesetDefinition(index);

              if (isLoading) {
                return (
                  <div
                    key={`${fieldName}-loading-${slotIndex}`}
                    className={clsx(cardShellClassName, 'h-full border border-dashed border-[var(--glass-border)] bg-[var(--surface-soft)]')}
                  >
                    <div className="text-[9px] font-extrabold uppercase tracking-[0.22em] text-[var(--text-secondary)]">
                      Card {slotIndex + 1}
                    </div>
                    <div className="mt-4 text-sm font-semibold text-[var(--text-secondary)]">
                      Loading ruleset...
                    </div>
                  </div>
                );
              }

              if (!definition) {
                return (
                  <div
                    key={`${fieldName}-empty-${slotIndex}`}
                    className={clsx(cardShellClassName, 'h-full items-center justify-center border-2 border-dashed border-[var(--glass-border)] bg-[var(--surface-soft)] text-center')}
                  >
                    <div className="text-xs font-black uppercase tracking-[0.14em] text-[var(--text-primary)]">
                      Empty slot
                    </div>
                    <p className="mt-2 max-w-[11rem] text-xs font-semibold leading-5 text-[var(--text-secondary)]">
                      {emptyLabel}
                    </p>
                  </div>
                );
              }

              return (
                <div
                  key={`${fieldName}-${definition.index}`}
                  className={clsx(cardShellClassName, 'h-full border border-slate-300/80 shadow-[0_14px_30px_rgba(15,23,42,0.10)]')}
                  style={{
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(237,242,247,0.98) 100%)'
                  }}
                >
                  <div className="min-w-0">
                    <div className="text-[9px] font-extrabold uppercase tracking-[0.22em] text-slate-500">Card {slotIndex + 1}</div>
                    <div
                      className="mt-2 text-[0.95rem] font-black leading-5 text-slate-950 [overflow-wrap:anywhere]"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}
                    >
                      {definition.label}
                    </div>
                    <div className="mt-2 inline-flex rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-700">
                      {definition.abbreviation}
                    </div>
                  </div>

                  <div className="mt-auto space-y-2 pt-4">
                    <button
                      type="button"
                      onClick={() => handleAccountRulesetPreview(definition.index)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-[0.95rem] border border-slate-300 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-900 transition hover:bg-slate-100"
                    >
                      <FileCode2 className="h-3.5 w-3.5" />
                      Code Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPlayerProfileModal(null);
                        handleAccountRulesetOpenInEditor(definition.index);
                      }}
                      className="flex w-full items-center justify-center gap-1.5 rounded-[0.95rem] border border-emerald-300 bg-emerald-100/85 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-950 transition hover:bg-emerald-200/80"
                    >
                      <Settings className="h-3.5 w-3.5" />
                      Open Editor
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    );
  };

  const renderPlayerProfileModal = () => {
    if (!playerProfileModal) {
      return null;
    }

    const busy = friendActionBusyTargetId === currentProfileTargetId;
    const relationship = currentFriendRelationship || {
      code: 'unavailable',
      label: 'Profile unavailable',
      canSendRequest: false
    };
    const footerButtons = [];

    if (relationship.canSendRequest) {
      footerButtons.push(
        <button
          key="send"
          type="button"
          disabled={busy}
          onClick={() => void runFriendAction('request', currentProfileTargetId, 'Friend request sent.', { updateProfileModal: true })}
          className="frutiger-button px-5 py-3 text-sm uppercase tracking-[0.14em] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {busy ? 'Sending...' : 'Send Friend Request'}
        </button>
      );
    } else if (relationship.canAcceptRequest) {
      footerButtons.push(
        <button
          key="accept"
          type="button"
          disabled={busy}
          onClick={() => void runFriendAction('accept', currentProfileTargetId, 'Friend request accepted.', { updateProfileModal: true })}
          className="frutiger-button px-5 py-3 text-sm uppercase tracking-[0.14em] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {busy ? 'Accepting...' : 'Accept Request'}
        </button>
      );
      footerButtons.push(
        <button
          key="reject"
          type="button"
          disabled={busy}
          onClick={async () => {
            await runFriendAction('reject', currentProfileTargetId, 'Friend request rejected.', { updateProfileModal: true });
          }}
          className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-70"
        >
          Reject
        </button>
      );
    } else if (relationship.canCancelOutgoing) {
      footerButtons.push(
        <button
          key="cancel"
          type="button"
          disabled={busy}
          onClick={() => void runFriendAction('cancel', currentProfileTargetId, 'Friend request canceled.', { updateProfileModal: true })}
          className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {busy ? 'Canceling...' : 'Cancel Request'}
        </button>
      );
    } else if (relationship.canRemoveFriend) {
      footerButtons.push(
        <button
          key="remove"
          type="button"
          disabled={busy}
          onClick={() => void runFriendAction('remove', currentProfileTargetId, 'Friend removed.', { updateProfileModal: true })}
          className="rounded-[1.3rem] border border-red-200/80 bg-red-100/80 px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-red-900 transition hover:bg-red-200/80 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {busy ? 'Removing...' : 'Remove Friend'}
        </button>
      );
    } else if (relationship.code === 'login-required') {
      footerButtons.push(
        <button
          key="login"
          type="button"
          onClick={() => {
            setPlayerProfileModal(null);
            setActiveTab('login');
            showTopPrompt('Log in to send friend requests.', 'info');
          }}
          className="frutiger-button px-5 py-3 text-sm uppercase tracking-[0.14em]"
        >
          Open Account
        </button>
      );
    } else if (relationship.code === 'self') {
      footerButtons.push(
        <button
          key="account"
          type="button"
          onClick={() => {
            setPlayerProfileModal(null);
            setActiveTab('login');
          }}
          className="frutiger-button px-5 py-3 text-sm uppercase tracking-[0.14em]"
        >
          Open Account
        </button>
      );
    }

    footerButtons.push(
      <button
        key="close"
        type="button"
        onClick={() => setPlayerProfileModal(null)}
        className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
      >
        Close
      </button>
    );

    return (
      <ModalShell
        title={playerProfileModal.username || playerProfileModal.displayName || 'Player Profile'}
        eyebrow={playerProfileModal.isBot ? 'AI profile' : (playerProfileModal.guest ? 'Guest profile' : 'Table profile')}
        onClose={() => setPlayerProfileModal(null)}
        wide
        footer={<div className="flex flex-col gap-3 sm:flex-row sm:justify-end">{footerButtons}</div>}
      >
        <div className="space-y-5">
          <div className="rounded-[1.6rem] border border-[var(--glass-border)] bg-[var(--surface-soft)]">
            <div
              className="relative h-56 overflow-hidden rounded-t-[1.6rem] border-b border-[var(--glass-border)]"
              style={{
                background: `linear-gradient(180deg, rgba(8,15,28,0.22), rgba(8,15,28,0.58)), url(${playerProfileModal.banner || DEFAULT_REGISTER_BANNER_PREVIEW}) center/cover`
              }}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.24),transparent_42%)]" />
            </div>

            <div className="px-5 pb-6 pt-5 sm:px-6 sm:pb-7 sm:pt-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white/85 bg-white/90 p-1 shadow-lg sm:h-28 sm:w-28">
                    <img
                      src={playerProfileModal.avatarUrl || DEFAULT_REGISTER_PROFILE_PREVIEW}
                      alt=""
                      className="h-full w-full rounded-full object-contain object-center"
                    />
                  </div>

                  <div className="min-w-0 pt-1">
                    <div className="text-3xl font-black text-[var(--text-primary)]">
                      {playerProfileModal.username || playerProfileModal.displayName || 'Player'}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full border border-[var(--glass-border)] bg-[var(--surface-soft)] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                        {relationship.label}
                      </span>
                      <span className="inline-flex rounded-full border border-[var(--glass-border)] bg-[var(--surface-soft)] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                        {getPlayerCompetitiveLabel(playerProfileModal)}
                      </span>
                      {!playerProfileModal.guest && !playerProfileModal.isBot && playerProfileModal.rankName ? (
                        <button
                          type="button"
                          onClick={() => void openRankLeaderboardModal({
                            targetUserId: playerProfileModal.userId,
                            fallbackRankName: playerProfileModal.rankName,
                            sourceLabel: 'profile-preview'
                          })}
                          className="inline-flex rounded-full border border-[var(--glass-border)] bg-[var(--surface-soft)] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--text-secondary)] transition hover:bg-[var(--surface-hover)] focus:outline-none focus:ring-4 focus:ring-[var(--accent-glow)]"
                          title="Open leaderboard for this rank"
                        >
                          {playerProfileModal.rankName}
                        </button>
                      ) : null}
                      <span className="text-sm font-semibold text-[var(--text-secondary)]">
                        {playerProfileModal.isBot
                          ? (playerProfileModal.replacementForName
                            ? `Replacing ${playerProfileModal.replacementForName}`
                            : 'Computer-controlled player')
                          : playerProfileModal.accountCreatedAt
                          ? `Joined ${new Date(playerProfileModal.accountCreatedAt).toLocaleDateString()}`
                          : 'Guest player'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-[1.45rem] border border-[var(--glass-border)] bg-[var(--surface-subtle)] p-4 sm:p-5">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                  Description
                </div>
                <p className="mt-3 text-sm font-semibold leading-7 text-[var(--text-primary)] [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
                  {playerProfileLoading
                    ? 'Loading profile...'
                    : (playerProfileModal.description || 'No profile description yet.')}
                </p>
              </div>
            </div>
          </div>

          {!playerProfileModal.guest && !playerProfileModal.isBot && (
            <div className="grid gap-5 min-[1800px]:grid-cols-2">
              {renderReadonlyProfileRulesetDeck({
                profile: playerProfileModal,
                title: 'Favourite Rulesets',
                fieldName: 'favouriteRulesets',
                limit: 5,
                emptyLabel: '',
                isLoading: playerProfileLoading
              })}
              {renderReadonlyProfileRulesetDeck({
                profile: playerProfileModal,
                title: 'Ruleset Loadout',
                fieldName: 'rulesetLoadout',
                limit: 3,
                emptyLabel: 'No ruleset loadout selected.',
                isLoading: playerProfileLoading
              })}
            </div>
          )}
        </div>
      </ModalShell>
    );
  };

  const renderRankLeaderboardModal = () => {
    if (!rankLeaderboardModal) {
      return null;
    }

    const {
      loading,
      error,
      entries = [],
      currentUserId,
      highlightedUserId,
      rankName,
      rankMinElo,
      rankMaxElo,
      sourceLabel
    } = rankLeaderboardModal;
    const rankRangeLabel = rankMaxElo == null
      ? `${rankMinElo ?? 0}+ ELO`
      : `${rankMinElo ?? 0}-${rankMaxElo} ELO`;

    return (
      <ModalShell
        title={rankName || 'Rank Leaderboard'}
        eyebrow={`${sourceLabel === 'profile-preview' ? 'Profile rank leaderboard' : 'Current rank leaderboard'}${rankName ? ` • ${rankRangeLabel}` : ''}`}
        onClose={() => setRankLeaderboardModal(null)}
        wide
        footer={(
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setRankLeaderboardModal(null)}
              className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
            >
              Close
            </button>
          </div>
        )}
      >
        <div className="space-y-4">
          {loading ? (
            <div className="rounded-[1.4rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-5 text-sm font-semibold text-[var(--text-secondary)]">
              Loading leaderboard...
            </div>
          ) : error ? (
            <div className="rounded-[1.4rem] border border-red-200/80 bg-red-100/80 p-5 text-sm font-semibold text-red-900">
              {error}
            </div>
          ) : entries.length === 0 ? (
            <div className="rounded-[1.4rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-5 text-sm font-semibold text-[var(--text-secondary)]">
              No ranked accounts are available in this tier yet.
            </div>
          ) : (
            <div className="grid gap-3">
              {entries.map((entry) => {
                const isCurrentUser = entry.userId && entry.userId === currentUserId;
                const isHighlightedUser = entry.userId && entry.userId === highlightedUserId;

                return (
                  <div
                    key={entry.userId || entry.username}
                    className={clsx(
                      'flex flex-wrap items-center gap-3 rounded-[1.35rem] border px-4 py-3 sm:flex-nowrap sm:px-5',
                      isHighlightedUser
                        ? 'border-emerald-300 bg-emerald-100/70'
                        : 'border-[var(--glass-border)] bg-[var(--surface-soft)]'
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className={clsx(
                        'flex h-10 min-w-10 items-center justify-center rounded-full border text-sm font-black',
                        isHighlightedUser
                          ? 'border-emerald-400 bg-white text-emerald-900'
                          : 'border-[var(--glass-border)] bg-[var(--surface-medium)] text-[var(--text-primary)]'
                      )}
                      >
                        #{entry.placement || '--'}
                      </div>
                      <AvatarFace
                        player={entry}
                        alt={`${getPlayerName(entry)} avatar`}
                        wrapperClassName="seat-avatar h-12 w-12 text-sm shrink-0"
                        imageClassName="h-full w-full rounded-full object-cover"
                        fallbackClassName="flex h-full w-full items-center justify-center rounded-full"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-base font-black text-[var(--text-primary)]">
                          {getPlayerName(entry)}{isCurrentUser ? ' (You)' : ''}
                        </div>
                        <div className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                          {entry.rankName || rankName}
                        </div>
                      </div>
                    </div>
                    <div className="ml-auto inline-flex rounded-full border border-[var(--glass-border)] bg-white/80 px-4 py-2 text-sm font-black uppercase tracking-[0.14em] text-[var(--text-primary)]">
                      ELO {getPlayerRating(entry) == null ? '--' : getPlayerRating(entry)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ModalShell>
    );
  };

  useEffect(() => {
    if (!hasActiveModal) {
      document.documentElement.classList.remove('rentz-modal-open');
      document.body.classList.remove('rentz-modal-open');
      return undefined;
    }

    const root = document.documentElement;
    const body = document.body;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousRootOverscroll = root.style.overscrollBehavior;
    const previousBodyOverscroll = body.style.overscrollBehavior;
    let touchStartX = 0;
    let touchStartY = 0;
    let lastTouchY = 0;

    const getScrollTarget = (target) => {
      if (!(target instanceof Element)) {
        return null;
      }

      return target.closest('[data-rentz-modal-scroll]');
    };

    const canScrollVertically = (element) => element.scrollHeight > element.clientHeight + 1;

    const shouldBlockVerticalScroll = (scrollTarget, deltaY) => {
      if (!canScrollVertically(scrollTarget)) {
        return true;
      }

      const atTop = scrollTarget.scrollTop <= 0;
      const atBottom = scrollTarget.scrollTop + scrollTarget.clientHeight >= scrollTarget.scrollHeight - 1;
      return (atTop && deltaY > 0) || (atBottom && deltaY < 0);
    };

    const handleTouchStart = (event) => {
      const touch = event.touches?.[0];
      if (!touch) {
        return;
      }

      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      lastTouchY = touch.clientY;
    };

    const handleTouchMove = (event) => {
      const touch = event.touches?.[0];
      const scrollTarget = getScrollTarget(event.target);

      if (!touch || !scrollTarget) {
        event.preventDefault();
        return;
      }

      const axis = scrollTarget.getAttribute('data-rentz-modal-scroll') || 'y';
      const gestureX = Math.abs(touch.clientX - touchStartX);
      const gestureY = Math.abs(touch.clientY - touchStartY);

      if (axis.includes('x') && gestureX > gestureY) {
        return;
      }

      if (!axis.includes('y')) {
        event.preventDefault();
        return;
      }

      const deltaY = touch.clientY - lastTouchY;
      lastTouchY = touch.clientY;

      if (shouldBlockVerticalScroll(scrollTarget, deltaY)) {
        event.preventDefault();
      }
    };

    const handleWheel = (event) => {
      const scrollTarget = getScrollTarget(event.target);

      if (!scrollTarget) {
        event.preventDefault();
        return;
      }

      const axis = scrollTarget.getAttribute('data-rentz-modal-scroll') || 'y';
      const isMostlyHorizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);

      if (axis.includes('x') && isMostlyHorizontal) {
        return;
      }

      if (!axis.includes('y')) {
        event.preventDefault();
        return;
      }

      if (shouldBlockVerticalScroll(scrollTarget, -event.deltaY)) {
        event.preventDefault();
      }
    };

    root.classList.add('rentz-modal-open');
    body.classList.add('rentz-modal-open');
    root.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    root.style.overscrollBehavior = 'none';
    body.style.overscrollBehavior = 'none';
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      root.classList.remove('rentz-modal-open');
      body.classList.remove('rentz-modal-open');
      root.style.overflow = previousRootOverflow;
      body.style.overflow = previousBodyOverflow;
      root.style.overscrollBehavior = previousRootOverscroll;
      body.style.overscrollBehavior = previousBodyOverscroll;
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('wheel', handleWheel);
    };
  }, [hasActiveModal]);

  useEffect(() => {
    setIsMobileMoreOpen(false);
  }, [activeTab]);

  useEffect(() => {
    if (!isMobileMoreOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (mobileNavRef.current && !mobileNavRef.current.contains(event.target)) {
        setIsMobileMoreOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isMobileMoreOpen]);

  useEffect(() => {
    if (!inLobby || gameStarted || !amIHost) {
      setIsRoomSettingsOpen(false);
    }
  }, [amIHost, gameStarted, inLobby]);

  useEffect(() => {
    if (pendingPlayCard && !playableCards[pendingPlayCard]) {
      setPendingPlayCard(null);
    }
  }, [pendingPlayCard, playableCards]);

  const localTablePlayer = myPlayer || mySpectatorProfile || activeProfile;
  const desktopSeatPlayers = players.length > 0
    ? getDesktopSeatOrder(players)
    : localTablePlayer
      ? [localTablePlayer]
      : [];
  const isTableStageVisible = activeTab === 'play' && inLobby && gameStarted && !gameFinished && !isRoundSetupPhase && playView === 'table';
  const isChoiceHandSpreadVisible = isChoosingRuleset && !choiceState?.nvSelected && !isSpectatingGame;
  const handSpreadLayoutMode = isChoiceHandSpreadVisible ? 'choice' : isTableStageVisible ? 'play' : 'hidden';
  const isHandSpreadVisible = handSpreadLayoutMode !== 'hidden';
  const displayedHand = isSpectatingGame ? spectatorVisibleHand : hand;
  const sortedDisplayedHand = sortCards(displayedHand);
  const fallbackHandSpreadMetrics = sortedDisplayedHand.length > 0
    ? (() => {
      const fallbackCardHeight = HAND_CARD_MIN_HEIGHT_PX;
      const fallbackCardWidth = fallbackCardHeight * CARD_ASSET_ASPECT_RATIO;
      const fallbackCardAdvance = fallbackCardWidth * 0.58;
      const fallbackSpreadWidth = fallbackCardWidth + (Math.max(0, sortedDisplayedHand.length - 1) * fallbackCardAdvance);

      return {
        cardHeight: fallbackCardHeight,
        cardWidth: fallbackCardWidth,
        cardAdvance: fallbackCardAdvance,
        spreadWidth: fallbackSpreadWidth
      };
    })()
    : null;
  const visibleHandSpreadMetrics = handSpreadMetrics || fallbackHandSpreadMetrics;
  const playersForMobilePanel = [...players].sort((left, right) => {
    const leftPoints = Number(getPlayerPoints(left) || 0);
    const rightPoints = Number(getPlayerPoints(right) || 0);
    if (rightPoints !== leftPoints) {
      return rightPoints - leftPoints;
    }

    const leftSeatIndex = Number.isInteger(left?.seatIndex) ? left.seatIndex : Number.MAX_SAFE_INTEGER;
    const rightSeatIndex = Number.isInteger(right?.seatIndex) ? right.seatIndex : Number.MAX_SAFE_INTEGER;
    if (leftSeatIndex !== rightSeatIndex) {
      return leftSeatIndex - rightSeatIndex;
    }

    const leftJoinOrder = Number.isInteger(left?.joinOrder) ? left.joinOrder : Number.MAX_SAFE_INTEGER;
    const rightJoinOrder = Number.isInteger(right?.joinOrder) ? right.joinOrder : Number.MAX_SAFE_INTEGER;
    if (leftJoinOrder !== rightJoinOrder) {
      return leftJoinOrder - rightJoinOrder;
    }

    return getPlayerName(left).localeCompare(getPlayerName(right));
  });
  const getReactionParticipant = (userId) => {
    if (!userId) {
      return null;
    }

    return players.find((player) => player.userId === userId)
      || spectators.find((spectator) => spectator.userId === userId)
      || (activeProfile?.userId === userId ? activeProfile : null);
  };
  const mobileReactionSpotlightPlayer = mobileReactionSpotlight
    ? mobileReactionSpotlight.player || getReactionParticipant(mobileReactionSpotlight.userId)
    : null;
  const mobileChatSpotlightPlayer = mobileChatSpotlight
    ? mobileChatSpotlight.player || getReactionParticipant(mobileChatSpotlight.userId)
    : null;
  const mobileReactionSpotlightTimestamp = getBubbleTimestampValue(mobileReactionSpotlight?.createdAt);
  const mobileChatSpotlightTimestamp = getBubbleTimestampValue(mobileChatSpotlight?.createdAt);
  const useChatSpotlight = Boolean(
    mobileChatSpotlight
    && mobileChatSpotlightTimestamp >= mobileReactionSpotlightTimestamp
  );
  const mobileSpotlightPlayer = useChatSpotlight
    ? mobileChatSpotlightPlayer
    : mobileReactionSpotlightPlayer;
  const mobileSpotlightReaction = useChatSpotlight ? null : mobileReactionSpotlight;
  const mobileSpotlightChatBubble = useChatSpotlight ? mobileChatSpotlight : null;
  const showMobileLocalBubble = Boolean(
    myPlayer
    && !isSpectatingGame
    && myPlayer.userId
    && myPlayer.userId !== nextTurnPlayer?.userId
  );

  const showReactionBubble = ({ userId, emojiId, createdAt = Date.now(), player: reactionPlayerPayload = null }) => {
    if (!userId || !EMOJI_REACTION_MAP[emojiId]) {
      return;
    }

    const existingTimeout = reactionTimeoutsRef.current.get(userId);
    if (existingTimeout) {
      window.clearTimeout(existingTimeout);
    }

    setActiveReactions((current) => ({
      ...current,
      [userId]: { emojiId, createdAt }
    }));

    const timeoutId = window.setTimeout(() => {
      reactionTimeoutsRef.current.delete(userId);
      setActiveReactions((current) => {
        if (!current[userId]) {
          return current;
        }

        const nextState = { ...current };
        delete nextState[userId];
        return nextState;
      });
    }, EMOJI_REACTION_DURATION_MS);

    reactionTimeoutsRef.current.set(userId, timeoutId);

    const shouldSpotlightOnMobile = userId !== activeProfile?.userId && userId !== nextTurnPlayer?.userId;
    if (!shouldSpotlightOnMobile) {
      return;
    }

    const reactionPlayer = getReactionParticipant(userId) || reactionPlayerPayload;
    if (mobileReactionSpotlightTimeoutRef.current) {
      window.clearTimeout(mobileReactionSpotlightTimeoutRef.current);
    }

    setMobileReactionSpotlight({
      userId,
      emojiId,
      createdAt,
      player: reactionPlayer
        ? {
          ...reactionPlayer,
          avatarUrl: getPlayerAvatarSource(reactionPlayer)
        }
        : null
    });

    mobileReactionSpotlightTimeoutRef.current = window.setTimeout(() => {
      setMobileReactionSpotlight((current) => {
        if (!current || current.userId !== userId || current.createdAt !== createdAt) {
          return current;
        }

        return null;
      });
      mobileReactionSpotlightTimeoutRef.current = null;
    }, EMOJI_REACTION_DURATION_MS);
  };
  showReactionBubbleRef.current = showReactionBubble;

  const showChatTableBubble = (message) => {
    const normalizedMessage = normalizeChatMessage(message, 'game');
    const userId = normalizedMessage?.sender?.userId || '';
    if (!userId) {
      return;
    }

    const existingTimeout = chatBubbleTimeoutsRef.current.get(userId);
    if (existingTimeout) {
      window.clearTimeout(existingTimeout);
    }

    setActiveChatBubbles((current) => ({
      ...current,
      [userId]: normalizedMessage
    }));

    const timeoutId = window.setTimeout(() => {
      chatBubbleTimeoutsRef.current.delete(userId);
      setActiveChatBubbles((current) => {
        if (!current[userId]) {
          return current;
        }

        const nextState = { ...current };
        delete nextState[userId];
        return nextState;
      });
    }, TABLE_CHAT_BUBBLE_DURATION_MS);

    chatBubbleTimeoutsRef.current.set(userId, timeoutId);

    const shouldSpotlightOnMobile = userId !== activeProfile?.userId && userId !== nextTurnPlayer?.userId;
    if (!shouldSpotlightOnMobile) {
      return;
    }

    const chatPlayer = getReactionParticipant(userId) || normalizedMessage.sender;
    if (mobileChatSpotlightTimeoutRef.current) {
      window.clearTimeout(mobileChatSpotlightTimeoutRef.current);
    }

    setMobileChatSpotlight({
      ...normalizedMessage,
      userId,
      player: chatPlayer
        ? {
          ...chatPlayer,
          avatarUrl: getPlayerAvatarSource(chatPlayer)
        }
        : null
    });

    mobileChatSpotlightTimeoutRef.current = window.setTimeout(() => {
      setMobileChatSpotlight((current) => {
        if (!current || current.id !== normalizedMessage.id) {
          return current;
        }

        return null;
      });
      mobileChatSpotlightTimeoutRef.current = null;
    }, TABLE_CHAT_BUBBLE_DURATION_MS);
  };
  showChatTableBubbleRef.current = showChatTableBubble;

  const handleEmojiPrompt = (event, player) => {
    if (!player?.userId || player.userId !== activeProfile?.userId) {
      return;
    }

    const triggerRect = event?.currentTarget?.getBoundingClientRect?.();
    if (!triggerRect) {
      return;
    }

    const pickerWidth = 244;
    const pickerHeight = 196;
    const left = Math.min(
      Math.max(12, triggerRect.left + triggerRect.width / 2 - pickerWidth / 2),
      window.innerWidth - pickerWidth - 12
    );
    const preferredTop = triggerRect.bottom + 10;
    const top = preferredTop + pickerHeight > window.innerHeight - 12
      ? Math.max(12, triggerRect.top - pickerHeight - 10)
      : preferredTop;

    setEmojiPickerState({
      userId: player.userId,
      mode: 'anchored',
      left,
      top
    });
  };

  const handleEmojiReactionSelect = (emojiId) => {
    if (!roomId || !EMOJI_REACTION_MAP[emojiId]) {
      return;
    }

    socket.emit('send_reaction', { roomId, emojiId }, (response) => {
      if (response?.error) {
        showErrorMessage(response.error);
      }
    });
    setEmojiPickerState(null);
  };

  useEffect(() => {
    return () => {
      if (turnTimerNoticeTimeoutRef.current) {
        window.clearTimeout(turnTimerNoticeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isPlayingRound) {
      return;
    }

    setPendingPlayCard(null);
    setHoveredCardIndex(null);
  }, [isPlayingRound]);

  useEffect(() => {
    if (!isPlayingRound) {
      setLocalTimerDeadline(null);
      setTimerNow(Date.now());
      return;
    }

    const absoluteDeadline = Number(choiceState?.timerDeadline);
    if (Number.isFinite(absoluteDeadline) && absoluteDeadline > 0) {
      setLocalTimerDeadline(absoluteDeadline);
      setTimerNow(Date.now());
      return;
    }

    if (typeof choiceState?.timerRemainingMs === 'number') {
      setLocalTimerDeadline(Date.now() + Math.max(0, choiceState.timerRemainingMs));
      setTimerNow(Date.now());
      return;
    }

    setLocalTimerDeadline(null);
    setTimerNow(Date.now());
  }, [choiceState?.timerDeadline, choiceState?.timerRemainingMs, isPlayingRound]);

  useEffect(() => {
    if (!activeRoundTimerDeadline) {
      return undefined;
    }

    setTimerNow(Date.now());
    const intervalId = window.setInterval(() => {
      setTimerNow(Date.now());
    }, 100);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeRoundTimerDeadline]);

  useEffect(() => {
    const warningState = turnTimerWarningStateRef.current;
    const clearTurnTimerNotice = () => {
      if (turnTimerNoticeTimeoutRef.current) {
        window.clearTimeout(turnTimerNoticeTimeoutRef.current);
        turnTimerNoticeTimeoutRef.current = null;
      }
      setTurnTimerNotice('');
    };

    const showTurnTimerNotice = (secondsLeft) => {
      if (turnTimerNoticeTimeoutRef.current) {
        window.clearTimeout(turnTimerNoticeTimeoutRef.current);
      }
      setTurnTimerNotice(`${secondsLeft}s left`);
      turnTimerNoticeTimeoutRef.current = window.setTimeout(() => {
        setTurnTimerNotice('');
        turnTimerNoticeTimeoutRef.current = null;
      }, 2400);
    };

    if (!isPlayingRound || !activeRoundTimerDeadline) {
      warningState.deadline = null;
      warningState.halfShown = false;
      warningState.quarterShown = false;
      clearTurnTimerNotice();
      return;
    }

    const totalTimerMs = Math.max(turnTimerTotalSeconds * 1000, 1);

    if (warningState.deadline !== activeRoundTimerDeadline) {
      warningState.deadline = activeRoundTimerDeadline;
      warningState.halfShown = turnTimerRemainingMs <= totalTimerMs / 2;
      warningState.quarterShown = turnTimerRemainingMs <= totalTimerMs / 4;
      clearTurnTimerNotice();
      return;
    }

    if (!warningState.quarterShown && turnTimerRemainingMs > 0 && turnTimerRemainingMs <= totalTimerMs / 4) {
      warningState.quarterShown = true;
      showTurnTimerNotice(turnTimerRemainingSeconds);
      return;
    }

    if (!warningState.halfShown && turnTimerRemainingMs > 0 && turnTimerRemainingMs <= totalTimerMs / 2) {
      warningState.halfShown = true;
      showTurnTimerNotice(turnTimerRemainingSeconds);
    }
  }, [activeRoundTimerDeadline, isPlayingRound, turnTimerRemainingMs, turnTimerRemainingSeconds, turnTimerTotalSeconds]);

  useEffect(() => {
    const stageElement = tableStageRef.current;
    const boardElement = cardBoardRef.current;

    if (!isTableStageVisible || !stageElement || !boardElement || desktopSeatPlayers.length === 0) {
      setDesktopSeatLayout([]);
      setDesktopStageTightness(0);
      return undefined;
    }

    let frameId = 0;
    const updateSeatLayout = () => {
      const stageRect = stageElement.getBoundingClientRect();
      const boardRect = boardElement.getBoundingClientRect();

      if (!stageRect.width || !stageRect.height || !boardRect.width || !boardRect.height) {
        return;
      }

      const nextStageTightness = getDesktopStageTightness({
        playerCount: desktopSeatPlayers.length,
        stageRect,
        boardRect
      });

      setDesktopStageTightness(nextStageTightness);

      setDesktopSeatLayout(buildDesktopSeatLayout({
        playerCount: desktopSeatPlayers.length,
        stageRect,
        boardRect,
        stageTightness: nextStageTightness
      }));
    };

    const queueSeatLayoutUpdate = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(updateSeatLayout);
    };

    queueSeatLayoutUpdate();

    const resizeObserver = typeof window.ResizeObserver === 'function'
      ? new window.ResizeObserver(() => {
        queueSeatLayoutUpdate();
      })
      : null;

    resizeObserver?.observe(stageElement);
    resizeObserver?.observe(boardElement);
    window.addEventListener('resize', queueSeatLayoutUpdate);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', queueSeatLayoutUpdate);
      resizeObserver?.disconnect();
    };
  }, [desktopSeatPlayers.length, isTableStageVisible, pageZoom]);

  useLayoutEffect(() => {
    const scrollElement = handSpreadLayoutMode === 'choice'
      ? choiceHandScrollRef.current
      : handScrollRef.current;
    const referenceHandSize = Math.max(startingHandSizeRef.current, startingHandSize);

    if (!isHandSpreadVisible || !scrollElement || referenceHandSize === 0) {
      setHandSpreadMetrics(null);
      return undefined;
    }

    let frameId = 0;
    const updateHandSpread = () => {
      const scrollRect = scrollElement.getBoundingClientRect();
      const parentRect = scrollElement.parentElement?.getBoundingClientRect();
      const measuredWidth = scrollRect.width || scrollElement.clientWidth || parentRect?.width || 0;
      const measuredHeight = scrollRect.height || scrollElement.clientHeight || parentRect?.height || 0;

      if (
        measuredWidth < HAND_CARD_MEASURE_MIN_WIDTH_PX ||
        measuredHeight < HAND_CARD_MEASURE_MIN_HEIGHT_PX ||
        referenceHandSize === 0
      ) {
        return;
      }

      const scrollStyles = window.getComputedStyle(scrollElement);
      const horizontalPadding = Number.parseFloat(scrollStyles.paddingLeft || '0')
        + Number.parseFloat(scrollStyles.paddingRight || '0');
      const verticalPadding = Number.parseFloat(scrollStyles.paddingTop || '0')
        + Number.parseFloat(scrollStyles.paddingBottom || '0');
      const availableWidth = Math.max(0, measuredWidth - horizontalPadding - 10);
      const availableHeight = Math.max(0, measuredHeight - verticalPadding - 4);
      const widthFitDenominator = CARD_ASSET_ASPECT_RATIO * (
        1 + (Math.max(0, referenceHandSize - 1) * HAND_CARD_MAX_ADVANCE_RATIO)
      );
      const maxHeightFromWidth = widthFitDenominator > 0
        ? availableWidth / widthFitDenominator
        : HAND_CARD_MAX_HEIGHT_PX;
      const responsiveMaxCardHeight = Math.min(
        HAND_CARD_MAX_HEIGHT_PX,
        Math.max(HAND_CARD_MIN_HEIGHT_PX, maxHeightFromWidth),
        Math.max(HAND_CARD_MIN_HEIGHT_PX, availableHeight)
      );
      const nextCardHeight = clampNumber(
        availableHeight * HAND_CARD_SIZE_SCALE,
        Math.min(HAND_CARD_MIN_HEIGHT_PX, responsiveMaxCardHeight),
        responsiveMaxCardHeight
      );
      const nextCardWidth = nextCardHeight * CARD_ASSET_ASPECT_RATIO;
      const maxAdvance = nextCardWidth * HAND_CARD_MAX_ADVANCE_RATIO;
      const minAdvance = nextCardWidth * HAND_CARD_MIN_ADVANCE_RATIO;
      const fittingAdvance = referenceHandSize > 1
        ? (availableWidth - nextCardWidth) / (referenceHandSize - 1)
        : nextCardWidth;
      const nextCardAdvance = referenceHandSize > 1
        ? clampNumber(fittingAdvance, minAdvance, maxAdvance)
        : nextCardWidth;
      const nextSpreadWidth = nextCardWidth + (Math.max(0, referenceHandSize - 1) * nextCardAdvance);

      setHandSpreadMetrics((current) => {
        if (
          current &&
          Math.abs(current.cardHeight - nextCardHeight) < 0.5 &&
          Math.abs(current.cardWidth - nextCardWidth) < 0.5 &&
          Math.abs(current.cardAdvance - nextCardAdvance) < 0.5 &&
          Math.abs(current.spreadWidth - nextSpreadWidth) < 0.5
        ) {
          return current;
        }

        return {
          cardHeight: nextCardHeight,
          cardWidth: nextCardWidth,
          cardAdvance: nextCardAdvance,
          spreadWidth: nextSpreadWidth
        };
      });
    };

    const queueHandSpreadUpdate = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(updateHandSpread);
    };

    queueHandSpreadUpdate();

    const resizeObserver = typeof window.ResizeObserver === 'function'
      ? new window.ResizeObserver(() => {
        queueHandSpreadUpdate();
      })
      : null;

    resizeObserver?.observe(scrollElement);
    if (scrollElement.parentElement) {
      resizeObserver?.observe(scrollElement.parentElement);
    }
    window.addEventListener('resize', queueHandSpreadUpdate);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', queueHandSpreadUpdate);
      resizeObserver?.disconnect();
    };
  }, [hand.length, handSpreadLayoutMode, isHandSpreadVisible, pageZoom, startingHandSize]);

  const isCompactGameHeader = activeTab === 'play' && inLobby && gameStarted;

  const renderChatMessageEntry = (message, { compact = false } = {}) => {
    const isOwnMessage = Boolean(message.sender?.userId && message.sender.userId === activeProfile?.userId);
    const avatarSizeClass = compact ? 'h-9 w-9 text-[10px]' : 'h-10 w-10 text-xs';
    const bubbleToneClass = isOwnMessage
      ? 'border-sky-200/80 bg-[linear-gradient(180deg,rgba(236,248,255,0.99)_0%,rgba(205,227,245,0.96)_100%)] shadow-[0_14px_28px_rgba(56,112,156,0.14)]'
      : 'border-[var(--glass-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(238,245,250,0.94)_100%)] shadow-[0_14px_28px_rgba(15,23,42,0.1)]';
    const bubbleTailClass = isOwnMessage
      ? 'right-[-0.35rem] border-r border-b border-sky-200/80'
      : 'left-[-0.35rem] border-l border-b border-[var(--glass-border)]';
    const bubbleTransformClass = isOwnMessage ? 'rotate-[20deg]' : '-rotate-[20deg]';

    return (
      <div key={message.id} className={clsx('flex w-full', isOwnMessage ? 'justify-end' : 'justify-start')}>
        <div className={clsx('flex max-w-[95%] items-end gap-2.5 sm:max-w-[85%]', isOwnMessage ? 'flex-row-reverse' : 'flex-row')}>
          <button
            type="button"
            onClick={() => void openPlayerProfileModal(message.sender)}
            className="shrink-0 text-left"
            title={`View ${getPlayerName(message.sender)}'s profile`}
          >
            <AvatarFace
              player={message.sender}
              alt={`${getPlayerName(message.sender)} avatar`}
              wrapperClassName={clsx('seat-avatar shrink-0 shadow-[0_10px_22px_rgba(15,23,42,0.12)]', avatarSizeClass)}
              imageClassName="h-full w-full rounded-full object-cover"
              fallbackClassName="flex h-full w-full items-center justify-center rounded-full"
            />
          </button>

          <div
            className={clsx(
              'relative min-w-0 flex-1 rounded-[1.35rem] border px-3.5 py-3',
              compact ? 'px-3 py-2.5' : 'px-3.5 py-3',
              bubbleToneClass
            )}
          >
            <span
              aria-hidden="true"
              className={clsx(
                'pointer-events-none absolute bottom-3 h-3 w-3 rounded-[0.2rem] bg-inherit',
                bubbleTailClass,
                bubbleTransformClass
              )}
            />

            <div className={clsx('flex items-center', isOwnMessage ? 'justify-end' : 'justify-start')}>
              <button
                type="button"
                onClick={() => void openPlayerProfileModal(message.sender)}
                className={clsx(
                  'truncate text-sm font-black text-[var(--text-primary)] transition hover:opacity-80',
                  isOwnMessage ? 'text-right' : 'text-left'
                )}
              >
                {getPlayerName(message.sender)}
              </button>
            </div>
            <div className={clsx(
              'mt-1.5 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-[var(--text-primary)]',
              isOwnMessage && 'text-right'
            )}
            >
              {message.content}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderChatComposer = (scope, { compact = false } = {}) => {
    const isBusy = chatBusyScope === scope;
    const isMuted = Boolean(activeProfile?.userId && mutedChatUserIds.includes(activeProfile.userId));
    const isDisabled = !scope || !inLobby || !activeProfile || isBusy || isMuted;
    const placeholder = isMuted
      ? 'Chat muted by host'
      : scope === 'game'
        ? 'Talk to the table...'
        : 'Talk to the room...';

    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSendChatMessage(scope);
        }}
        className={clsx(
          'border-t border-[var(--glass-border)]',
          compact ? 'p-3' : 'p-3.5'
        )}
      >
        <div className={clsx('flex items-center gap-2 rounded-[1.1rem] border border-[var(--glass-border)] bg-[var(--surface-input)] px-3 py-2 shadow-[inset_0_1px_3px_rgba(255,255,255,0.4)]', compact && 'px-3 py-2.5')}>
          <input
            value={chatDrafts[scope] || ''}
            onChange={(event) => updateChatDraft(scope, event.target.value)}
            disabled={isMuted}
            maxLength={CHAT_MESSAGE_MAX_LENGTH}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)]"
          />
          <button
            type="submit"
            disabled={isDisabled}
            className="inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] p-2.5 text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            title={isBusy ? 'Sending...' : 'Send message'}
          >
            <SendHorizontal className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
          <span>{isMuted ? 'Chat muted in this room' : scope === 'game' ? 'Game-scoped live chat' : 'Room-scoped live chat'}</span>
          <span>{(chatDrafts[scope] || '').length}/{CHAT_MESSAGE_MAX_LENGTH}</span>
        </div>
      </form>
    );
  };

  const renderMobileChatPanel = (scope) => {
    const messages = scope === 'game' ? gameChatMessages : roomChatMessages;
    const listRef = scope === 'game' ? gameChatListRef : roomChatListRef;
    const title = scope === 'game' ? 'Chat' : 'Room Chat';

    return (
      <section className="rentz-log-panel rentz-chat-panel-mobile lg:hidden">
        <ChromePanelHeader title={title} />
        <div className="flex min-h-0 flex-1 flex-col">
          <div ref={listRef} className="rentz-log-list">
            {messages.length === 0 ? (
              <div className="rentz-log-entry is-empty">
                {scope === 'game'
                  ? 'Game messages will appear here for everyone at the table.'
                  : 'Room messages will appear here for everyone in the lobby.'}
              </div>
            ) : (
              messages.map((message) => renderChatMessageEntry(message, { compact: true }))
            )}
          </div>
          {renderChatComposer(scope, { compact: true })}
        </div>
      </section>
    );
  };

  const renderDesktopChatWindow = () => {
    if (activeTab !== 'play' || !inLobby || !activeChatScope) {
      return null;
    }

    return (
      <div className="pointer-events-none fixed bottom-6 right-6 z-[44] hidden lg:flex">
        <div className="pointer-events-auto flex flex-col items-end">
          {isDesktopChatOpen ? (
            <section className="mb-3 flex h-[28rem] w-[22rem] flex-col overflow-hidden rounded-[1.7rem] border border-[var(--glass-border)] bg-[var(--glass-bg)] shadow-[0_26px_64px_rgba(15,23,42,0.24)] backdrop-blur-2xl">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--glass-border)] bg-[var(--surface-soft)] px-4 py-3">
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                    {activeChatScope === 'game' ? 'Active match' : 'Current room'}
                  </div>
                  <div className="mt-1 text-base font-black text-[var(--text-primary)]">{activeChatTitle}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDesktopChatOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
                  title="Collapse chat"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div ref={desktopChatListRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
                {activeChatMessages.length === 0 ? (
                  <div className="rounded-[1.2rem] border border-dashed border-[var(--glass-border)] bg-[var(--surface-soft)] px-4 py-3 text-sm font-semibold leading-7 text-[var(--text-secondary)]">
                    {activeChatScope === 'game'
                      ? 'No one has chatted in this game yet.'
                      : 'No one has chatted in this room yet.'}
                  </div>
                ) : (
                  activeChatMessages.map((message) => renderChatMessageEntry(message))
                )}
              </div>

              {renderChatComposer(activeChatScope)}
            </section>
          ) : null}

          <button
            type="button"
            onClick={() => {
              setIsDesktopChatOpen((current) => !current);
              setDesktopChatUnread(0);
            }}
            className="inline-flex items-center gap-3 rounded-full border border-white/75 px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-[var(--nav-active-text)] shadow-[0_18px_40px_rgba(15,23,42,0.24)] transition hover:-translate-y-0.5 hover:brightness-105"
            style={{ background: 'var(--nav-active-bg)' }}
          >
            <MessageCircle className="h-4 w-4" />
            {activeChatTitle}
            {desktopChatUnread > 0 && (
              <span className="inline-flex min-w-[1.55rem] items-center justify-center rounded-full bg-white/90 px-2 py-1 text-[10px] font-black tracking-[0.08em] text-[#153247]">
                {desktopChatUnread > 99 ? '99+' : desktopChatUnread}
              </span>
            )}
          </button>
        </div>
      </div>
    );
  };

  const renderLobbyView = () => (
    <div className="relative z-10 flex w-full max-w-[90rem] min-h-0 flex-1 flex-col gap-5 overflow-x-hidden">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-2xl font-display font-extrabold text-[var(--text-primary)] sm:text-3xl">
            {roomName || 'Room'}
          </h3>
          {isTrainingMatch ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-100/85 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-950">
              <Sparkles className="h-3.5 w-3.5" />
              Training
            </div>
          ) : null}
          <div className="flex items-center gap-2 rounded-[1.35rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] px-3 py-2 shadow-sm">
            <span className="text-base font-black tracking-[0.22em] text-[var(--text-secondary)] sm:text-lg sm:tracking-[0.26em]">
              {roomId}
            </span>
            <button
              type="button"
              onClick={handleCopyRoomCode}
              className="rounded-full border border-[var(--glass-border)] bg-[var(--surface-hover)] p-2 text-[var(--text-primary)] transition hover:-translate-y-0.5 hover:bg-[var(--surface-solid)]"
              title="Copy room code"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isTrainingMatch ? (
            <div className="status-pill bg-emerald-100/85 px-4 py-2 text-emerald-950">
              Training
            </div>
          ) : null}
          <div className="status-pill px-4 py-2">
            {roomVisibility === 'public' ? 'Public' : 'Private'}
          </div>
          <div className="status-pill px-4 py-2">
            {players.length}/{MAX_ACTIVE_PLAYERS} active
          </div>
          <div className="status-pill px-4 py-2">
            {spectators.length} spectator{spectators.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(17.5rem,19.75rem)]">
        <div className="space-y-5 lg:grid lg:min-h-0 lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)] lg:space-y-0">
          <section className="lg:flex lg:min-h-0 lg:flex-col">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-xl font-display font-black text-[var(--text-primary)] sm:text-2xl">Active Players</h4>
                <p className="text-sm font-semibold text-[var(--text-secondary)]">
                  Only these players receive cards and take turns in the match.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="status-pill px-4 py-2">
                  {players.length}/{MAX_ACTIVE_PLAYERS} seats used
                </div>
                {amIHost && !gameStarted && players.length < MAX_ACTIVE_PLAYERS ? (
                  <button
                    type="button"
                    onClick={() => void handleAddBotToLobby()}
                    className="inline-flex items-center gap-2 rounded-[1.1rem] border border-sky-200/80 bg-sky-100/85 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-sky-900 transition hover:bg-sky-200/80"
                  >
                    <Bot className="h-4 w-4" />
                    Add Bot
                  </button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
              {players.length > 0 ? (
                players.map((player, index) => {
                  const isHostPlayer = player.userId === lobbyHostId;

                  return (
                    <div key={`${player.socketId}-${index}`} className="glass-panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                      {renderPlayerActionTrigger(player, {
                        className: 'flex min-w-0 items-center gap-4 text-left',
                        children: (
                          <>
                            <AvatarFace
                              player={player}
                              alt={`${getPlayerName(player)} avatar`}
                              wrapperClassName="seat-avatar h-12 w-12 text-sm"
                              imageClassName="h-full w-full rounded-full object-cover"
                              fallbackClassName="flex h-full w-full items-center justify-center rounded-full"
                            />
                            <div className="min-w-0">
                              <PlayerNameLabel
                                player={player}
                                isLocal={player.socketId === socket.id}
                                className="text-lg font-black text-[var(--text-primary)] sm:text-xl"
                              />
                              <div className="text-xs font-extrabold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                                {isHostPlayer ? 'Host Player' : 'Player'}
                              </div>
                            </div>
                          </>
                        )
                      })}
                      <div className="flex flex-wrap items-center gap-2">
                        {player.isBot && amIHost && !gameStarted ? (
                          <button
                            type="button"
                            onClick={() => void handleRemoveBotFromLobby(player.userId)}
                            className="inline-flex items-center gap-2 rounded-[1.1rem] border border-rose-200/80 bg-rose-100/85 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-rose-900 transition hover:bg-rose-200/85"
                          >
                            <Trash2 className="h-4 w-4" />
                            Remove Bot
                          </button>
                        ) : null}
                        <div className={clsx('status-pill px-4 py-2', player.isReady && 'bg-emerald-200/80 text-emerald-900')}>
                          {player.isBot ? (
                            <span className="flex items-center gap-2">
                              <Bot className="h-4 w-4" />
                              AI Ready
                            </span>
                          ) : player.isReady ? (
                            <span className="flex items-center gap-2">
                              <Check className="h-4 w-4" />
                              Ready
                            </span>
                          ) : (
                            'Waiting'
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="glass-panel px-4 py-5 text-sm font-semibold text-[var(--text-secondary)] sm:px-5">
                  No active players yet.
                </div>
              )}
            </div>
          </section>

          <section className="lg:flex lg:min-h-0 lg:flex-col">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-xl font-display font-black text-[var(--text-primary)] sm:text-2xl">Spectators</h4>
                <p className="text-sm font-semibold text-[var(--text-secondary)]">
                  Spectators watch the table without joining gameplay.
                </p>
              </div>
              <div className="status-pill px-4 py-2">
                {spectators.length} watching
              </div>
            </div>

            <div className="grid gap-4 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
              {spectators.length > 0 ? (
                spectators.map((spectator, index) => {
                  const isHostSpectator = spectator.userId === lobbyHostId;

                  return (
                    <div key={`${spectator.socketId}-${index}`} className="glass-panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                      {renderPlayerActionTrigger(spectator, {
                        className: 'flex min-w-0 items-center gap-4 text-left',
                        children: (
                          <>
                            <AvatarFace
                              player={spectator}
                              alt={`${getPlayerName(spectator)} avatar`}
                              wrapperClassName="seat-avatar h-12 w-12 text-sm"
                              imageClassName="h-full w-full rounded-full object-cover"
                              fallbackClassName="flex h-full w-full items-center justify-center rounded-full"
                            />
                            <div className="min-w-0">
                              <PlayerNameLabel
                                player={spectator}
                                isLocal={spectator.socketId === socket.id}
                                className="text-lg font-black text-[var(--text-primary)] sm:text-xl"
                              />
                              <div className="text-xs font-extrabold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                                {isHostSpectator ? 'Host Spectator' : 'Spectator'}
                              </div>
                            </div>
                          </>
                        )
                      })}
                      <div className="status-pill bg-sky-100/85 px-4 py-2 text-sky-900">
                        Spectating
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="glass-panel px-4 py-5 text-sm font-semibold text-[var(--text-secondary)] sm:px-5">
                  No one is spectating right now.
                </div>
              )}
            </div>
          </section>
        </div>

        {renderMobileChatPanel('lobby')}

        <div className="glass-panel h-fit p-4 sm:p-5 lg:sticky lg:top-0 lg:self-start">
          <div className="mb-3.5">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--text-secondary)]">
              Your lobby role
            </div>
            <div className="mt-1.5 text-[1.65rem] font-black text-[var(--text-primary)] sm:text-[1.85rem]">
              {amISpectator ? 'Spectator' : 'Active Player'}
            </div>
            <p className="mt-1.5 text-[0.92rem] font-semibold leading-5 text-[var(--text-secondary)]">
              {amISpectator
                ? (areActiveSeatsFull
                  ? `All ${MAX_ACTIVE_PLAYERS} player seats are currently taken.`
                  : `There ${activeSeatsRemaining === 1 ? 'is' : 'are'} ${activeSeatsRemaining} open player seat${activeSeatsRemaining === 1 ? '' : 's'} right now.`)
                : 'Ready up when you want to be included in the next match.'}
            </p>
          </div>

          <div className="mb-3.5 rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-subtle)] p-3.5">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--text-secondary)]">
              Room rules
            </div>
            <div className="mt-1.5 text-[0.95rem] font-black leading-6 text-[var(--text-primary)]">
              {selectedRoomRuleLabels.length > 0 ? selectedRoomRuleLabels.join(', ') : 'No rules selected'}
            </div>
            <p className="mt-1.5 text-[0.88rem] font-semibold leading-5 text-[var(--text-secondary)]">
              {amIHost
                ? 'You can change these before the match starts.'
                : 'Only the host can change the room rule selection.'}
            </p>
            {amIHost && !gameStarted && (
              <button
                type="button"
                onClick={handleOpenRoomSettings}
                className="mt-2.5 inline-flex items-center gap-2 rounded-[1.05rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] px-3.5 py-2.5 text-[0.82rem] font-black uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
              >
                <Settings className="h-4 w-4" />
                Room Settings
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2.5">
            {!amISpectator ? (
              <>
                <button
                  onClick={toggleReady}
                  className={clsx(
                    'rounded-[1.45rem] px-5 py-3.5 text-[0.95rem] font-black uppercase tracking-[0.16em] transition-[transform,background-color,color,box-shadow] duration-300 sm:px-6 sm:text-base sm:tracking-[0.18em]',
                    amIReady ? 'ready-button-active' : 'ready-button'
                  )}
                >
                  {amIReady ? 'Ready to Deal' : 'Ready Up'}
                </button>
                <button
                  onClick={() => setLobbyRole('spectator')}
                  className="rounded-[1.45rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] px-5 py-3.5 text-[0.95rem] font-black uppercase tracking-[0.16em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)] sm:px-6 sm:text-base sm:tracking-[0.18em]"
                >
                  Become Spectator
                </button>
              </>
            ) : (
              <button
                onClick={() => setLobbyRole('player')}
                disabled={areActiveSeatsFull}
                className={clsx(
                  'rounded-[1.45rem] px-5 py-3.5 text-[0.95rem] font-black uppercase tracking-[0.16em] transition-[transform,background-color,color,box-shadow] duration-300 sm:px-6 sm:text-base sm:tracking-[0.18em]',
                  areActiveSeatsFull
                    ? 'cursor-not-allowed border border-[var(--glass-border)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] opacity-70'
                    : 'ready-button'
                )}
              >
                {areActiveSeatsFull ? 'Player Seats Full' : 'Join Player Seats'}
              </button>
            )}

            {amIHost && (
              <button
                onClick={startGame}
                className="inline-flex items-center justify-center gap-3 rounded-[1.45rem] border border-emerald-100/90 bg-[linear-gradient(180deg,rgba(241,255,235,0.98)_0%,rgba(168,245,132,0.96)_52%,rgba(34,112,58,0.98)_100%)] px-5 py-3.5 text-[0.95rem] font-black uppercase tracking-[0.18em] text-emerald-950 shadow-[inset_0_2px_4px_rgba(255,255,255,0.94),0_18px_36px_rgba(52,148,73,0.32)] transition hover:-translate-y-0.5 hover:brightness-[1.04] sm:px-6 sm:text-base"
              >
                <Crown className="h-5 w-5" />
                Start Match
              </button>
            )}

            <button
              type="button"
              onClick={handleLeaveRoom}
              className="inline-flex items-center justify-center gap-2 rounded-[1.45rem] border border-red-200/75 bg-[linear-gradient(180deg,rgba(255,243,243,0.97)_0%,rgba(254,205,211,0.9)_100%)] px-5 py-3.5 text-[0.95rem] font-black uppercase tracking-[0.16em] text-red-950 transition hover:-translate-y-0.5 hover:brightness-[1.02] sm:px-6 sm:text-base sm:tracking-[0.18em]"
            >
              <LogOut className="h-4 w-4" />
              {gameStarted ? (isSpectatingGame ? 'Leave Spectating' : 'Abandon Match') : 'Leave Room'}
            </button>

            {gameFinished && (
              <button onClick={() => setPlayView('stats')} className="rounded-[1.45rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] px-5 py-3.5 text-[0.95rem] font-black uppercase tracking-[0.16em] transition hover:bg-[var(--surface-hover)] sm:px-6 sm:text-base sm:tracking-[0.18em]">
                View Last Game Stats
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderMatchmaking = () => (
    <div className="relative z-10 m-auto w-full max-w-3xl space-y-6">
      {!isAuthenticated && guestProfile && (
        <div className="glass-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--text-secondary)]">
              Guest profile
            </div>
            <div className="mt-1 text-2xl font-black text-[var(--text-primary)]">
              {guestProfile.name}
            </div>
          </div>
          <button
            onClick={handleGuestReset}
            className="rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
          >
            Change Guest Name
          </button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="glass-panel p-5 sm:p-8">
          <h3 className="mb-3 text-2xl font-display font-black text-[var(--text-primary)] sm:text-3xl">Host Table</h3>
          <p className="mb-6 text-base font-semibold text-[var(--text-secondary)] sm:text-sm">
            Create a named room. Public rooms appear in the browser; private rooms still work by code.
          </p>
          <div className="mb-4 grid gap-3">
            <input
              value={newRoomName}
              onChange={(event) => setNewRoomName(event.target.value)}
              placeholder={activeProfile ? `${getPlayerName(activeProfile)}'s Room` : 'Room name'}
              className="w-full rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-input)] px-5 py-4 font-black text-[var(--text-primary)] shadow-inner placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-4 focus:ring-[var(--accent-glow)]"
            />
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'public', label: 'Public', icon: Globe2 },
                { id: 'private', label: 'Private', icon: Lock }
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setNewRoomVisibility(option.id)}
                  className={clsx(
                    'flex items-center justify-center gap-2 rounded-[1.2rem] border px-4 py-3 text-sm font-black uppercase tracking-[0.14em] transition',
                    newRoomVisibility === option.id
                      ? 'border-white/80 bg-[var(--surface-solid)] text-[var(--text-primary)] shadow-md'
                      : 'border-[var(--glass-border)] bg-[var(--surface-medium)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                  )}
                >
                  <option.icon className="h-4 w-4" />
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <button onClick={handleCreateLobby} className="frutiger-button w-full py-4 text-base sm:text-lg">
            Create Room
          </button>
        </div>
        <div className="glass-panel p-5 sm:p-8">
          <h3 className="mb-3 text-2xl font-display font-black text-[var(--text-primary)] sm:text-3xl">Join Room</h3>
          <p className="mb-6 text-base font-semibold text-[var(--text-secondary)] sm:text-sm">
            Paste a private room code or browse currently open public rooms.
          </p>
          <div className="flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              value={joinInput}
              onChange={(event) => setJoinInput(event.target.value)}
              autoCapitalize="characters"
              placeholder="Room code"
              spellCheck={false}
              className="min-w-0 rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-input)] px-5 py-4 font-mono text-[0.95rem] font-black uppercase tracking-[0.06em] text-[var(--text-primary)] shadow-inner placeholder:font-sans placeholder:text-[0.9rem] placeholder:font-bold placeholder:normal-case placeholder:tracking-normal focus:outline-none focus:ring-4 focus:ring-[var(--accent-glow)] sm:text-[1rem] sm:tracking-[0.12em]"
            />
            <button onClick={handleJoinLobby} className="frutiger-button w-full px-6 py-4 text-base sm:min-w-[9rem] sm:px-8 sm:text-lg">
              Join
            </button>
          </div>
          <button
            type="button"
            onClick={openPublicRoomBrowser}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] px-5 py-4 text-sm font-black uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
          >
            <Users className="h-4 w-4" />
            Browse public rooms
          </button>
        </div>
      </div>

      <div className="glass-panel overflow-hidden p-5 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-100/85 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-950">
              <Sparkles className="h-3.5 w-3.5" />
              Training
            </div>
            <h3 className="mt-3 text-2xl font-display font-black text-[var(--text-primary)] sm:text-3xl">Play with Trainer</h3>
            <p className="mt-3 max-w-2xl text-base font-semibold leading-7 text-[var(--text-secondary)] sm:text-sm">
              Launch an unranked coaching match with one Trainer bot, adjustable Trainer ELO, optional move commentary, your chosen ruleset, and extra filler bots when you want a fuller table.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
              <span className="rounded-full border border-[var(--glass-border)] bg-[var(--surface-soft)] px-3 py-2">Unranked</span>
              <span className="rounded-full border border-[var(--glass-border)] bg-[var(--surface-soft)] px-3 py-2">Default + saved rulesets</span>
              <span className="rounded-full border border-[var(--glass-border)] bg-[var(--surface-soft)] px-3 py-2">2 to 6 players</span>
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[16rem]">
            <button
              type="button"
              onClick={handleOpenTrainingSetup}
              className="inline-flex items-center justify-center gap-3 rounded-[1.45rem] border border-emerald-100/90 bg-[linear-gradient(180deg,rgba(245,255,240,0.98)_0%,rgba(181,245,138,0.96)_48%,rgba(46,124,69,0.98)_100%)] px-6 py-4 text-sm font-black uppercase tracking-[0.16em] text-emerald-950 shadow-[inset_0_2px_4px_rgba(255,255,255,0.92),0_18px_36px_rgba(52,148,73,0.28)] transition hover:-translate-y-0.5 hover:brightness-[1.03] sm:text-base"
            >
              <Bot className="h-5 w-5" />
              Open Training Setup
            </button>
            <div className="rounded-[1.2rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] px-4 py-3 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
              {isAuthenticated
                ? 'Your saved library rulesets appear alongside the default training rules.'
                : 'Guest training uses the default rulesets and starts Trainer ELO at 500.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderPublicRoomsView = () => (
    <div className="relative z-10 m-auto w-full max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-2xl font-display font-black text-[var(--text-primary)] sm:text-3xl">Public Rooms</h3>
          <p className="mt-2 text-sm font-semibold text-[var(--text-secondary)]">
            Join one open room at a time. Private rooms still require their code.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={refreshPublicRooms}
            className="inline-flex items-center gap-2 rounded-[1.2rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setIsPublicBrowserOpen(false)}
            className="rounded-[1.2rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
          >
            Back
          </button>
        </div>
      </div>

      {inLobby && (
        <div className="glass-panel p-4 text-sm font-bold text-[var(--text-secondary)]">
          You are already in room {roomId}. Leave it before joining another public room.
        </div>
      )}

      {publicRoomsLoading ? (
        <div className="glass-panel p-6 text-center text-sm font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">
          Loading rooms...
        </div>
      ) : publicRooms.length === 0 ? (
        <div className="glass-panel p-6 text-center text-sm font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">
          No public rooms are available right now.
        </div>
      ) : (
        <div className="space-y-6">
          {publicRooms.filter((room) => room.hasFriend).length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-xl font-display font-black text-[var(--text-primary)] sm:text-2xl">Friends at Tables</h4>
                  <p className="text-sm font-semibold text-[var(--text-secondary)]">
                    These public rooms already have someone from your friends list inside.
                  </p>
                </div>
                <div className="status-pill px-4 py-2">
                  {publicRooms.filter((room) => room.hasFriend).length} room{publicRooms.filter((room) => room.hasFriend).length === 1 ? '' : 's'}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {publicRooms.filter((room) => room.hasFriend).map((room) => (
                  <article key={room.roomId} className="glass-panel p-5">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-xl font-black text-[var(--text-primary)]">{room.roomName}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                          <span>{room.playerCount}/{room.maxPlayers} players</span>
                          {room.isInGame && <span className="rounded-full bg-amber-200/85 px-2 py-1 text-amber-900">In game</span>}
                          <span className="rounded-full bg-emerald-200/80 px-2 py-1 text-emerald-900">Friend here</span>
                        </div>
                      </div>
                      <div className="status-pill px-3 py-2">{room.roomId}</div>
                    </div>

                    <div className="mb-4 flex flex-wrap gap-2">
                        {(room.avatars || []).map((avatar, index) => (
                          renderPlayerActionTrigger(avatar, {
                          elementKey: `${room.roomId}-${avatar.userId || index}`,
                          className: 'seat-avatar h-10 w-10 border-2 border-white text-xs',
                          title: `Open actions for ${getPlayerName(avatar)}`,
                          children: avatar.avatarUrl ? (
                            <img src={avatar.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
                          ) : (
                            getPlayerInitials(avatar)
                          )
                        })
                      ))}
                    </div>

                    {room.friendsInRoom?.length > 0 && (
                      <div className="mb-4 rounded-[1.25rem] border border-emerald-200/70 bg-emerald-50/80 p-3">
                        <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-emerald-800">
                          Friends in this room
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {room.friendsInRoom.map((friend) => (
                            renderPlayerActionTrigger(friend, {
                              elementKey: `${room.roomId}-friend-${friend.userId}`,
                              className: 'rounded-full border border-emerald-200 bg-white/85 px-3 py-2 text-xs font-black text-emerald-950',
                              children: <span>{getPlayerName(friend)}</span>
                            })
                          ))}
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={inLobby || gameStarted}
                      onClick={() => {
                        if (room.isInGame) {
                          setPendingSpectatorJoin({
                            roomId: room.roomId,
                            roomName: room.roomName
                          });
                          return;
                        }

                        joinPublicRoom(room.roomId);
                      }}
                      className={clsx(
                        'w-full rounded-[1.3rem] px-5 py-3 text-sm font-black uppercase tracking-[0.14em] transition',
                        inLobby || gameStarted
                          ? 'cursor-not-allowed border border-[var(--glass-border)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] opacity-70'
                          : 'frutiger-button'
                      )}
                    >
                      {inLobby || gameStarted ? 'Already in a room' : room.isInGame ? 'Spectate active room' : 'Join public room'}
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-xl font-display font-black text-[var(--text-primary)] sm:text-2xl">
                  {publicRooms.some((room) => room.hasFriend) ? 'Other Public Rooms' : 'All Public Rooms'}
                </h4>
                <p className="text-sm font-semibold text-[var(--text-secondary)]">
                  Public tables stay available below even when none of your friends are inside.
                </p>
              </div>
              <div className="status-pill px-4 py-2">
                {publicRooms.filter((room) => !room.hasFriend).length} room{publicRooms.filter((room) => !room.hasFriend).length === 1 ? '' : 's'}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {publicRooms.filter((room) => !room.hasFriend).map((room) => (
            <article key={room.roomId} className="glass-panel p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-xl font-black text-[var(--text-primary)]">{room.roomName}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                    <span>{room.playerCount}/{room.maxPlayers} players</span>
                    {room.isInGame && <span className="rounded-full bg-amber-200/85 px-2 py-1 text-amber-900">In game</span>}
                  </div>
                </div>
                <div className="status-pill px-3 py-2">{room.roomId}</div>
              </div>
              <div className="mb-4 flex -space-x-2">
                {(room.avatars || []).map((avatar, index) => (
                  renderPlayerActionTrigger(avatar, {
                    elementKey: `${room.roomId}-${avatar.userId || index}`,
                    className: 'seat-avatar h-10 w-10 border-2 border-white text-xs',
                    title: `Open actions for ${getPlayerName(avatar)}`,
                    children: avatar.avatarUrl ? (
                      <img src={avatar.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
                    ) : (
                      getPlayerInitials(avatar)
                    )
                  })
                ))}
              </div>
              <button
                type="button"
                disabled={inLobby || gameStarted}
                onClick={() => {
                  if (room.isInGame) {
                    setPendingSpectatorJoin({
                      roomId: room.roomId,
                      roomName: room.roomName
                    });
                    return;
                  }

                  joinPublicRoom(room.roomId);
                }}
                className={clsx(
                  'w-full rounded-[1.3rem] px-5 py-3 text-sm font-black uppercase tracking-[0.14em] transition',
                  inLobby || gameStarted
                    ? 'cursor-not-allowed border border-[var(--glass-border)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] opacity-70'
                    : 'frutiger-button'
                )}
              >
                {inLobby || gameStarted ? 'Already in a room' : room.isInGame ? 'Spectate active room' : 'Join public room'}
              </button>
            </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );

  const renderGameTable = () => {
    if (gameFinished && playView === 'stats') {
      return (
        <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-4">
          <section className="glass-panel p-4 sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Trophy className="h-5 w-5 text-[var(--text-secondary)]" />
                <div>
                  <h4 className="text-xl font-display font-black text-[var(--text-primary)] sm:text-2xl">Game Finished</h4>
                  <p className="text-sm font-semibold text-[var(--text-secondary)]">
                    Final standings for room {roomId}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPlayView('table')}
                className="rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] transition hover:bg-[var(--surface-hover)]"
              >
                Back to Lobby
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {finalStandings.map((standing, index) => (
                <div
                  key={standing.userId}
                  className={clsx(
                    'rounded-[1.5rem] border px-4 py-4 text-sm font-bold',
                    index === 0
                      ? 'border-lime-200/80 bg-lime-100/20 text-[var(--text-primary)]'
                      : 'border-[var(--glass-border)] bg-[var(--surface-subtle)] text-[var(--text-primary)]'
                  )}
                >
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.18em]">
                    {index === 0 ? 'Winner' : `Place ${index + 1}`}
                  </div>
                  <div className="mt-1 text-lg font-black">{standing.name}</div>
                  <div className="mt-2 text-sm text-[var(--text-secondary)]">{standing.tricksWon} hands collected</div>
                  <div className="mt-1 text-sm text-[var(--text-secondary)]">{standing.cardsLeft} cards left</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      );
    }

    if (isRoundSetupPhase) {
      const setupPlayerName = getPlayerName(currentChooser);
      const setupLabel = isChoosingNv
        ? `${setupPlayerName} is choosing NV.`
        : isChoosingRuleset
          ? `${setupPlayerName} is choosing a game.`
          : 'Preparing the round.';

      return (
        <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center">
          <section className="glass-panel max-w-md p-5 text-center sm:p-6" aria-live="polite">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--text-secondary)]">
              Round setup
            </div>
            <h3 className="mt-2 text-2xl font-display font-black text-[var(--text-primary)]">
              {setupLabel}
            </h3>
          </section>
        </div>
      );
    }

    if (playView === 'collected') {
      return (
        <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-4">
          <section className="glass-panel p-4 sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-xl font-display font-black text-[var(--text-primary)] sm:text-2xl">Taken Hands</h4>
                <p className="text-sm font-semibold text-[var(--text-secondary)]">
                  This is the existing taken-hands view, remapped from the new table action area.
                </p>
              </div>
              <button
                onClick={() => setPlayView('table')}
                className="frutiger-button px-5 py-3 text-sm font-black uppercase tracking-[0.16em]"
              >
                Back to table
              </button>
            </div>

            <CollectedHandsView
              players={players}
              collectedHandsByPlayer={collectedHandsByPlayer}
              myPlayerId={myPlayerId}
            />
          </section>
        </div>
      );
    }

    return (
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <section
          className="rentz-game-frame flex-1 min-h-0"
          style={{ '--rentz-stage-tightness': `${desktopStageTightness}` }}
        >
          <div className="rentz-desktop-main">
            <div className="rentz-desktop-stage">
              <div className="rentz-table-stage table-felt">
              <div ref={tableStageRef} className="rentz-table-main">
              <div className="rentz-current-game-box" title={currentGameLabel}>
                <span className="rentz-marking-label">Current game:</span>
                <span className="rentz-marking-value is-neutral rentz-current-game-value">
                  {activeRulesetDefinition?.code ? (
                    <button
                      type="button"
                      onClick={() => setRulesetPreview(activeRulesetDefinition)}
                      className="rentz-current-game-link"
                      title="Preview active ruleset code"
                    >
                      <span className="rentz-current-game-text rentz-current-game-text-desktop">{currentGameLabel}</span>
                      <span className="rentz-current-game-text rentz-current-game-text-mobile">{`Game: ${currentGameShortLabel}`}</span>
                    </button>
                  ) : (
                    <>
                      <span className="rentz-current-game-text rentz-current-game-text-desktop">{currentGameLabel}</span>
                      <span className="rentz-current-game-text rentz-current-game-text-mobile">{`Game: ${currentGameShortLabel}`}</span>
                    </>
                  )}
                </span>
              </div>
              <div className={clsx('rentz-table-indicator-stack', isTrainingMatch && 'is-training')}>
                <div className="rentz-marking-box">
                  <span className="rentz-marking-label">Marking suit:</span>
                  <span
                    className={clsx(
                      'rentz-marking-value',
                      trickSuit && (trickSuit === 'H' || trickSuit === 'D') ? 'is-red' : 'is-neutral'
                    )}
                  >
                    {formatMarkingSuit(trickSuit)}
                  </span>
                </div>
                {isTrainingMatch ? (
                  <div className="rentz-marking-box rentz-training-mode-box">
                    <span className="rentz-training-mode-label">TRAINING</span>
                    <span className="rentz-training-mode-rank">
                      {trainingState?.trainerRankName || 'Starting-out Rentz Rookie'}
                    </span>
                  </div>
                ) : null}
              </div>

              <div
                ref={spectatorPopoverRef}
                className={clsx('rentz-spectator-box', isSpectatorPopoverOpen && 'is-open')}
              >
                <button
                  type="button"
                  className="rentz-spectator-toggle"
                  onClick={() => setIsSpectatorPopoverOpen((current) => !current)}
                  aria-expanded={isSpectatorPopoverOpen}
                  aria-controls="rentz-spectator-popover"
                  title="View spectators"
                >
                  <span className="rentz-spectator-label">
                    <Users className="h-4 w-4" />
                    Spectators
                  </span>
                  <span className="rentz-marking-value is-neutral">{spectators.length}</span>
                </button>

                {isSpectatorPopoverOpen && (
                  <div id="rentz-spectator-popover" className="rentz-spectator-popover">
                    {spectators.length > 0 ? (
                      spectators.map((spectator, index) => (
                        <button
                          type="button"
                          onClick={(event) => openPlayerActionMenu(event, spectator, 'spectator-popover')}
                          key={spectator.userId || spectator.socketId || index}
                          className="rentz-spectator-entry rentz-spectator-entry-button"
                        >
                          <AvatarFace
                            player={spectator}
                            alt={`${getPlayerName(spectator)} avatar`}
                            wrapperClassName="rentz-spectator-entry-avatar"
                            imageClassName="rentz-spectator-entry-avatar-image"
                            fallbackClassName="rentz-spectator-entry-avatar-fallback"
                          />
                          <div className="rentz-spectator-entry-copy">
                            <PlayerNameLabel
                              player={spectator}
                              isLocal={spectator.socketId === socket.id}
                              className="rentz-spectator-entry-name"
                            />
                            <div className="rentz-spectator-entry-meta">
                              {spectator.userId === lobbyHostId ? 'Host spectating' : 'Watching the table'}
                            </div>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="rentz-spectator-empty">No spectators right now.</div>
                    )}
                  </div>
                )}
              </div>

              <div className="rentz-table-brand">Rentz</div>
              {mobileSpotlightPlayer && (mobileSpotlightReaction || mobileSpotlightChatBubble) ? (
                <MobileReactionSpotlight
                  player={mobileSpotlightPlayer}
                  reaction={mobileSpotlightReaction}
                  chatBubble={mobileSpotlightChatBubble}
                />
              ) : null}

              {isPlayingRound && activeRoundTimerDeadline && (
                <div
                  className={clsx(
                    'rentz-turn-timer-box',
                    turnTimerWarningStage === 'half' && 'is-half',
                    turnTimerWarningStage === 'quarter' && 'is-quarter',
                    turnTimerWarningStage === 'low' && 'is-low',
                    !isMyTurn && 'is-frozen'
                  )}
                  style={{ '--timer-progress-deg': `${turnTimerProgress * 360}deg` }}
                  aria-label={`${turnTimerRemainingSeconds} seconds left for ${nextTurnPlayer ? getPlayerName(nextTurnPlayer) : 'player'} to play`}
                >
                  {isMyTurn && turnTimerNotice && (
                    <div
                      key={turnTimerNotice}
                      className="rentz-turn-timer-note"
                      role="status"
                      aria-live="polite"
                    >
                      <Clock className="rentz-turn-timer-note-icon h-4 w-4" aria-hidden="true" />
                      <span>{turnTimerNotice}</span>
                    </div>
                  )}
                  <div className="rentz-turn-timer-ring" aria-hidden="true">
                    <div className="rentz-turn-timer-face">
                      <span className="rentz-turn-timer-value">{turnTimerRemainingSeconds}</span>
                      <span className="rentz-turn-timer-unit">sec</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="rentz-mobile-hero">
                <div className="rentz-current-player-label">Current player:</div>
                {nextTurnPlayer ? (
                  <RentzSeatCluster
                    player={nextTurnPlayer}
                    seatRole="hero"
                    mobileHero
                    isCurrent
                    isWinner={trickWinnerId === nextTurnPlayer.userId}
                    isLocal={nextTurnPlayer.userId === myPlayerId}
                    showElo={false}
                    showStats={false}
                    cardCount={nextTurnPlayer.userId === myPlayerId ? hand.length : (cardCounts[nextTurnPlayer.userId] || 0)}
                    tricksWon={(collectedHandsByPlayer[nextTurnPlayer.userId] || []).length}
                    points={getPlayerPoints(nextTurnPlayer)}
                    reaction={activeReactions[nextTurnPlayer.userId] || null}
                    chatBubble={activeChatBubbles[nextTurnPlayer.userId] || null}
                    reactionPlacement="left"
                    onEmojiClick={handleEmojiPrompt}
                    onProfileAction={openPlayerActionMenu}
                  />
                ) : null}
              </div>
              {showMobileLocalBubble ? (
                <div className="rentz-mobile-local-bubble">
                  <RentzSeatCluster
                    player={myPlayer}
                    seatRole="hero"
                    isWinner={trickWinnerId === myPlayer.userId}
                    isLocal
                    showElo={false}
                    showStats={false}
                    cardCount={hand.length}
                    tricksWon={(collectedHandsByPlayer[myPlayer.userId] || []).length}
                    points={getPlayerPoints(myPlayer)}
                    reaction={activeReactions[myPlayer.userId] || null}
                    chatBubble={activeChatBubbles[myPlayer.userId] || null}
                    reactionPlacement="left"
                    onEmojiClick={handleEmojiPrompt}
                    onProfileAction={openPlayerActionMenu}
                  />
                </div>
              ) : null}

              <div className="rentz-desktop-seats">
                {desktopSeatPlayers.map((player, index) => {
                  const seatPosition = desktopSeatLayout[index];

                  if (!seatPosition) {
                    return null;
                  }

                  return (
                    <div
                      key={player.userId || player.socketId || index}
                      className={clsx('rentz-seat-slot', player.userId === myPlayerId && 'is-local')}
                      style={{ left: `${seatPosition.x}px`, top: `${seatPosition.y}px` }}
                    >
                      <RentzSeatCluster
                        player={player}
                        seatRole="table"
                        isCurrent={nextTurnPlayer?.userId === player.userId}
                        isWinner={trickWinnerId === player.userId}
                        isLocal={player.userId === myPlayerId}
                        showElo={false}
                        showStats={false}
                        reaction={activeReactions[player.userId] || null}
                        chatBubble={activeChatBubbles[player.userId] || null}
                        reactionPlacement={Math.cos(seatPosition.angle) < -0.34 ? 'right' : 'left'}
                        onEmojiClick={handleEmojiPrompt}
                        onProfileAction={openPlayerActionMenu}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="rentz-board-area">
                <TrickBoard
                  boardRef={cardBoardRef}
                  currentTrick={currentTrick}
                  trickPending={trickPending || Boolean(animatingWinner)}
                  trickWinnerId={trickWinnerId}
                />
              </div>
            </div>
            </div>
            </div>

            <div className="rentz-bottom-strip">
              {renderHandSpread()}

              <div className="rentz-bottom-action-column flex w-full h-full flex-col justify-center items-center gap-2">
                <div className="rentz-bottom-action-row">
                  <button
                    type="button"
                    onClick={() => setPlayView('collected')}
                    className="rentz-verify-button w-full !min-h-0 shrink-0 py-2 sm:py-3 transition-transform hover:-translate-y-0.5"
                  >
                    <span className="inline-flex items-center justify-center gap-1.5 text-[0.85rem] sm:text-[0.95rem]">
                      <Swords className="h-4 w-4" />
                      See Hands
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={!latestRoundStats}
                    onClick={() => latestRoundStats && setIsStatsOpen(true)}
                    className={clsx(
                      'rentz-verify-button w-full !min-h-0 shrink-0 py-2 sm:py-3 transition-transform hover:-translate-y-0.5',
                      !latestRoundStats && 'is-disabled'
                    )}
                    title={latestRoundStats ? 'Open round stats' : 'Stats appear after a round ends'}
                  >
                    <span className="inline-flex items-center justify-center gap-1.5 text-[0.85rem] sm:text-[0.95rem]">
                      <BarChart3 className="h-4 w-4" />
                      Stats
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={handleLeaveRoom}
                    className="rentz-verify-button col-span-full w-full !min-h-0 shrink-0 py-2 sm:py-3 transition-transform hover:-translate-y-0.5"
                  >
                    <span className="inline-flex items-center justify-center gap-1.5 text-[0.85rem] sm:text-[0.95rem]">
                      <LogOut className="h-4 w-4" />
                      {isSpectatingGame ? 'Leave Spectating' : 'Abandon Match'}
                    </span>
                  </button>
                </div>

                <div
                  className="flex w-full shrink-0 items-center justify-between rounded-[1.3rem] border border-[rgba(255,255,255,0.74)] px-3 py-2 sm:px-4 sm:py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),inset_0_-1px_0_rgba(148,163,184,0.16),0_8px_16px_rgba(0,0,0,0.1)]"
                  style={{ background: 'linear-gradient(180deg, rgba(240,245,249,0.96) 0%, rgba(208,219,230,0.92) 100%)' }}
                >
                  <div className="flex flex-col gap-0 pr-2 sm:pr-3">
                    <span className="text-[0.6rem] font-black uppercase tracking-[0.14em] text-[#546775]">Room</span>
                    <span className="text-[0.9rem] sm:text-[1rem] font-black uppercase tracking-[0.12em] text-[#1f4d68] drop-shadow-sm leading-none">{roomId}</span>
                  </div>
                  <div className="h-6 w-px bg-[#94a3b8]/40 mx-1"></div>
                  <div className="flex flex-col items-end gap-0 pl-2 sm:pl-3 min-w-0">
                    <span className="text-[0.65rem] sm:text-[0.7rem] font-bold text-[#5c7080] truncate max-w-[80px] sm:max-w-[100px]">
                      {localTablePlayer ? `${getPlayerName(localTablePlayer)}` : 'You'}
                    </span>
                    <span className="text-[0.65rem] sm:text-[0.7rem] font-black text-[#20303b]">
                      {isSpectatingGame ? 'Spectating' : `${hand.length} cards`}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rentz-desktop-sidebar">
            <div className="rentz-desktop-player-list">
              {playersForMobilePanel.map((player, index) => (
                <DesktopPlayerCard
                  key={player.userId || player.socketId || index}
                  player={player}
                  isCurrent={nextTurnPlayer?.userId === player.userId}
                  isLocal={player.userId === myPlayerId}
                  cardCount={player.userId === myPlayerId ? hand.length : (cardCounts[player.userId] || 0)}
                  tricksWon={(collectedHandsByPlayer[player.userId] || []).length}
                  points={getPlayerPoints(player)}
                  onProfileAction={openPlayerActionMenu}
                />
              ))}
            </div>

            <section className="rentz-log-panel rentz-log-panel-desktop">
              <ChromePanelHeader title="Log" />
              <div className="rentz-log-list">
                {activityFeed.length === 0 ? (
                  <div className="rentz-log-entry is-empty">Hand winners appear here.</div>
                ) : (
                  activityFeed.map((item, index) => (
                    <div key={`${item}-${index}`} className="rentz-log-entry">
                      {item}
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <div className="rentz-mobile-panels">
            <section className="rentz-players-panel">
              <ChromePanelHeader title="Players" />
              <div className="rentz-player-list">
                {playersForMobilePanel.map((player, index) => (
                  <CompactPlayerRow
                    key={player.userId || player.socketId || index}
                    player={player}
                    isCurrent={nextTurnPlayer?.userId === player.userId}
                    isLocal={player.userId === myPlayerId}
                    cardCount={player.userId === myPlayerId ? hand.length : (cardCounts[player.userId] || 0)}
                    tricksWon={(collectedHandsByPlayer[player.userId] || []).length}
                    points={getPlayerPoints(player)}
                    onProfileAction={openPlayerActionMenu}
                  />
                ))}
              </div>
            </section>

            {renderMobileChatPanel('game')}

            <section className="rentz-log-panel rentz-log-panel-mobile">
              <ChromePanelHeader title="Log" />
              <div className="rentz-log-list">
                {activityFeed.length === 0 ? (
                  <div className="rentz-log-entry is-empty">Hand winners appear here.</div>
                ) : (
                  activityFeed.map((item, index) => (
                    <div key={`${item}-${index}`} className="rentz-log-entry">
                      {item}
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </section>
      </div>
    );
  };

  const renderPlayContent = () => {
    let playContent;

    if (authLoading && !activeProfile) {
      playContent = (
        <div className="relative z-10 m-auto flex w-full max-w-md flex-col gap-4 px-1 text-center">
          <h3 className="text-2xl font-display font-black text-[var(--text-primary)] sm:text-3xl">Checking account session</h3>
          <p className="text-base font-semibold text-[var(--text-secondary)] sm:text-sm">
            Restoring your saved account before we decide whether to show guest play.
          </p>
        </div>
      );
    } else if (!activeProfile) {
      playContent = (
        <div className="relative z-10 m-auto flex w-full max-w-md flex-col gap-4 px-1 text-center">
          <h3 className="text-2xl font-display font-black text-[var(--text-primary)] sm:text-3xl">Play as Guest</h3>
          <p className="text-base font-semibold text-[var(--text-secondary)] sm:text-sm">
            Pick a guest display name for this device. Account login lives separately from guest play.
          </p>
          <input
            value={guestNameInput}
            onChange={(event) => setGuestNameInput(event.target.value)}
            placeholder="Enter a guest display name..."
            className="w-full rounded-[1.4rem] border border-[var(--glass-border)] bg-[var(--surface-input)] px-5 py-4 font-black tracking-wide text-[var(--text-primary)] shadow-inner focus:outline-none focus:ring-4 focus:ring-[var(--accent-glow)]"
          />
          <button onClick={handleGuestContinue} className="frutiger-button py-4 text-base sm:text-lg">
            Continue as Guest
          </button>
        </div>
      );
    } else if (!inLobby) {
      playContent = isPublicBrowserOpen ? renderPublicRoomsView() : renderMatchmaking();
    } else if (!gameStarted || (gameFinished && playView !== 'stats')) {
      playContent = renderLobbyView();
    } else {
      playContent = renderGameTable();
    }

    return (
      <>
        {errorMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-[1.5rem] bg-red-500/90 px-4 py-3 text-sm font-bold text-white shadow-lg sm:rounded-full sm:px-6">
            <Info className="h-5 w-5" />
            {errorMsg}
          </div>
        )}
        {playContent}
      </>
    );
  };

  const renderHandSpread = ({ mode = 'play' } = {}) => {
    const isPlayMode = mode === 'play';
    const isSpectatorReadOnlyHand = isPlayMode && isSpectatingGame;
    const spectatorHandLabel = spectatorVisiblePlayerName
      ? `${spectatorVisiblePlayerName}'s hand`
      : 'current player hand';

    return (
      <section className={clsx('rentz-hand-panel relative', mode === 'choice' && 'rentz-choice-hand-panel')}>
        {isPlayMode && pendingPlayCard && !isSpectatorReadOnlyHand && (
          <div className="absolute right-4 top-1 z-[110] flex origin-top-right scale-[0.93] flex-col items-center gap-1.5 rounded-[1.2rem] border border-[rgba(255,255,255,0.7)] bg-[linear-gradient(180deg,rgba(255,255,255,0.65)_0%,rgba(210,225,240,0.5)_100%)] p-2 shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),0_8px_16px_rgba(30,50,70,0.12)] backdrop-blur-md">
            <span className="text-[0.62rem] font-black uppercase tracking-[0.08em] text-[#1e3445] drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)] pt-0.5">Place card?</span>
            <div className="flex w-full justify-between gap-1.5 px-0.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingPlayCard(null);
                }}
                className="flex h-[1.35rem] w-full flex-1 items-center justify-center rounded-full border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.8)_0%,rgba(230,235,240,0.8)_100%)] text-slate-500 shadow-sm transition hover:brightness-105"
              >
                <X className="h-3 w-3" strokeWidth={3} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  socket.emit('play_card', { roomId, card: pendingPlayCard });
                  setPendingPlayCard(null);
                }}
                className="flex h-[1.35rem] w-full flex-1 items-center justify-center rounded-full border border-[#b4e854] bg-[linear-gradient(180deg,#d4fc79_0%,#96e6a1_100%)] text-[#2f5c15] shadow-[0_2px_4px_rgba(150,230,161,0.3),inset_0_1px_0_rgba(255,255,255,0.6)] transition hover:brightness-105"
              >
                <Check className="h-3 w-3" strokeWidth={3} />
              </button>
            </div>
          </div>
        )}
        {isSpectatorReadOnlyHand ? (
          <div className="pointer-events-none absolute inset-x-3 top-3 z-[105] flex justify-center sm:inset-x-5">
            <div className="rounded-full border border-white/35 bg-[linear-gradient(180deg,rgba(7,18,30,0.34)_0%,rgba(15,23,42,0.22)_100%)] px-4 py-2 text-center shadow-[0_12px_24px_rgba(15,23,42,0.14)] backdrop-blur-sm">
              <div className="text-sm font-black text-white sm:text-base">
                Spectating this match
              </div>
            </div>
          </div>
        ) : null}
        <div
          ref={mode === 'choice' ? choiceHandScrollRef : handScrollRef}
          className="rentz-hand-scroll"
          data-rentz-modal-scroll={mode === 'choice' ? 'x' : undefined}
        >
          <div
            className="rentz-hand-row"
            style={sortedDisplayedHand.length > 0 && visibleHandSpreadMetrics ? { width: `${visibleHandSpreadMetrics.spreadWidth}px` } : undefined}
          >
            {(() => {
              let hoverShifts = [];
              if (sortedDisplayedHand.length > 0) {
                const N = sortedDisplayedHand.length;
                hoverShifts = new Array(N).fill(0);
                const effectiveHoverIndex = !isSpectatorReadOnlyHand && hoveredCardIndex !== null
                  ? hoveredCardIndex
                  : (!isSpectatorReadOnlyHand && pendingPlayCard ? sortedDisplayedHand.indexOf(pendingPlayCard) : null);

                if (effectiveHoverIndex !== null && visibleHandSpreadMetrics && N > 1) {
                  const H = effectiveHoverIndex;
                  const A = visibleHandSpreadMetrics.cardAdvance;
                  const hoverWeight = 3.5;

                  const leftTotalWeight = (H > 0) ? ((H - 1) * 1 + hoverWeight) : 0;
                  let currentX = 0;
                  for (let i = 0; i <= H; i += 1) {
                    hoverShifts[i] = currentX - i * A;
                    if (i === H - 1) {
                      currentX += (H * A) * (hoverWeight / leftTotalWeight);
                    } else if (i < H - 1) {
                      currentX += (H * A) * (1 / leftTotalWeight);
                    }
                  }

                  const R = N - 1 - Math.max(0, H);
                  const rightTotalWeight = (R > 0) ? ((R - 1) * 1 + hoverWeight) : 0;
                  currentX = H * A;
                  for (let i = H + 1; i < N; i += 1) {
                    if (i === H + 1) {
                      currentX += (R * A) * (hoverWeight / rightTotalWeight);
                    } else {
                      currentX += (R * A) * (1 / rightTotalWeight);
                    }
                    hoverShifts[i] = currentX - i * A;
                  }
                }
              }

              return sortedDisplayedHand.map((card, index) => {
                const playable = !isSpectatorReadOnlyHand && isPlayMode && playableCards[card];
                const disabled = !playable;
                const mustFollowSuit = !isSpectatorReadOnlyHand && isPlayMode && isMyTurn && trickSuit && !playable && hand.some((handCard) => parseCard(handCard).suit === trickSuit);
                const roundFinishedEarly = !isSpectatorReadOnlyHand && isPlayMode && isRoundStatsPhase && hand.length > 0;
                const roundInteractionBlocked = isPlayMode && !isPlayingRound;
                const shouldGhostCard = isSpectatorReadOnlyHand || (isPlayMode && disabled && (mustFollowSuit || isTurnLocked || roundInteractionBlocked));
                const disabledTitle = isSpectatorReadOnlyHand
                  ? `Read-only spectator view of ${spectatorHandLabel}.`
                  : mustFollowSuit
                    ? `You must follow ${SUIT_NAMES[trickSuit]}.`
                    : roundFinishedEarly
                      ? 'This small game has already ended.'
                      : roundInteractionBlocked
                        ? 'Cards cannot be played right now.'
                        : '';

                const isCardHovered = !isSpectatorReadOnlyHand
                  && (hoveredCardIndex !== null ? hoveredCardIndex : (pendingPlayCard ? sortedDisplayedHand.indexOf(pendingPlayCard) : null)) === index;

                return (
                  <div
                    key={`${mode}-${card}-${index}`}
                    className={clsx(
                      'rentz-hand-card-wrap',
                      playable && 'is-playable',
                      isCardHovered && 'is-hovered'
                    )}
                    onMouseEnter={isSpectatorReadOnlyHand ? undefined : () => setHoveredCardIndex(index)}
                    onMouseLeave={isSpectatorReadOnlyHand ? undefined : () => setHoveredCardIndex(null)}
                    style={{
                      zIndex: index + 1,
                      height: visibleHandSpreadMetrics ? `${visibleHandSpreadMetrics.cardHeight}px` : undefined,
                      width: visibleHandSpreadMetrics ? `${visibleHandSpreadMetrics.cardWidth}px` : undefined,
                      marginLeft: index > 0 && visibleHandSpreadMetrics
                        ? `${visibleHandSpreadMetrics.cardAdvance - visibleHandSpreadMetrics.cardWidth}px`
                        : undefined,
                      '--hover-shift': `${hoverShifts[index]}px`
                    }}
                  >
                    <Card
                      cardString={card}
                      onClick={isPlayMode && !isSpectatorReadOnlyHand
                        ? () => {
                          const isMobileDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches || window.innerWidth < 1024;
                          if (disabled) {
                            if (isMobileDevice) {
                              setPendingPlayCard(null);
                            }
                            return;
                          }
                          if (isMobileDevice) {
                            setPendingPlayCard(card);
                          } else {
                            socket.emit('play_card', { roomId, card });
                          }
                        }
                        : undefined}
                      disabled={isSpectatorReadOnlyHand || disabled}
                      ghosted={shouldGhostCard}
                      title={disabledTitle}
                      variant="hand"
                    />
                  </div>
                );
              });
            })()}

            {displayedHand.length === 0 && (
              <div className="rentz-empty-hand">
                {isSpectatingGame ? 'Spectating this match' : 'Waiting for the next hand...'}
              </div>
            )}
          </div>
        </div>
      </section>
    );
  };

  const renderChoiceMatrix = () => {
    const allRulesets = choiceState?.availableRulesets?.length
      ? choiceState.availableRulesets
      : roomSettings.availableRulesets;
    const selectedRulesets = choiceState?.selectedRulesets || roomSettings.selectedRulesets;
    const permissions = choiceState?.rulesetPermissions || roomSettings.rulesetPermissions;
    const usedChoices = choiceState?.usedChoices || {};
    const chooserName = getPlayerName(currentChooser);
    const showChoiceHand = !choiceState?.nvSelected && !isSpectatingGame;
    const chooserId = choiceState?.chooserId || currentChooser?.userId || '';
    const rulesets = allRulesets.filter((rule) => (
      selectedRulesets[rule.id] !== false
      && (!chooserId || permissions?.[chooserId]?.[rule.id] !== false)
      && (!chooserId || !usedChoices?.[chooserId]?.[rule.id])
    ));

    return (
      <ModalShell
        title={amIChooser ? 'Choose a game' : `${getPlayerName(currentChooser)} is choosing a game`}
        eyebrow={choiceState?.nvSelected ? 'NV selected' : 'Small game'}
        wide
        overlayClassName={clsx('rentz-choice-overlay', showChoiceHand && 'has-choice-hand')}
        panelClassName={clsx('rentz-choice-panel', showChoiceHand && 'has-choice-hand')}
        bodyClassName="rentz-choice-body"
        headerAside={(
          <div className={clsx('rentz-choice-status-pill', amIChooser ? 'is-active' : 'is-waiting')}>
            {amIChooser ? 'Your choice' : 'Waiting for chooser'}
          </div>
        )}
        afterPanel={showChoiceHand ? (
          <div className="rentz-choice-hand-stage" aria-label="Your hand preview">
            {renderHandSpread({ mode: 'choice' })}
          </div>
        ) : null}
      >
        <div className={clsx('rentz-choice-table-shell', !amIChooser && 'is-waiting')}>
          <div className="rentz-ruleset-grid-wrap rentz-choice-table-scroll overflow-x-auto" data-rentz-modal-scroll="y">
          <table className="rentz-ruleset-grid w-full">
            <thead>
              <tr>
                <th className="rentz-ruleset-header-cell text-left">
                  Game
                </th>
                {players.map((player) => (
                  <th
                    key={player.userId}
                    data-short-label={getPlayerInitials(player)}
                    className={clsx(
                      'rentz-ruleset-header-cell text-center',
                      player.userId === choiceState?.chooserId && 'is-chooser-column'
                    )}
                    title={getPlayerName(player)}
                  >
                    <span className="rentz-ruleset-player-name">{getPlayerName(player)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rulesets.map((rule) => (
                <tr key={rule.id}>
                  <th className="rentz-ruleset-row-header text-left">
                    <div className="text-lg font-black text-[var(--text-primary)]">{rule.abbreviation || rule.label}</div>
                    <div className="text-xs font-bold text-[var(--text-secondary)]">{rule.label}</div>
                  </th>
                  {players.map((player) => {
                    const globallyEnabled = selectedRulesets[rule.id] !== false;
                    const allowed = permissions?.[player.userId]?.[rule.id] !== false;
                    const used = Boolean(usedChoices?.[player.userId]?.[rule.id]);
                    const isChooserCell = player.userId === choiceState?.chooserId;
                    const canChoose = amIChooser && isChooserCell && globallyEnabled && allowed && !used;
                    const choiceLabel = used ? 'Used' : globallyEnabled && allowed ? (isChooserCell ? 'Pick' : 'Open') : 'Off';

                    return (
                      <td
                        key={`${player.userId}-${rule.id}`}
                        role={canChoose ? 'button' : undefined}
                        tabIndex={canChoose ? 0 : undefined}
                        aria-disabled={!canChoose || undefined}
                        onClick={canChoose ? () => handleChooseRuleset(rule.id) : undefined}
                        onKeyDown={canChoose
                          ? (event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              handleChooseRuleset(rule.id);
                            }
                          }
                          : undefined}
                        className={clsx(
                          'rentz-ruleset-choice-td',
                          canChoose && 'is-pickable',
                          used && 'is-used',
                          !used && globallyEnabled && allowed && !canChoose && 'is-open',
                          (!globallyEnabled || !allowed) && 'is-disabled',
                          isChooserCell && 'is-chooser-cell'
                        )}
                      >
                        <span className="rentz-ruleset-choice-cell">{choiceLabel}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {rulesets.length === 0 && (
                <tr>
                  <td
                    colSpan={players.length + 1}
                    className="rentz-ruleset-row-header text-center"
                  >
                    No active rulesets are available for this chooser.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
          {!amIChooser && (
            <div className="rentz-choice-table-status is-floating">
              {chooserName} is choosing. Table actions are paused for you.
            </div>
          )}
        </div>
      </ModalShell>
    );
  };

  const renderNvChoice = () => (
    <ModalShell
      title={amIChooser ? 'Choose NV' : `${getPlayerName(currentChooser)} is choosing NV`}
      eyebrow="Round setup"
      headerAside={(
        <div className={clsx('rentz-choice-status-pill', amIChooser ? 'is-active' : 'is-waiting')}>
          {amIChooser ? 'Your choice' : 'Waiting for chooser'}
        </div>
      )}
    >
      <div className="rentz-nv-choice-intro">
        <p>
          {amIChooser
            ? 'You are choosing whether this round starts as NV.'
            : `${getPlayerName(currentChooser)} is choosing whether this round starts as NV.`}
        </p>
        {isTrainingMatch ? (
          <p className="mt-2">
            The selected training ruleset is already locked in, so your choice here will go straight into the round.
          </p>
        ) : null}
      </div>
      <div className={clsx('rentz-nv-choice-grid', !amIChooser && 'is-waiting')}>
        <button
          type="button"
          disabled={!amIChooser}
          onClick={() => handleNvChoice(true)}
          className={clsx(
            'rentz-nv-choice-card',
            amIChooser && 'is-pickable',
            !amIChooser && 'is-disabled'
          )}
        >
          <span className="rentz-nv-choice-icon">
            <Sparkles className="h-5 w-5" />
          </span>
          <span className="rentz-nv-choice-title">Play NV</span>
          <span className="rentz-nv-choice-copy">
            {isTrainingMatch
              ? 'Start the training round in NV. Scores from the round are doubled.'
              : 'Choose the game first. Scores from the round are doubled.'}
          </span>
        </button>
        <button
          type="button"
          disabled={!amIChooser}
          onClick={() => handleNvChoice(false)}
          className={clsx(
            'rentz-nv-choice-card',
            amIChooser && 'is-pickable',
            !amIChooser && 'is-disabled'
          )}
        >
          <span className="rentz-nv-choice-icon">
            <Swords className="h-5 w-5" />
          </span>
          <span className="rentz-nv-choice-title">No NV</span>
          <span className="rentz-nv-choice-copy">
            {isTrainingMatch
              ? 'Start the training round normally with the locked training ruleset.'
              : 'Deal first. Every player sees their own hand during game choice.'}
          </span>
        </button>
      </div>
    </ModalShell>
  );

  const renderEditorContent = () => (
    <div className="grid items-start gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <section className="glass-panel self-start p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-2xl font-display font-black text-[var(--text-primary)] sm:text-3xl">Ruleset Editor</h3>
            <p className="text-base font-semibold text-[var(--text-secondary)] sm:text-sm">
              Create, edit, and validate custom Rentz rules before you bring them into a match.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isViewingEditableRoomRuleset && <div className="status-pill px-4 py-2">linked to room</div>}
            <div className="status-pill px-4 py-2">{editorType.replace('_', ' ')}</div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(8rem,12rem)_auto]">
          <label>
            <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">Long name</span>
            <input
              value={editorTitle}
              onChange={(event) => setEditorTitle(event.target.value)}
              className="w-full rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-input)] px-5 py-4 font-black text-[var(--text-primary)] shadow-inner focus:outline-none focus:ring-4 focus:ring-[var(--accent-glow)]"
              placeholder="King of Hearts"
            />
          </label>
          <label>
            <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">Short name</span>
            <input
              value={editorShortName}
              onChange={(event) => setEditorShortName(event.target.value)}
              className="w-full rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-input)] px-5 py-4 font-black text-[var(--text-primary)] shadow-inner focus:outline-none focus:ring-4 focus:ring-[var(--accent-glow)]"
              placeholder="K♥"
            />
          </label>
          <label>
            <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">Type</span>
            <select
              value={editorType}
              onChange={(event) => setEditorType(event.target.value)}
              className="w-full rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-input)] px-4 py-4 font-black text-[var(--text-primary)] shadow-inner focus:outline-none"
            >
              <option value="per_round">per_round</option>
              <option value="end_game">end_game</option>
            </select>
          </label>
        </div>

        <div className="rentz-code-editor-shell mt-4">
          <textarea
            value={editorCode}
            onChange={(event) => setEditorCode(event.target.value)}
            className="rentz-code-editor-textarea"
            spellCheck={false}
          />
        </div>

        <input
          ref={editorImportInputRef}
          type="file"
          accept=".rentz,text/plain"
          onChange={handleImportRentzToEditor}
          className="hidden"
        />

        <div className="rentz-editor-actions mt-4">
          <button onClick={handleCompileRules} className="rentz-editor-action is-primary">
            <span className="rentz-editor-action-icon">
              <FileCode2 className="h-5 w-5" />
            </span>
            <span className="rentz-editor-action-copy">
              <span className="rentz-editor-action-title">Compile Ruleset</span>
              <span className="rentz-editor-action-meta">Validate syntax and refresh the preview.</span>
            </span>
          </button>
          <button onClick={handleSaveDraft} className="rentz-editor-action is-positive">
            <span className="rentz-editor-action-icon">
              <Check className="h-5 w-5" />
            </span>
            <span className="rentz-editor-action-copy">
              <span className="rentz-editor-action-title">Save Draft</span>
              <span className="rentz-editor-action-meta">Keep this ruleset in your local draft list.</span>
            </span>
          </button>
          <button onClick={handleSaveEditorRulesetToProfile} disabled={editorSaveBusy} className="rentz-editor-action is-positive disabled:cursor-not-allowed disabled:opacity-70">
            <span className="rentz-editor-action-icon">
              <Library className="h-5 w-5" />
            </span>
            <span className="rentz-editor-action-copy">
              <span className="rentz-editor-action-title">{editorSaveBusy ? 'Saving...' : 'Save Ruleset to Profile'}</span>
              <span className="rentz-editor-action-meta">Store this custom ruleset in your profile library without duplicating repeats.</span>
            </span>
          </button>
          <button onClick={handleDownloadRentzRuleset} className="rentz-editor-action">
            <span className="rentz-editor-action-icon">
              <Download className="h-5 w-5" />
            </span>
            <span className="rentz-editor-action-copy">
              <span className="rentz-editor-action-title">Download .rentz</span>
              <span className="rentz-editor-action-meta">Export the current ruleset as a shareable file.</span>
            </span>
          </button>
          <button onClick={() => editorImportInputRef.current?.click()} className="rentz-editor-action">
            <span className="rentz-editor-action-icon">
              <Upload className="h-5 w-5" />
            </span>
            <span className="rentz-editor-action-copy">
              <span className="rentz-editor-action-title">Import .rentz</span>
              <span className="rentz-editor-action-meta">Load a saved ruleset into the editor.</span>
            </span>
          </button>
          {canAddGuestRoomRulesets && (
            <button onClick={handleApplyEditorRulesetToRoom} className="rentz-editor-action is-room">
              <span className="rentz-editor-action-icon">
                <Sparkles className="h-5 w-5" />
              </span>
              <span className="rentz-editor-action-copy">
                <span className="rentz-editor-action-title">{isViewingEditableRoomRuleset ? 'Update Room Ruleset' : 'Apply to Room'}</span>
                <span className="rentz-editor-action-meta">{isViewingEditableRoomRuleset ? 'Save these edits back into the linked room ruleset.' : 'Push this ruleset straight into the current room.'}</span>
              </span>
            </button>
          )}
          <button onClick={() => setActiveTab('guide')} className="rentz-editor-action is-guide">
            <span className="rentz-editor-action-icon">
              <Info className="h-5 w-5" />
            </span>
            <span className="rentz-editor-action-copy">
              <span className="rentz-editor-action-title">View Guide</span>
              <span className="rentz-editor-action-meta">Open the syntax guide and rule-writing help.</span>
            </span>
          </button>
        </div>

      </section>

      <section className="space-y-5 self-start">
        {(() => {
          const currentEditorJudgeSignature = buildEditorRulesetSignature();
          const isJudgeReviewStale = Boolean(editorJudgeReview) && editorJudgeSignature !== currentEditorJudgeSignature;

          return (
            <>
        <div>
          <div
            className="flex min-h-[3.35rem] items-center rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] px-4 py-3 text-sm font-semibold text-[var(--text-secondary)]"
            role="status"
            aria-live="polite"
          >
            {editorStatus || 'Compiler messages will appear here after compile, save, import, and related editor actions.'}
          </div>
        </div>

        <div className="glass-panel p-5 sm:p-6">
          <h4 className="mb-3 text-2xl font-display font-black text-[var(--text-primary)]">Compiler Preview</h4>
          {editorAst ? (
            <pre className="max-h-[24rem] overflow-auto rounded-[1.3rem] bg-slate-950/80 p-4 text-xs text-lime-100">
              {JSON.stringify(editorAst, null, 2)}
            </pre>
          ) : (
            <p className="rounded-[1.3rem] border border-dashed border-[var(--glass-border)] bg-[var(--surface-subtle)] p-5 text-sm font-semibold text-[var(--text-secondary)]">
              No compiled preview yet.
            </p>
          )}
        </div>

        <div className="glass-panel p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-2xl font-display font-black text-[var(--text-primary)]">Editor Bot</h4>
              <p className="mt-2 text-sm font-semibold text-[var(--text-secondary)]">
                Ask for a gameplay-focused review of fairness, pacing, balance, clarity, and strategic depth.
              </p>
            </div>
            {editorJudgeReview && (
              <div className="status-pill px-4 py-2">
                {editorJudgeReview.reviewSource === 'ai' ? 'AI review ready' : 'fallback review'}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleJudgeRulesetWithAi}
            disabled={editorJudgeBusy}
            className="rentz-editor-action is-guide mt-4 w-full disabled:cursor-not-allowed disabled:opacity-70"
          >
            <span className="rentz-editor-action-icon">
              {editorJudgeBusy ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Bot className="h-5 w-5" />}
            </span>
            <span className="rentz-editor-action-copy">
              <span className="rentz-editor-action-title">{editorJudgeBusy ? 'Judging Ruleset...' : 'Judge Ruleset with AI...'}</span>
              <span className="rentz-editor-action-meta">Run a design review without replacing the compiler preview.</span>
            </span>
          </button>

          <div className="mt-4 rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-subtle)] p-4 text-sm font-semibold text-[var(--text-secondary)]">
            {editorJudgeError
              ? editorJudgeError
              : editorJudgeBusy
                ? 'Editor Bot is reviewing gameplay quality now. This can fall back cleanly if Ollama is unavailable.'
                : 'Compile status still matters. If the ruleset does not compile, the judge will stop and ask you to fix those errors first.'}
          </div>
        </div>

        {editorJudgeReview && (
          <div className="glass-panel max-h-[calc(100vh-8rem)] overflow-y-auto p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">Editor Bot review</div>
                <h4 className="mt-2 text-2xl font-display font-black text-[var(--text-primary)]">Ruleset Judgment</h4>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="status-pill px-4 py-2">
                  {editorJudgeReview.reviewSource === 'ai' ? 'Ollama review' : 'Local fallback'}
                </div>
                {isJudgeReviewStale && <div className="status-pill px-4 py-2">review is for an earlier draft</div>}
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
              <div className="rounded-[1.45rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-5 shadow-[0_14px_30px_rgba(15,23,42,0.08)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">Overall score</div>
                    <div className="mt-3 flex items-end gap-3">
                      <span className="text-4xl font-display font-black text-[var(--text-primary)] sm:text-5xl">{editorJudgeReview.overallScore.toFixed(1)}</span>
                      <span className="pb-1 text-sm font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">/ 10</span>
                    </div>
                  </div>
                  <div className="rounded-full border border-[var(--glass-border)] bg-[var(--surface-subtle)] p-4 text-[var(--text-primary)]">
                    <Star className="h-6 w-6" />
                  </div>
                </div>
                <p className="mt-4 text-sm font-semibold leading-6 text-[var(--text-secondary)]">{editorJudgeReview.rulesetSummary}</p>
              </div>

              <div className="rounded-[1.45rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-5 shadow-[0_14px_30px_rgba(15,23,42,0.08)]">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">Constructive review</div>
                <p className="mt-3 text-sm font-semibold leading-6 text-[var(--text-secondary)]">{editorJudgeReview.constructiveReview}</p>
                {editorJudgeReview.recommendations.length > 0 && (
                  <div className="mt-4">
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">Recommendations</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {editorJudgeReview.recommendations.map((recommendation, index) => (
                        <div
                          key={`editor-judge-recommendation-${index}`}
                          className="rounded-full border border-[var(--glass-border)] bg-[var(--surface-subtle)] px-3 py-2 text-xs font-bold text-[var(--text-primary)]"
                        >
                          {recommendation}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {EDITOR_BOT_CATEGORY_DEFINITIONS.map((category) => {
                const categoryEntry = editorJudgeReview.categoryRatings[category.key];

                return (
                  <div
                    key={category.key}
                    className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-subtle)] p-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-black text-[var(--text-primary)]">{category.label}</div>
                      <div className="rounded-full border border-[var(--glass-border)] bg-[var(--surface-soft)] px-3 py-1 text-sm font-black text-[var(--text-primary)]">
                        {categoryEntry.score.toFixed(1)}
                      </div>
                    </div>
                    <p className="mt-3 text-sm font-semibold leading-6 text-[var(--text-secondary)]">{categoryEntry.explanation}</p>
                  </div>
                );
              })}
            </div>

            {editorJudgeReview.warnings.length > 0 && (
              <div className="mt-4 rounded-[1.35rem] border border-amber-200/60 bg-amber-50/80 p-4 text-sm font-semibold text-amber-950">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-amber-900">
                  <Ban className="h-4 w-4" />
                  Warnings and concerns
                </div>
                <div className="mt-3 space-y-2">
                  {editorJudgeReview.warnings.map((warning, index) => (
                    <p key={`editor-judge-warning-${index}`}>{warning}</p>
                  ))}
                </div>
              </div>
            )}

            {editorJudgeReview.diagnostics.length > 0 && (
              <div className="mt-4 rounded-[1.35rem] border border-[var(--glass-border)] bg-[var(--surface-subtle)] p-4 text-sm font-semibold text-[var(--text-secondary)]">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">Editor Bot diagnostics</div>
                <div className="mt-3 space-y-3">
                  {editorJudgeReview.diagnostics.map((entry, index) => (
                    <div
                      key={`editor-judge-diagnostic-${index}`}
                      className="rounded-[1.1rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-[var(--text-primary)]">
                        <span>{entry.attempt}</span>
                        <span>{entry.success ? 'success' : 'failed'}</span>
                        <span>{entry.stage}</span>
                        <span>{entry.elapsedMs}ms</span>
                      </div>
                      {entry.error && <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{entry.error}</p>}
                      {entry.rawPreview && (
                        <p className="mt-2 rounded-[0.9rem] bg-slate-950/85 px-3 py-2 font-mono text-xs text-lime-100">
                          {entry.rawPreview}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="glass-panel p-5 sm:p-6">
          <h4 className="mb-3 text-2xl font-display font-black text-[var(--text-primary)]">Saved Drafts</h4>
          <div className="space-y-3">
            {ruleDrafts.length === 0 ? (
              <p className="text-sm font-semibold text-[var(--text-secondary)]">
                Drafts you save here stay on this device for quick iteration.
              </p>
            ) : (
              ruleDrafts.map((draft) => (
                <button
                  key={draft.id}
                  onClick={() => {
                    populateEditorFromRuleset({
                      longName: draft.title,
                      shortName: draft.shortName,
                      type: draft.type,
                      code: draft.code
                    }, {
                      linkedRoomRulesetId: null,
                      switchToEditor: true
                    });
                  }}
                  className="w-full rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-subtle)] px-4 py-3 text-left transition hover:bg-[var(--surface-soft)]"
                >
                  <div className="text-base font-black text-[var(--text-primary)]">{draft.title}</div>
                  <div className="mt-1 text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                    {draft.type} • {new Date(draft.updatedAt).toLocaleString()}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
            </>
          );
        })()}
      </section>
    </div>
  );

  const renderAccountRulesetDeck = ({ title, fieldName, limit, emptyLabel }) => {
    const indexes = Array.isArray(userProfile?.[fieldName]) ? userProfile[fieldName] : [];
    const slots = Array.from({ length: limit }, (_, slotIndex) => indexes[slotIndex] ?? null);
    const isBusy = accountRulesetBusyField === fieldName;
    const cardShellClassName = 'relative flex min-h-[13.25rem] w-full min-w-0 flex-col overflow-hidden rounded-[1.45rem] box-border p-4';
    const gridClassName = limit === 5
      ? 'grid grid-cols-1 justify-start gap-3 sm:grid-cols-2 md:grid-cols-3 lg:[grid-template-columns:repeat(5,var(--ruleset-card-width))]'
      : 'grid grid-cols-1 justify-start gap-3 sm:grid-cols-2 md:grid-cols-3 lg:[grid-template-columns:repeat(3,var(--ruleset-card-width))]';
    const gridStyle = {
      '--ruleset-card-width': '11rem'
    };

    return (
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-xl font-display font-black text-[var(--text-primary)]">{title}</h4>
            <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">{indexes.length}/{limit} cards filled</p>
          </div>
          {isBusy && (
            <div className="rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]">
              Saving...
            </div>
          )}
        </div>

        <div className={gridClassName} style={gridStyle}>
          {slots.map((index, slotIndex) => {
            const definition = index == null ? null : getAccountRulesetDefinition(index);
            if (!definition) {
              return (
                <button
                  key={`${fieldName}-empty-${slotIndex}`}
                  type="button"
                  onClick={() => openAccountRulesetPicker(fieldName, limit)}
                  disabled={isBusy}
                  className={clsx(cardShellClassName, 'group h-full items-center justify-center border-2 border-dashed border-[var(--glass-border)] bg-[var(--surface-soft)] text-center transition hover:border-[var(--text-secondary)] hover:bg-[var(--surface-medium)] disabled:cursor-not-allowed disabled:opacity-70')}
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] text-[var(--text-primary)] transition group-hover:scale-105">
                    <Plus className="h-4 w-4" />
                  </div>
                  <div className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-[var(--text-primary)]">Add ruleset</div>
                  <p className="mt-2 max-w-[11rem] text-xs font-semibold leading-5 text-[var(--text-secondary)]">{emptyLabel}</p>
                </button>
              );
            }

            return (
              <div
                key={`${fieldName}-${definition.index}`}
                className={clsx(cardShellClassName, 'h-full border border-slate-300/80 shadow-[0_14px_30px_rgba(15,23,42,0.10)]')}
                style={{
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(237,242,247,0.98) 100%)'
                }}
              >
                <button
                  type="button"
                  onClick={() => handleRemoveAccountRuleset(fieldName, definition.index)}
                  disabled={isBusy}
                  className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                  title={`Remove ${definition.label}`}
                >
                  <X className="h-4 w-4" />
                </button>

                <div className="min-w-0 pr-9">
                  <div className="text-[9px] font-extrabold uppercase tracking-[0.22em] text-slate-500">Card {slotIndex + 1}</div>
                  <div
                    className="mt-2 text-[0.95rem] font-black leading-5 text-slate-950 [overflow-wrap:anywhere]"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}
                  >
                    {definition.label}
                  </div>
                  <div className="mt-2 inline-flex rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-700">
                    {definition.abbreviation}
                  </div>
                </div>

                <div className="mt-auto space-y-2 pt-4">
                  <button
                    type="button"
                    onClick={() => handleAccountRulesetPreview(definition.index)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-[0.95rem] border border-slate-300 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-900 transition hover:bg-slate-100"
                  >
                    <FileCode2 className="h-3.5 w-3.5" />
                    Code Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAccountRulesetOpenInEditor(definition.index)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-[0.95rem] border border-emerald-300 bg-emerald-100/85 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-950 transition hover:bg-emerald-200/80"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    Open Editor
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderLoginContent = () => {
    if (authLoading) {
      return (
        <section className="glass-panel p-5 sm:p-8">
          <div className="rounded-[1.7rem] border border-[var(--glass-border)] bg-[var(--surface-subtle)] p-5 text-sm font-semibold text-[var(--text-secondary)] sm:p-6">
            Checking the current account session...
          </div>
        </section>
      );
    }

    if (isAuthenticated) {
      const isSavingAccount = authBusyAction === 'account-save';
      const isSavingAvatar = authBusyAction === 'profilePicture-upload';
      const isSavingBanner = authBusyAction === 'banner-upload';
      const profilePreview = userProfile?.avatarUrl || DEFAULT_REGISTER_PROFILE_PREVIEW;
      const bannerPreview = userProfile?.banner || DEFAULT_REGISTER_BANNER_PREVIEW;

      return (
        <div className="space-y-5">
          {authFeedback && (
            <div className="rounded-[1.5rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] px-4 py-3 text-sm font-semibold text-[var(--text-secondary)]">
              {authFeedback}
            </div>
          )}

          <section className="glass-panel overflow-hidden p-0">
            <div className="relative border-b border-[var(--glass-border)]">
              <button
                type="button"
                onClick={() => setAccountImagePreview({ src: bannerPreview, title: `${userProfile?.username || 'Account'} banner`, shape: 'landscape' })}
                className="relative block min-h-[14rem] w-full overflow-hidden text-left transition hover:brightness-[1.04] focus:outline-none focus:ring-4 focus:ring-[var(--accent-glow)]"
                title="View banner fullscreen"
              >
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(180deg, rgba(8,15,28,0.22), rgba(8,15,28,0.62)), url(${bannerPreview}) center/cover`
                  }}
                />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.22),transparent_45%)]" />
              </button>
              {accountEditMode && (
                <button
                  type="button"
                  onClick={() => accountBannerInputRef.current?.click()}
                  disabled={isSavingBanner || isSavingAccount}
                  className="absolute bottom-4 right-4 flex items-center gap-2 rounded-full border border-white/40 bg-black/35 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white backdrop-blur-sm transition hover:bg-black/45 focus:outline-none focus:ring-4 focus:ring-[var(--accent-glow)] disabled:cursor-not-allowed disabled:opacity-70"
                  title="Replace banner"
                >
                  <Upload className="h-4 w-4" />
                  {isSavingBanner ? 'Uploading...' : 'Replace banner'}
                </button>
              )}
              <input
                ref={accountBannerInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(event) => handleDirectAccountImageChange('banner', 'Banner', event)}
                className="hidden"
              />
            </div>

            <div className="px-5 py-6 sm:px-6 sm:py-7">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setAccountImagePreview({ src: profilePreview, title: `${userProfile?.username || 'Account'} profile picture`, shape: 'portrait' })}
                      className="seat-avatar h-28 w-28 text-3xl shadow-lg transition hover:scale-[1.02] focus:outline-none focus:ring-4 focus:ring-[var(--accent-glow)] sm:h-32 sm:w-32"
                      title="View profile picture fullscreen"
                    >
                      <img src={profilePreview} alt="" className="h-full w-full rounded-full object-cover" />
                    </button>
                    {accountEditMode && (
                      <button
                        type="button"
                        onClick={() => accountAvatarInputRef.current?.click()}
                        disabled={isSavingAvatar || isSavingAccount}
                        className="absolute bottom-1 right-1 flex h-11 w-11 items-center justify-center rounded-full border border-white/50 bg-black/55 text-white shadow-lg transition hover:bg-black/70 focus:outline-none focus:ring-4 focus:ring-[var(--accent-glow)] disabled:cursor-not-allowed disabled:opacity-70"
                        title="Replace profile picture"
                      >
                        <Upload className="h-4 w-4" />
                      </button>
                    )}
                    <input
                      ref={accountAvatarInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={(event) => handleDirectAccountImageChange('profilePicture', 'Profile picture', event)}
                      className="hidden"
                    />
                  </div>

                  <div className="min-w-0">
                    {accountEditMode ? (
                      <label className="block">
                        <span className="mb-2 block text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--text-secondary)]">Username</span>
                        <input
                          value={accountEditForm.username}
                          onChange={(event) => setAccountEditForm((current) => ({ ...current, username: event.target.value }))}
                          placeholder="Username"
                          className="w-full rounded-[1.2rem] border border-[var(--glass-border)] bg-[var(--surface-input)] px-4 py-3 text-xl font-black text-[var(--text-primary)] shadow-inner focus:outline-none focus:ring-4 focus:ring-[var(--accent-glow)] sm:min-w-[18rem]"
                        />
                      </label>
                    ) : (
                      <div className="text-3xl font-black text-[var(--text-primary)]">{userProfile?.username}</div>
                    )}

                    <div className="mt-3 inline-flex rounded-full border border-[var(--glass-border)] bg-[var(--surface-soft)] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                      Joined {new Date(userProfile?.accountCreatedAt || Date.now()).toLocaleDateString()}
                    </div>
                    <div className="mt-5 rounded-[1.45rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 sm:p-5">
                      <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                        {accountEditMode ? 'Edit description' : 'Description'}
                      </div>
                      {accountEditMode ? (
                        <textarea
                          ref={descriptionTextareaRef}
                          value={accountEditForm.description}
                          onChange={(event) => setAccountEditForm((current) => ({ ...current, description: event.target.value }))}
                          rows={1}
                          placeholder="Tell the table what kind of Rentz player you are."
                          className="mt-3 max-h-64 w-full max-w-full resize-none overflow-y-auto rounded-[1.2rem] border border-[var(--glass-border)] bg-[var(--surface-input)] px-4 py-3 font-semibold leading-7 text-[var(--text-primary)] shadow-inner [overflow-wrap:anywhere] break-words whitespace-pre-wrap focus:outline-none focus:ring-4 focus:ring-[var(--accent-glow)]"
                        />
                      ) : (
                        <p className="mt-3 max-w-full text-sm font-semibold leading-7 text-[var(--text-primary)] [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
                          {userProfile?.description || 'No account description yet.'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex w-full flex-col gap-3 xl:w-56">
                  {accountEditMode ? (
                    <>
                      <button
                        type="button"
                        onClick={handleSaveAccountEdits}
                        disabled={isSavingAccount}
                        className="frutiger-button w-full py-3 text-sm uppercase tracking-[0.14em] disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {isSavingAccount ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelAccountEdits}
                        disabled={isSavingAccount}
                        className="rounded-[1.2rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={openAccountEditMode}
                      className="flex w-full items-center justify-center gap-2 rounded-[1.2rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
                    >
                      <PencilLine className="h-4 w-4" />
                      Edit
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={authBusyAction === 'logout' || isSavingAccount}
                    className="rounded-[1.2rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {authBusyAction === 'logout' ? 'Signing out...' : 'Log Out'}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="glass-panel p-5 sm:p-6">
            <div className="grid gap-4 lg:grid-cols-4">
              <div className="rounded-[1.4rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                  ELO
                </div>
                <div className="mt-2 text-3xl font-black text-[var(--text-primary)]">
                  {getPlayerRating(userProfile) == null ? '--' : getPlayerRating(userProfile)}
                </div>
              </div>
              <div className="rounded-[1.4rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                  Rank
                </div>
                <button
                  type="button"
                  onClick={() => void openRankLeaderboardModal({
                    targetUserId: userProfile?.userId,
                    fallbackRankName: userProfile?.rankName || 'Current Rank',
                    sourceLabel: 'account'
                  })}
                  className="mt-2 text-left text-lg font-black leading-6 text-[var(--text-primary)] transition hover:opacity-80 focus:outline-none focus:ring-4 focus:ring-[var(--accent-glow)] rounded-[0.9rem]"
                  title="Open leaderboard for this rank"
                >
                  {userProfile?.rankName || 'Starting-out Rentz Rookie'}
                </button>
              </div>
              <div className="rounded-[1.4rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                  Global Placement
                </div>
                <div className="mt-2 text-3xl font-black text-[var(--text-primary)]">
                  {userProfile?.globalPlacement ? `#${userProfile.globalPlacement}` : '#--'}
                </div>
              </div>
              <div className="rounded-[1.4rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                  Rank Leaderboard
                </div>
                <button
                  type="button"
                  onClick={() => void openRankLeaderboardModal({
                    targetUserId: userProfile?.userId,
                    fallbackRankName: userProfile?.rankName || 'Current Rank',
                    sourceLabel: 'account'
                  })}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[1.15rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
                >
                  <Trophy className="h-4 w-4" />
                  View Your Rank
                </button>
              </div>
            </div>
          </section>

          <section className="glass-panel p-5 sm:p-6">
            <div className="mb-6 grid gap-4 lg:grid-cols-3">
              <div className="rounded-[1.4rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                  Friends
                </div>
                <div className="mt-2 text-3xl font-black text-[var(--text-primary)]">
                  {friendState.friends.length}
                </div>
              </div>
              <div className="rounded-[1.4rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                  Incoming Requests
                </div>
                <div className="mt-2 text-3xl font-black text-[var(--text-primary)]">
                  {friendState.incomingRequests.length}
                </div>
              </div>
              <div className="rounded-[1.4rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                  Outgoing Requests
                </div>
                <div className="mt-2 text-3xl font-black text-[var(--text-primary)]">
                  {friendState.outgoingRequests.length}
                </div>
              </div>
            </div>

            <div className="mb-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <section className="rounded-[1.45rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h4 className="text-xl font-display font-black text-[var(--text-primary)]">Incoming Requests</h4>
                  <div className="status-pill px-3 py-2">{friendState.incomingRequests.length}</div>
                </div>

                <div className="space-y-3">
                  {friendState.incomingRequests.length === 0 ? (
                    <div className="rounded-[1.3rem] border border-dashed border-[var(--glass-border)] bg-[var(--surface-subtle)] p-4 text-sm font-semibold text-[var(--text-secondary)]">
                      No incoming friend requests right now.
                    </div>
                  ) : friendState.incomingRequests.map((requester) => (
                    <div key={requester.userId} className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-subtle)] p-4">
                      <div className="flex items-start justify-between gap-4">
                        <button
                          type="button"
                          onClick={() => void openPlayerProfileModal(requester)}
                          className="flex min-w-0 items-center gap-3 text-left"
                        >
                          <AvatarFace
                            player={requester}
                            alt={`${getPlayerName(requester)} avatar`}
                            wrapperClassName="seat-avatar h-12 w-12 text-sm"
                            imageClassName="h-full w-full rounded-full object-cover"
                            fallbackClassName="flex h-full w-full items-center justify-center rounded-full"
                          />
                          <div className="min-w-0">
                            <div className="truncate text-base font-black text-[var(--text-primary)]">{getPlayerName(requester)}</div>
                            <div className="text-xs font-bold text-[var(--text-secondary)]">Wants to add you as a friend</div>
                          </div>
                        </button>

                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            disabled={friendActionBusyTargetId === requester.userId}
                            onClick={() => void runFriendAction('accept', requester.userId, 'Friend request accepted.')}
                            className="rounded-full bg-emerald-100/85 p-2 text-emerald-900 transition hover:bg-emerald-200/80 disabled:cursor-not-allowed disabled:opacity-70"
                            title="Accept request"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            disabled={friendActionBusyTargetId === requester.userId}
                            onClick={() => void runFriendAction('reject', requester.userId, 'Friend request rejected.')}
                            className="rounded-full bg-rose-100/85 p-2 text-rose-900 transition hover:bg-rose-200/80 disabled:cursor-not-allowed disabled:opacity-70"
                            title="Reject request"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[1.45rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h4 className="text-xl font-display font-black text-[var(--text-primary)]">Outgoing Requests</h4>
                  <div className="status-pill px-3 py-2">{friendState.outgoingRequests.length}</div>
                </div>

                <div className="space-y-3">
                  {friendState.outgoingRequests.length === 0 ? (
                    <div className="rounded-[1.3rem] border border-dashed border-[var(--glass-border)] bg-[var(--surface-subtle)] p-4 text-sm font-semibold text-[var(--text-secondary)]">
                      No outgoing friend requests right now.
                    </div>
                  ) : friendState.outgoingRequests.map((requester) => (
                    <div key={requester.userId} className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-subtle)] p-4">
                      <div className="flex items-start justify-between gap-4">
                        <button
                          type="button"
                          onClick={() => void openPlayerProfileModal(requester)}
                          className="flex min-w-0 items-center gap-3 text-left"
                        >
                          <AvatarFace
                            player={requester}
                            alt={`${getPlayerName(requester)} avatar`}
                            wrapperClassName="seat-avatar h-12 w-12 text-sm"
                            imageClassName="h-full w-full rounded-full object-cover"
                            fallbackClassName="flex h-full w-full items-center justify-center rounded-full"
                          />
                          <div className="min-w-0">
                            <div className="truncate text-base font-black text-[var(--text-primary)]">{getPlayerName(requester)}</div>
                            <div className="text-xs font-bold text-[var(--text-secondary)]">Request sent</div>
                          </div>
                        </button>

                        <button
                          type="button"
                          disabled={friendActionBusyTargetId === requester.userId}
                          onClick={() => void runFriendAction('cancel', requester.userId, 'Friend request canceled.')}
                          className="rounded-[1rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section className="mb-6 rounded-[1.45rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h4 className="text-xl font-display font-black text-[var(--text-primary)]">Friends</h4>
                <div className="status-pill px-3 py-2">{friendState.friends.length}</div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {friendState.friends.length === 0 ? (
                  <div className="rounded-[1.3rem] border border-dashed border-[var(--glass-border)] bg-[var(--surface-subtle)] p-4 text-sm font-semibold text-[var(--text-secondary)]">
                    You have not added any friends yet.
                  </div>
                ) : friendState.friends.map((friend) => (
                  <div key={friend.userId} className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-subtle)] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <button
                        type="button"
                        onClick={() => void openPlayerProfileModal(friend)}
                        className="flex min-w-0 items-center gap-3 text-left"
                      >
                        <AvatarFace
                          player={friend}
                          alt={`${getPlayerName(friend)} avatar`}
                          wrapperClassName="seat-avatar h-12 w-12 text-sm"
                          imageClassName="h-full w-full rounded-full object-cover"
                          fallbackClassName="flex h-full w-full items-center justify-center rounded-full"
                        />
                        <div className="min-w-0">
                          <div className="truncate text-base font-black text-[var(--text-primary)]">{getPlayerName(friend)}</div>
                          <div className="text-xs font-bold text-[var(--text-secondary)]">Friend</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        disabled={friendActionBusyTargetId === friend.userId}
                        onClick={() => void runFriendAction('remove', friend.userId, 'Friend removed.')}
                        className="rounded-[1rem] border border-red-200/75 bg-red-100/80 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-red-900 transition hover:bg-red-200/80 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="space-y-6 overflow-x-hidden">
              {renderAccountRulesetDeck({
                title: 'Favourite Rulesets',
                fieldName: 'favouriteRulesets',
                limit: 5,
                emptyLabel: 'Save the presets you reach for most often.'
              })}
              {renderAccountRulesetDeck({
                title: 'Ruleset Loadout',
                fieldName: 'rulesetLoadout',
                limit: 3,
                emptyLabel: 'Pick the pack you want ready when you host.'
              })}
            </div>
          </section>
        </div>
      );
    }

    return (
      <section className="glass-panel p-5 sm:p-8">
        <h3 className="mb-2 text-2xl font-display font-black text-[var(--text-primary)] sm:text-3xl">
          Account Access
        </h3>
        <p className="mb-6 text-base font-semibold text-[var(--text-secondary)] sm:text-sm">
          Sign in with a real Rentz account, create a new one with profile details, or leave a placeholder password-reset request for future email integration.
        </p>

        {authFeedback && (
          <div className="mb-5 rounded-[1.5rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] px-4 py-3 text-sm font-semibold text-[var(--text-secondary)]">
            {authFeedback}
          </div>
        )}

        <div className="mb-5 grid grid-cols-2 gap-2 rounded-[1.5rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-2">
          {[
            { id: 'login', label: 'Login' },
            { id: 'register', label: 'Create account' }
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setAuthView(option.id)}
              className={clsx(
                'rounded-[1.15rem] px-3 py-3 text-xs font-black uppercase tracking-[0.12em] transition sm:text-sm',
                (authView === option.id || (option.id === 'login' && authView === 'forgot-password'))
                  ? 'border border-white/80 bg-[var(--surface-solid)] text-[var(--text-primary)] shadow-md'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-medium)]'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {(authView === 'login' || authView === 'forgot-password') && (
          <form onSubmit={handleLoginSubmit} className="space-y-4 rounded-[1.7rem] border border-[var(--glass-border)] bg-[var(--surface-subtle)] p-5 sm:p-6">
            <label className="block">
              <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">Username</span>
              <input
                value={loginForm.username}
                onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))}
                placeholder="Enter your username"
                className="w-full rounded-[1.25rem] border border-[var(--glass-border)] bg-[var(--surface-input)] px-4 py-3 font-black text-[var(--text-primary)] shadow-inner focus:outline-none focus:ring-4 focus:ring-[var(--accent-glow)]"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">Password</span>
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="Enter your password"
                className="w-full rounded-[1.25rem] border border-[var(--glass-border)] bg-[var(--surface-input)] px-4 py-3 font-black text-[var(--text-primary)] shadow-inner focus:outline-none focus:ring-4 focus:ring-[var(--accent-glow)]"
              />
            </label>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setAuthView('forgot-password')}
                className="text-xs font-black uppercase tracking-[0.14em] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
              >
                Forgot password?
              </button>
            </div>
            <button type="submit" disabled={Boolean(authBusyAction)} className="frutiger-button w-full py-4 text-base disabled:cursor-not-allowed disabled:opacity-70 sm:text-lg">
              {authBusyAction === 'login' ? 'Signing in...' : 'Login'}
            </button>
            {authView === 'forgot-password' && (
              <div className="rounded-[1.35rem] border border-dashed border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
                <div className="text-sm font-semibold leading-7 text-[var(--text-secondary)]">
                  The email reset pipeline is not built yet. This placeholder records the request cleanly so mail delivery can be added later.
                </div>
                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">Username</span>
                    <input
                      value={forgotPasswordUsername}
                      onChange={(event) => setForgotPasswordUsername(event.target.value)}
                      placeholder="Which account needs help?"
                      className="w-full rounded-[1.25rem] border border-[var(--glass-border)] bg-[var(--surface-input)] px-4 py-3 font-black text-[var(--text-primary)] shadow-inner focus:outline-none focus:ring-4 focus:ring-[var(--accent-glow)]"
                    />
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() => setAuthView('login')}
                      className="rounded-[1.2rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
                    >
                      Back to login
                    </button>
                    <button
                      type="button"
                      onClick={handleForgotPasswordSubmit}
                      disabled={Boolean(authBusyAction)}
                      className="frutiger-button px-4 py-3 text-xs uppercase tracking-[0.14em] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {authBusyAction === 'forgot-password' ? 'Submitting request...' : 'Request password help'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </form>
        )}

        {authView === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-4 rounded-[1.7rem] border border-[var(--glass-border)] bg-[var(--surface-subtle)] p-5 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">Username</span>
                <input
                  value={registerForm.username}
                  onChange={(event) => setRegisterForm((current) => ({ ...current, username: event.target.value }))}
                  placeholder="Unique username"
                  className="w-full rounded-[1.25rem] border border-[var(--glass-border)] bg-[var(--surface-input)] px-4 py-3 font-black text-[var(--text-primary)] shadow-inner focus:outline-none focus:ring-4 focus:ring-[var(--accent-glow)]"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">Password</span>
                <input
                  type="password"
                  value={registerForm.password}
                  onChange={(event) => setRegisterForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Minimum 8 characters"
                  className="w-full rounded-[1.25rem] border border-[var(--glass-border)] bg-[var(--surface-input)] px-4 py-3 font-black text-[var(--text-primary)] shadow-inner focus:outline-none focus:ring-4 focus:ring-[var(--accent-glow)]"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">Profile picture</span>
              <div className="rounded-[1.4rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
                <div className="flex items-center gap-4">
                  <div className="seat-avatar h-16 w-16 text-lg shadow-sm">
                    {registerForm.profilePicturePreview ? (
                      <img src={registerForm.profilePicturePreview || DEFAULT_REGISTER_PROFILE_PREVIEW} alt="" className="h-full w-full rounded-full object-cover" />
                    ) : (
                      <img src={DEFAULT_REGISTER_PROFILE_PREVIEW} alt="" className="h-full w-full rounded-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={(event) => handleRegisterImageChange('profilePictureFile', 'profilePicturePreview', 'Profile picture', event)}
                      className="block w-full text-sm font-semibold text-[var(--text-primary)] file:mr-4 file:rounded-full file:border-0 file:bg-[var(--surface-medium)] file:px-4 file:py-2 file:text-xs file:font-black file:uppercase file:tracking-[0.14em] file:text-[var(--text-primary)] hover:file:bg-[var(--surface-hover)]"
                    />
                    <p className="mt-2 text-xs font-semibold leading-6 text-[var(--text-secondary)]">
                      Optional. PNG, JPEG, WebP, or GIF up to 2 MB. If you skip this, the provided default profile picture will be used.
                    </p>
                  </div>
                </div>
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">Banner</span>
              <div className="rounded-[1.4rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
                <div className="space-y-3">
                  <div className="h-28 overflow-hidden rounded-[1.1rem] border border-[var(--glass-border)] bg-[var(--surface-medium)]">
                    {registerForm.bannerPreview ? (
                      <img src={registerForm.bannerPreview || DEFAULT_REGISTER_BANNER_PREVIEW} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <img src={DEFAULT_REGISTER_BANNER_PREVIEW} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(event) => handleRegisterImageChange('bannerFile', 'bannerPreview', 'Banner', event)}
                    className="block w-full text-sm font-semibold text-[var(--text-primary)] file:mr-4 file:rounded-full file:border-0 file:bg-[var(--surface-medium)] file:px-4 file:py-2 file:text-xs file:font-black file:uppercase file:tracking-[0.14em] file:text-[var(--text-primary)] hover:file:bg-[var(--surface-hover)]"
                  />
                  <p className="text-xs font-semibold leading-6 text-[var(--text-secondary)]">
                    Optional. PNG, JPEG, WebP, or GIF up to 2 MB. If you skip this, the provided default banner will be used.
                  </p>
                </div>
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">Description</span>
              <textarea
                value={registerForm.description}
                onChange={(event) => setRegisterForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Tell the table what kind of Rentz player you are."
                rows={4}
                className="w-full rounded-[1.25rem] border border-[var(--glass-border)] bg-[var(--surface-input)] px-4 py-3 font-semibold text-[var(--text-primary)] shadow-inner focus:outline-none focus:ring-4 focus:ring-[var(--accent-glow)]"
              />
            </label>

            <button type="submit" disabled={Boolean(authBusyAction)} className="frutiger-button w-full py-4 text-base disabled:cursor-not-allowed disabled:opacity-70 sm:text-lg">
              {authBusyAction === 'register' ? 'Creating account...' : 'Create account'}
            </button>
          </form>
        )}
      </section>
    );
  };

  const renderPlaceholderModule = (title, body) => (
    <div className="glass-panel min-h-[60vh] p-5 sm:p-8">
      <h3 className="mb-3 text-2xl font-display font-black text-[var(--text-primary)] sm:text-3xl">{title}</h3>
      <p className="max-w-2xl text-base font-semibold leading-7 text-[var(--text-secondary)] sm:text-sm">{body}</p>
    </div>
  );

  const renderGuideContent = () => (
    <div className="flex max-h-[85vh] flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between px-2">
        <h3 className="text-2xl font-display font-black text-[var(--text-primary)] sm:text-3xl">Ruleset Definition Guide</h3>
        <button onClick={() => setActiveTab('editor')} className="rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] px-5 py-2 text-sm font-black uppercase tracking-[0.18em] text-[var(--text-primary)] shadow-sm transition hover:bg-[var(--surface-hover)]">
          Back to Editor
        </button>
      </div>

      <div className="glass-panel flex-1 overflow-y-auto p-5 sm:p-8">
        <div className="space-y-8 text-sm font-medium leading-7 text-[var(--text-secondary)]">
          <section>
            <h4 className="mb-3 text-xl font-bold text-[var(--text-primary)]">Overview</h4>
            <p>The rules engine supports custom Rentz rules executed either <code>per_round</code> or <code>end_game</code>. Special variables are made available to your scripts at runtime.</p>
          </section>

          <section>
            <h4 className="mb-3 text-xl font-bold text-[var(--text-primary)]">Variables</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
                <strong className="text-base text-[var(--text-primary)]">PLAYER_COUNT</strong>
                <p className="mt-1 text-xs">How many active players are in the current match.</p>
              </div>
              <div className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
                <strong className="text-base text-[var(--text-primary)]">INITIAL_POINTS / POINTS / TOTAL_POINTS</strong>
                <p className="mt-1 text-xs">Starting score, current score, and the running total used by <code>end_game</code> rulesets.</p>
              </div>
              <div className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
                <strong className="text-base text-[var(--text-primary)]">CARD_NR</strong>
                <p className="mt-1 text-xs">How many cards are in the captured hand being evaluated.</p>
              </div>
              <div className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
                <strong className="text-base text-[var(--text-primary)]">[SUIT]_NR / TOTAL_[SUIT]_NR</strong>
                <p className="mt-1 text-xs">Suit counts in the captured hand and in the remaining non-discarded cards, for example <code>HEART_NR</code> or <code>TOTAL_SPADE_NR</code>.</p>
              </div>
              <div className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
                <strong className="text-base text-[var(--text-primary)]">[VALUE]_NR / TOTAL_[VALUE]_NR</strong>
                <p className="mt-1 text-xs">Value counts in the captured hand and in the remaining deck state, like <code>K_NR</code> or <code>TOTAL_10_NR</code>.</p>
              </div>
              <div className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
                <strong className="text-base text-[var(--text-primary)]">[SUIT]_[VALUE]</strong>
                <p className="mt-1 text-xs">Card-presence booleans such as <code>HEART_K</code> or <code>DIAMOND_Q</code>. Long aliases like <code>HEART_KING</code> also work.</p>
              </div>
            </div>
          </section>

          <section>
            <h4 className="mb-3 text-xl font-bold text-[var(--text-primary)]">Functions & Commands</h4>
            <ul className="space-y-4">
              <li className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
                <code className="rounded bg-[var(--surface-code-inline)] px-1 font-mono text-base font-bold text-[var(--text-primary)]">add(value)</code>
                <p className="mt-1">Adds the specified integer expression to the player's score.</p>
              </li>
              <li className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
                <code className="rounded bg-[var(--surface-code-inline)] px-1 font-mono text-base font-bold text-[var(--text-primary)]">set_to(value)</code>
                <p className="mt-1">Hardcodes the player's score directly to the specified expression.</p>
              </li>
              <li className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
                <code className="rounded bg-[var(--surface-code-inline)] px-1 font-mono text-base font-bold text-[var(--text-primary)]">reset_to(value)</code>
                <p className="mt-1">Only for <code>end_game</code> rulesets. Sets <code>TOTAL_POINTS</code> to the supplied value.</p>
              </li>
              <li className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
                <code className="rounded bg-[var(--surface-code-inline)] px-1 font-mono text-base font-bold text-[var(--text-primary)]">end()</code>
                <p className="mt-1">Stops evaluating the current ruleset immediately.</p>
              </li>
              <li className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
                <code className="rounded bg-[var(--surface-code-inline)] px-1 font-mono text-base font-bold text-[var(--text-primary)]">game_end()</code>
                <p className="mt-1">Only for <code>per_round</code> rulesets. Ends the overall match after this rule resolves.</p>
              </li>
            </ul>
          </section>

          <section>
            <h4 className="mb-3 text-xl font-bold text-[var(--text-primary)]">Control Flow & Logic</h4>
            <p className="mb-3">Standard logical branches are fully supported. Conditions must be wrapped in parentheses.</p>
            <ul className="list-inside list-disc space-y-2 pl-4">
              <li><strong>Statements:</strong> <code>if</code>, <code>elif</code>, <code>else</code>, <code>endif</code></li>
              <li><strong>Comparisons:</strong> <code>==</code>, <code>!=</code>, <code>&gt;</code>, <code>&lt;</code>, <code>&gt;=</code>, <code>&lt;=</code></li>
              <li><strong>Logical Operators:</strong> <code>and</code>, <code>or</code>, <code>not</code></li>
              <li><strong>Math Operators:</strong> <code>+</code>, <code>-</code>, <code>*</code>, <code>/</code></li>
            </ul>
          </section>

          <section>
            <h4 className="mb-3 text-xl font-bold text-[var(--text-primary)]">Comprehensive Example</h4>
            <pre className="overflow-x-auto rounded-[1.3rem] bg-slate-950/85 p-6 font-mono text-sm leading-relaxed text-lime-100 shadow-inner">
              {`if (HEART_KING)
  add(-100)
elif (HEART_NR > 0)
  add(HEART_NR * -20)
endif

if (CARD_NR == 0 and POINTS < -50)
  set_to(0)
  end()
endif

if (not DIAMOND_JACK)
  add(10)
else
  add(150)
endif

if (POINTS < -500)
  game_end()
endif`}
            </pre>
          </section>
        </div>
      </div>
    </div>
  );

  const renderForumComposer = ({
    draft,
    busy = false,
    onTextChange,
    onRulesetChange,
    onMediaChange,
    onClearMedia,
    onSubmit,
    submitLabel,
    placeholder,
    compact = false,
    onCancel = null,
    title = 'Share with Rentz Forum',
    description = 'Every post is public. Friend posts stay pinned above the broader community feed.'
  }) => {
    const attachmentOptions = Array.isArray(savedCustomRulesets) ? savedCustomRulesets : [];
    const attachedRuleset = attachmentOptions.find((option) => String(option.id) === String(draft.attachedRulesetIndex));

    return (
      <form
        onSubmit={onSubmit}
        className={clsx(
          'rounded-[1.8rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] shadow-[0_18px_36px_rgba(15,23,42,0.08)]',
          compact ? 'p-4 sm:p-5' : 'glass-panel p-5 sm:p-7'
        )}
      >
        <div className={clsx('space-y-5', compact ? 'space-y-4' : 'space-y-6')}>
          {!compact && (
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--text-secondary)]">Public thread post</div>
                <h3 className="mt-2 text-2xl font-display font-black text-[var(--text-primary)] sm:text-3xl">{title}</h3>
                <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[var(--text-secondary)]">{description}</p>
              </div>
              <div className="status-pill px-3 py-2">Public</div>
            </div>
          )}

          <div className={clsx(
            'grid gap-4 rounded-[1.55rem] border border-[var(--glass-border)] bg-[var(--surface-subtle)] p-4 sm:p-5',
            compact ? 'grid-cols-1' : 'sm:grid-cols-[auto_minmax(0,1fr)]'
          )}>
            <div className="flex justify-center sm:justify-start">
              <AvatarFace
                player={userProfile || { avatarUrl: DEFAULT_REGISTER_PROFILE_PREVIEW, name: 'You' }}
                alt="Your avatar"
                wrapperClassName={clsx('seat-avatar text-sm', compact ? 'h-12 w-12' : 'h-16 w-16')}
                imageClassName="h-full w-full rounded-full object-cover"
                fallbackClassName="flex h-full w-full items-center justify-center rounded-full"
              />
            </div>

            <div className="min-w-0 space-y-4">
              <label className="block">
                <span className="mb-2 block text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                  {submitLabel === 'Reply' ? 'Reply text' : 'Post text'}
                </span>
                <textarea
                  value={draft.text}
                  onChange={(event) => onTextChange(event.target.value)}
                  rows={compact ? 4 : 6}
                  placeholder={placeholder}
                  className="min-h-[9rem] w-full rounded-[1.45rem] border border-[var(--glass-border)] bg-[var(--surface-input)] px-4 py-3 text-sm font-semibold leading-6 text-[var(--text-primary)] outline-none transition focus:ring-4 focus:ring-[var(--accent-glow)]"
                />
              </label>

              {draft.mediaPreview && (
                <div className="overflow-hidden rounded-[1.45rem] border border-[var(--glass-border)] bg-[var(--surface-medium)]">
                  <img src={draft.mediaPreview} alt="" className="max-h-[22rem] w-full object-cover" />
                  <div className="flex items-center justify-between gap-3 border-t border-[var(--glass-border)] p-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">Attached image / gif</div>
                    <button
                      type="button"
                      onClick={onClearMedia}
                      className="rounded-full border border-[var(--glass-border)] bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
                    >
                      Remove media
                    </button>
                  </div>
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--text-secondary)]">Attach custom ruleset</span>
                  <select
                    value={draft.attachedRulesetIndex}
                    onChange={(event) => onRulesetChange(event.target.value)}
                    className="w-full rounded-[1.2rem] border border-[var(--glass-border)] bg-[var(--surface-input)] px-4 py-3 text-sm font-black text-[var(--text-primary)] outline-none focus:ring-4 focus:ring-[var(--accent-glow)]"
                  >
                    <option value="">No ruleset</option>
                    {attachmentOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {(option.label || option.title || 'Untitled Ruleset')}
                        {option.abbreviation ? ` (${option.abbreviation})` : ''}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 text-xs font-semibold leading-6 text-[var(--text-secondary)]">
                    {attachmentOptions.length === 0
                      ? 'Save a custom ruleset from the editor or forum to attach it here. Built-in rulesets are not attachable.'
                      : attachedRuleset
                        ? `Selected: ${attachedRuleset.label || attachedRuleset.title || 'Untitled Ruleset'}`
                        : 'Only custom rulesets can be attached to forum posts and replies.'}
                  </div>
                </label>

                <div className="rounded-[1.25rem] border border-[var(--glass-border)] bg-[var(--surface-input)] p-4">
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--text-secondary)]">Media upload</div>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm font-semibold leading-6 text-[var(--text-secondary)]">
                      PNG, JPEG, WebP, or GIF up to 4 MB.
                    </div>
                    <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-[1.2rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]">
                      <ImagePlus className="h-4 w-4" />
                      {draft.mediaPreview ? 'Replace media' : 'Add image / gif'}
                      <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif" onChange={onMediaChange} className="hidden" />
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t border-[var(--glass-border)] pt-4 sm:flex-row sm:justify-end">
                {onCancel && (
                  <button
                    type="button"
                    onClick={onCancel}
                    className="rounded-[1.2rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={busy}
                  className="frutiger-button inline-flex min-w-[10rem] items-center justify-center gap-2 px-5 py-3 text-sm uppercase tracking-[0.14em] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <SendHorizontal className="h-4 w-4" />
                  {busy ? 'Posting...' : submitLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>
    );
  };

  const renderForumUserPreviewCard = (entry, { eyebrow = 'User result' } = {}) => (
    <button
      key={entry.userId}
      type="button"
      onClick={() => void openPlayerProfileModal(entry)}
      className="overflow-hidden rounded-[1.7rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] text-left shadow-[0_14px_32px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:bg-[var(--surface-medium)]"
    >
      <div className="h-28 w-full bg-[var(--surface-medium)]">
        {entry.banner ? (
          <img src={entry.banner} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="relative p-5">
        <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-secondary)]">{eyebrow}</div>
        <div className="-mt-1 flex items-end gap-4">
          <AvatarFace
            player={entry}
            alt={`${getPlayerName(entry)} avatar`}
            wrapperClassName="seat-avatar h-20 w-20 text-lg border-4 border-white/80 bg-white"
            imageClassName="h-full w-full rounded-full object-cover"
            fallbackClassName="flex h-full w-full items-center justify-center rounded-full"
          />
          <div className="min-w-0 pb-2">
            <div className="truncate text-xl font-black text-[var(--text-primary)]">{getPlayerName(entry)}</div>
            <div className="mt-1 inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]">
              ELO {getPlayerRating(entry) == null ? '--' : getPlayerRating(entry)}
            </div>
          </div>
        </div>
      </div>
    </button>
  );

  const renderForumRatingControl = (entry) => {
    if (!entry?.attachedRuleset) {
      return null;
    }

    const viewerRating = Number(entry.attachedRuleset.viewerRating || 0);
    const previewRating = forumRatingPreview?.postId === entry.id
      ? Number(forumRatingPreview.value || 0)
      : null;
    const displayRating = previewRating ?? viewerRating;
    const ratingBusy = forumActionBusyKey === `${entry.id}:rate-ruleset`;

    return (
      <div
        className="flex flex-wrap items-center justify-end gap-3 sm:flex-nowrap"
        onMouseLeave={() => setForumRatingPreview((current) => (current?.postId === entry.id ? null : current))}
      >
        <span className="shrink-0 whitespace-nowrap text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">
          {displayRating > 0 ? `${displayRating.toFixed(1)} stars` : 'Rate'}
        </span>
        <div className="flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2 py-1.5 shadow-[0_4px_12px_rgba(15,23,42,0.08)]">
          {Array.from({ length: 5 }, (_value, index) => {
            const fill = clampNumber(displayRating - index, 0, 1);
            const leftValue = index + 0.5;
            const rightValue = index + 1;

            return (
              <div key={`${entry.id}-star-${index}`} className="relative h-9 w-9">
                <svg viewBox="0 0 24 24" className="absolute inset-0 h-9 w-9 text-slate-300" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M12 2.25l2.92 5.92 6.53.95-4.72 4.6 1.12 6.51L12 17.16l-5.85 3.07 1.12-6.51-4.72-4.6 6.53-.95L12 2.25z"
                  />
                </svg>
                <div
                  className="absolute inset-y-0 left-0 overflow-hidden"
                  style={{ width: `${fill * 100}%` }}
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 24 24" className="h-9 w-9 text-amber-500">
                    <path
                      fill="currentColor"
                      d="M12 2.25l2.92 5.92 6.53.95-4.72 4.6 1.12 6.51L12 17.16l-5.85 3.07 1.12-6.51-4.72-4.6 6.53-.95L12 2.25z"
                    />
                  </svg>
                </div>
                <button
                  type="button"
                  disabled={ratingBusy}
                  onMouseEnter={() => setForumRatingPreview({ postId: entry.id, value: leftValue })}
                  onFocus={() => setForumRatingPreview({ postId: entry.id, value: leftValue })}
                  onTouchStart={() => setForumRatingPreview({ postId: entry.id, value: leftValue })}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleForumRateRuleset(entry.id, leftValue);
                  }}
                  className="absolute inset-y-0 left-0 w-1/2 rounded-l-full disabled:cursor-not-allowed"
                  aria-label={`Rate ${leftValue} stars`}
                />
                <button
                  type="button"
                  disabled={ratingBusy}
                  onMouseEnter={() => setForumRatingPreview({ postId: entry.id, value: rightValue })}
                  onFocus={() => setForumRatingPreview({ postId: entry.id, value: rightValue })}
                  onTouchStart={() => setForumRatingPreview({ postId: entry.id, value: rightValue })}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleForumRateRuleset(entry.id, rightValue);
                  }}
                  className="absolute inset-y-0 right-0 w-1/2 rounded-r-full disabled:cursor-not-allowed"
                  aria-label={`Rate ${rightValue} stars`}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderForumRulesetAttachment = (entry, { compact = false } = {}) => {
    if (!entry?.attachedRuleset) {
      return null;
    }

    const creator = entry.attachedRuleset.originalCreator;
    const previewBusy = forumActionBusyKey === `${entry.id}:preview-ruleset`;
    const copyBusy = forumActionBusyKey === `${entry.id}:copy-ruleset`;
    const saveBusy = forumActionBusyKey === `${entry.id}:save-ruleset`;

    const actionButtons = (
      <>
        <button
          type="button"
          disabled={previewBusy}
          onClick={(event) => {
            event.stopPropagation();
            void handleForumPreviewRuleset(entry.id);
          }}
          className="rounded-[1rem] border border-slate-300 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {previewBusy ? 'Opening...' : 'Preview Ruleset'}
        </button>
        <button
          type="button"
          disabled={copyBusy}
          onClick={(event) => {
            event.stopPropagation();
            void handleForumCopyRulesetToEditor(entry.id);
          }}
          className="rounded-[1rem] border border-slate-300 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {copyBusy ? 'Copying...' : 'Copy to Editor'}
        </button>
        <button
          type="button"
          disabled={saveBusy}
          onClick={(event) => {
            event.stopPropagation();
            openForumRulesetSaveChoice(entry);
          }}
          className="rounded-[1rem] border border-emerald-300 bg-emerald-100 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-emerald-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saveBusy ? 'Saving...' : 'Save to Profile'}
        </button>
      </>
    );

    return (
      <div className="group relative mt-4 overflow-hidden rounded-[1.55rem] border border-[var(--glass-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.92)_0%,rgba(233,240,247,0.96)_100%)] p-5 shadow-[0_16px_36px_rgba(15,23,42,0.12)]">
        <div className={compact ? '' : 'pr-24'}>
          <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-500">Attached ruleset</div>
          <div className="mt-3 text-xl font-black text-slate-950 sm:text-[1.75rem]">{entry.attachedRuleset.label}</div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-700">
            {entry.attachedRuleset.abbreviation && (
              <span className="rounded-full border border-slate-300 bg-white px-3 py-1">{entry.attachedRuleset.abbreviation}</span>
            )}
            <span className="rounded-full border border-slate-300 bg-white/70 px-3 py-1">
              {entry.attachedRuleset.type === 'end_game' ? 'End Game' : 'Per Round'}
            </span>
          </div>

          {creator && (
            <div className="mt-4 flex items-center gap-3 rounded-[1.15rem] border border-slate-300/80 bg-white/70 px-3 py-2.5">
              <AvatarFace
                player={creator}
                alt={`${getPlayerName(creator)} avatar`}
                wrapperClassName="seat-avatar h-10 w-10 text-xs border border-white/90 bg-white"
                imageClassName="h-full w-full rounded-full object-cover"
                fallbackClassName="flex h-full w-full items-center justify-center rounded-full"
              />
              <div className="min-w-0">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-500">Original creator</div>
                <div className="truncate text-sm font-black text-slate-900">Created by {getPlayerName(creator)}</div>
              </div>
            </div>
          )}
        </div>

        {!compact && (
          <>
            <div className="hidden gap-2 md:absolute md:right-4 md:top-4 md:flex md:flex-col md:opacity-0 md:transition md:group-hover:opacity-100">
              {actionButtons}
            </div>
            <div className="mt-5 flex flex-wrap gap-2 md:hidden">
              {actionButtons}
            </div>
          </>
        )}

        <div className={clsx('mt-5 flex items-end justify-between gap-3', compact && 'mt-4')}>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-slate-700">
            <Star className="h-3.5 w-3.5 fill-current" />
            {formatForumRatingLabel(entry.attachedRuleset.averageRating)}
          </div>

          {!compact && (
            <div className="max-w-full sm:pl-3">
              {renderForumRatingControl(entry)}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderForumEntryCard = (entry, {
    compact = false,
    depth = 0,
    interactive = true,
    showReplies = false,
    switchTabOnOpen = false
  } = {}) => {
    if (!entry) {
      return null;
    }

    const actionBusy = (action) => forumActionBusyKey === `${entry.id}:${action}`;
    const rating = getPlayerRating(entry.author);
    const showMetadata = !compact;
    const isDeleted = Boolean(entry.isDeleted);
    const isOwner = getPlayerUserId(entry.author) && getPlayerUserId(entry.author) === String(userProfile?.userId || '');

    const openThread = () => {
      if (!interactive || !entry.id) {
        return;
      }

      void loadForumThread(entry.id, { switchTab: switchTabOnOpen });
    };

    return (
      <article
        key={`${entry.id}-${compact ? 'compact' : 'full'}`}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        onClick={openThread}
        onKeyDown={interactive
          ? (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openThread();
            }
          }
          : undefined}
        className={clsx(
          'rounded-[1.8rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 text-left shadow-[0_14px_32px_rgba(15,23,42,0.08)] transition sm:p-5',
          interactive && 'cursor-pointer hover:-translate-y-0.5 hover:bg-[var(--surface-medium)]',
          depth > 0 && 'ml-2 sm:ml-4'
        )}
      >
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void openPlayerProfileModal(entry.author);
            }}
            className="shrink-0 text-left"
            title={`View ${getPlayerName(entry.author)}'s profile`}
          >
            <AvatarFace
              player={entry.author}
              alt={`${getPlayerName(entry.author)} avatar`}
              wrapperClassName={clsx('seat-avatar text-sm', compact ? 'h-11 w-11' : 'h-14 w-14')}
              imageClassName="h-full w-full rounded-full object-cover"
              fallbackClassName="flex h-full w-full items-center justify-center rounded-full"
            />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void openPlayerProfileModal(entry.author);
                  }}
                  className="truncate text-left text-lg font-black text-[var(--text-primary)] transition hover:opacity-80"
                >
                  {getPlayerName(entry.author)}
                </button>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] px-3 py-1">
                    ELO {rating == null ? '--' : rating}
                  </span>
                  {showMetadata && <span>{formatForumTimestamp(entry.createdAt)}</span>}
                  {showMetadata && entry.isFriendAuthor && (
                    <span className="rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-emerald-950">
                      Friend post
                    </span>
                  )}
                </div>
              </div>

              {!compact && isOwner && !isDeleted && (
                <button
                  type="button"
                  disabled={actionBusy('delete')}
                  onClick={(event) => {
                    event.stopPropagation();
                    setForumDeleteTarget(entry);
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-red-900 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <Trash2 className="h-4 w-4" />
                  {actionBusy('delete') ? 'Deleting...' : 'Delete'}
                </button>
              )}
            </div>

            {isDeleted ? (
              <div className="mt-4 rounded-[1.35rem] border border-dashed border-[var(--glass-border)] bg-[var(--surface-subtle)] px-4 py-3 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
                This post was deleted.
              </div>
            ) : entry.text && (
              <div className={clsx(
                'mt-4 whitespace-pre-wrap break-words font-semibold text-[var(--text-primary)]',
                compact ? 'text-sm leading-6' : 'text-base leading-7'
              )}
              >
                {entry.text}
              </div>
            )}

            {!isDeleted && entry.media?.url && (
              <div className="mt-4 overflow-hidden rounded-[1.55rem] border border-[var(--glass-border)] bg-[var(--surface-subtle)]">
                <img src={entry.media.url} alt="" className="max-h-[34rem] w-full object-cover" />
              </div>
            )}

            {!isDeleted && renderForumRulesetAttachment(entry, { compact })}

            {!compact && !isDeleted && (
              <div className="mt-5 flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                <button
                  type="button"
                  disabled={actionBusy('like')}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleForumEntryAction(entry.id, 'like', {
                      loginPrompt: 'Log in to like Rentz Forum posts.'
                    });
                  }}
                  className={clsx(
                    'inline-flex items-center gap-2 rounded-full border px-3 py-2 transition disabled:cursor-not-allowed disabled:opacity-70',
                    entry.likedByViewer
                      ? 'border-rose-200 bg-rose-100 text-rose-900'
                      : 'border-[var(--glass-border)] bg-[var(--surface-medium)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                  )}
                >
                  <Heart className={clsx('h-4 w-4', entry.likedByViewer && 'fill-current')} />
                  Like {entry.likeCount > 0 ? entry.likeCount : ''}
                </button>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setForumReplyTarget(entry);
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] px-3 py-2 text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
                >
                  <MessageCircle className="h-4 w-4" />
                  Comment {entry.replyCount > 0 ? entry.replyCount : ''}
                </button>

                <button
                  type="button"
                  disabled={actionBusy('bookmark')}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleForumEntryAction(entry.id, 'bookmark', {
                      loginPrompt: 'Log in to save Rentz Forum posts.'
                    });
                  }}
                  className={clsx(
                    'inline-flex items-center gap-2 rounded-full border px-3 py-2 transition disabled:cursor-not-allowed disabled:opacity-70',
                    entry.bookmarkedByViewer
                      ? 'border-amber-200 bg-amber-100 text-amber-950'
                      : 'border-[var(--glass-border)] bg-[var(--surface-medium)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                  )}
                >
                  <Bookmark className={clsx('h-4 w-4', entry.bookmarkedByViewer && 'fill-current')} />
                  Save {entry.bookmarkCount > 0 ? entry.bookmarkCount : ''}
                </button>
              </div>
            )}
          </div>
        </div>

        {!compact && showReplies && (entry.replies || []).length > 0 && (
          <div className="mt-5 space-y-3 border-t border-[var(--glass-border)] pt-4">
            {(entry.replies || []).map((reply) => renderForumEntryCard(reply, {
              depth: depth + 1,
              showReplies: true
            }))}
          </div>
        )}
      </article>
    );
  };

  const renderSavedRulesetCard = (ruleset) => (
    <div key={ruleset.id} className="rounded-[1.55rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 shadow-[0_14px_30px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-lg font-black text-[var(--text-primary)]">{ruleset.label || ruleset.title || 'Untitled Ruleset'}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]">
            {ruleset.abbreviation && (
              <span className="rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] px-3 py-1">{ruleset.abbreviation}</span>
            )}
            <span className="rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] px-3 py-1">
              {ruleset.type === 'end_game' ? 'End Game' : 'Per Round'}
            </span>
          </div>
        </div>
        <div className="inline-flex items-center gap-1 rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]">
          <Star className="h-3.5 w-3.5" />
          {formatForumRatingLabel(ruleset.averageRating)}
        </div>
      </div>

      {ruleset.originalCreator && (
        <div className="mt-4 flex items-center gap-3 rounded-[1.15rem] border border-[var(--glass-border)] bg-[var(--surface-subtle)] px-3 py-2.5">
          <AvatarFace
            player={ruleset.originalCreator}
            alt={`${getPlayerName(ruleset.originalCreator)} avatar`}
            wrapperClassName="seat-avatar h-10 w-10 text-xs"
            imageClassName="h-full w-full rounded-full object-cover"
            fallbackClassName="flex h-full w-full items-center justify-center rounded-full"
          />
          <div className="min-w-0">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Original creator</div>
            <div className="truncate text-sm font-black text-[var(--text-primary)]">{getPlayerName(ruleset.originalCreator)}</div>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setRulesetPreview({
            label: ruleset.label || ruleset.title,
            abbreviation: ruleset.abbreviation || ruleset.shortName,
            type: ruleset.type,
            code: ruleset.code
          })}
          className="rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
        >
          Preview
        </button>
        <button
          type="button"
          onClick={() => populateEditorFromRuleset({
            longName: ruleset.label || ruleset.title,
            shortName: ruleset.abbreviation || ruleset.shortName,
            type: ruleset.type,
            code: ruleset.code
          }, {
            linkedRoomRulesetId: null,
            switchToEditor: true
          })}
          className="rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
        >
          Open in Editor
        </button>
      </div>
    </div>
  );

  const renderBanNoticeModal = () => {
    if (!banNoticeModal) {
      return null;
    }

    return (
      <ModalShell
        title={banNoticeModal.title || 'Removed From Game'}
        eyebrow="Ban notice"
        onClose={() => setBanNoticeModal(null)}
        footer={(
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setBanNoticeModal(null)}
              className="frutiger-button px-5 py-3 text-sm uppercase tracking-[0.14em]"
            >
              Okay
            </button>
          </div>
        )}
      >
        <p className="text-sm font-semibold leading-7 text-[var(--text-secondary)]">
          {banNoticeModal.message || 'You were banned from this game. You cannot rejoin it.'}
        </p>
      </ModalShell>
    );
  };

  const renderRoomStartBlockedModal = () => {
    if (!roomStartBlockedModal) {
      return null;
    }

    const waitingPlayers = Array.isArray(roomStartBlockedModal.playerNames)
      ? roomStartBlockedModal.playerNames
      : [];

    return (
      <ModalShell
        title="A Player Is Not Ready"
        eyebrow="Start blocked"
        onClose={() => setRoomStartBlockedModal(null)}
        panelClassName="max-w-2xl"
        footer={(
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setRoomStartBlockedModal(null)}
              className="rounded-[1.3rem] border border-rose-200/80 bg-rose-100/90 px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-rose-950 transition hover:bg-rose-200/85"
            >
              Dismiss
            </button>
          </div>
        )}
      >
        <div className="space-y-4">
          <div className="rounded-[1.5rem] border border-rose-200/80 bg-[linear-gradient(180deg,rgba(255,244,246,0.98)_0%,rgba(254,205,211,0.9)_100%)] p-5 shadow-[0_22px_44px_rgba(225,29,72,0.16)]">
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-rose-800">Cannot start yet</div>
            <p className="mt-3 text-base font-black leading-7 text-rose-950 sm:text-lg">
              Everyone in the active player list must ready up before the host can start the match.
            </p>
          </div>

          <div className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
              Waiting on {waitingPlayers.length === 1 ? 'this player' : 'these players'}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {waitingPlayers.length > 0 ? waitingPlayers.map((playerName) => (
                <span
                  key={playerName}
                  className="inline-flex rounded-full border border-rose-200/80 bg-white/92 px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-rose-900"
                >
                  {playerName}
                </span>
              )) : (
                <span className="text-sm font-semibold text-[var(--text-secondary)]">
                  One or more players are still marked as waiting.
                </span>
              )}
            </div>
          </div>
        </div>
      </ModalShell>
    );
  };

  const renderLeaveMatchConfirmModal = () => {
    if (!leaveMatchConfirmModal) {
      return null;
    }

    return (
      <ModalShell
        title={leaveMatchConfirmModal.title || 'Abandon Match'}
        eyebrow="Confirm action"
        onClose={() => setLeaveMatchConfirmModal(null)}
        footer={(
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setLeaveMatchConfirmModal(null)}
              className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmLeaveMatch}
              disabled={trainingReturnBusy}
              className="rounded-[1.3rem] border border-red-200/80 bg-red-100/85 px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-red-950 transition hover:bg-red-200/80 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {trainingReturnBusy
                ? 'Working...'
                : (leaveMatchConfirmModal.confirmLabel || 'Abandon Match')}
            </button>
          </div>
        )}
      >
        <p className="text-sm font-semibold leading-7 text-[var(--text-secondary)]">
          {leaveMatchConfirmModal.message}
        </p>
      </ModalShell>
    );
  };

  const renderTrainingFinalReviewModal = () => {
    if (!isTrainingMatch || !trainingFinalReview || !trainerPlayer) {
      return null;
    }

    return (
      <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/75 px-4 py-6 backdrop-blur-[2px]">
        <div className="relative z-10 w-full max-w-3xl">
          <div className="flex flex-col items-center gap-6">
            <div className="flex w-full items-end justify-center gap-4">
              <AvatarFace
                player={trainerPlayer}
                alt={`${getPlayerName(trainerPlayer)} avatar`}
                wrapperClassName="seat-avatar h-16 w-16 shrink-0 border-4 border-white/80 text-lg shadow-[0_14px_30px_rgba(15,23,42,0.18)] sm:h-20 sm:w-20"
                imageClassName="h-full w-full rounded-full object-cover"
                fallbackClassName="flex h-full w-full items-center justify-center rounded-full"
              />
              <div className="relative w-full max-w-2xl rounded-[1.8rem] border border-white/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(236,248,255,0.94)_100%)] px-5 py-4 text-left shadow-[0_26px_54px_rgba(15,23,42,0.16)] sm:px-6 sm:py-5">
                <span className="absolute -left-2.5 bottom-5 h-5 w-5 rotate-45 rounded-[0.3rem] border-l border-b border-white/85 bg-inherit" aria-hidden="true" />
                <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                  {getPlayerName(trainerPlayer)}
                </div>
                <div className="mt-2 text-base font-semibold leading-7 text-[var(--text-primary)] sm:text-lg">
                  {trainingFinalReview.review}
                </div>
              </div>
            </div>

            <div className="flex w-full justify-center" aria-label="Trainer final star rating">
              <div className="inline-flex items-center justify-center gap-2.5 rounded-full bg-slate-950/35 px-4 py-2.5 shadow-[0_18px_42px_rgba(0,0,0,0.28)] sm:gap-3 sm:px-5">
                {Array.from({ length: 5 }).map((_, index) => {
                  const starValue = index + 1;
                  const fillPercent = trainingFinalReview.starRating >= starValue
                    ? 100
                    : trainingFinalReview.starRating >= starValue - 0.5
                      ? 50
                      : 0;

                  return (
                    <div key={`training-review-star-${starValue}`} className="relative h-9 w-9 shrink-0 sm:h-11 sm:w-11">
                      <Star className="h-full w-full text-white/35" />
                      <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fillPercent}%` }}>
                        <Star fill="currentColor" className="h-full w-full text-amber-400 drop-shadow-[0_4px_12px_rgba(245,158,11,0.45)]" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              disabled={trainingReturnBusy}
              onClick={handleReturnToPlayFromTrainingReview}
              className="rounded-[1.45rem] border border-emerald-100/90 bg-[linear-gradient(180deg,rgba(245,255,240,0.98)_0%,rgba(181,245,138,0.96)_48%,rgba(46,124,69,0.98)_100%)] px-6 py-3.5 text-sm font-black uppercase tracking-[0.16em] text-emerald-950 shadow-[inset_0_2px_4px_rgba(255,255,255,0.92),0_18px_36px_rgba(52,148,73,0.28)] transition hover:-translate-y-0.5 hover:brightness-[1.03] disabled:cursor-not-allowed disabled:opacity-70 sm:text-base"
            >
              {trainingReturnBusy ? 'Returning...' : 'Return to Play'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderSavedGameRulesetTableModal = () => {
    if (!savedGameRulesetTableModal) {
      return null;
    }

    const playersInSavedGame = Array.isArray(savedGameRulesetTableModal.players)
      ? savedGameRulesetTableModal.players
      : [];
    const availableRulesets = Array.isArray(savedGameRulesetTableModal.availableRulesets)
      ? savedGameRulesetTableModal.availableRulesets
      : [];
    const selectedRulesets = savedGameRulesetTableModal.selectedRulesets || {};
    const usedChoices = savedGameRulesetTableModal.usedChoices || {};

    return (
      <ModalShell
        title={savedGameRulesetTableModal.roomName || 'Saved Game'}
        eyebrow="Saved ruleset table"
        wide
        panelClassName="max-w-5xl"
        onClose={() => setSavedGameRulesetTableModal(null)}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="status-pill px-4 py-2">Rounds finished {savedGameRulesetTableModal.roundsFinished || 0}</div>
            <div className="status-pill px-4 py-2">
              Leader {savedGameRulesetTableModal.leaderName || 'No leader yet'}
              {typeof savedGameRulesetTableModal.leaderPoints === 'number' ? ` • ${savedGameRulesetTableModal.leaderPoints} pts` : ''}
            </div>
          </div>

          {availableRulesets.length === 0 ? (
            <div className="rounded-[1.35rem] border border-dashed border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 text-sm font-semibold text-[var(--text-secondary)]">
              No saved ruleset table is available for this game.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[1.4rem] border border-[var(--glass-border)] bg-[var(--surface-soft)]">
              <table className="min-w-full rentz-ruleset-table">
                <thead>
                  <tr>
                    <th className="rentz-ruleset-header-cell text-left">Ruleset</th>
                    <th className="rentz-ruleset-header-cell text-center">Enabled</th>
                    {playersInSavedGame.map((player) => (
                      <th
                        key={player.userId}
                        className="rentz-ruleset-header-cell text-center"
                        data-short-label={getPlayerInitials(player)}
                        title={getPlayerName(player)}
                      >
                        <span className="rentz-ruleset-player-name">{getPlayerName(player)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {availableRulesets.map((rule) => (
                    <tr key={rule.id}>
                      <th className="rentz-ruleset-row-header text-left">
                        <div className="text-lg font-black text-[var(--text-primary)]">{rule.abbreviation || rule.label}</div>
                        <div className="text-xs font-bold text-[var(--text-secondary)]">{rule.label}</div>
                      </th>
                      <td className="text-center">
                        {selectedRulesets[rule.id] !== false ? (
                          <span className="inline-flex rounded-full bg-emerald-100/85 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-900">
                            Enabled
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-slate-200/85 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-700">
                            Off
                          </span>
                        )}
                      </td>
                      {playersInSavedGame.map((player) => {
                        const alreadyUsed = Boolean(usedChoices?.[player.userId]?.[rule.id]);
                        return (
                          <td key={`${player.userId}-${rule.id}`} className="text-center">
                            {alreadyUsed ? (
                              <span className="inline-flex rounded-full bg-amber-100/85 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-amber-900">
                                Used
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-sky-100/80 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-sky-900">
                                Open
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </ModalShell>
    );
  };

  const renderSavedGameCard = (savedGame) => {
    const busy = librarySavedGameBusyId === savedGame.id;
    const savedPlayers = Array.isArray(savedGame.players) ? savedGame.players : [];

    return (
      <article key={savedGame.id} className="rounded-[1.45rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 shadow-[0_18px_36px_rgba(0,0,0,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-display font-black text-[var(--text-primary)]">{savedGame.roomName || 'Saved Match'}</div>
            <div className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
              Saved {formatForumTimestamp(savedGame.savedAt)}
            </div>
          </div>
          <div className="status-pill px-3 py-2">
            {savedGame.roundsFinished || 0} rounds finished
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[1.15rem] border border-[var(--glass-border)] bg-[var(--surface-subtle)] px-4 py-3">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Current leader</div>
            <div className="mt-2 text-base font-black text-[var(--text-primary)]">
              {savedGame.leaderName || 'No leader yet'}
            </div>
            <div className="text-sm font-semibold text-[var(--text-secondary)]">
              {typeof savedGame.leaderPoints === 'number' ? `${savedGame.leaderPoints} points` : 'No points yet'}
            </div>
          </div>
          <div className="rounded-[1.15rem] border border-[var(--glass-border)] bg-[var(--surface-subtle)] px-4 py-3">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Seats</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {savedPlayers.map((player) => (
                <span
                  key={player.userId}
                  className="inline-flex rounded-full border border-[var(--glass-border)] bg-white/85 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--text-primary)]"
                >
                  {getPlayerName(player)}
                  {player.isBot ? ' • AI' : player.guest ? ' • guest' : ''}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => handleResumeSavedGame(savedGame.id)}
            className="frutiger-button px-4 py-3 text-sm uppercase tracking-[0.14em] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {busy ? 'Working...' : 'Resume'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => handleEndSavedGame(savedGame.id)}
            className="rounded-[1.15rem] border border-rose-200/80 bg-rose-100/85 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-rose-950 transition hover:bg-rose-200/80 disabled:cursor-not-allowed disabled:opacity-70"
          >
            End Saved Game
          </button>
          <button
            type="button"
            onClick={() => setSavedGameRulesetTableModal(savedGame)}
            className="rounded-[1.15rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
          >
            Ruleset Table
          </button>
        </div>
      </article>
    );
  };

  const renderMatchHistoryCard = (entry) => {
    const viewerUserId = activeProfile?.userId;
    const standings = Array.isArray(entry.standings) ? entry.standings : [];
    const viewerSummary = entry.viewerSummary || null;
    const shouldShowRankShift = Boolean(
      viewerSummary?.rankChanged
      && viewerSummary.previousRankName
      && viewerSummary.nextRankName
      && viewerSummary.previousRankName !== viewerSummary.nextRankName
    );

    return (
      <article key={entry.id} className="rounded-[1.45rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 shadow-[0_18px_36px_rgba(0,0,0,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-display font-black text-[var(--text-primary)]">{entry.roomName || 'Rentz Match'}</div>
            <div className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
              Completed {formatForumTimestamp(entry.completedAt)}
            </div>
          </div>
          <div className="status-pill px-3 py-2">{entry.roundsPlayed || 0} rounds</div>
        </div>

        {viewerSummary ? (
          <div className={clsx('mt-4 grid gap-3', shouldShowRankShift ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
            <div className="rounded-[1.15rem] border border-[var(--glass-border)] bg-[var(--surface-subtle)] px-4 py-3">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Your finish</div>
              <div className="mt-2 text-2xl font-black text-[var(--text-primary)]">#{viewerSummary.finalRank || '--'}</div>
            </div>
            <div className="rounded-[1.15rem] border border-[var(--glass-border)] bg-[var(--surface-subtle)] px-4 py-3">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-secondary)]">ELO change</div>
              <div className={clsx('mt-2 text-2xl font-black', (viewerSummary.eloDelta || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700')}>
                {(viewerSummary.eloDelta || 0) >= 0 ? '+' : ''}{viewerSummary.eloDelta || 0}
              </div>
            </div>
            {shouldShowRankShift ? (
              <div className="rounded-[1.15rem] border border-[var(--glass-border)] bg-[var(--surface-subtle)] px-4 py-3">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Rank shift</div>
                <div className="mt-2 text-sm font-black leading-6 text-[var(--text-primary)]">
                  {viewerSummary.previousRankName} → {viewerSummary.nextRankName}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          {standings.map((standing) => {
            const isViewer = Boolean(viewerUserId && standing.userId === viewerUserId);
            const isWinner = standing.finalRank === 1 || standing.userId === entry.winnerUserId;

            return (
              <div
                key={`${entry.id}-${standing.userId}-${standing.finalRank}`}
                className={clsx(
                  'flex items-center gap-3 rounded-[1.1rem] border px-4 py-3',
                  isWinner
                    ? 'border-amber-200/80 bg-amber-100/80'
                    : isViewer
                      ? 'border-sky-200/80 bg-sky-100/70'
                      : 'border-[var(--glass-border)] bg-[var(--surface-subtle)]'
                )}
              >
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-sm font-black text-[var(--text-primary)]">
                  #{standing.finalRank || '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-black text-[var(--text-primary)]">
                    {standing.name || 'Player'}
                    {isViewer ? ' (You)' : ''}
                    {standing.isBot ? ' • AI' : standing.guest ? ' • guest' : ''}
                  </div>
                  <div className="text-xs font-bold text-[var(--text-secondary)]">
                    {standing.points || 0} points • {(standing.tricksWon || 0)} tricks
                  </div>
                </div>
                {isWinner ? (
                  <div className="inline-flex rounded-full bg-amber-200/90 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-amber-950">
                    Winner
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </article>
    );
  };

  const renderLibraryContent = () => {
    if (!isAuthenticated) {
      return renderPlaceholderModule(
        'Library',
        'Log in to see saved custom rulesets, bookmarked Rentz Forum ruleset previews, saved matches, and your match history.'
      );
    }

    return (
      <div className="space-y-5">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void loadLibraryData()}
            disabled={libraryState.loading}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-70"
            title="Refresh library"
          >
            <RefreshCw className={clsx('h-4 w-4', libraryState.loading && 'animate-spin')} />
            Refresh Library
          </button>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
          <div className="grid gap-5">
            <section className="glass-panel p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h4 className="text-xl font-display font-black text-[var(--text-primary)] sm:text-2xl">Saved Rulesets</h4>
                <div className="text-xs font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                  {libraryState.savedRulesets.length} saved
                </div>
              </div>
              {libraryState.loading && libraryState.savedRulesets.length === 0 ? (
                <div className="rounded-[1.35rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 text-sm font-semibold text-[var(--text-secondary)]">
                  Loading saved rulesets...
                </div>
              ) : libraryState.savedRulesets.length === 0 ? (
                <div className="rounded-[1.35rem] border border-dashed border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 text-sm font-semibold leading-7 text-[var(--text-secondary)]">
                  Save a custom ruleset from the editor or from a forum attachment to see it here.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {libraryState.savedRulesets.map((ruleset) => renderSavedRulesetCard(ruleset))}
                </div>
              )}
            </section>

            <div className="grid gap-5 md:grid-cols-2">
              <section className="glass-panel p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h4 className="text-xl font-display font-black text-[var(--text-primary)] sm:text-2xl">Match History</h4>
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                    {libraryState.matchHistory.length} matches
                  </div>
                </div>
                {libraryState.loading && libraryState.matchHistory.length === 0 ? (
                  <div className="rounded-[1.35rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 text-sm font-semibold text-[var(--text-secondary)]">
                    Loading match history...
                  </div>
                ) : libraryState.matchHistory.length === 0 ? (
                  <div className="rounded-[1.35rem] border border-dashed border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 text-sm font-semibold leading-7 text-[var(--text-secondary)]">
                    Completed ranked matches will appear here with your finish, ELO movement, and rank changes.
                  </div>
                ) : (
                  <div className="max-h-[30rem] space-y-4 overflow-y-auto pr-1">
                    {libraryState.matchHistory.map((entry) => renderMatchHistoryCard(entry))}
                  </div>
                )}
              </section>

              <section className="glass-panel p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h4 className="text-xl font-display font-black text-[var(--text-primary)] sm:text-2xl">Saved Games</h4>
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                    {libraryState.savedGames.length} saved
                  </div>
                </div>
                {libraryState.loading && libraryState.savedGames.length === 0 ? (
                  <div className="rounded-[1.35rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 text-sm font-semibold text-[var(--text-secondary)]">
                    Loading saved games...
                  </div>
                ) : libraryState.savedGames.length === 0 ? (
                  <div className="rounded-[1.35rem] border border-dashed border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 text-sm font-semibold leading-7 text-[var(--text-secondary)]">
                    Use Save & Quit from round stats to store a resumable match here.
                  </div>
                ) : (
                  <div className="max-h-[30rem] space-y-4 overflow-y-auto pr-1">
                    {libraryState.savedGames.map((savedGame) => renderSavedGameCard(savedGame))}
                  </div>
                )}
              </section>
            </div>
          </div>

          <section className="glass-panel p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h4 className="text-xl font-display font-black text-[var(--text-primary)] sm:text-2xl">Bookmarked Post Previews</h4>
              <div className="text-xs font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                {libraryState.bookmarkedRulesetPosts.length} saved
              </div>
            </div>

            {libraryState.loading && libraryState.bookmarkedRulesetPosts.length === 0 ? (
              <div className="rounded-[1.35rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 text-sm font-semibold text-[var(--text-secondary)]">
                Loading bookmarked forum previews...
              </div>
            ) : libraryState.bookmarkedRulesetPosts.length === 0 ? (
              <div className="rounded-[1.35rem] border border-dashed border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 text-sm font-semibold leading-7 text-[var(--text-secondary)]">
                Bookmark forum posts with attached rulesets to collect quick previews here.
              </div>
            ) : (
              <div className="space-y-4">
                {libraryState.bookmarkedRulesetPosts.map((entry) => renderForumEntryCard(entry, {
                  compact: true,
                  switchTabOnOpen: true
                }))}
              </div>
            )}
          </section>
        </div>
      </div>
    );
  };

  const renderForumContent = () => (
    <div className="relative space-y-5 pb-28">
      {isForumComposerOpen && (
        <ModalShell
          title="Create Post"
          eyebrow="Rentz Forum"
          onClose={() => setIsForumComposerOpen(false)}
          wide
          panelClassName="max-w-4xl"
        >
          {renderForumComposer({
            draft: forumComposerDraft,
            busy: forumComposerBusy,
            onTextChange: (text) => setForumComposerDraft((current) => ({ ...current, text })),
            onRulesetChange: (value) => setForumComposerDraft((current) => ({ ...current, attachedRulesetIndex: value })),
            onMediaChange: handleForumComposerMediaChange,
            onClearMedia: () => setForumComposerDraft((current) => {
              revokeObjectPreview(current.mediaPreview);
              return {
                ...current,
                mediaFile: null,
                mediaPreview: ''
              };
            }),
            onSubmit: handleSubmitForumComposer,
            submitLabel: 'Post',
            placeholder: 'What are you playing, testing, or arguing about in Rentz today?',
            onCancel: () => setIsForumComposerOpen(false),
            title: 'Create a Rentz Forum post',
            description: 'Write a public forum post, optionally add media, and attach one of your saved custom rulesets.'
          })}
        </ModalShell>
      )}

      {forumReplyTarget && (
        <ModalShell
          title="Add Comment"
          eyebrow="Thread reply"
          onClose={() => setForumReplyTarget(null)}
          wide
          panelClassName="max-w-4xl"
        >
          <div className="space-y-5">
            <div className="rounded-[1.4rem] border border-[var(--glass-border)] bg-[var(--surface-subtle)] px-4 py-3">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Reply target</div>
              <div className="mt-2 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
                Replying to {getPlayerName(forumReplyTarget.author)} in this thread.
              </div>
            </div>
            {renderForumEntryCard(forumReplyTarget, { compact: true, interactive: false })}
            {renderForumComposer({
              draft: forumReplyDrafts[forumReplyTarget.id] || createForumDraft(),
              busy: forumReplyBusyId === forumReplyTarget.id,
              onTextChange: (text) => updateForumReplyDraft(forumReplyTarget.id, { text }),
              onRulesetChange: (value) => updateForumReplyDraft(forumReplyTarget.id, { attachedRulesetIndex: value }),
              onMediaChange: (event) => handleForumReplyMediaChange(forumReplyTarget.id, event),
              onClearMedia: () => updateForumReplyDraft(forumReplyTarget.id, (current) => {
                revokeObjectPreview(current.mediaPreview);
                return {
                  ...current,
                  mediaFile: null,
                  mediaPreview: ''
                };
              }),
              onSubmit: (event) => {
                event.preventDefault();
                void handleSubmitForumReply(forumReplyTarget.id);
              },
              submitLabel: 'Reply',
              placeholder: 'Write a threaded reply...',
              onCancel: () => setForumReplyTarget(null),
              title: 'Write your reply',
              description: 'Replies behave like thread posts and can include media or one of your saved custom rulesets.'
            })}
          </div>
        </ModalShell>
      )}

      {!isAuthenticated && (
        <div className="rounded-[1.5rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
          You can browse every public post without signing in. Logging in is required for posting, likes, replies, bookmarks, rating attached rulesets, and saving custom rulesets to your profile library.
        </div>
      )}

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <h3 className="text-2xl font-display font-black text-[var(--text-primary)] sm:text-3xl">
              {forumView === 'thread' ? 'Thread View' : 'Public Feed'}
            </h3>
            <p className="mt-1 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
              {forumView === 'thread'
                ? 'Parent previews stay above the selected post, and replies continue below like a social thread.'
                : 'Friend posts are shown first, then the rest of the community, with newest posts leading each group.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {forumView === 'thread' && (
              <button
                type="button"
                onClick={() => {
                  setForumView('feed');
                  setForumThread(null);
                }}
                className="rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (forumView === 'thread' && forumThread?.selected?.id) {
                  void loadForumThread(forumThread.selected.id);
                  return;
                }

                void loadForumFeed();
              }}
              disabled={forumFeedLoading || forumThreadLoading}
              className="rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] p-3 text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-70"
              title={forumView === 'thread' ? 'Refresh thread' : 'Refresh forum feed'}
            >
              <RefreshCw className={clsx('h-4 w-4', (forumFeedLoading || forumThreadLoading) && 'animate-spin')} />
            </button>
          </div>
        </div>

        {forumView === 'thread' ? (
          forumThreadLoading && !forumThread?.selected ? (
            <div className="glass-panel p-6 text-sm font-semibold text-[var(--text-secondary)]">Loading thread...</div>
          ) : !forumThread?.selected ? (
            <div className="glass-panel p-6 text-sm font-semibold leading-7 text-[var(--text-secondary)]">
              This post no longer exists. Use Back to return to the feed.
            </div>
          ) : (
            <div className="mx-auto w-full space-y-4 lg:w-1/2">
              {(forumThread.parents || []).map((entry) => renderForumEntryCard(entry, { compact: true }))}
              {renderForumEntryCard(forumThread.selected, {
                interactive: false,
                showReplies: true
              })}
            </div>
          )
        ) : forumFeedLoading && forumFeed.length === 0 ? (
          <div className="glass-panel p-6 text-sm font-semibold text-[var(--text-secondary)]">Loading public forum posts...</div>
        ) : forumFeed.length === 0 ? (
          <div className="glass-panel p-6 text-sm font-semibold leading-7 text-[var(--text-secondary)]">
            No public posts have been shared yet. The first post here will become the start of Rentz Forum.
          </div>
        ) : (
          <div className="mx-auto w-full space-y-4 lg:w-1/2">
            {forumFeed.map((entry) => renderForumEntryCard(entry))}
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={() => {
          if (!isAuthenticated) {
            setActiveTab('login');
            showTopPrompt('Log in to create a Rentz Forum post.', 'info');
            return;
          }

          setIsForumComposerOpen(true);
        }}
        className="fixed bottom-24 right-4 z-[55] flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/80 text-[var(--nav-active-text)] shadow-[var(--nav-active-shadow)] transition hover:scale-[1.05] hover:brightness-105 focus:outline-none focus:ring-4 focus:ring-[var(--accent-glow)] active:scale-[0.98] md:bottom-8 md:right-8"
        style={{
          background: 'var(--nav-active-bg)',
          boxShadow: 'var(--nav-active-shadow), 0 0 0 6px color-mix(in srgb, var(--surface-soft) 42%, transparent)'
        }}
        title="Create a post"
      >
        <Plus className="h-7 w-7" strokeWidth={3} />
      </button>
    </div>
  );

  const renderSearchResultsContent = () => {
    const activeResults = forumSearchState.activeView === 'posts'
      ? forumSearchState.posts
      : forumSearchState.activeView === 'friends'
        ? forumSearchState.friends
        : forumSearchState.users;

    return (
      <div className="space-y-5">
        <section className="glass-panel p-5 sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Search preview</div>
              <div className="mt-2 text-2xl font-display font-black text-[var(--text-primary)] sm:text-3xl">
                “{forumSearchState.query || 'No search yet'}”
              </div>
              <p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
                Posts match public post text only. Users and Friends match account usernames and open the existing profile preview.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                { id: 'posts', label: `Posts (${forumSearchState.posts.length})` },
                { id: 'users', label: `Users (${forumSearchState.users.length})` },
                { id: 'friends', label: `Friends (${forumSearchState.friends.length})` }
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setForumSearchState((current) => ({ ...current, activeView: option.id }))}
                  className={clsx(
                    'rounded-full border px-4 py-2 text-sm font-black uppercase tracking-[0.14em] transition',
                    forumSearchState.activeView === option.id
                      ? 'border-white/80 text-[var(--nav-active-text)] shadow-[var(--nav-active-shadow)]'
                      : 'border-[var(--glass-border)] bg-[var(--surface-medium)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                  )}
                  style={forumSearchState.activeView === option.id ? { background: 'var(--nav-active-bg)' } : {}}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {forumSearchState.loading ? (
          <div className="glass-panel p-6 text-sm font-semibold text-[var(--text-secondary)]">Loading search results...</div>
        ) : forumSearchState.activeView === 'posts' ? (
          forumSearchState.posts.length === 0 ? (
            <div className="glass-panel p-6 text-sm font-semibold leading-7 text-[var(--text-secondary)]">
              No public posts matched that search text.
            </div>
          ) : (
            <div className="mx-auto w-full space-y-4 lg:w-1/2">
              {forumSearchState.posts.map((entry) => renderForumEntryCard(entry, { compact: true, switchTabOnOpen: true }))}
            </div>
          )
        ) : forumSearchState.activeView === 'friends' && !isAuthenticated ? (
          <div className="glass-panel p-6 text-sm font-semibold leading-7 text-[var(--text-secondary)]">
            Log in to filter your own friends list here.
          </div>
        ) : activeResults.length === 0 ? (
          <div className="glass-panel p-6 text-sm font-semibold leading-7 text-[var(--text-secondary)]">
            {forumSearchState.activeView === 'friends'
              ? 'No friends matched that search.'
              : 'No users matched that search.'}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {activeResults.map((entry) => renderForumUserPreviewCard(entry, {
              eyebrow: forumSearchState.activeView === 'friends' ? 'Friend result' : 'User result'
            }))}
          </div>
        )}
      </div>
    );
  };

  const renderMainContent = () => {
    if (activeTab === 'play') {
      return renderPlayContent();
    }

    if (activeTab === 'editor') {
      return renderEditorContent();
    }

    if (activeTab === 'guide') {
      return renderGuideContent();
    }

    if (activeTab === 'login') {
      return renderLoginContent();
    }

    if (activeTab === 'settings') {
      return (
        <div className="space-y-5">
          <div className="glass-panel p-5 sm:p-6 lg:p-8">
            <h3 className="mb-3 text-2xl font-display font-black text-[var(--text-primary)] sm:text-3xl">Settings</h3>
            <p className="mb-6 text-base font-semibold leading-7 text-[var(--text-secondary)] sm:text-sm">
              Theme, font size, and content zoom save locally on this device. Page zoom only affects the active subpage area, so the browser window and OS UI stay untouched.
            </p>

            <div className="rounded-[1.6rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 sm:p-5">
              <div className="mb-4">
                <h4 className="text-xl font-display font-black text-[var(--text-primary)] sm:text-2xl">Theme Palette</h4>
                <p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-secondary)] sm:text-base">
                  Each palette now uses stronger surface contrast so cards, chips, and secondary panels stay readable.
                </p>
              </div>
              <ThemeTray themes={themes} theme={theme} onThemeChange={applyTheme} />
            </div>
          </div>

          <SettingsSlider
            title="Font Size"
            description="Scale the app typography in fixed 5% steps for easier reading across the interface."
            min={FONT_SCALE_RANGE.min}
            max={FONT_SCALE_RANGE.max}
            step={FONT_SCALE_RANGE.step}
            value={fontScalePercent}
            defaultValue={FONT_SCALE_RANGE.defaultValue}
            onChange={(nextValue) => setFontScale(nextValue / 100)}
          />

          <SettingsSlider
            title="Subpage Zoom"
            description="Scale the current page content in fixed 5% steps without zooming the entire browser tab."
            min={PAGE_ZOOM_RANGE.min}
            max={PAGE_ZOOM_RANGE.max}
            step={PAGE_ZOOM_RANGE.step}
            value={pageZoomPercent}
            defaultValue={PAGE_ZOOM_RANGE.defaultValue}
            onChange={(nextValue) => setPageZoom(nextValue / 100)}
          />
        </div>
      );
    }

    if (activeTab === 'library') {
      return renderLibraryContent();
    }

    if (activeTab === 'ruleset-rater') {
      return renderForumContent();
    }

    if (activeTab === 'search-results') {
      return renderSearchResultsContent();
    }

    return null;
  };

  return (
    <div className="app-shell relative min-h-screen w-full overflow-hidden p-0 pt-2 font-sans transition-colors duration-700 sm:pt-4 md:p-3 md:pt-3 lg:p-4">
      <div className="app-window macos-window relative z-20 mx-auto flex h-[calc(100dvh-0.5rem)] w-full max-w-[1680px] flex-col border border-[var(--glass-border)] shadow-2xl transition-colors duration-500 sm:h-[calc(100dvh-1rem)] md:h-[96vh]">
        <div className="relative z-30 flex min-h-[4.5rem] shrink-0 items-center gap-3 border-b border-[var(--glass-border)] px-3 py-2 shadow-sm transition-colors duration-500 sm:px-4 md:px-5" style={{ background: 'var(--glass-bg)' }}>
          <div className="flex w-auto shrink-0 gap-2.5 md:w-24">
            <div className="h-3.5 w-3.5 rounded-full border border-[#e0443e] bg-[#ff5f56] shadow-[inset_0_1px_4px_rgba(0,0,0,0.2)]" />
            <div className="h-3.5 w-3.5 rounded-full border border-[#dea123] bg-[#ffbd2e] shadow-[inset_0_1px_4px_rgba(0,0,0,0.2)]" />
            <div className="h-3.5 w-3.5 rounded-full border border-[#1aab29] bg-[#27c93f] shadow-[inset_0_1px_4px_rgba(0,0,0,0.2)]" />
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex shrink-0 items-center gap-2">
              <Droplet fill="currentColor" className="h-4 w-4 text-[var(--text-primary)] opacity-40 drop-shadow-md" />
              <span className="font-display text-[10px] font-semibold uppercase tracking-widest text-[var(--text-primary)] opacity-60 sm:text-xs">
                Rentz Arena
              </span>
            </div>

            <form onSubmit={handleForumSearchSubmit} className="ml-auto w-full max-w-[10.5rem] min-w-0 sm:max-w-[12rem] md:max-w-[13rem] lg:max-w-[14rem] xl:max-w-[15rem]">
              <div className="flex items-center gap-1.5 rounded-full border border-[var(--glass-border)] bg-[var(--surface-input)] px-2.5 py-1.5 shadow-[inset_0_1px_2px_rgba(255,255,255,0.35)]">
                <Search className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
                <input
                  value={forumSearchInput}
                  onChange={(event) => setForumSearchInput(event.target.value)}
                  placeholder="Search"
                  className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)] sm:text-sm"
                />
                <button
                  type="submit"
                  className="inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] p-1.5 text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
                  title="Search Rentz Arena"
                >
                  <Search className="h-3.5 w-3.5" />
                </button>
              </div>
            </form>
          </div>

          <div className="flex w-auto shrink-0 justify-end md:w-24">
            <button
              onClick={() => handleNavSelect('settings')}
              className="rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] p-2 text-[var(--text-primary)] shadow-sm transition hover:bg-[var(--surface-hover)]"
              title="Open settings"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>

        {topPrompts.length > 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-[4.85rem] z-40 px-4">
            <div className="relative mx-auto h-14 w-full">
              {topPrompts.map((topPrompt) => (
                <div
                  key={topPrompt.id}
                  className="absolute left-1/2 top-0 w-fit max-w-[calc(100vw-2rem)] -translate-x-1/2"
                >
                  <div
                    className={clsx(
                      'copy-toast glass-panel inline-flex w-max max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-[1.35rem] px-3 py-2.5 shadow-[0_18px_36px_rgba(0,0,0,0.16)] backdrop-blur-2xl sm:gap-3 sm:rounded-[1.6rem] sm:px-4 sm:py-3 sm:max-w-[30rem]',
                      topPrompt.tone === 'success' && 'border-lime-100/90 bg-[linear-gradient(180deg,rgba(248,255,245,0.92)_0%,rgba(214,247,177,0.78)_100%)]',
                      topPrompt.tone === 'warning' && 'border-amber-100/90 bg-[linear-gradient(180deg,rgba(255,251,235,0.95)_0%,rgba(253,230,138,0.82)_100%)]',
                      topPrompt.tone === 'error' && 'border-rose-100/90 bg-[linear-gradient(180deg,rgba(255,246,248,0.94)_0%,rgba(255,205,218,0.82)_100%)]',
                      topPrompt.tone === 'info' && 'border-sky-100/90 bg-[linear-gradient(180deg,rgba(245,252,255,0.94)_0%,rgba(198,234,255,0.8)_100%)]'
                    )}
                  >
                    <div
                      className={clsx(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border shadow-[inset_0_1px_2px_rgba(255,255,255,0.92),0_6px_12px_rgba(0,0,0,0.08)] sm:h-8 sm:w-8',
                        topPrompt.tone === 'success' && 'border-lime-100/95 bg-white/80 text-emerald-700',
                        topPrompt.tone === 'warning' && 'border-amber-100/95 bg-white/80 text-amber-700',
                        topPrompt.tone === 'error' && 'border-rose-100/95 bg-white/80 text-rose-700',
                        topPrompt.tone === 'info' && 'border-sky-100/95 bg-white/80 text-sky-700'
                      )}
                    >
                      {topPrompt.tone === 'error' ? (
                        <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      ) : topPrompt.tone === 'warning' ? (
                        <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      ) : topPrompt.tone === 'info' ? (
                        <Info className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      ) : (
                        <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      )}
                    </div>
                    <div className="min-w-0 whitespace-normal break-words text-xs font-black leading-5 text-[var(--text-primary)] sm:text-sm md:text-base">
                      {topPrompt.message}
                    </div>
                  </div>
                </div>
              ))}
              <div className="h-14" aria-hidden="true" />
            </div>
          </div>
        )}

        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <aside className="hidden w-56 shrink-0 flex-col border-r border-[var(--glass-border)] p-4 transition-colors duration-500 md:flex" style={{ background: 'var(--glass-bg)' }}>
            <div className="mb-8 mt-2 flex items-center gap-3 px-3">
              <Sparkles fill="currentColor" className="h-8 w-8 text-[var(--text-primary)] opacity-80 drop-shadow-lg" />
              <h1 className="font-display text-[2.1rem] font-black tracking-tighter text-[var(--text-primary)]">Rentz</h1>
            </div>

            <nav className="flex flex-1 flex-col gap-1.5">
              {navItems.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavSelect(item.id)}
                    className={clsx(
                      'flex items-center gap-4 rounded-2xl px-4 py-3.5 text-left font-medium transition-[transform,background-color,color,box-shadow] duration-300',
                      isActive
                        ? 'translate-x-2 font-bold text-[var(--nav-active-text)]'
                        : 'text-[var(--text-secondary)] hover:bg-black/5 hover:text-[var(--text-primary)]'
                    )}
                    style={isActive ? { background: 'var(--nav-active-bg)', boxShadow: 'var(--nav-active-shadow)' } : {}}
                  >
                    <item.icon className={clsx('relative z-10 h-5 w-5 drop-shadow-[0_2px_4px_rgba(0,0,0,0.1)] transition-transform duration-300', isActive && 'scale-110')} />
                    <span className="relative z-10 text-[14px] tracking-wide">{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-auto border-t border-[var(--glass-border)] pt-6" />
          </aside>

          <main className="relative z-10 flex h-full flex-1 flex-col overflow-y-auto overflow-x-auto p-1 pb-16 sm:p-2 sm:pb-24 md:p-2 lg:p-2">
            <div className="subpage-viewport">
              <div className="subpage-content">
                {!isCompactGameHeader && (
                  <header className="mb-6 flex shrink-0 flex-col gap-3">
                    <div className="min-w-0 flex flex-col gap-1.5 pt-1">
                      <h2 className="flex items-center gap-3 font-display font-black capitalize leading-[1.08] tracking-tight text-[var(--text-primary)] drop-shadow-sm text-[2rem] sm:text-3xl md:text-[4rem]">
                        {activeTab === 'play' && !inLobby && <Swords className="h-8 w-8 opacity-70 sm:h-10 sm:w-10" />}
                        {activeTabLabel}
                      </h2>
                      <div
                        className="h-1.5 w-24 rounded-full"
                        style={{ background: 'var(--button-bg)', boxShadow: 'var(--nav-active-shadow)' }}
                      />
                    </div>
                  </header>
                )}

                {errorMsg && activeTab !== 'play' && (
                  <div className="mb-4 flex items-center gap-2 rounded-[1.5rem] bg-red-500/90 px-4 py-3 text-sm font-bold text-white shadow-lg sm:rounded-full sm:px-6">
                    <Info className="h-5 w-5" />
                    {errorMsg}
                  </div>
                )}

                {renderMainContent()}
              </div>
            </div>
          </main>
        </div>
      </div>

      {renderDesktopChatWindow()}

      {isRecoveryPromptOpen && recoverableGuestProfile && (
        <ModalShell
          title="Rejoin session?"
          eyebrow="Refresh recovery"
          footer={(
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleStartFreshSession}
                className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
              >
                Start new session
              </button>
              <button
                type="button"
                onClick={handleRejoinRecoverableSession}
                className="frutiger-button px-5 py-3 text-sm uppercase tracking-[0.14em]"
              >
                Rejoin session
              </button>
            </div>
          )}
        >
          <div className="rounded-[1.4rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 text-sm font-semibold leading-6 text-[var(--text-secondary)] sm:text-base">
            Do you want to rejoin the previous session of{' '}
            <span className="font-black text-[var(--text-primary)]">{recoverableGuestProfile.name}</span>?
          </div>
        </ModalShell>
      )}

      {isTrainingSetupOpen && (
        <ModalShell
          title="Trainer Setup"
          eyebrow="Unranked training match"
          onClose={trainingStartBusy ? undefined : () => setIsTrainingSetupOpen(false)}
          wide
          footer={(
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={trainingStartBusy}
                onClick={() => setIsTrainingSetupOpen(false)}
                className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={trainingStartDisabled}
                onClick={handleStartTrainingMatch}
                className={clsx(
                  'px-5 py-3 text-sm uppercase tracking-[0.14em] disabled:cursor-not-allowed disabled:opacity-70',
                  trainingStartDisabled ? 'rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-subtle)] text-[var(--text-secondary)]' : 'frutiger-button'
                )}
              >
                {trainingStartBusy ? 'Starting...' : 'Start Training'}
              </button>
            </div>
          )}
        >
          <div className="space-y-5">
            <section className="grid gap-5 lg:grid-cols-2">
              <label className="rounded-[1.45rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 sm:p-5">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">Trainer ELO</span>
                <div className="mt-2 text-2xl font-black text-[var(--text-primary)]">{trainingSetup.trainerElo}</div>
                <div className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">{trainerRankName}</div>
                <input
                  type="range"
                  min="0"
                  max={trainerSliderMax}
                  step="1"
                  value={trainingSetup.trainerElo}
                  onChange={(event) => setTrainingSetup((current) => ({
                    ...current,
                    trainerElo: normalizeTrainerEloValue(event.target.value, getTrainerDefaultElo(activeProfile))
                  }))}
                  className="mt-4 w-full accent-emerald-500"
                />
                <div className="mt-2 flex items-center justify-between text-xs font-bold text-[var(--text-secondary)]">
                  <span>0</span>
                  <span>Max {trainerSliderMax}</span>
                </div>
              </label>

              <div className="grid gap-3">
                <div className="rounded-[1.45rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-[var(--text-primary)]">Send message before Trainer move</div>
                      <div className="mt-1 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
                        Trainer explains its idea before placing a card.
                      </div>
                    </div>
                    <ToggleCheck
                      checked={Boolean(trainingSetup.preMoveCommentaryEnabled)}
                      onChange={() => setTrainingSetup((current) => ({
                        ...current,
                        preMoveCommentaryEnabled: !current.preMoveCommentaryEnabled
                      }))}
                      label="Send message before Trainer move"
                    />
                  </div>
                </div>
                <div className="rounded-[1.45rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-[var(--text-primary)]">Review my move after I play</div>
                      <div className="mt-1 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
                        Trainer comments only on meaningful decisions and includes a rating out of 10.
                      </div>
                    </div>
                    <ToggleCheck
                      checked={Boolean(trainingSetup.postMoveFeedbackEnabled)}
                      onChange={() => setTrainingSetup((current) => ({
                        ...current,
                        postMoveFeedbackEnabled: !current.postMoveFeedbackEnabled
                      }))}
                      label="Review my move after I play"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-5 lg:grid-cols-2">
              <label className="rounded-[1.45rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-black text-[var(--text-primary)]">Rounds to play</span>
                  <span className="rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] px-3 py-1 text-xs font-black text-[var(--text-primary)]">
                    {trainingSetup.totalRounds}
                  </span>
                </div>
                <input
                  type="range"
                  min={TRAINING_ROUNDS_RANGE.min}
                  max={TRAINING_ROUNDS_RANGE.max}
                  step="1"
                  value={trainingSetup.totalRounds}
                  onChange={(event) => setTrainingSetup((current) => ({
                    ...current,
                    totalRounds: clampNumber(Number(event.target.value), TRAINING_ROUNDS_RANGE.min, TRAINING_ROUNDS_RANGE.max)
                  }))}
                  className="mt-4 w-full accent-emerald-500"
                />
                <div className="mt-2 text-xs font-bold text-[var(--text-secondary)]">
                  Choose between {TRAINING_ROUNDS_RANGE.min} and {TRAINING_ROUNDS_RANGE.max} rounds.
                </div>
              </label>

              <label className="rounded-[1.45rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-black text-[var(--text-primary)]">Players at the table</span>
                  <span className="rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] px-3 py-1 text-xs font-black text-[var(--text-primary)]">
                    {trainingSetup.playerCount}
                  </span>
                </div>
                <input
                  type="range"
                  min={TRAINING_PLAYERS_RANGE.min}
                  max={TRAINING_PLAYERS_RANGE.max}
                  step="1"
                  value={trainingSetup.playerCount}
                  onChange={(event) => setTrainingSetup((current) => ({
                    ...current,
                    playerCount: clampNumber(Number(event.target.value), TRAINING_PLAYERS_RANGE.min, TRAINING_PLAYERS_RANGE.max)
                  }))}
                  className="mt-4 w-full accent-emerald-500"
                />
                <div className="mt-2 text-xs font-bold text-[var(--text-secondary)]">
                  This creates you + Trainer + {trainingSelectedRegularBots} regular bot{trainingSelectedRegularBots === 1 ? '' : 's'}.
                </div>
              </label>
            </section>

            <section className="rounded-[1.45rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 sm:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">Choose ruleset for training</div>
                  <div className="mt-1 text-lg font-black text-[var(--text-primary)]">No default is preselected</div>
                  <div className="mt-1 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
                    Default rules are always available. Saved library rulesets appear when you are logged in.
                  </div>
                </div>
                <div className="rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--text-primary)]">
                  {trainingSetup.selectedRulesetId ? 'Ruleset selected' : 'Selection required'}
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">Default rulesets</div>
                  {trainingDefaultRulesets.map((option) => {
                    const isSelected = trainingSetup.selectedRulesetId === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          setTrainingValidationMessage('');
                          setTrainingSetup((current) => ({ ...current, selectedRulesetId: option.id }));
                        }}
                        className={clsx(
                          'flex w-full items-center justify-between gap-3 rounded-[1.2rem] border px-4 py-3 text-left transition',
                          isSelected
                            ? 'border-emerald-200/90 bg-emerald-100/85 text-emerald-950 shadow-[0_12px_24px_rgba(52,148,73,0.14)]'
                            : 'border-[var(--glass-border)] bg-[var(--surface-medium)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                        )}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-black">{option.label}</div>
                          <div className="mt-1 text-xs font-semibold text-[var(--text-secondary)]">Default training ruleset</div>
                        </div>
                        <div className="rounded-full border border-current/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em]">
                          {option.abbreviation}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-3">
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                    {isAuthenticated ? 'Saved library rulesets' : 'Saved library rulesets'}
                  </div>
                  {isAuthenticated ? (
                    trainingSavedRulesets.length > 0 ? (
                      trainingSavedRulesets.map((option) => {
                        const isSelected = trainingSetup.selectedRulesetId === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => {
                              setTrainingValidationMessage('');
                              setTrainingSetup((current) => ({ ...current, selectedRulesetId: option.id }));
                            }}
                            className={clsx(
                              'flex w-full items-center justify-between gap-3 rounded-[1.2rem] border px-4 py-3 text-left transition',
                              isSelected
                                ? 'border-sky-200/90 bg-sky-100/85 text-sky-950 shadow-[0_12px_24px_rgba(56,112,156,0.14)]'
                                : 'border-[var(--glass-border)] bg-[var(--surface-medium)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                            )}
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm font-black">{option.label}</div>
                              <div className="mt-1 text-xs font-semibold text-[var(--text-secondary)]">Saved to your account library</div>
                            </div>
                            <div className="rounded-full border border-current/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em]">
                              {option.abbreviation}
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="rounded-[1.2rem] border border-dashed border-[var(--glass-border)] bg-[var(--surface-medium)] px-4 py-4 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
                        No saved custom rulesets are available on this account yet.
                      </div>
                    )
                  ) : (
                    <div className="rounded-[1.2rem] border border-dashed border-[var(--glass-border)] bg-[var(--surface-medium)] px-4 py-4 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
                      Sign in if you want to train on rulesets saved in your Library. Guests can still train with the default rulesets.
                    </div>
                  )}
                </div>
              </div>
            </section>

            {trainingValidationMessage ? (
              <div className="rounded-[1.25rem] border border-rose-200/85 bg-rose-100/85 px-4 py-3 text-sm font-bold text-rose-950">
                {trainingValidationMessage}
              </div>
            ) : (
              <div className="rounded-[1.25rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] px-4 py-3 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
                Training matches use the normal game engine, but they stay unranked: no account ELO changes and no normal ranked match-history entry.
              </div>
            )}
          </div>
        </ModalShell>
      )}

      {isRoomSettingsOpen && (
        <ModalShell
          title="Room Settings"
          eyebrow="Host controls"
          onClose={() => setIsRoomSettingsOpen(false)}
          wide
          footer={(
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsRoomSettingsOpen(false)}
                className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveRoomSettings}
                className="frutiger-button px-5 py-3 text-sm uppercase tracking-[0.14em]"
              >
                Save room settings
              </button>
            </div>
          )}
        >
          <input
            ref={roomImportInputRef}
            type="file"
            accept=".rentz,text/plain"
            onChange={handleImportRentzToRoom}
            className="hidden"
          />
          <div className="space-y-5">
            <section className="grid gap-4 lg:grid-cols-3">
              <label className="lg:col-span-1">
                <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">Room name</span>
                <input
                  value={draftRoomSettings.roomName}
                  onChange={(event) => setDraftRoomSettings((current) => ({ ...current, roomName: event.target.value }))}
                  className="w-full rounded-[1.2rem] border border-[var(--glass-border)] bg-[var(--surface-input)] px-4 py-3 font-black text-[var(--text-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--accent-glow)]"
                />
              </label>
              <div>
                <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">Visibility</span>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'public', label: 'Public', icon: Globe2 },
                    { id: 'private', label: 'Private', icon: Lock }
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setDraftRoomSettings((current) => ({ ...current, visibility: option.id }))}
                      className={clsx(
                        'flex items-center justify-center gap-2 rounded-[1.1rem] border px-3 py-3 text-xs font-black uppercase tracking-[0.12em]',
                        draftRoomSettings.visibility === option.id
                          ? 'border-white/80 bg-[var(--surface-solid)] text-[var(--text-primary)]'
                          : 'border-[var(--glass-border)] bg-[var(--surface-medium)] text-[var(--text-secondary)]'
                      )}
                    >
                      <option.icon className="h-4 w-4" />
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">Round controls</span>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-3 rounded-[1.1rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] px-4 py-3">
                    <span className="text-sm font-black text-[var(--text-primary)]">Allow NV</span>
                    <ToggleCheck
                      checked={Boolean(draftRoomSettings.nvAllowed)}
                      onChange={() => setDraftRoomSettings((current) => ({ ...current, nvAllowed: !current.nvAllowed }))}
                      label="Allow NV games"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-[1.1rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] px-4 py-3">
                    <span className="text-sm font-black text-[var(--text-primary)]">Use turn timer</span>
                    <ToggleCheck
                      checked={Boolean(draftRoomSettings.useTurnTimer)}
                      onChange={() => setDraftRoomSettings((current) => ({ ...current, useTurnTimer: !current.useTurnTimer }))}
                      label="Use turn timer"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-[1.1rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] px-4 py-3">
                    <span className="text-sm font-black text-[var(--text-primary)]">Auto bot replacement</span>
                    <ToggleCheck
                      checked={Boolean(draftRoomSettings.autoBotReplacementEnabled)}
                      onChange={() => setDraftRoomSettings((current) => ({ ...current, autoBotReplacementEnabled: !current.autoBotReplacementEnabled }))}
                      label="Replace abandoned players with bots automatically"
                    />
                  </div>
                  <label className="rounded-[1.1rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] px-4 py-3">
                    <span className="mb-2 flex items-center gap-2 text-sm font-black text-[var(--text-primary)]"><Clock className="h-4 w-4" /> Turn timer</span>
                    <input
                      type="range"
                      min={TURN_TIMER_RANGE.min}
                      max={TURN_TIMER_RANGE.max}
                      step="5"
                      value={draftRoomSettings.turnTimerSeconds}
                      disabled={!draftRoomSettings.useTurnTimer}
                      onChange={(event) => setDraftRoomSettings((current) => ({ ...current, turnTimerSeconds: Number(event.target.value) }))}
                      className="w-full accent-emerald-500 disabled:cursor-not-allowed disabled:opacity-45"
                    />
                    <span className="text-xs font-bold text-[var(--text-secondary)]">
                      {draftRoomSettings.useTurnTimer ? `${draftRoomSettings.turnTimerSeconds}s` : 'Timer disabled'}
                    </span>
                  </label>
                </div>
              </div>
            </section>

            {canAddGuestRoomRulesets && (
              <section className="flex flex-col gap-3 rounded-[1.4rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-lg font-display font-black text-[var(--text-primary)]">Room Ruleset</h4>
                  <div className="mt-1 text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                    Guest host
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => roomImportInputRef.current?.click()}
                    className="inline-flex items-center justify-center gap-2 rounded-[1.2rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
                  >
                    <Upload className="h-4 w-4" />
                    Import .rentz
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsRoomSettingsOpen(false);
                      setEditorRoomRulesetId(null);
                      setActiveTab('editor');
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-[1.2rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
                  >
                    <FileCode2 className="h-4 w-4" />
                    Open Editor
                  </button>
                </div>
              </section>
            )}

            <section className="rentz-ruleset-grid-wrap overflow-x-auto rounded-[1.4rem] border border-[var(--glass-border)] bg-[var(--surface-subtle)] p-3">
              <table className="rentz-ruleset-grid w-full">
                <thead>
                  <tr>
                    <th className="rentz-ruleset-header-cell text-left">Ruleset</th>
                    <th className="rentz-ruleset-header-cell text-center">Room</th>
                    {players.map((player) => (
                      <th
                        key={player.userId}
                        className="rentz-ruleset-header-cell text-center"
                        data-short-label={getPlayerInitials(player)}
                        title={getPlayerName(player)}
                      >
                        <span className="rentz-ruleset-player-name">{getPlayerName(player)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {draftRoomSettings.availableRulesets.map((option) => (
                    <tr key={option.id}>
                      <th className="rentz-ruleset-row-header text-left">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-lg font-black text-[var(--text-primary)]">{option.abbreviation || option.label}</div>
                            <div className="text-xs font-bold text-[var(--text-secondary)]">
                              {option.label}{option.source === 'room' ? ' (room)' : ''}
                            </div>
                          </div>
                          {option.source === 'room' && (
                            <div className="rentz-ruleset-row-actions">
                              <button
                                type="button"
                                onClick={() => {
                                  populateEditorFromRuleset(option, {
                                    linkedRoomRulesetId: option.id,
                                    switchToEditor: true
                                  });
                                  setIsRoomSettingsOpen(false);
                                }}
                                className="rentz-ruleset-row-action-button"
                                title="Open this room ruleset in the editor"
                              >
                                <FileCode2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  socket.emit('delete_room_ruleset', { roomId, rulesetId: option.id }, (response) => {
                                    if (response?.error) {
                                      showErrorMessage(response.error);
                                      return;
                                    }

                                    if (response?.lobby) {
                                      applyLobbyState(response.lobby);
                                      setDraftRoomSettings(normalizeRoomSettings(response.lobby.roomSettings));
                                    }
                                    if (editorRoomRulesetId === option.id) {
                                      setEditorRoomRulesetId(null);
                                    }
                                    showTopPrompt(`${option.label} removed from the room.`, 'info');
                                  });
                                }}
                                className="rentz-ruleset-row-action-button is-danger"
                                title="Delete this room ruleset"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </th>
                      <td className="text-center">
                        <ToggleCheck
                          checked={Boolean(draftRoomSettings.selectedRulesets[option.id])}
                          onChange={() => handleRoomRulesetToggle(option.id)}
                          label={`Enable ${option.label} in this room`}
                          compact
                        />
                      </td>
                      {players.map((player) => (
                        <td key={`${player.userId}-${option.id}`} className="text-center">
                          <ToggleCheck
                            checked={draftRoomSettings.rulesetPermissions?.[player.userId]?.[option.id] !== false && Boolean(draftRoomSettings.selectedRulesets[option.id])}
                            disabled={!draftRoomSettings.selectedRulesets[option.id]}
                            onChange={() => handlePlayerRulesetPermissionToggle(player.userId, option.id)}
                            label={`${getPlayerName(player)} can choose ${option.label}`}
                            compact
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="rounded-[1.4rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
              <h4 className="mb-3 text-lg font-display font-black text-[var(--text-primary)]">Player Management</h4>
              <div className="grid gap-3 md:grid-cols-2">
                {[...players, ...spectators].filter((member) => member.userId !== activeProfile?.userId).map((member) => (
                  <div key={member.userId} className="flex items-center justify-between gap-3 rounded-[1.2rem] border border-[var(--glass-border)] bg-[var(--surface-subtle)] px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-[var(--text-primary)]">{getPlayerName(member)}</div>
                      <div className="text-xs font-bold text-[var(--text-secondary)]">{member.role}</div>
                    </div>
                    <div className="flex gap-1.5">
                      {member.isBot ? (
                        <button type="button" onClick={() => void handleRemoveBotFromLobby(member.userId)} className="rounded-full bg-[var(--surface-medium)] p-2" title="Remove bot"><Trash2 className="h-4 w-4" /></button>
                      ) : (
                        <>
                          <button type="button" onClick={() => handleTransferHost(member.userId)} className="rounded-full bg-[var(--surface-medium)] p-2" title="Transfer host"><Crown className="h-4 w-4" /></button>
                          <button type="button" onClick={() => handleKickMember(member.userId)} className="rounded-full bg-[var(--surface-medium)] p-2" title="Kick"><X className="h-4 w-4" /></button>
                          <button type="button" onClick={() => handleBanMember(member.userId)} className="rounded-full bg-[var(--surface-medium)] p-2" title="Ban"><Ban className="h-4 w-4" /></button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleLeaveRoom}
                  className="inline-flex items-center gap-2 rounded-[1.2rem] border border-red-200/70 bg-[linear-gradient(180deg,rgba(255,243,243,0.97)_0%,rgba(254,205,211,0.9)_100%)] px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-red-950"
                >
                  <LogOut className="h-4 w-4" />
                  Leave room
                </button>
                <button
                  type="button"
                  onClick={handleDeleteRoom}
                  className="inline-flex items-center gap-2 rounded-[1.2rem] border border-red-200/70 bg-red-200/70 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-red-950"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete room
                </button>
              </div>
            </section>
          </div>
        </ModalShell>
      )}

      {renderPlayerActionMenu()}
      {renderPlayerProfileModal()}
      {renderRankLeaderboardModal()}
      {renderBanNoticeModal()}
      {renderRoomStartBlockedModal()}
      {renderLeaveMatchConfirmModal()}
      {renderSavedGameRulesetTableModal()}

      {pendingSpectatorJoin && (
        <ModalShell
          title="Game In Progress"
          eyebrow="Join as spectator"
          onClose={() => setPendingSpectatorJoin(null)}
          footer={(
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPendingSpectatorJoin(null)}
                className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => joinLobbyRequest(pendingSpectatorJoin.roomId, { asSpectator: true })}
                className="frutiger-button px-5 py-3 text-sm uppercase tracking-[0.14em]"
              >
                Spectate room
              </button>
            </div>
          )}
        >
          <div className="rounded-[1.4rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 text-sm font-semibold leading-6 text-[var(--text-secondary)] sm:text-base">
            <span className="font-black text-[var(--text-primary)]">{pendingSpectatorJoin.roomName || pendingSpectatorJoin.roomId}</span> is already in a game. You can still enter the room as a spectator.
          </div>
        </ModalShell>
      )}

      {emojiPickerState && (
        <div
          ref={emojiPickerRef}
          className={clsx('rentz-emoji-picker', emojiPickerState.mode === 'bottom' && 'is-bottom-sheet')}
          style={emojiPickerState.mode === 'bottom'
            ? undefined
            : {
              left: `${emojiPickerState.left}px`,
              top: `${emojiPickerState.top}px`
            }}
        >
          <div className="rentz-emoji-picker-title">React</div>
          <div className="rentz-emoji-picker-grid">
            {EMOJI_REACTION_REGISTRY.map((emoji) => (
              <button
                key={emoji.id}
                type="button"
                onClick={() => handleEmojiReactionSelect(emoji.id)}
                className="rentz-emoji-choice"
                title={emoji.label}
                aria-label={emoji.label}
              >
                <span className={clsx('rentz-emoji-choice-glyph', emoji.animationClassName)}>{emoji.glyph}</span>
                <span className="rentz-emoji-choice-label">{emoji.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {accountRulesetPicker && (
        <ModalShell
          title={accountRulesetPicker.fieldName === 'favouriteRulesets' ? 'Add Favourite Ruleset' : 'Add Ruleset to Loadout'}
          eyebrow={accountRulesetPicker.fieldName === 'favouriteRulesets' ? 'Account profile' : 'Game-ready pack'}
          onClose={() => setAccountRulesetPicker(null)}
        >
          <div className="space-y-3">
            {accountRulesetCatalog
              .filter((option) => !(Array.isArray(userProfile?.[accountRulesetPicker.fieldName]) ? userProfile[accountRulesetPicker.fieldName] : []).includes(option.index))
              .map((option) => (
                <button
                  key={option.index}
                  type="button"
                  onClick={() => handleAddAccountRuleset(accountRulesetPicker.fieldName, option.index)}
                  disabled={accountRulesetBusyField === accountRulesetPicker.fieldName}
                  className="w-full rounded-[1.35rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 text-left transition hover:bg-[var(--surface-medium)] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-lg font-black text-[var(--text-primary)]">{option.label}</div>
                      <div className="mt-1 text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--text-secondary)]">{option.abbreviation}</div>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] text-[var(--text-primary)]">
                      <Plus className="h-4 w-4" />
                    </div>
                  </div>
                </button>
              ))}

            {accountRulesetCatalog.filter((option) => !(Array.isArray(userProfile?.[accountRulesetPicker.fieldName]) ? userProfile[accountRulesetPicker.fieldName] : []).includes(option.index)).length === 0 && (
              <div className="rounded-[1.35rem] border border-dashed border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 text-sm font-semibold leading-7 text-[var(--text-secondary)]">
                Every available built-in ruleset is already in this section.
              </div>
            )}
          </div>
        </ModalShell>
      )}

      {forumRulesetSaveTarget && (
        <ModalShell
          title="Save Attached Ruleset"
          eyebrow="Profile library"
          onClose={() => setForumRulesetSaveTarget(null)}
        >
          <div className="space-y-3">
            <div className="rounded-[1.35rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 text-sm font-semibold leading-7 text-[var(--text-secondary)]">
              Save <span className="font-black text-[var(--text-primary)]">{forumRulesetSaveTarget.attachedRuleset?.label || 'this ruleset'}</span> into your profile library.
              Saved rulesets appear in the Library tab and stay available for later previewing or copying into the editor.
            </div>

            <button
              type="button"
              disabled={forumActionBusyKey === `${forumRulesetSaveTarget.id}:save-ruleset`}
              onClick={() => void handleForumSaveRulesetToProfile()}
              className="w-full rounded-[1.35rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 text-left transition hover:bg-[var(--surface-medium)] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <div className="text-lg font-black text-[var(--text-primary)]">
                {forumActionBusyKey === `${forumRulesetSaveTarget.id}:save-ruleset` ? 'Saving...' : 'Save to Library'}
              </div>
              <div className="mt-1 text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--text-secondary)]">Duplicate-safe profile save</div>
            </button>
          </div>
        </ModalShell>
      )}

      {forumDeleteTarget && (
        <ModalShell
          title="Delete Post"
          eyebrow="Rentz Forum"
          onClose={() => setForumDeleteTarget(null)}
        >
          <div className="space-y-4">
            <div className="rounded-[1.35rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 text-sm font-semibold leading-7 text-[var(--text-secondary)]">
              Delete this {forumDeleteTarget.parentPostId ? 'reply' : 'post'} from Rentz Forum?
              It will be removed from public forum views, search results, thread previews, and library/forum references.
            </div>

            {renderForumEntryCard(forumDeleteTarget, { compact: true, interactive: false })}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setForumDeleteTarget(null)}
                className="rounded-[1.2rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={forumActionBusyKey === `${forumDeleteTarget.id}:delete`}
                onClick={() => void handleDeleteForumPost()}
                className="rounded-[1.2rem] border border-red-200 bg-red-50 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-red-900 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {forumActionBusyKey === `${forumDeleteTarget.id}:delete` ? 'Deleting...' : 'Delete Post'}
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {accountImagePreview && (
        <ModalShell
          title={accountImagePreview.title}
          eyebrow="Fullscreen preview"
          onClose={() => setAccountImagePreview(null)}
          wide
          bodyClassName="mt-5 min-h-0 flex-1 overflow-auto"
          panelClassName="max-w-5xl"
        >
          <div className="flex min-h-[24rem] items-center justify-center rounded-[1.6rem] border border-[var(--glass-border)] bg-[rgba(7,11,22,0.92)] p-3 sm:p-5">
            <img
              src={accountImagePreview.src}
              alt=""
              className={clsx(
                'max-h-[70vh] w-auto object-contain',
                accountImagePreview.shape === 'portrait'
                  ? 'rounded-[2rem] border border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.35)]'
                  : 'rounded-[1.5rem]'
              )}
            />
          </div>
        </ModalShell>
      )}

      {rulesetPreview && (
        <ModalShell
          title={rulesetPreview.label || 'Ruleset Preview'}
          eyebrow="Full .rentz file"
          onClose={() => setRulesetPreview(null)}
          wide
          bodyClassName="mt-5 min-h-0 flex-1 overflow-auto pr-1"
        >
          <div
            className="rounded-[1.45rem] p-1.5 shadow-[inset_0_2px_10px_rgba(0,0,0,0.42),inset_0_-10px_24px_rgba(0,0,0,0.32)]"
            style={{
              background: 'linear-gradient(180deg, rgba(20,27,45,0.96) 0%, rgba(7,11,22,0.99) 100%)'
            }}
          >
            <pre className="overflow-auto rounded-[1.1rem] bg-[linear-gradient(180deg,rgba(3,7,18,0.96)_0%,rgba(2,6,23,0.99)_100%)] p-5 text-xs leading-6 text-lime-100 shadow-[inset_0_1px_10px_rgba(0,0,0,0.5)]" data-rentz-modal-scroll="x">
              {formatRentzRuleset({
                longName: rulesetPreview.label,
                shortName: rulesetPreview.abbreviation,
                type: rulesetPreview.type,
                code: rulesetPreview.code
              })}
            </pre>
          </div>
        </ModalShell>
      )}

      {isChoosingNv && renderNvChoice()}
      {!isTrainingMatch && isChoosingRuleset && renderChoiceMatrix()}
      {isStatsOpen && latestRoundStats && (
        <StatsOverlay
          stats={latestRoundStats}
          players={players}
          canContinue={canContinueRoundFromStats}
          canEndGame={canManageRoundStats}
          canSaveQuit={canManageRoundStats && isAuthenticated && !isTrainingMatch}
          actionBusy={roundActionBusy}
          matchComplete={matchCompletePending || gameFinished}
          onContinue={handleContinueMatch}
          onEndGame={handleEndGame}
          onSaveQuit={handleSaveAndQuit}
          onClose={() => setIsStatsOpen(false)}
        />
      )}
      {renderTrainingFinalReviewModal()}

      <nav ref={mobileNavRef} className="mobile-tab-bar fixed bottom-3 left-2 right-2 z-50 sm:bottom-4 sm:left-3 sm:right-3 md:hidden">
        {isMobileMoreOpen && mobileMoreNavItems.length > 0 && (
          <div className="mobile-more-menu glass-panel absolute bottom-[calc(100%+0.7rem)] right-0 w-full rounded-[1.35rem] border border-[var(--glass-border)] p-2 shadow-[0_22px_44px_rgba(0,0,0,0.22)]">
            <div className="grid gap-2">
              {mobileMoreNavItems.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavSelect(item.id)}
                    className={clsx(
                      'flex min-h-[3.35rem] items-center gap-3 rounded-[1.05rem] px-3 text-left transition-[background-color,color,box-shadow]',
                      isActive
                        ? 'font-black text-[var(--nav-active-text)] shadow-[var(--nav-active-shadow)]'
                        : 'font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                    )}
                    style={isActive ? { background: 'var(--nav-active-bg)' } : {}}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    <span className="min-w-0 truncate text-xs uppercase tracking-[0.12em]">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="mobile-tab-panel glass-panel rounded-[1.9rem] border border-[var(--glass-border)] p-2 shadow-[0_20px_40px_rgba(0,0,0,0.2)]">
          <div className="grid grid-cols-4 gap-2">
            {mobilePrimaryNavItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavSelect(item.id)}
                  className={clsx(
                    'relative flex h-[4.5rem] min-w-0 flex-col items-center justify-center gap-1 rounded-[1.45rem] px-1.5 transition-[transform,background-color,color,box-shadow] duration-300',
                    isActive ? '-translate-y-2 scale-105 text-[var(--nav-active-text)]' : 'text-[var(--text-secondary)]'
                  )}
                >
                  {isActive && <div className="absolute inset-0 rounded-[1.45rem] shadow-[var(--nav-active-shadow)]" style={{ background: 'var(--nav-active-bg)' }} />}
                  <item.icon className="relative z-10 h-5 w-5 drop-shadow-md" />
                  <span className="relative z-10 max-w-full truncate text-[10px] font-black uppercase tracking-[0.08em] sm:text-[11px] sm:tracking-[0.14em]">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setIsMobileMoreOpen((current) => !current)}
              className={clsx(
                'relative flex h-[4.5rem] min-w-0 flex-col items-center justify-center gap-1 rounded-[1.45rem] px-1.5 transition-[transform,background-color,color,box-shadow] duration-300',
                isMobileMoreActive || isMobileMoreOpen ? '-translate-y-2 scale-105 text-[var(--nav-active-text)]' : 'text-[var(--text-secondary)]'
              )}
              aria-expanded={isMobileMoreOpen}
              aria-haspopup="menu"
            >
              {(isMobileMoreActive || isMobileMoreOpen) && (
                <div className="absolute inset-0 rounded-[1.45rem] shadow-[var(--nav-active-shadow)]" style={{ background: 'var(--nav-active-bg)' }} />
              )}
              <MoreHorizontal className="relative z-10 h-5 w-5 drop-shadow-md" />
              <span className="relative z-10 max-w-full truncate text-[10px] font-black uppercase tracking-[0.08em] sm:text-[11px] sm:tracking-[0.14em]">
                More
              </span>
            </button>
          </div>
        </div>
      </nav>
    </div>
  );
}

export default App;

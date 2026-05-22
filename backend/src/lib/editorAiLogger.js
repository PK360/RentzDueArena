const fs = require('fs/promises');
const path = require('path');

const DEFAULT_LOG_PATH = 'logs/editor-ai.log.txt';
const DEFAULT_LOG_ENABLED = process.env.EDITOR_AI_LOG_ENABLED === 'false' ? false : true;
const DEFAULT_LOG_VERBOSE = process.env.EDITOR_AI_LOG_VERBOSE === 'true';

let loggingInitialized = false;
let logWriteWarningShown = false;
let resolvedLogPathCache = '';

function isEditorAiLogEnabled() {
  return DEFAULT_LOG_ENABLED;
}

function isEditorAiVerboseLoggingEnabled() {
  return DEFAULT_LOG_VERBOSE;
}

function getEditorAiLogPath() {
  if (resolvedLogPathCache) {
    return resolvedLogPathCache;
  }

  resolvedLogPathCache = path.resolve(
    __dirname,
    '..',
    '..',
    String(process.env.EDITOR_AI_LOG_PATH || DEFAULT_LOG_PATH).trim() || DEFAULT_LOG_PATH
  );

  return resolvedLogPathCache;
}

function sanitizeEditorAiLogValue(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/"/g, '\'')
    .trim();
}

function formatEditorAiLogField(key, value) {
  if (!key) {
    return '';
  }

  if (value == null || value === '') {
    return '';
  }

  const normalizedKey = sanitizeEditorAiLogValue(key).replace(/[^a-zA-Z0-9_.-]/g, '');
  if (!normalizedKey) {
    return '';
  }

  if (typeof value === 'boolean' || typeof value === 'number') {
    return `${normalizedKey}=${value}`;
  }

  const sanitizedValue = sanitizeEditorAiLogValue(value);
  if (!sanitizedValue) {
    return '';
  }

  return /[^a-zA-Z0-9_./:@-]/.test(sanitizedValue)
    ? `${normalizedKey}="${sanitizedValue}"`
    : `${normalizedKey}=${sanitizedValue}`;
}

function formatEditorAiLogLine(level, message, fields = {}) {
  const fieldText = Object.entries(fields)
    .map(([key, value]) => formatEditorAiLogField(key, value))
    .filter(Boolean)
    .join(' ');

  return `[${new Date().toISOString()}] [editor-ai] [${level}] ${sanitizeEditorAiLogValue(message)}${fieldText ? ` ${fieldText}` : ''}\n`;
}

async function ensureEditorAiLogReady() {
  if (!isEditorAiLogEnabled()) {
    return false;
  }

  const logPath = getEditorAiLogPath();
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  return true;
}

async function appendEditorAiLog(level, message, fields = {}) {
  if (!isEditorAiLogEnabled()) {
    return;
  }

  try {
    await ensureEditorAiLogReady();
    await fs.appendFile(getEditorAiLogPath(), formatEditorAiLogLine(level, message, fields), 'utf8');
  } catch (error) {
    if (!logWriteWarningShown) {
      logWriteWarningShown = true;
      console.warn('Editor AI logging unavailable:', error.message);
    }
  }
}

async function initializeEditorAiLogging(fields = {}) {
  if (loggingInitialized || !isEditorAiLogEnabled()) {
    return;
  }

  loggingInitialized = true;
  await appendEditorAiLog('INFO', 'logging initialized', {
    logPath: getEditorAiLogPath(),
    verbose: isEditorAiVerboseLoggingEnabled(),
    ...fields
  });
}

module.exports = {
  getEditorAiLogPath,
  initializeEditorAiLogging,
  isEditorAiLogEnabled,
  isEditorAiVerboseLoggingEnabled,
  appendEditorAiLog
};

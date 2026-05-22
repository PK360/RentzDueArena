const fs = require('fs/promises');
const path = require('path');

const DEFAULT_CAPTURE_PATH = 'logs/editor-bot-response-dump.txt';
const DEFAULT_CAPTURE_ENABLED = process.env.EDITOR_BOT_RESPONSE_CAPTURE_ENABLED === 'false'
  ? false
  : true;

let resolvedCapturePathCache = '';
let captureWarningShown = false;

function isEditorBotResponseCaptureEnabled() {
  return DEFAULT_CAPTURE_ENABLED;
}

function getEditorBotResponseCapturePath() {
  if (resolvedCapturePathCache) {
    return resolvedCapturePathCache;
  }

  resolvedCapturePathCache = path.resolve(
    __dirname,
    '..',
    '..',
    String(process.env.EDITOR_BOT_RESPONSE_CAPTURE_PATH || DEFAULT_CAPTURE_PATH).trim() || DEFAULT_CAPTURE_PATH
  );

  return resolvedCapturePathCache;
}

async function ensureEditorBotResponseCaptureReady() {
  if (!isEditorBotResponseCaptureEnabled()) {
    return false;
  }

  await fs.mkdir(path.dirname(getEditorBotResponseCapturePath()), { recursive: true });
  return true;
}

function normalizeCaptureFieldValue(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function normalizeCaptureContent(content) {
  if (content == null) {
    return '';
  }

  if (typeof content === 'string') {
    return content.replace(/\r\n/g, '\n').trim();
  }

  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return String(content);
  }
}

function formatCaptureBlock({ title = 'editor bot response', fields = {}, content = '' } = {}) {
  const lines = [
    '================================================================================',
    `[${new Date().toISOString()}] ${normalizeCaptureFieldValue(title) || 'editor bot response'}`
  ];

  for (const [key, value] of Object.entries(fields)) {
    const normalizedValue = normalizeCaptureFieldValue(value);
    if (!key || !normalizedValue) {
      continue;
    }

    lines.push(`${key}: ${normalizedValue}`);
  }

  const normalizedContent = normalizeCaptureContent(content);
  if (normalizedContent) {
    lines.push('');
    lines.push(normalizedContent);
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function resetEditorBotResponseCapture(reason = 'backend startup') {
  if (!isEditorBotResponseCaptureEnabled()) {
    return;
  }

  try {
    await ensureEditorBotResponseCaptureReady();
    const header = formatCaptureBlock({
      title: 'editor bot response capture reset',
      fields: {
        reason
      },
      content: 'New editor bot responses will be appended below.'
    });
    await fs.writeFile(getEditorBotResponseCapturePath(), header, 'utf8');
  } catch (error) {
    if (!captureWarningShown) {
      captureWarningShown = true;
      console.warn('Editor Bot response capture unavailable:', error.message);
    }
  }
}

async function appendEditorBotResponseCapture({ title = 'editor bot response', fields = {}, content = '' } = {}) {
  if (!isEditorBotResponseCaptureEnabled()) {
    return;
  }

  try {
    await ensureEditorBotResponseCaptureReady();
    await fs.appendFile(
      getEditorBotResponseCapturePath(),
      formatCaptureBlock({ title, fields, content }),
      'utf8'
    );
  } catch (error) {
    if (!captureWarningShown) {
      captureWarningShown = true;
      console.warn('Editor Bot response capture unavailable:', error.message);
    }
  }
}

module.exports = {
  appendEditorBotResponseCapture,
  getEditorBotResponseCapturePath,
  isEditorBotResponseCaptureEnabled,
  resetEditorBotResponseCapture
};

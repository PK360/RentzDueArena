const {
  getPromptfooEnv,
  getSafeEvalConfigForLogs,
  loadPromptfooEnv,
  nowMs
} = require('../shared/eval-utils');

function buildGenerateUrl(baseUrl) {
  const normalized = String(baseUrl || '').replace(/\/+$/, '');
  if (/\/(?:api\/)?generate$/i.test(normalized)) {
    return normalized;
  }
  if (/\/api$/i.test(normalized)) {
    return `${normalized}/generate`;
  }
  return `${normalized}/api/generate`;
}

function readFirstEnvValue(...names) {
  for (const name of names.flat()) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function buildHeaders() {
  const headers = {
    'Content-Type': 'application/json'
  };
  const authToken = readFirstEnvValue(
    'OLLAMA_EDITOR_BOT_AUTH_TOKEN',
    'RENTZ_EDITOR_BOT_OLLAMA_AUTH_TOKEN',
    'OLLAMA_AUTH_TOKEN',
    'OLLAMA_API_KEY'
  );
  const authScheme = readFirstEnvValue(
    'OLLAMA_EDITOR_BOT_AUTH_SCHEME',
    'RENTZ_EDITOR_BOT_OLLAMA_AUTH_SCHEME'
  ) || 'Bearer';

  if (authToken) {
    headers.Authorization = `${authScheme} ${authToken}`.trim();
  }

  return headers;
}

async function postJson(url, payload, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  timeoutId.unref?.();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const bodyText = await response.text().catch(() => '');
    return {
      ok: response.ok,
      status: response.status,
      bodyText
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseEnvelope(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function previewText(value, maxLength = 200) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

async function main() {
  loadPromptfooEnv();
  const env = getPromptfooEnv();
  const mode = env.editorMode === 'deep' ? 'deep' : 'fast';
  const timeoutMs = Number(mode === 'deep' ? env.editorTimeoutDeepMs : env.editorTimeoutFastMs || 90000);
  const numPredict = Number(mode === 'deep' ? env.editorNumPredictDeep : env.editorNumPredictFast || 1600);
  const missingFields = [
    env.editorBaseUrl ? '' : 'OLLAMA_EDITOR_BOT_BASE_URL',
    env.editorModel ? '' : 'OLLAMA_EDITOR_BOT_MODEL',
    env.editorAuthTokenPresent ? '' : 'OLLAMA_EDITOR_BOT_AUTH_TOKEN'
  ].filter(Boolean);

  if (missingFields.length > 0) {
    console.log(JSON.stringify({
      check: 'editor-cloud',
      success: false,
      error: 'cloud_config_missing',
      missingFields,
      safeConfig: getSafeEvalConfigForLogs()
    }, null, 2));
    process.exit(1);
  }

  const startedAt = nowMs();
  const response = await postJson(buildGenerateUrl(env.editorBaseUrl), {
    model: env.editorModel,
    prompt: '/no_think Return exactly this JSON and nothing else: {"ok":true}',
    stream: false,
    format: 'json',
    think: false,
    thinking: false,
    reasoning: false,
    options: {
      temperature: 0,
      num_predict: numPredict,
      think: false,
      thinking: false,
      reasoning: false
    }
  }, timeoutMs).catch((error) => ({
    ok: false,
    status: 0,
    bodyText: '',
    error: error?.name === 'AbortError'
      ? 'cloud_timeout'
      : 'cloud_connectivity_failed'
  }));
  const elapsedMs = nowMs() - startedAt;
  const envelope = parseEnvelope(response.bodyText);
  const responseText = String(envelope?.response || '').trim();
  const thinkingText = String(envelope?.thinking || '').trim();
  let parsedJson = null;

  if (responseText) {
    try {
      parsedJson = JSON.parse(responseText);
    } catch {
      parsedJson = null;
    }
  }

  const errorCode = response.error
    || (response.status === 401 || response.status === 403
      ? 'cloud_auth_failed'
      : response.status === 404
        ? 'cloud_model_not_found'
        : response.ok
          ? ''
          : 'cloud_http_error');
  const report = {
    check: 'editor-cloud',
    success: response.ok && parsedJson?.ok === true,
    mode,
    model: env.editorModel,
    baseUrl: env.editorBaseUrl,
    hasApiKey: env.editorAuthTokenPresent,
    numPredict,
    timeoutMs,
    elapsedMs,
    httpStatus: response.status,
    doneReason: envelope?.done_reason || '',
    emptyResponse: !responseText,
    thinkingDetected: Boolean(thinkingText),
    parseSuccess: Boolean(parsedJson),
    validationSuccess: parsedJson?.ok === true,
    error: errorCode,
    responsePreview: previewText(responseText || response.bodyText),
    thinkingPreview: previewText(thinkingText),
    safeConfig: getSafeEvalConfigForLogs()
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.success ? 0 : 1);
}

main().catch((error) => {
  console.error(JSON.stringify({
    check: 'editor-cloud',
    success: false,
    error: error?.message || 'unknown error'
  }, null, 2));
  process.exit(1);
});

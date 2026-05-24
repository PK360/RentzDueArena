const {
  getPromptfooEnv,
  getSafeEvalConfigForLogs,
  loadPromptfooEnv,
  nowMs
} = require('../shared/eval-utils');

function buildGenerateUrl(baseUrl) {
  const normalized = String(baseUrl || '').replace(/\/+$/, '');
  if (/\/api\/generate$/i.test(normalized)) {
    return normalized;
  }
  if (/\/api$/i.test(normalized)) {
    return `${normalized}/generate`;
  }
  return `${normalized}/api/generate`;
}

async function postJson(url, payload, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  timeoutId.unref?.();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

function previewText(value, maxLength = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

async function main() {
  loadPromptfooEnv();
  const env = getPromptfooEnv();
  const mode = env.gameplayMode === 'eval' ? 'eval' : 'live';
  const timeoutMs = Number(mode === 'eval' ? env.gameplayEvalTimeoutMs : env.gameplayLiveTimeoutMs || 120000);
  const numPredict = Number(mode === 'eval' ? env.gameplayNumPredictEval : env.gameplayNumPredictLive || 0);
  const temperature = Number(mode === 'eval' ? env.gameplayTemperatureEval : env.gameplayTemperatureLive || 0.2);
  const startedAt = nowMs();
  const response = await postJson(buildGenerateUrl(env.ollamaBaseUrl), {
    model: env.gameplayModel,
    stream: false,
    format: 'json',
    prompt: [
      'Return JSON only.',
      'Use exactly these keys: move_id, confidence.',
      'Respond with a legal-looking example.'
    ].join(' '),
    options: {
      num_predict: numPredict,
      temperature
    }
  }, timeoutMs).catch((error) => ({
    ok: false,
    status: 0,
    bodyText: '',
    error: error?.name === 'AbortError'
      ? `timeout after ${timeoutMs}ms`
      : 'ollama_connectivity_failed'
  }));
  const elapsedMs = nowMs() - startedAt;
  const envelope = parseEnvelope(response.bodyText);
  const rawResponseText = String(envelope?.response || '').trim();
  let parsedJson = null;

  if (rawResponseText) {
    try {
      parsedJson = JSON.parse(rawResponseText);
    } catch {
      parsedJson = null;
    }
  }

  const report = {
    check: 'gameplay-ollama',
    success: response.ok && Boolean(parsedJson?.moveId || parsedJson?.move_id),
    elapsedMs,
    mode,
    model: env.gameplayModel,
    baseUrl: env.ollamaBaseUrl,
    timeoutMs,
    numPredict,
    httpStatus: response.status,
    doneReason: envelope?.done_reason || '',
    emptyResponse: !rawResponseText,
    parseSuccess: Boolean(parsedJson),
    validationSuccess: Boolean(parsedJson?.moveId || parsedJson?.move_id),
    responsePreview: previewText(rawResponseText || response.bodyText),
    error: response.error || '',
    safeConfig: getSafeEvalConfigForLogs()
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.success ? 0 : 1);
}

main().catch((error) => {
  console.error(JSON.stringify({
    check: 'gameplay-ollama',
    success: false,
    error: error?.message || 'unknown error'
  }, null, 2));
  process.exit(1);
});

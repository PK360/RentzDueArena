const {
  getPromptfooEnv,
  getSafeEvalConfigForLogs,
  loadBotsLib,
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
  const mode = env.trainerMode === 'deep' ? 'deep' : 'fast';
  const timeoutMs = Number(mode === 'deep' ? env.trainerEvalTimeoutMs : env.trainerFastTimeoutMs || 120000);
  const numPredict = Number(mode === 'deep' ? env.trainerNumPredictEval : env.trainerNumPredictFast || 0);
  const temperature = Number(mode === 'deep' ? env.trainerTemperatureEval : env.trainerTemperatureFast || 0.2);
  const botsLib = loadBotsLib({
    mode: 'trainer',
    useRealOllama: true,
    runtimeMode: env.trainerMode
  });
  await botsLib.warmTrainerBotStage({
    stage: 'before_move',
    timeoutMs: 45000
  }).catch(() => false);
  const startedAt = nowMs();
  const response = await postJson(buildGenerateUrl(env.ollamaBaseUrl), {
    model: env.trainerModel,
    stream: false,
    prompt: [
      'You are a Rentz trainer.',
      'Write one short coaching sentence, max 12 words.',
      'Return only the sentence.'
    ].join(' '),
    keep_alive: '10m',
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
  const looksJsonLike = /^\s*[{[]/.test(rawResponseText);
  const visibleText = rawResponseText.replace(/^["']+|["']+$/g, '').trim();

  const report = {
    check: 'trainer-ollama',
    success: response.ok && Boolean(visibleText),
    elapsedMs,
    mode,
    model: env.trainerModel,
    baseUrl: env.ollamaBaseUrl,
    timeoutMs,
    numPredict,
    httpStatus: response.status,
    doneReason: envelope?.done_reason || '',
    emptyResponse: !visibleText,
    parseSuccess: !looksJsonLike,
    validationSuccess: Boolean(visibleText),
    responsePreview: previewText(visibleText || rawResponseText || response.bodyText),
    error: response.error || '',
    safeConfig: getSafeEvalConfigForLogs()
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.success ? 0 : 1);
}

main().catch((error) => {
  console.error(JSON.stringify({
    check: 'trainer-ollama',
    success: false,
    error: error?.message || 'unknown error'
  }, null, 2));
  process.exit(1);
});

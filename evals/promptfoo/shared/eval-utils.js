const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const BACKEND_ROOT = path.join(REPO_ROOT, 'backend');
const DEAD_OLLAMA_URL = 'http://127.0.0.1:1';
const ENV_FILE_CANDIDATES = Object.freeze([
  path.join(REPO_ROOT, '.env'),
  path.join(REPO_ROOT, '.env.local'),
  path.join(BACKEND_ROOT, '.env'),
  path.join(BACKEND_ROOT, '.env.local')
]);

const DEFAULT_ENV = Object.freeze({
  ollamaBaseUrl: 'http://localhost:11434',
  gameplayModel: 'llama3.2:3b',
  trainerFastModel: 'llama3.2:3b',
  trainerFinalModel: 'llama3.2:3b',
  trainerEvalModel: 'qwen2.5:7b',
  trainerModel: 'llama3.2:3b',
  editorModel: 'gpt-oss:120b-cloud',
  editorBaseUrl: 'https://ollama.com/api',
  editorNumPredict: '1600',
  botDecisionTimeoutMs: '90000',
  editorTimeoutMs: '90000',
  gameplayMode: 'live',
  gameplayLiveTimeoutMs: '8000',
  gameplayEvalTimeoutMs: '120000',
  gameplayNumPredictLive: '48',
  gameplayNumPredictEval: '160',
  gameplayTemperatureLive: '0.1',
  gameplayTemperatureEval: '0.2',
  trainerMode: 'fast',
  trainerFastTimeoutMs: '8000',
  trainerFinalTimeoutMs: '40000',
  trainerEvalTimeoutMs: '120000',
  trainerNumPredictFast: '48',
  trainerNumPredictFinal: '180',
  trainerNumPredictEval: '500',
  trainerTemperatureFast: '0.2',
  trainerTemperatureFinal: '0.2',
  trainerTemperatureEval: '0.2',
  editorMode: 'fast',
  editorNumPredictFast: '900',
  editorNumPredictDeep: '1800',
  editorTimeoutFastMs: '25000',
  editorTimeoutDeepMs: '120000',
  editorTemperature: '0.2'
});

let dotenvModule = null;
let promptfooEnvLoaded = false;
let loadedEnvFiles = [];

function getDotenvModule() {
  if (dotenvModule) {
    return dotenvModule;
  }

  const candidatePaths = [
    'dotenv',
    path.join(BACKEND_ROOT, 'node_modules/dotenv')
  ];

  for (const candidatePath of candidatePaths) {
    try {
      dotenvModule = require(candidatePath);
      return dotenvModule;
    } catch {
      continue;
    }
  }

  return null;
}

function envFlag(name, fallback = false) {
  const value = String(process.env[name] || '').trim().toLowerCase();
  if (!value) {
    return fallback;
  }

  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
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

function readModeValue(name, fallback) {
  const value = String(process.env[name] || '').trim().toLowerCase();
  return value || fallback;
}

function loadPromptfooEnv() {
  if (promptfooEnvLoaded) {
    return {
      cwd: process.cwd(),
      repoRoot: REPO_ROOT,
      backendRoot: BACKEND_ROOT,
      envFilesFound: [...loadedEnvFiles]
    };
  }

  const dotenv = getDotenvModule();
  loadedEnvFiles = [];

  for (const envFile of ENV_FILE_CANDIDATES) {
    if (!fs.existsSync(envFile)) {
      continue;
    }

    loadedEnvFiles.push(envFile);
    dotenv?.config({
      path: envFile,
      override: false,
      quiet: true
    });
  }

  promptfooEnvLoaded = true;
  return {
    cwd: process.cwd(),
    repoRoot: REPO_ROOT,
    backendRoot: BACKEND_ROOT,
    envFilesFound: [...loadedEnvFiles]
  };
}

function getPromptfooEnv() {
  loadPromptfooEnv();

  const gameplayMode = readModeValue('RENTZ_GAMEPLAY_BOT_MODE', DEFAULT_ENV.gameplayMode);
  const trainerMode = readModeValue('RENTZ_TRAINER_MODE', DEFAULT_ENV.trainerMode);
  const editorMode = readModeValue('RENTZ_EDITOR_BOT_MODE', DEFAULT_ENV.editorMode);

  return {
    useRealOllama: envFlag('PROMPTFOO_USE_REAL_OLLAMA', false),
    useRealCloud: envFlag('PROMPTFOO_USE_REAL_CLOUD', false),
    gameplayMode,
    trainerMode,
    editorMode,
    ollamaBaseUrl: readFirstEnvValue('OLLAMA_BASE_URL', 'RENTZ_BOT_OLLAMA_BASE_URL') || DEFAULT_ENV.ollamaBaseUrl,
    gameplayModel: readFirstEnvValue('OLLAMA_GAMEPLAY_MODEL', 'RENTZ_BOT_OLLAMA_MODEL') || DEFAULT_ENV.gameplayModel,
    trainerFastModel: readFirstEnvValue('OLLAMA_TRAINER_FAST_MODEL', 'OLLAMA_TRAINER_MODEL', 'RENTZ_TRAINER_OLLAMA_MODEL', 'RENTZ_BOT_OLLAMA_MODEL') || DEFAULT_ENV.trainerFastModel,
    trainerFinalModel: readFirstEnvValue('OLLAMA_TRAINER_FINAL_MODEL', 'OLLAMA_TRAINER_EVAL_MODEL', 'OLLAMA_TRAINER_MODEL', 'RENTZ_TRAINER_OLLAMA_MODEL', 'RENTZ_BOT_OLLAMA_MODEL') || DEFAULT_ENV.trainerFinalModel,
    trainerEvalModel: readFirstEnvValue('OLLAMA_TRAINER_EVAL_MODEL', 'OLLAMA_TRAINER_MODEL', 'RENTZ_TRAINER_OLLAMA_MODEL', 'RENTZ_BOT_OLLAMA_MODEL') || DEFAULT_ENV.trainerEvalModel,
    trainerModel: readFirstEnvValue('OLLAMA_TRAINER_MODEL', 'RENTZ_TRAINER_OLLAMA_MODEL', 'RENTZ_BOT_OLLAMA_MODEL') || DEFAULT_ENV.trainerModel,
    editorModel: readFirstEnvValue('OLLAMA_EDITOR_BOT_MODEL', 'RENTZ_EDITOR_BOT_OLLAMA_MODEL') || DEFAULT_ENV.editorModel,
    editorBaseUrl: readFirstEnvValue('OLLAMA_EDITOR_BOT_BASE_URL', 'RENTZ_EDITOR_BOT_OLLAMA_BASE_URL') || DEFAULT_ENV.editorBaseUrl,
    editorNumPredict: String(
      readFirstEnvValue(
        'OLLAMA_EDITOR_BOT_NUM_PREDICT',
        'OLLAMA_EDITOR_BOT_CLOUD_NUM_PREDICT',
        'RENTZ_EDITOR_BOT_NUM_PREDICT'
      ) || DEFAULT_ENV.editorNumPredict
    ),
    botDecisionTimeoutMs: String(
      readFirstEnvValue('PROMPTFOO_BOT_DECISION_TIMEOUT_MS', 'RENTZ_BOT_DECISION_TIMEOUT_MS')
      || DEFAULT_ENV.botDecisionTimeoutMs
    ),
    gameplayLiveTimeoutMs: String(
      readFirstEnvValue('RENTZ_GAMEPLAY_BOT_LIVE_TIMEOUT_MS')
      || DEFAULT_ENV.gameplayLiveTimeoutMs
    ),
    gameplayEvalTimeoutMs: String(
      readFirstEnvValue('RENTZ_GAMEPLAY_BOT_EVAL_TIMEOUT_MS', 'PROMPTFOO_BOT_DECISION_TIMEOUT_MS', 'RENTZ_BOT_DECISION_TIMEOUT_MS')
      || DEFAULT_ENV.gameplayEvalTimeoutMs
    ),
    gameplayNumPredictLive: String(
      readFirstEnvValue('RENTZ_GAMEPLAY_BOT_NUM_PREDICT_LIVE')
      || DEFAULT_ENV.gameplayNumPredictLive
    ),
    gameplayNumPredictEval: String(
      readFirstEnvValue('RENTZ_GAMEPLAY_BOT_NUM_PREDICT_EVAL')
      || DEFAULT_ENV.gameplayNumPredictEval
    ),
    gameplayTemperatureLive: String(
      readFirstEnvValue('RENTZ_GAMEPLAY_BOT_TEMPERATURE_LIVE')
      || DEFAULT_ENV.gameplayTemperatureLive
    ),
    gameplayTemperatureEval: String(
      readFirstEnvValue('RENTZ_GAMEPLAY_BOT_TEMPERATURE_EVAL')
      || DEFAULT_ENV.gameplayTemperatureEval
    ),
    trainerFastTimeoutMs: String(
      readFirstEnvValue(
        'RENTZ_TRAINER_FAST_TIMEOUT_MS',
        'RENTZ_TRAINER_COMMENT_TIMEOUT_MS',
        'RENTZ_TRAINER_FEEDBACK_TIMEOUT_MS'
      ) || DEFAULT_ENV.trainerFastTimeoutMs
    ),
    trainerFinalTimeoutMs: String(
      readFirstEnvValue('RENTZ_TRAINER_FINAL_TIMEOUT_MS', 'RENTZ_TRAINER_FINAL_REVIEW_TIMEOUT_MS')
      || DEFAULT_ENV.trainerFinalTimeoutMs
    ),
    trainerEvalTimeoutMs: String(
      readFirstEnvValue('RENTZ_TRAINER_EVAL_TIMEOUT_MS', 'PROMPTFOO_BOT_DECISION_TIMEOUT_MS', 'RENTZ_BOT_DECISION_TIMEOUT_MS')
      || DEFAULT_ENV.trainerEvalTimeoutMs
    ),
    trainerNumPredictFast: String(
      readFirstEnvValue('RENTZ_TRAINER_FAST_NUM_PREDICT', 'RENTZ_TRAINER_NUM_PREDICT_FAST')
      || DEFAULT_ENV.trainerNumPredictFast
    ),
    trainerNumPredictFinal: String(
      readFirstEnvValue('RENTZ_TRAINER_FINAL_NUM_PREDICT', 'RENTZ_TRAINER_FINAL_REVIEW_NUM_PREDICT')
      || DEFAULT_ENV.trainerNumPredictFinal
    ),
    trainerNumPredictEval: String(
      readFirstEnvValue('RENTZ_TRAINER_NUM_PREDICT_EVAL')
      || DEFAULT_ENV.trainerNumPredictEval
    ),
    trainerTemperatureFast: String(
      readFirstEnvValue('RENTZ_TRAINER_TEMPERATURE_FAST')
      || DEFAULT_ENV.trainerTemperatureFast
    ),
    trainerTemperatureFinal: String(
      readFirstEnvValue('RENTZ_TRAINER_TEMPERATURE_FINAL')
      || DEFAULT_ENV.trainerTemperatureFinal
    ),
    trainerTemperatureEval: String(
      readFirstEnvValue('RENTZ_TRAINER_TEMPERATURE_EVAL')
      || DEFAULT_ENV.trainerTemperatureEval
    ),
    editorTimeoutMs: String(
      readFirstEnvValue('OLLAMA_EDITOR_BOT_TIMEOUT_MS', 'RENTZ_EDITOR_BOT_TIMEOUT_MS')
      || DEFAULT_ENV.editorTimeoutMs
    ),
    editorNumPredictFast: String(
      readFirstEnvValue('OLLAMA_EDITOR_BOT_NUM_PREDICT_FAST')
      || DEFAULT_ENV.editorNumPredictFast
    ),
    editorNumPredictDeep: String(
      readFirstEnvValue('OLLAMA_EDITOR_BOT_NUM_PREDICT_DEEP')
      || DEFAULT_ENV.editorNumPredictDeep
    ),
    editorTimeoutFastMs: String(
      readFirstEnvValue('OLLAMA_EDITOR_BOT_TIMEOUT_FAST_MS')
      || DEFAULT_ENV.editorTimeoutFastMs
    ),
    editorTimeoutDeepMs: String(
      readFirstEnvValue('OLLAMA_EDITOR_BOT_TIMEOUT_DEEP_MS')
      || DEFAULT_ENV.editorTimeoutDeepMs
    ),
    editorTemperature: String(
      readFirstEnvValue('OLLAMA_EDITOR_BOT_TEMPERATURE')
      || DEFAULT_ENV.editorTemperature
    ),
    editorAuthTokenPresent: Boolean(
      readFirstEnvValue(
        'OLLAMA_EDITOR_BOT_AUTH_TOKEN',
        'RENTZ_EDITOR_BOT_OLLAMA_AUTH_TOKEN',
        'OLLAMA_AUTH_TOKEN',
        'OLLAMA_API_KEY'
      )
    )
  };
}

function freshRequire(modulePath) {
  const resolvedPath = require.resolve(modulePath);
  delete require.cache[resolvedPath];
  return require(resolvedPath);
}

function applyBotEnv({ modelName, baseUrl, timeoutMs }) {
  process.env.RENTZ_BOT_OLLAMA_MODEL = modelName;
  process.env.RENTZ_BOT_OLLAMA_BASE_URL = baseUrl;
  process.env.RENTZ_BOT_DECISION_TIMEOUT_MS = String(timeoutMs || DEFAULT_ENV.botDecisionTimeoutMs);
}

function applyGameplayBotEnv({
  modelName,
  baseUrl,
  timeoutMs,
  runtimeMode = DEFAULT_ENV.gameplayMode,
  numPredict,
  temperature
}) {
  applyBotEnv({ modelName, baseUrl, timeoutMs });
  process.env.RENTZ_GAMEPLAY_BOT_MODE = runtimeMode;
  process.env.RENTZ_GAMEPLAY_BOT_LIVE_TIMEOUT_MS = String(
    runtimeMode === 'eval'
      ? readFirstEnvValue('RENTZ_GAMEPLAY_BOT_LIVE_TIMEOUT_MS') || DEFAULT_ENV.gameplayLiveTimeoutMs
      : timeoutMs || DEFAULT_ENV.gameplayLiveTimeoutMs
  );
  process.env.RENTZ_GAMEPLAY_BOT_EVAL_TIMEOUT_MS = String(
    runtimeMode === 'eval'
      ? timeoutMs || DEFAULT_ENV.gameplayEvalTimeoutMs
      : readFirstEnvValue('RENTZ_GAMEPLAY_BOT_EVAL_TIMEOUT_MS') || DEFAULT_ENV.gameplayEvalTimeoutMs
  );
  process.env.RENTZ_GAMEPLAY_BOT_NUM_PREDICT_LIVE = String(
    runtimeMode === 'eval'
      ? readFirstEnvValue('RENTZ_GAMEPLAY_BOT_NUM_PREDICT_LIVE') || DEFAULT_ENV.gameplayNumPredictLive
      : numPredict || DEFAULT_ENV.gameplayNumPredictLive
  );
  process.env.RENTZ_GAMEPLAY_BOT_NUM_PREDICT_EVAL = String(
    runtimeMode === 'eval'
      ? numPredict || DEFAULT_ENV.gameplayNumPredictEval
      : readFirstEnvValue('RENTZ_GAMEPLAY_BOT_NUM_PREDICT_EVAL') || DEFAULT_ENV.gameplayNumPredictEval
  );
  process.env.RENTZ_GAMEPLAY_BOT_TEMPERATURE_LIVE = String(
    runtimeMode === 'eval'
      ? readFirstEnvValue('RENTZ_GAMEPLAY_BOT_TEMPERATURE_LIVE') || DEFAULT_ENV.gameplayTemperatureLive
      : temperature || DEFAULT_ENV.gameplayTemperatureLive
  );
  process.env.RENTZ_GAMEPLAY_BOT_TEMPERATURE_EVAL = String(
    runtimeMode === 'eval'
      ? temperature || DEFAULT_ENV.gameplayTemperatureEval
      : readFirstEnvValue('RENTZ_GAMEPLAY_BOT_TEMPERATURE_EVAL') || DEFAULT_ENV.gameplayTemperatureEval
  );
}

function applyTrainerBotEnv({
  modelName,
  baseUrl,
  timeoutMs,
  runtimeMode = DEFAULT_ENV.trainerMode,
  numPredict,
  temperature,
  finalModelName,
  finalTimeoutMs,
  finalNumPredict,
  finalTemperature
}) {
  applyBotEnv({ modelName, baseUrl, timeoutMs });
  process.env.OLLAMA_TRAINER_FAST_MODEL = String(
    runtimeMode === 'deep'
      ? readFirstEnvValue('OLLAMA_TRAINER_FAST_MODEL') || DEFAULT_ENV.trainerFastModel
      : modelName || DEFAULT_ENV.trainerFastModel
  );
  process.env.OLLAMA_TRAINER_FINAL_MODEL = String(finalModelName || readFirstEnvValue('OLLAMA_TRAINER_FINAL_MODEL') || DEFAULT_ENV.trainerFinalModel);
  process.env.OLLAMA_TRAINER_EVAL_MODEL = String(
    runtimeMode === 'deep'
      ? modelName || DEFAULT_ENV.trainerEvalModel
      : readFirstEnvValue('OLLAMA_TRAINER_EVAL_MODEL') || DEFAULT_ENV.trainerEvalModel
  );
  process.env.OLLAMA_TRAINER_MODEL = String(modelName || DEFAULT_ENV.trainerModel);
  process.env.RENTZ_TRAINER_MODE = runtimeMode;
  process.env.RENTZ_TRAINER_FAST_TIMEOUT_MS = String(
    runtimeMode === 'deep'
      ? readFirstEnvValue('RENTZ_TRAINER_FAST_TIMEOUT_MS') || DEFAULT_ENV.trainerFastTimeoutMs
      : timeoutMs || DEFAULT_ENV.trainerFastTimeoutMs
  );
  process.env.RENTZ_TRAINER_FINAL_TIMEOUT_MS = String(finalTimeoutMs || readFirstEnvValue('RENTZ_TRAINER_FINAL_TIMEOUT_MS') || DEFAULT_ENV.trainerFinalTimeoutMs);
  process.env.RENTZ_TRAINER_FINAL_REVIEW_TIMEOUT_MS = String(finalTimeoutMs || readFirstEnvValue('RENTZ_TRAINER_FINAL_REVIEW_TIMEOUT_MS') || DEFAULT_ENV.trainerFinalTimeoutMs);
  process.env.RENTZ_TRAINER_EVAL_TIMEOUT_MS = String(
    runtimeMode === 'deep'
      ? timeoutMs || DEFAULT_ENV.trainerEvalTimeoutMs
      : readFirstEnvValue('RENTZ_TRAINER_EVAL_TIMEOUT_MS') || DEFAULT_ENV.trainerEvalTimeoutMs
  );
  process.env.RENTZ_TRAINER_FAST_NUM_PREDICT = String(
    runtimeMode === 'deep'
      ? readFirstEnvValue('RENTZ_TRAINER_FAST_NUM_PREDICT') || DEFAULT_ENV.trainerNumPredictFast
      : numPredict || DEFAULT_ENV.trainerNumPredictFast
  );
  process.env.RENTZ_TRAINER_NUM_PREDICT_FAST = String(
    runtimeMode === 'deep'
      ? readFirstEnvValue('RENTZ_TRAINER_NUM_PREDICT_FAST') || DEFAULT_ENV.trainerNumPredictFast
      : numPredict || DEFAULT_ENV.trainerNumPredictFast
  );
  process.env.RENTZ_TRAINER_FINAL_NUM_PREDICT = String(finalNumPredict || readFirstEnvValue('RENTZ_TRAINER_FINAL_NUM_PREDICT') || DEFAULT_ENV.trainerNumPredictFinal);
  process.env.RENTZ_TRAINER_FINAL_REVIEW_NUM_PREDICT = String(finalNumPredict || readFirstEnvValue('RENTZ_TRAINER_FINAL_REVIEW_NUM_PREDICT') || DEFAULT_ENV.trainerNumPredictFinal);
  process.env.RENTZ_TRAINER_NUM_PREDICT_EVAL = String(
    runtimeMode === 'deep'
      ? numPredict || DEFAULT_ENV.trainerNumPredictEval
      : readFirstEnvValue('RENTZ_TRAINER_NUM_PREDICT_EVAL') || DEFAULT_ENV.trainerNumPredictEval
  );
  process.env.RENTZ_TRAINER_TEMPERATURE_FAST = String(
    runtimeMode === 'deep'
      ? readFirstEnvValue('RENTZ_TRAINER_TEMPERATURE_FAST') || DEFAULT_ENV.trainerTemperatureFast
      : temperature || DEFAULT_ENV.trainerTemperatureFast
  );
  process.env.RENTZ_TRAINER_TEMPERATURE_FINAL = String(finalTemperature || readFirstEnvValue('RENTZ_TRAINER_TEMPERATURE_FINAL') || DEFAULT_ENV.trainerTemperatureFinal);
  process.env.RENTZ_TRAINER_TEMPERATURE_EVAL = String(
    runtimeMode === 'deep'
      ? temperature || DEFAULT_ENV.trainerTemperatureEval
      : readFirstEnvValue('RENTZ_TRAINER_TEMPERATURE_EVAL') || DEFAULT_ENV.trainerTemperatureEval
  );
}

function applyEditorEnv({ modelName, baseUrl, numPredict }) {
  process.env.OLLAMA_EDITOR_BOT_MODEL = modelName;
  process.env.OLLAMA_EDITOR_BOT_FULL_MODEL = modelName;
  process.env.OLLAMA_EDITOR_BOT_LEAN_MODEL = modelName;
  process.env.OLLAMA_EDITOR_BOT_BASE_URL = baseUrl;
  process.env.OLLAMA_EDITOR_BOT_NUM_PREDICT = String(numPredict || DEFAULT_ENV.editorNumPredict);
  process.env.OLLAMA_EDITOR_BOT_CLOUD_NUM_PREDICT = String(numPredict || DEFAULT_ENV.editorNumPredict);
  process.env.RENTZ_EDITOR_BOT_OLLAMA_MODEL = modelName;
  process.env.RENTZ_EDITOR_BOT_OLLAMA_BASE_URL = baseUrl;
  process.env.RENTZ_EDITOR_BOT_NUM_PREDICT = String(numPredict || DEFAULT_ENV.editorNumPredict);
}

function applyEditorBotEnv({ modelName, baseUrl, numPredict, timeoutMs, runtimeMode = DEFAULT_ENV.editorMode, temperature }) {
  applyEditorEnv({ modelName, baseUrl, numPredict });
  process.env.RENTZ_EDITOR_BOT_MODE = runtimeMode;
  process.env.OLLAMA_EDITOR_BOT_NUM_PREDICT_FAST = String(
    runtimeMode === 'deep'
      ? readFirstEnvValue('OLLAMA_EDITOR_BOT_NUM_PREDICT_FAST') || DEFAULT_ENV.editorNumPredictFast
      : numPredict || DEFAULT_ENV.editorNumPredictFast
  );
  process.env.OLLAMA_EDITOR_BOT_NUM_PREDICT_DEEP = String(
    runtimeMode === 'deep'
      ? numPredict || DEFAULT_ENV.editorNumPredictDeep
      : readFirstEnvValue('OLLAMA_EDITOR_BOT_NUM_PREDICT_DEEP') || DEFAULT_ENV.editorNumPredictDeep
  );
  process.env.OLLAMA_EDITOR_BOT_TIMEOUT_FAST_MS = String(
    runtimeMode === 'deep'
      ? readFirstEnvValue('OLLAMA_EDITOR_BOT_TIMEOUT_FAST_MS') || DEFAULT_ENV.editorTimeoutFastMs
      : timeoutMs || DEFAULT_ENV.editorTimeoutFastMs
  );
  process.env.OLLAMA_EDITOR_BOT_TIMEOUT_DEEP_MS = String(
    runtimeMode === 'deep'
      ? timeoutMs || DEFAULT_ENV.editorTimeoutDeepMs
      : readFirstEnvValue('OLLAMA_EDITOR_BOT_TIMEOUT_DEEP_MS') || DEFAULT_ENV.editorTimeoutDeepMs
  );
  process.env.OLLAMA_EDITOR_BOT_TIMEOUT_MS = String(timeoutMs || DEFAULT_ENV.editorTimeoutMs);
  process.env.RENTZ_EDITOR_BOT_TIMEOUT_MS = String(timeoutMs || DEFAULT_ENV.editorTimeoutMs);
  process.env.OLLAMA_EDITOR_BOT_TEMPERATURE = String(temperature || DEFAULT_ENV.editorTemperature);
}

function loadBotsLib({
  mode = 'gameplay',
  useRealOllama = false,
  runtimeMode
} = {}) {
  const env = getPromptfooEnv();
  const resolvedRuntimeMode = runtimeMode || (mode === 'trainer' ? env.trainerMode : env.gameplayMode);
  const timeoutMs = useRealOllama
    ? (
      mode === 'trainer'
        ? (resolvedRuntimeMode === 'deep' ? env.trainerEvalTimeoutMs : env.trainerFastTimeoutMs)
        : (resolvedRuntimeMode === 'eval' ? env.gameplayEvalTimeoutMs : env.gameplayLiveTimeoutMs)
    )
    : '25';
  const appliedEnv = {
    modelName: mode === 'trainer'
      ? (resolvedRuntimeMode === 'deep' ? env.trainerEvalModel : env.trainerFastModel)
      : env.gameplayModel,
    baseUrl: useRealOllama ? env.ollamaBaseUrl : DEAD_OLLAMA_URL,
    timeoutMs,
    runtimeMode: resolvedRuntimeMode,
    numPredict: mode === 'trainer'
      ? (resolvedRuntimeMode === 'deep' ? env.trainerNumPredictEval : env.trainerNumPredictFast)
      : (resolvedRuntimeMode === 'eval' ? env.gameplayNumPredictEval : env.gameplayNumPredictLive),
    temperature: mode === 'trainer'
      ? (resolvedRuntimeMode === 'deep' ? env.trainerTemperatureEval : env.trainerTemperatureFast)
      : (resolvedRuntimeMode === 'eval' ? env.gameplayTemperatureEval : env.gameplayTemperatureLive),
    finalModelName: mode === 'trainer' ? env.trainerFinalModel : undefined,
    finalTimeoutMs: mode === 'trainer' ? env.trainerFinalTimeoutMs : undefined,
    finalNumPredict: mode === 'trainer' ? env.trainerNumPredictFinal : undefined,
    finalTemperature: mode === 'trainer' ? env.trainerTemperatureFinal : undefined
  };
  if (mode === 'trainer') {
    applyTrainerBotEnv(appliedEnv);
  } else {
    applyGameplayBotEnv(appliedEnv);
  }
  return freshRequire(path.join(BACKEND_ROOT, 'src/lib/bots.js'));
}

function loadEditorBotLib({ useRealCloud = false } = {}) {
  const env = getPromptfooEnv();
  const runtimeMode = env.editorMode === 'deep' ? 'deep' : 'fast';
  applyEditorBotEnv({
    modelName: env.editorModel,
    baseUrl: useRealCloud ? env.editorBaseUrl : DEAD_OLLAMA_URL,
    numPredict: runtimeMode === 'deep' ? env.editorNumPredictDeep : env.editorNumPredictFast,
    timeoutMs: runtimeMode === 'deep' ? env.editorTimeoutDeepMs : env.editorTimeoutFastMs,
    runtimeMode,
    temperature: env.editorTemperature
  });
  return freshRequire(path.join(BACKEND_ROOT, 'src/lib/editorBot.js'));
}

function requireBackendModule(relativePath) {
  loadPromptfooEnv();
  return freshRequire(path.join(BACKEND_ROOT, relativePath));
}

function safeReadText(relativePath) {
  loadPromptfooEnv();
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function nowMs() {
  return Date.now();
}

function buildProviderResult(output, metadata = {}) {
  return {
    output: typeof output === 'string' ? output : JSON.stringify(output, null, 2),
    metadata
  };
}

function getSafeEvalConfigForLogs() {
  const env = getPromptfooEnv();
  const loaded = loadPromptfooEnv();

  return {
    cwd: loaded.cwd,
    repoRoot: loaded.repoRoot,
    backendRoot: loaded.backendRoot,
    envFilesFound: loaded.envFilesFound,
    promptfooUseRealOllama: env.useRealOllama,
    promptfooUseRealCloud: env.useRealCloud,
    ollamaBaseUrlPresent: Boolean(env.ollamaBaseUrl),
    ollamaBaseUrlResolved: env.ollamaBaseUrl || '',
    ollamaGameplayModelResolved: env.gameplayModel || '',
    ollamaTrainerFastModelResolved: env.trainerFastModel || '',
    ollamaTrainerFinalModelResolved: env.trainerFinalModel || '',
    ollamaTrainerEvalModelResolved: env.trainerEvalModel || '',
    ollamaTrainerModelResolved: env.trainerModel || '',
    ollamaEditorBotModelResolved: env.editorModel || '',
    ollamaEditorBotBaseUrlResolved: env.editorBaseUrl || '',
    ollamaEditorBotNumPredictResolved: env.editorNumPredict || '',
    promptfooBotDecisionTimeoutMsResolved: env.botDecisionTimeoutMs || '',
    ollamaEditorBotTimeoutMsResolved: env.editorTimeoutMs || '',
    gameplayModeResolved: env.gameplayMode || '',
    gameplayLiveTimeoutMsResolved: env.gameplayLiveTimeoutMs || '',
    gameplayEvalTimeoutMsResolved: env.gameplayEvalTimeoutMs || '',
    gameplayNumPredictLiveResolved: env.gameplayNumPredictLive || '',
    gameplayNumPredictEvalResolved: env.gameplayNumPredictEval || '',
    trainerModeResolved: env.trainerMode || '',
    trainerFastTimeoutMsResolved: env.trainerFastTimeoutMs || '',
    trainerFinalTimeoutMsResolved: env.trainerFinalTimeoutMs || '',
    trainerEvalTimeoutMsResolved: env.trainerEvalTimeoutMs || '',
    trainerNumPredictFastResolved: env.trainerNumPredictFast || '',
    trainerNumPredictFinalResolved: env.trainerNumPredictFinal || '',
    trainerNumPredictEvalResolved: env.trainerNumPredictEval || '',
    editorModeResolved: env.editorMode || '',
    editorNumPredictFastResolved: env.editorNumPredictFast || '',
    editorNumPredictDeepResolved: env.editorNumPredictDeep || '',
    editorTimeoutFastMsResolved: env.editorTimeoutFastMs || '',
    editorTimeoutDeepMsResolved: env.editorTimeoutDeepMs || '',
    editorApiKeyPresent: env.editorAuthTokenPresent
  };
}

function withMockedFetch(mockFetch, fn) {
  const originalFetch = global.fetch;
  global.fetch = mockFetch;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      global.fetch = originalFetch;
    });
}

function createJsonFetchResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: null,
    json: async () => body
  };
}

function createTextFetchResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body
  };
}

function createWarmupEnvelope(modelName) {
  return createTextFetchResponse(JSON.stringify({
    model: modelName,
    response: '{"ok":true}',
    thinking: '',
    done: true,
    done_reason: 'stop'
  }));
}

function createSequencedFetch(responses = []) {
  let index = 0;

  return async () => {
    const next = responses[index] || responses[responses.length - 1];
    index += 1;
    return typeof next === 'function' ? next() : next;
  };
}

function buildDebugSummary(value, maxLength = 240) {
  const text = typeof value === 'string'
    ? value
    : JSON.stringify(value);
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

module.exports = {
  BACKEND_ROOT,
  DEAD_OLLAMA_URL,
  REPO_ROOT,
  applyEditorBotEnv,
  applyGameplayBotEnv,
  applyTrainerBotEnv,
  buildDebugSummary,
  buildProviderResult,
  createJsonFetchResponse,
  createSequencedFetch,
  createTextFetchResponse,
  createWarmupEnvelope,
  envFlag,
  freshRequire,
  getSafeEvalConfigForLogs,
  getPromptfooEnv,
  loadPromptfooEnv,
  loadBotsLib,
  loadEditorBotLib,
  nowMs,
  requireBackendModule,
  safeReadText,
  withMockedFetch
};

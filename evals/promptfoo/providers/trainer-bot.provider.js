const { buildTrainerContext } = require('../shared/rentz-fixtures');
const {
  buildProviderResult,
  getPromptfooEnv,
  getSafeEvalConfigForLogs,
  loadBotsLib,
  nowMs
} = require('../shared/eval-utils');

function previewText(value, maxLength = 140) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

class TrainerBotProvider {
  constructor(options = {}) {
    this.providerId = options.label || options.id || 'trainer-bot';
    this.config = options.config || {};
    this.botsLib = null;
    this.stageWarmups = new Map();
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context = {}) {
    const vars = context.vars || {};
    const env = getPromptfooEnv();
    const botsLib = this.botsLib || loadBotsLib({
      mode: 'trainer',
      useRealOllama: env.useRealOllama,
      runtimeMode: env.trainerMode
    });
    this.botsLib = botsLib;
    const trainerContext = buildTrainerContext(vars);
    const requestedStage = vars.mode === 'final_review'
      ? 'final_review'
      : vars.mode === 'before_move'
        ? 'before_move'
        : 'after_move';
    const timeoutMs = env.useRealOllama
      ? Number(
        vars.timeoutMs
        || (requestedStage === 'final_review'
          ? env.trainerFinalTimeoutMs
          : env.trainerMode === 'deep'
            ? env.trainerEvalTimeoutMs
            : env.trainerFastTimeoutMs)
        || 120000
      )
      : 25;
    const warmupKey = requestedStage === 'final_review' ? 'final_review' : 'fast_live';

    if (
      env.useRealOllama
      && typeof botsLib.warmTrainerBotStage === 'function'
      && !this.stageWarmups.has(warmupKey)
    ) {
      const warmupPromise = Promise.resolve(
        botsLib.warmTrainerBotStage({
          stage: requestedStage,
          timeoutMs: requestedStage === 'final_review' ? 60000 : 45000
        })
      ).catch(() => false);
      this.stageWarmups.set(warmupKey, warmupPromise);
    }

    if (env.useRealOllama && this.stageWarmups.has(warmupKey)) {
      await this.stageWarmups.get(warmupKey);
    }

    const startedAt = nowMs();
    let result;
    let backendResult;

    if (vars.mode === 'before_move') {
      const selectedMove = trainerContext.legalMoves.find((move) => move.id === vars.selectedMoveId)
        || trainerContext.legalMoves[0]
        || null;
      backendResult = await botsLib.generateTrainerPreMoveComment({
        gameState: trainerContext.gameState,
        trainerPlayer: trainerContext.trainerPlayer,
        legalMoves: trainerContext.legalMoves,
        selectedMove,
        ruleset: trainerContext.ruleset,
        timeoutMs,
        returnMetadata: true
      });

      result = {
        mode: 'before_move',
        comment: backendResult.comment,
        source: env.useRealOllama ? backendResult.source : 'mock',
        errorCode: backendResult.errorCode || null
      };
    } else if (vars.mode === 'after_move') {
      backendResult = await botsLib.evaluateTrainerPlayerMove({
        gameState: trainerContext.gameState,
        trainerPlayer: trainerContext.trainerPlayer,
        humanPlayer: trainerContext.humanPlayer,
        playedCard: vars.playedCard,
        legalMoves: trainerContext.legalMoves,
        ruleset: trainerContext.ruleset,
        currentTrickBeforeMove: trainerContext.currentTrickBeforeMove,
        timeoutMs,
        returnMetadata: true
      });

      result = {
        mode: 'after_move',
        shouldComment: backendResult.shouldComment !== false,
        rating: backendResult.rating,
        feedback: backendResult.feedback || '',
        source: env.useRealOllama ? backendResult.source : 'mock',
        errorCode: backendResult.errorCode || null
      };
    } else if (vars.mode === 'final_review') {
      backendResult = await botsLib.generateTrainerFinalReview({
        training: trainerContext.training,
        feedbackEntries: trainerContext.feedbackEntries,
        roundSummaries: trainerContext.roundSummaries,
        humanPlayer: trainerContext.humanPlayer,
        trainerPlayer: trainerContext.trainerPlayer,
        timeoutMs,
        returnMetadata: true
      });

      result = {
        mode: 'final_review',
        review: backendResult.review,
        starRating: backendResult.starRating,
        source: env.useRealOllama ? backendResult.source : 'mock',
        errorCode: backendResult.errorCode || null
      };
    } else {
      throw new Error(`Unknown trainer mode '${vars.mode || ''}'`);
    }

    const elapsedMs = nowMs() - startedAt;
    const visibleText = result.comment || result.feedback || result.review || '';
    const resolvedModel = backendResult?.model
      || (requestedStage === 'final_review'
        ? env.trainerFinalModel
        : env.trainerMode === 'deep'
          ? env.trainerEvalModel
          : env.trainerFastModel);
    const displayPayload = {
      scenarioId: vars.scenarioId || '',
      mode: result.mode,
      source: result.source,
      rating: result.rating ?? result.starRating ?? null,
      elapsedMs,
      fallbackUsed: env.useRealOllama
        ? result.source === 'fallback'
        : false,
      errorCode: result.errorCode || null,
      preview: previewText(visibleText, 120),
      ...result
    };

    return buildProviderResult(displayPayload, {
      elapsedMs,
      promptPreview: String(prompt || '').slice(0, 140),
      mode: env.useRealOllama ? env.trainerMode : 'mock',
      scenarioId: vars.scenarioId || '',
      timeoutMs,
      model: resolvedModel,
      numPredict: Number(
        backendResult?.numPredict
        || (requestedStage === 'final_review'
          ? env.trainerNumPredictFinal
          : env.trainerMode === 'deep'
            ? env.trainerNumPredictEval
            : env.trainerNumPredictFast)
      ),
      promptLength: Number(backendResult?.promptLength || 0),
      payloadLength: Number(backendResult?.payloadLength || 0),
      backendSource: backendResult?.source || '',
      fullResult: {
        ...result,
        backendSource: backendResult?.source || '',
        backendFallbackUsed: backendResult?.fallbackUsed === true
      },
      promptfooEnv: getSafeEvalConfigForLogs()
    });
  }
}

module.exports = TrainerBotProvider;

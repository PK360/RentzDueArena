const { buildGameStateForGameplay, buildSixPlayerGameplayContext, getRankTierForElo } = require('../shared/rentz-fixtures');
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

class GameplayBotProvider {
  constructor(options = {}) {
    this.providerId = options.label || options.id || 'gameplay-bot';
    this.config = options.config || {};
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context = {}) {
    const startedAt = nowMs();
    const vars = context.vars || {};
    const env = getPromptfooEnv();
    const botsLib = loadBotsLib({
      mode: 'gameplay',
      useRealOllama: env.useRealOllama,
      runtimeMode: env.gameplayMode
    });
    const scenario = vars.useSixPlayerFixture
      ? buildSixPlayerGameplayContext(vars)
      : buildGameStateForGameplay(vars);
    const { gameState, botPlayer, kind, legalMoves, ruleset } = scenario;
    const roomAverageElo = botsLib.getAverageHumanElo(gameState.players || []);
    const botDifficultyElo = botsLib.getBotDifficultyElo(botPlayer, gameState.players || []);
    const promptPayload = botsLib.buildBotPromptPayload({
      kind,
      gameState,
      botPlayer: {
        ...botPlayer,
        averageHumanElo: roomAverageElo,
        difficultyElo: botDifficultyElo
      },
      legalMoves,
      ruleset
    });
    const promptSpec = botsLib.buildGameplayDecisionPrompt({
      kind,
      promptPayload,
      runtimeMode: env.gameplayMode
    });
    const payloadLength = promptSpec.rawPrompt
      ? promptSpec.rawPrompt.length
      : promptSpec.humanPrompt.length;
    const promptLength = promptSpec.rawPrompt
      ? promptSpec.rawPrompt.length
      : promptSpec.systemPrompt.length + promptSpec.humanPrompt.length;

    let result;

    if (env.useRealOllama) {
      const decision = await botsLib.chooseBotMove({
        roomId: vars.roomId || 'PROMPTFOO',
        kind,
        gameState,
        botPlayer,
        legalMoves,
        ruleset
      });
      const selectedMove = decision.selectedMove || null;

      result = {
        moveId: selectedMove?.id || '',
        card: selectedMove?.card || selectedMove?.id || '',
        confidence: decision.confidence,
        reason: decision.reason || '',
        source: decision.source || 'fallback',
        errorCode: decision.errorCode || null,
        botRank: decision.botRank || getRankTierForElo(botDifficultyElo).name,
        botDifficultyElo: decision.botDifficultyElo ?? botDifficultyElo,
        roomAverageElo: decision.roomAverageElo ?? roomAverageElo
      };
    } else {
      const fallbackMove = botsLib.chooseFallbackMove(kind, legalMoves, {
        botProfile: {
          averageHumanElo: roomAverageElo
        },
        gameState
      }) || legalMoves[0] || null;
      const selectedMove = legalMoves.find((move) => move.id === vars.mockSelectedMoveId)
        || legalMoves.find((move) => move.id === vars.expectedMoveId)
        || fallbackMove;

      result = {
        moveId: selectedMove?.id || '',
        card: selectedMove?.card || selectedMove?.id || '',
        confidence: selectedMove ? Number(vars.mockConfidence ?? 0.82) : null,
        reason: vars.mockReason || (
          vars.mockResponseMode === 'malformed-output'
            ? 'Recovered from malformed mock model output with a deterministic legal move.'
            : 'Deterministic mock move chosen from the legal move list.'
        ),
        source: vars.mockResponseMode === 'malformed-output' ? 'mock-fallback' : 'mock',
        botRank: getRankTierForElo(botDifficultyElo).name,
        botDifficultyElo,
        roomAverageElo
      };
    }

    const elapsedMs = nowMs() - startedAt;
    const displayPayload = {
      scenarioId: vars.scenarioId || '',
      mode: env.useRealOllama ? env.gameplayMode : 'mock',
      source: result.source || 'fallback',
      moveId: result.moveId,
      card: result.card,
      elapsedMs,
      fallbackUsed: result.source === 'fallback' || result.source === 'mock-fallback',
      errorCode: result.errorCode || null,
      botRank: result.botRank,
      botDifficultyElo: result.botDifficultyElo,
      confidence: result.confidence,
      reason: previewText(result.reason, 120)
    };

    return buildProviderResult(displayPayload, {
      elapsedMs,
      promptPreview: String(prompt || '').slice(0, 140),
      mode: env.useRealOllama ? env.gameplayMode : 'mock',
      scenarioId: vars.scenarioId || '',
      timeoutMs: Number(env.gameplayMode === 'eval' ? env.gameplayEvalTimeoutMs : env.gameplayLiveTimeoutMs),
      model: env.gameplayModel,
      numPredict: Number(env.gameplayMode === 'eval' ? env.gameplayNumPredictEval : env.gameplayNumPredictLive),
      promptLength,
      payloadLength,
      fullResult: result,
      promptPayloadSummary: {
        decisionType: promptPayload.decisionType,
        legalMoveCount: promptPayload.legalMoves.length,
        rulesetId: promptPayload.contract || null
      },
      promptfooEnv: getSafeEvalConfigForLogs(),
      rawModelOutput: vars.mockResponseMode === 'malformed-output'
        ? '{"moveId":"???","confidence":"not-a-number"}'
        : ''
    });
  }
}

module.exports = GameplayBotProvider;

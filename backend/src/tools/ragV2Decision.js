import { callLLM } from '../llm/client.js';

export const DECISION_THRESHOLDS = Object.freeze({
  update_best_min: 0.82,
  update_margin_min: 0.08,
  create_best_max: 0.58,
  fallback_update_best_min: 0.7,
  fallback_update_margin_min: 0.03,
});
const EPSILON = 1e-9;

/**
 * Task 8: 决策引擎
 * - best>=0.82 且 margin>=0.08 => UPDATE
 * - best<0.58 => CREATE
 * - 中间区间 => LLM 决策
 * - LLM 异常 => 回退规则
 *
 * @param {string} queryText
 * @param {Array} rerankRows - 来自 Task7 的 rerank 数组
 * @param {object} [options]
 * @param {(payload:object)=>Promise<object>} [options.llmDecisionFn]
 * @returns {Promise<object>}
 */
export async function decideCreateOrUpdate(queryText, rerankRows, options = {}) {
  console.log('[RAGv2] 🧾 开始执行 CREATE/UPDATE 决策...');

  if (typeof queryText !== 'string' || queryText.trim().length === 0) {
    throw new Error('decideCreateOrUpdate 需要非空 queryText');
  }
  if (!Array.isArray(rerankRows)) {
    throw new Error('decideCreateOrUpdate 需要 rerankRows 数组');
  }

  const candidates = rerankRows.filter(row =>
    row &&
    typeof row.note_id === 'string' &&
    Number.isFinite(Number(row.rerank_score))
  );

  if (candidates.length === 0) {
    return {
      action: 'CREATE',
      decision_method: 'rule_no_candidate',
      best_score: null,
      margin: null,
      note_id: null,
      reason: 'no candidates',
    };
  }

  const sorted = [...candidates].sort((a, b) => Number(b.rerank_score) - Number(a.rerank_score));
  const top = sorted[0];
  const second = sorted[1] || null;
  const bestScore = Number(top.rerank_score);
  const margin = second ? bestScore - Number(second.rerank_score) : 1;

  if (
    isGte(bestScore, DECISION_THRESHOLDS.update_best_min) &&
    isGte(margin, DECISION_THRESHOLDS.update_margin_min)
  ) {
    return buildUpdateDecision('rule_high_confidence', top, bestScore, margin, 'high confidence by rules');
  }

  if (bestScore < DECISION_THRESHOLDS.create_best_max) {
    return buildCreateDecision('rule_low_confidence', bestScore, margin, 'low confidence by rules');
  }

  const llmDecisionFn = typeof options.llmDecisionFn === 'function'
    ? options.llmDecisionFn
    : defaultLLMDecision;

  try {
    const llmResult = await llmDecisionFn({
      query_text: queryText,
      candidates: sorted.slice(0, 8).map(row => ({
        note_id: row.note_id,
        note_title: row.note_title || '(unknown)',
        rerank_score: Number(row.rerank_score),
        snippet: typeof row.snippet === 'string' ? row.snippet.slice(0, 800) : '',
      })),
      best_score: bestScore,
      margin,
    });

    const normalized = normalizeLLMDecision(llmResult, sorted);
    if (normalized.action === 'UPDATE') {
      return {
        action: 'UPDATE',
        decision_method: 'llm_decision',
        best_score: bestScore,
        margin,
        note_id: normalized.note_id,
        reason: normalized.reason,
      };
    }

    return {
      action: 'CREATE',
      decision_method: 'llm_decision',
      best_score: bestScore,
      margin,
      note_id: null,
      reason: normalized.reason,
    };
  } catch (err) {
    const fallbackReason = `llm_error: ${err.message}`;
    const fallback = fallbackByRules(top, bestScore, margin, fallbackReason);
    return fallback;
  }
}

function fallbackByRules(top, bestScore, margin, reason) {
  if (
    isGte(bestScore, DECISION_THRESHOLDS.fallback_update_best_min) &&
    isGte(margin, DECISION_THRESHOLDS.fallback_update_margin_min)
  ) {
    return buildUpdateDecision('fallback_rule_after_llm_error', top, bestScore, margin, reason);
  }

  return buildCreateDecision('fallback_rule_after_llm_error', bestScore, margin, reason);
}

function buildUpdateDecision(method, top, bestScore, margin, reason) {
  return {
    action: 'UPDATE',
    decision_method: method,
    best_score: bestScore,
    margin,
    note_id: top.note_id,
    reason,
  };
}

function buildCreateDecision(method, bestScore, margin, reason) {
  return {
    action: 'CREATE',
    decision_method: method,
    best_score: bestScore,
    margin,
    note_id: null,
    reason,
  };
}

function normalizeLLMDecision(raw, sortedCandidates) {
  const action = raw?.action;
  if (action !== 'CREATE' && action !== 'UPDATE') {
    throw new Error(`llm action invalid: ${JSON.stringify(raw)}`);
  }

  const reason = typeof raw?.reason === 'string' && raw.reason.trim().length > 0
    ? raw.reason.trim()
    : 'llm decision';

  if (action === 'CREATE') {
    return { action: 'CREATE', note_id: null, reason };
  }

  const requestedId = typeof raw?.target_note_id === 'string' ? raw.target_note_id : '';
  const candidateIds = new Set(sortedCandidates.map(c => c.note_id));
  const noteId = candidateIds.has(requestedId)
    ? requestedId
    : sortedCandidates[0].note_id;

  return {
    action: 'UPDATE',
    note_id: noteId,
    reason,
  };
}

async function defaultLLMDecision(payload) {
  const systemPrompt = `
你是 RAG 决策器。你的任务是判断本次应 CREATE 新笔记还是 UPDATE 已有笔记。
只输出 JSON：
{
  "action": "CREATE" | "UPDATE",
  "target_note_id": "当 action=UPDATE 时必须填写",
  "reason": "简要理由"
}
`;

  const userPrompt = `
用户查询：
${payload.query_text}

候选文档：
${JSON.stringify(payload.candidates, null, 2)}

辅助分数：
${JSON.stringify({ best_score: payload.best_score, margin: payload.margin }, null, 2)}
`;

  return callLLM(userPrompt, systemPrompt, true);
}

function isGte(a, b) {
  return a > b || Math.abs(a - b) <= EPSILON;
}

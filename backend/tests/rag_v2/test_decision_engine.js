import { decideCreateOrUpdate } from '../../src/tools/ragV2Decision.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function buildRow(noteId, score, title = 'Note', snippet = '') {
  return {
    note_id: noteId,
    note_title: title,
    rerank_score: score,
    snippet,
  };
}

async function assertThrowsAsync(fn, expectedText, label) {
  try {
    await fn();
    throw new Error(`${label} 未抛出错误`);
  } catch (err) {
    assert(String(err.message).includes(expectedText), `${label} 错误不匹配: ${err.message}`);
  }
}

async function testInvalidArgs() {
  console.log('[TestDecision] 🧪 case=invalid_args');
  await assertThrowsAsync(
    async () => decideCreateOrUpdate('', []),
    '非空 queryText',
    'invalid_query'
  );
  await assertThrowsAsync(
    async () => decideCreateOrUpdate('react', null),
    'rerankRows 数组',
    'invalid_rerank'
  );
}

async function testNoCandidateBranch() {
  console.log('[TestDecision] 🧪 case=no_candidate');
  const result = await decideCreateOrUpdate('react hooks', []);
  console.log('[TestDecision] 📦 no_candidate_result=', JSON.stringify(result, null, 2));
  assert(result.action === 'CREATE', 'no_candidate 应 CREATE');
  assert(result.decision_method === 'rule_no_candidate', 'no_candidate decision_method 错误');
}

async function testRuleHighConfidenceBranch() {
  console.log('[TestDecision] 🧪 case=rule_high_confidence');
  const result = await decideCreateOrUpdate('react hooks', [
    buildRow('note-a', 0.9, 'React A'),
    buildRow('note-b', 0.79, 'React B'),
  ]);
  console.log('[TestDecision] 📦 rule_high_result=', JSON.stringify(result, null, 2));

  assert(result.action === 'UPDATE', 'rule_high_confidence 应 UPDATE');
  assert(result.note_id === 'note-a', 'rule_high_confidence note_id 错误');
  assert(result.decision_method === 'rule_high_confidence', 'rule_high_confidence method 错误');
}

async function testRuleLowConfidenceBranch() {
  console.log('[TestDecision] 🧪 case=rule_low_confidence');
  const result = await decideCreateOrUpdate('react hooks', [
    buildRow('note-a', 0.57, 'React A'),
    buildRow('note-b', 0.52, 'React B'),
  ]);
  console.log('[TestDecision] 📦 rule_low_result=', JSON.stringify(result, null, 2));

  assert(result.action === 'CREATE', 'rule_low_confidence 应 CREATE');
  assert(result.decision_method === 'rule_low_confidence', 'rule_low_confidence method 错误');
}

async function testRuleBoundaryInclusiveBranch() {
  console.log('[TestDecision] 🧪 case=rule_boundary_inclusive');
  const result = await decideCreateOrUpdate('react hooks', [
    buildRow('note-a', 0.82, 'React A'),
    buildRow('note-b', 0.74, 'React B'),
  ]);
  console.log('[TestDecision] 📦 rule_boundary_result=', JSON.stringify(result, null, 2));

  assert(result.action === 'UPDATE', 'rule_boundary_inclusive 应 UPDATE');
  assert(result.decision_method === 'rule_high_confidence', 'rule_boundary_inclusive method 错误');
}

async function testLLMDecisionUpdateBranch() {
  console.log('[TestDecision] 🧪 case=llm_update');
  const result = await decideCreateOrUpdate(
    'react hooks',
    [
      buildRow('note-a', 0.75, 'React A'),
      buildRow('note-b', 0.72, 'React B'),
    ],
    {
      llmDecisionFn: async () => ({
        action: 'UPDATE',
        target_note_id: 'note-b',
        reason: 'B is more semantically aligned',
      }),
    }
  );
  console.log('[TestDecision] 📦 llm_update_result=', JSON.stringify(result, null, 2));

  assert(result.action === 'UPDATE', 'llm_update 应 UPDATE');
  assert(result.note_id === 'note-b', 'llm_update 应尊重 target_note_id');
  assert(result.decision_method === 'llm_decision', 'llm_update method 错误');
}

async function testLLMDecisionCreateBranch() {
  console.log('[TestDecision] 🧪 case=llm_create');
  const result = await decideCreateOrUpdate(
    'react hooks',
    [
      buildRow('note-a', 0.76, 'React A'),
      buildRow('note-b', 0.73, 'React B'),
    ],
    {
      llmDecisionFn: async () => ({
        action: 'CREATE',
        reason: 'query introduces new topic',
      }),
    }
  );
  console.log('[TestDecision] 📦 llm_create_result=', JSON.stringify(result, null, 2));

  assert(result.action === 'CREATE', 'llm_create 应 CREATE');
  assert(result.decision_method === 'llm_decision', 'llm_create method 错误');
}

async function testLLMInvalidPayloadFallbackBranch() {
  console.log('[TestDecision] 🧪 case=llm_invalid_payload_fallback');
  const result = await decideCreateOrUpdate(
    'react hooks',
    [
      buildRow('note-a', 0.78, 'React A'),
      buildRow('note-b', 0.74, 'React B'),
    ],
    {
      llmDecisionFn: async () => ({
        action: 'UNKNOWN',
      }),
    }
  );
  console.log('[TestDecision] 📦 llm_invalid_payload_result=', JSON.stringify(result, null, 2));

  assert(result.decision_method === 'fallback_rule_after_llm_error', 'llm_invalid_payload 应 fallback');
  assert(result.action === 'UPDATE', 'llm_invalid_payload fallback 规则应 UPDATE');
  assert(result.note_id === 'note-a', 'llm_invalid_payload fallback 应回退到 top1');
}

async function testLLMThrowsFallbackCreateBranch() {
  console.log('[TestDecision] 🧪 case=llm_throw_fallback_create');
  const result = await decideCreateOrUpdate(
    'react hooks',
    [
      buildRow('note-a', 0.69, 'React A'),
      buildRow('note-b', 0.68, 'React B'),
    ],
    {
      llmDecisionFn: async () => {
        throw new Error('mock_llm_unavailable');
      },
    }
  );
  console.log('[TestDecision] 📦 llm_throw_fallback_create_result=', JSON.stringify(result, null, 2));

  assert(result.decision_method === 'fallback_rule_after_llm_error', 'llm_throw 应 fallback');
  assert(result.action === 'CREATE', 'llm_throw 低分 fallback 应 CREATE');
}

async function run() {
  console.log('[TestDecision] 🚀 开始测试 Task 8 决策引擎');
  await testInvalidArgs();
  await testNoCandidateBranch();
  await testRuleHighConfidenceBranch();
  await testRuleLowConfidenceBranch();
  await testRuleBoundaryInclusiveBranch();
  await testLLMDecisionUpdateBranch();
  await testLLMDecisionCreateBranch();
  await testLLMInvalidPayloadFallbackBranch();
  await testLLMThrowsFallbackCreateBranch();
  console.log('[TestDecision] ✅ 所有 case 通过');
}

run().catch(err => {
  console.error('[TestDecision] ❌ 测试失败:', err.message);
  process.exit(1);
});

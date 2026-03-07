import {
  buildDocSnippet,
  fallbackCrossEncoderScore,
  rerankTopDocs,
} from '../../src/tools/ragV2Reranker.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertThrowsAsync(fn, expectedText, label) {
  return fn()
    .then(() => {
      throw new Error(`${label} 未抛出错误`);
    })
    .catch(err => {
      assert(String(err.message).includes(expectedText), `${label} 错误不匹配: ${err.message}`);
    });
}

function buildDoc(noteId, title, aggScore, chunks) {
  return {
    note_id: noteId,
    note_title: title,
    agg_score: aggScore,
    chunks,
  };
}

async function testInvalidArgs() {
  console.log('[TestReranker] 🧪 case=invalid_args');
  await assertThrowsAsync(
    async () => rerankTopDocs('', []),
    '非空 queryText',
    'invalid_query'
  );
  await assertThrowsAsync(
    async () => rerankTopDocs('react', null),
    'topDocs 数组',
    'invalid_top_docs'
  );
  await assertThrowsAsync(
    async () => rerankTopDocs('react', [buildDoc('x', 'X', 0.1, [{ chunk_text: 'x' }])], { topN: 0 }),
    'topN 必须是正整数',
    'invalid_topn'
  );
}

async function testEmptyBranch() {
  console.log('[TestReranker] 🧪 case=empty_branch');
  const result = await rerankTopDocs('react', []);
  assert(result.rerank.length === 0, 'empty_branch rerank 应为空');
  assert(result.used_fallback === false, 'empty_branch used_fallback 应为 false');
}

async function testBuildSnippetRules() {
  console.log('[TestReranker] 🧪 case=snippet_rules');
  const doc = buildDoc('d1', 'Doc 1', 0.7, [
    { chunk_text: `chunk-1-${'a'.repeat(1000)}` },
    { chunk_text: `chunk-2-${'b'.repeat(1000)}` },
    { chunk_text: 'chunk-3-should-not-appear' },
  ]);

  const snippet = buildDocSnippet(doc);
  assert(snippet.includes('chunk-1-'), 'snippet 应包含第1块');
  assert(snippet.includes('chunk-2-'), 'snippet 应包含第2块');
  assert(!snippet.includes('chunk-3-should-not-appear'), 'snippet 不应包含第3块');
  assert(snippet.length <= 1800, 'snippet 长度不应超过 1800');
}

async function testRerankWithCrossEncoderFn() {
  console.log('[TestReranker] 🧪 case=rerank_with_cross_encoder_fn');
  const docs = [
    buildDoc('react-doc', 'React Doc', 0.6, [
      { chunk_text: 'react hooks useState useEffect' },
      { chunk_text: 'state management pattern' },
    ]),
    buildDoc('docker-doc', 'Docker Doc', 0.9, [
      { chunk_text: 'docker image and container basics' },
      { chunk_text: 'dockerfile build command' },
    ]),
  ];

  const mockCrossEncoder = async (query, snippet) => {
    const q = query.toLowerCase();
    const s = snippet.toLowerCase();
    if (q.includes('react') && s.includes('react')) {
      return 0.95;
    }
    if (q.includes('react') && s.includes('docker')) {
      return 0.12;
    }
    return 0.2;
  };

  const result = await rerankTopDocs('react hooks', docs, {
    topN: 1,
    crossEncoderFn: mockCrossEncoder,
    modelName: 'mock-cross-encoder',
  });
  console.log('[TestReranker] 📦 rerank_cross_encoder_result=', JSON.stringify(result, null, 2));

  assert(result.model === 'mock-cross-encoder', 'modelName 应透传');
  assert(result.used_fallback === false, 'cross_encoder 成功时不应 fallback');
  assert(result.rerank.length === 1, 'topN=1 应只返回1条');
  assert(result.rerank[0].note_id === 'react-doc', '重排 Top1 应为 react-doc');
  assert(result.rerank[0].score_source === 'cross_encoder', 'score_source 应为 cross_encoder');
}

async function testFallbackBranch() {
  console.log('[TestReranker] 🧪 case=fallback_branch');
  const docs = [
    buildDoc('doc-a', 'Doc A', 0.88, [{ chunk_text: 'a content' }]),
    buildDoc('doc-b', 'Doc B', 0.66, [{ chunk_text: 'b content' }]),
  ];

  const errorCrossEncoder = async () => {
    throw new Error('mock_cross_encoder_failed');
  };

  const result = await rerankTopDocs('anything', docs, {
    crossEncoderFn: errorCrossEncoder,
  });
  console.log('[TestReranker] 📦 rerank_fallback_result=', JSON.stringify(result, null, 2));

  assert(result.used_fallback === true, 'fallback_branch 应标记 used_fallback');
  assert(result.rerank[0].note_id === 'doc-a', 'fallback_branch 应按 agg_score 排序');
  assert(result.rerank[0].score_source === 'agg_fallback', 'fallback_branch score_source 应为 agg_fallback');
}

async function testBuiltInFallbackScorer() {
  console.log('[TestReranker] 🧪 case=builtin_fallback_scorer');
  const high = await fallbackCrossEncoderScore('react hooks', 'react hooks useState pattern');
  const low = await fallbackCrossEncoderScore('react hooks', 'docker image container');
  assert(high > low, 'builtin fallback scorer 语义相关分应更高');
}

async function run() {
  console.log('[TestReranker] 🚀 开始测试 Task 7 重排');
  await testInvalidArgs();
  await testEmptyBranch();
  await testBuildSnippetRules();
  await testRerankWithCrossEncoderFn();
  await testFallbackBranch();
  await testBuiltInFallbackScorer();
  console.log('[TestReranker] ✅ 所有 case 通过');
}

run().catch(err => {
  console.error('[TestReranker] ❌ 测试失败:', err.message);
  process.exit(1);
});

import {
  aggregateChunksToDocs,
  computeSectionCoverage,
} from '../../src/tools/ragV2Aggregator.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertClose(actual, expected, eps, label) {
  const ok = Math.abs(actual - expected) <= eps;
  assert(ok, `${label} 不匹配: actual=${actual}, expected=${expected}`);
}

function assertThrows(fn, expectedText, label) {
  let ok = false;
  try {
    fn();
  } catch (err) {
    ok = String(err.message).includes(expectedText);
  }
  assert(ok, `${label} 未抛出预期错误: ${expectedText}`);
}

function testInvalidArgs() {
  console.log('[TestDocAgg] 🧪 case=invalid_args');
  assertThrows(
    () => aggregateChunksToDocs(null),
    'topChunks 数组',
    'invalid_top_chunks'
  );
  assertThrows(
    () => aggregateChunksToDocs([], { topN: 0 }),
    'topN 必须是正整数',
    'invalid_topn'
  );
}

function testEmptyBranch() {
  console.log('[TestDocAgg] 🧪 case=empty_branch');
  const result = aggregateChunksToDocs([]);
  assert(Array.isArray(result.top_docs), 'empty_branch top_docs 应为数组');
  assert(result.top_docs.length === 0, 'empty_branch 应返回空结果');
}

function testCoverageHelper() {
  console.log('[TestDocAgg] 🧪 case=coverage_helper');
  const coverage1 = computeSectionCoverage([
    { section_path: 'A' },
    { section_path: 'A' },
    { section_path: 'A' },
  ]);
  assertClose(coverage1, 1 / 3, 0.000001, 'coverage_same_section');

  const coverage2 = computeSectionCoverage([
    { section_path: 'A' },
    { section_path: 'B' },
    { section_path: 'C' },
  ]);
  assertClose(coverage2, 1, 0.000001, 'coverage_three_sections');
}

function testFormulaAndRanking() {
  console.log('[TestDocAgg] 🧪 case=formula_and_ranking');
  const chunks = [
    // doc A: max 0.90, top3 mean 0.80, coverage 1.0 -> 0.885
    { note_id: 'docA', note_title: 'Doc A', chunk_id: 'a1', section_path: 'S1', score: 0.90, chunk_text: 'a1' },
    { note_id: 'docA', note_title: 'Doc A', chunk_id: 'a2', section_path: 'S2', score: 0.80, chunk_text: 'a2' },
    { note_id: 'docA', note_title: 'Doc A', chunk_id: 'a3', section_path: 'S3', score: 0.70, chunk_text: 'a3' },
    // doc B: max 0.92, top3 mean 0.70, coverage 1/3 -> ~0.766
    { note_id: 'docB', note_title: 'Doc B', chunk_id: 'b1', section_path: 'X', score: 0.92, chunk_text: 'b1' },
    { note_id: 'docB', note_title: 'Doc B', chunk_id: 'b2', section_path: 'X', score: 0.60, chunk_text: 'b2' },
    { note_id: 'docB', note_title: 'Doc B', chunk_id: 'b3', section_path: 'X', score: 0.58, chunk_text: 'b3' },
  ];

  const result = aggregateChunksToDocs(chunks, { topN: 8 });
  console.log('[TestDocAgg] 📦 ranking_result=', JSON.stringify(result, null, 2));

  assert(result.top_docs.length === 2, 'formula_and_ranking 文档数应为 2');
  assert(result.top_docs[0].note_id === 'docA', 'formula_and_ranking Top1 应为 docA');
  assert(result.top_docs[1].note_id === 'docB', 'formula_and_ranking Top2 应为 docB');

  const docA = result.top_docs[0];
  const docB = result.top_docs[1];
  assertClose(docA.agg_score, 0.885, 0.000001, 'docA_agg_score');
  assertClose(docB.agg_score, 0.766, 0.000001, 'docB_agg_score');
}

function testTopNLimitAndSkipInvalidChunk() {
  console.log('[TestDocAgg] 🧪 case=topn_limit_and_skip_invalid_chunk');
  const chunks = [
    { note_id: 'd1', note_title: 'D1', section_path: 'A', score: 0.9, chunk_text: '1' },
    { note_id: 'd2', note_title: 'D2', section_path: 'A', score: 0.8, chunk_text: '2' },
    { note_id: 'd3', note_title: 'D3', section_path: 'A', score: 0.7, chunk_text: '3' },
    { note_id: null, note_title: 'BAD', section_path: 'A', score: 0.99, chunk_text: 'bad-note-id' },
    { note_id: 'd2', note_title: 'D2', section_path: 'B', score: 'bad-score', chunk_text: 'bad-score' },
  ];

  const result = aggregateChunksToDocs(chunks, { topN: 2 });
  console.log('[TestDocAgg] 📦 topn_result=', JSON.stringify(result, null, 2));

  assert(result.top_docs.length === 2, 'topN_limit 应只返回 2 条');
  assert(result.top_docs[0].note_id === 'd1', 'topN_limit 排序 Top1 错误');
  assert(result.top_docs[1].note_id === 'd2', 'topN_limit 排序 Top2 错误');
}

function run() {
  console.log('[TestDocAgg] 🚀 开始测试 Task 6 文档聚合');
  testInvalidArgs();
  testEmptyBranch();
  testCoverageHelper();
  testFormulaAndRanking();
  testTopNLimitAndSkipInvalidChunk();
  console.log('[TestDocAgg] ✅ 所有 case 通过');
}

run();


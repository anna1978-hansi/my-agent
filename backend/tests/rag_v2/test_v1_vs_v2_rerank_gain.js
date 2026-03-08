import { aggregateChunksToDocs } from '../../src/tools/ragV2Aggregator.js';
import { rerankTopDocs } from '../../src/tools/ragV2Reranker.js';
import { generateEmbedding } from '../../src/tools/rag.js';
import { callLLM } from '../../src/llm/client.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function cosineSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length !== vecB.length || vecA.length === 0) {
    throw new Error('cosineSimilarity 输入非法');
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i += 1) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function llmSemanticCrossEncoderScore(query, snippet, doc) {
  const systemPrompt = `
你是语义重排打分器。给定 query 与候选文档片段，请输出 0~1 的语义相关分数。
只输出 JSON：
{
  "score": 0.0,
  "reason": "一句话解释"
}
规则：
1) score 必须是 0~1 的数字。
2) 关注问题是否“同一问题 + 同一修复目标”，不要只看关键词重叠。
3) 若主题相近但问题不一致（如性能 vs 内存泄漏排查），分数应明显降低。
`;

  const userPrompt = `
query:
${query}

candidate_title:
${doc?.note_title || '(unknown)'}

candidate_snippet:
${snippet}
`;

  const raw = await callLLM(userPrompt, systemPrompt, true);
  const score = Number(raw?.score);
  if (!Number.isFinite(score)) {
    throw new Error(`llm_semantic_score_invalid: ${JSON.stringify(raw)}`);
  }

  const clipped = Math.max(0, Math.min(1, score));
  console.log(`[TestV1V2] 🧠 LLM semantic score note_id=${doc?.note_id || '(unknown)'} score=${clipped.toFixed(4)} reason=${raw?.reason || ''}`);
  return clipped;
}

async function buildChunkScore(queryEmbedding, noteId, noteTitle, chunkId, chunkIndex, sectionPath, chunkText) {
  const emb = await generateEmbedding(chunkText);
  const score = cosineSimilarity(queryEmbedding, emb);
  return {
    note_id: noteId,
    note_title: noteTitle,
    chunk_id: chunkId,
    chunk_index: chunkIndex,
    section_path: sectionPath,
    chunk_text: chunkText,
    score,
  };
}

async function run() {
  console.log('[TestV1V2] 🚀 开始对比：V1 embedding vs V2 LLM semantic rerank');

  const queryText = [
    '我们线上有一个 React 18 页面，开发模式 StrictMode 开启后，',
    'useEffect 里的 websocket 订阅逻辑会出现重复绑定，',
    '表现是消息回调触发次数越来越多，内存曲线持续上升，页面停留 20 分钟后出现明显卡顿。',
    '现有代码里 cleanup 写了 removeEventListener，但在路由切换和重连场景仍然泄漏。',
    '我需要的是“根因定位 + 稳定修复方案”，包括如何保证 effect 幂等、如何处理重连状态、',
    '以及怎么验证 listener 数量不会继续增长。',
  ].join('');

  const docAText = [
    '# React StrictMode 下 websocket 重复订阅排查',
    '我们复盘了一个 useEffect cleanup 失效问题：组件在 mount/unmount + reconnect 组合路径下重复注册 listener。',
    '核心根因是 effect 闭包里 capture 的 socket 引用不稳定，cleanup 阶段 remove 的并不是最后一次 add 的 handler。',
    '修复策略：1) 抽离稳定 handler 引用；2) 引入 idempotent guard；3) reconnect 前显式 teardown；',
    '验证方式：记录 listener count、heap snapshot、长时会话压测。',
  ].join('\n');

  const docBText = [
    '# React StrictMode websocket 重复订阅监控方案',
    '这篇也在 React 18 + StrictMode + websocket 场景下讨论 useEffect cleanup 相关现象，',
    '记录了 listener count 上升、消息重复消费、内存曲线波动等指标。',
    '但重点是如何做观测与告警：埋点、仪表盘、阈值报警、回放链路，不讨论根因修复和幂等治理落地。',
  ].join('\n');

  // V1：按“整篇文档 embedding”比较相似度（真实调用项目 embedding 函数）
  console.log('[TestV1V2] 🧠 计算 V1 文档级 embedding 相似度...');
  const queryEmbedding = await generateEmbedding(queryText);
  const docAEmbedding = await generateEmbedding(docAText);
  const docBEmbedding = await generateEmbedding(docBText);
  const v1ScoreA = cosineSimilarity(queryEmbedding, docAEmbedding);
  const v1ScoreB = cosineSimilarity(queryEmbedding, docBEmbedding);

  // V2：构造 chunk 候选，并用真实 embedding 计算 chunk 级分数，再走聚合+精排
  console.log('[TestV1V2] 🧩 计算 V2 chunk 级分数并聚合...');
  const topChunks = [];

  topChunks.push(await buildChunkScore(
    queryEmbedding,
    'doc-a',
    'React Cleanup Incident',
    'a1',
    0,
    'RootCause',
    'StrictMode + reconnect 导致重复 addEventListener，cleanup 移除目标不一致，listener 逐步累积。'
  ));
  topChunks.push(await buildChunkScore(
    queryEmbedding,
    'doc-a',
    'React Cleanup Incident',
    'a2',
    1,
    'FixPlan',
    '使用稳定 handler 引用、幂等订阅保护、重连前 teardown，并用 listener count 回归验证。'
  ));
  topChunks.push(await buildChunkScore(
    queryEmbedding,
    'doc-b',
    'React Rendering Metrics',
    'b1',
    0,
    'Perf',
    '在 StrictMode + websocket 场景下采集 listener_count、重复消息率、内存斜率，建立监控面板。'
  ));
  topChunks.push(await buildChunkScore(
    queryEmbedding,
    'doc-b',
    'React Rendering Metrics',
    'b2',
    1,
    'Perf',
    '通过告警规则发现 cleanup 异常，但本文不覆盖 root cause 分析与修复方案，只讨论观测体系。'
  ));

  const aggregated = aggregateChunksToDocs(topChunks, { topN: 8 });
  const reranked = await rerankTopDocs(queryText, aggregated.top_docs, {
    topN: 8,
    crossEncoderFn: llmSemanticCrossEncoderScore,
    modelName: 'llm-semantic-reranker-v1',
  });

  const aggA = aggregated.top_docs.find(doc => doc.note_id === 'doc-a');
  const aggB = aggregated.top_docs.find(doc => doc.note_id === 'doc-b');
  const rerankA = reranked.rerank.find(row => row.note_id === 'doc-a');
  const rerankB = reranked.rerank.find(row => row.note_id === 'doc-b');

  const output = {
    query_preview: queryText.slice(0, 80),
    v1_note_level_similarity: {
      doc_a: Number(v1ScoreA.toFixed(6)),
      doc_b: Number(v1ScoreB.toFixed(6)),
      abs_diff: Number(Math.abs(v1ScoreA - v1ScoreB).toFixed(6)),
      top1: v1ScoreA >= v1ScoreB ? 'doc-a' : 'doc-b',
    },
    v2_aggregate_stage: {
      doc_a_agg: Number((aggA?.agg_score ?? 0).toFixed(6)),
      doc_b_agg: Number((aggB?.agg_score ?? 0).toFixed(6)),
      top1: (aggregated.top_docs[0] && aggregated.top_docs[0].note_id) || null,
    },
    v2_rerank_stage: {
      doc_a_rerank: Number((rerankA?.rerank_score ?? 0).toFixed(6)),
      doc_b_rerank: Number((rerankB?.rerank_score ?? 0).toFixed(6)),
      abs_diff: Number(Math.abs((rerankA?.rerank_score ?? 0) - (rerankB?.rerank_score ?? 0)).toFixed(6)),
      top1: (reranked.rerank[0] && reranked.rerank[0].note_id) || null,
      score_source: reranked.rerank.map(r => ({ note_id: r.note_id, score_source: r.score_source })),
    },
  };

  console.log('[TestV1V2] 📦 对比结果:');
  console.log(JSON.stringify(output, null, 2));

  assert(Math.abs(v1ScoreA - v1ScoreB) <= 0.2, 'V1 两个候选 embedding 分数不够接近，无法体现问题');
  assert((reranked.rerank[0] && reranked.rerank[0].note_id) === 'doc-a', '精排阶段应把更语义相关的 doc-a 提升到 Top1');
  assert(
    Math.abs((rerankA?.rerank_score ?? 0) - (rerankB?.rerank_score ?? 0)) >= 0.2,
    '精排分差不够明显，未体现升级收益'
  );

  console.log('[TestV1V2] ✅ 结论成立：V1 分数接近，但 V2 语义精排能明显拉开差距');
}

run().catch(err => {
  console.error('[TestV1V2] ❌ 测试失败:', err.message);
  process.exit(1);
});

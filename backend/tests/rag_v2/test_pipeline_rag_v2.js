import fs from 'fs';
import path from 'path';
import { executeKnowledge } from '../../src/agent/executor.js';
import { saveNote } from '../../src/db/notes.js';
import { indexNoteById } from '../../src/tools/chunkIndexer.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function writeTmpMarkdown(fileName, content) {
  const filePath = path.join('/tmp', fileName);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function keywordEmbedding(text) {
  const src = String(text || '').toLowerCase();
  const react = (src.match(/react|hook|usestate|useeffect|cleanup|fiber|scheduler|state/g) || []).length;
  const docker = (src.match(/docker|container|image|dockerfile|compose/g) || []).length;
  const redis = (src.match(/redis|cache|ttl|eviction/g) || []).length;
  return [react + 1, docker + 1, redis + 1];
}

function buildCrossEncoderById(scoreMap) {
  return async (_query, _snippet, doc) => {
    if (doc && Object.prototype.hasOwnProperty.call(scoreMap, doc.note_id)) {
      return scoreMap[doc.note_id];
    }
    return 0.2;
  };
}

async function seedIndexedNote({ title, rawChat, markdown }) {
  const filePath = writeTmpMarkdown(
    `rag-v2-pipeline-${Date.now()}-${Math.random().toString(16).slice(2)}.md`,
    markdown
  );

  const note = saveNote({
    intent: 'Concept',
    data: { title, use_cases: ['pipeline-rag-v2-e2e'] },
    raw_chat: rawChat,
    file_path: filePath,
    embedding: null,
  });

  const indexResult = await indexNoteById(note.id, {
    embeddingFn: async text => keywordEmbedding(text),
  });
  assert(indexResult.status === 'ready', `seed 索引失败: ${title}`);

  return {
    ...note,
    file_path: filePath,
  };
}

function buildLongReactMarkdown() {
  return `
# React Rendering Deep Dive

## Fiber
React Fiber is the incremental rendering architecture. It splits work into units and can pause/restart.
${'Fiber scheduling detail. '.repeat(80)}

## Hooks
useState and useEffect are the most common hooks. Cleanup is important for side effects.
${'useEffect cleanup memory leak prevention. '.repeat(80)}

## Performance
Memoization and avoiding unnecessary re-render are key.
${'state update batching and render optimization. '.repeat(80)}
`.trim();
}

function buildPayload(queryText, createMode = 'confirm') {
  return {
    intent: 'Concept',
    data: {
      title: 'Pipeline RAG v2 Draft',
      summary: 'draft summary',
      key_points: ['k1'],
      use_cases: ['u1'],
      links: [],
    },
    raw_chat: queryText,
    embedding: [0.1, 0.2, 0.3],
    create_mode: createMode,
    use_rag_v2: true,
  };
}

function summarizeResult(result) {
  return {
    action: result.action,
    mode: result.mode || null,
    note_id: result.note_id || null,
    score: result.score ?? null,
    decision_method: result.retrieval_debug?.decision_method || null,
    best_score: result.retrieval_debug?.best_score ?? null,
    margin: result.retrieval_debug?.margin ?? null,
    top_chunks: Array.isArray(result.retrieval_debug?.top_chunks)
      ? result.retrieval_debug.top_chunks.length
      : 0,
    top_docs: Array.isArray(result.retrieval_debug?.top_docs)
      ? result.retrieval_debug.top_docs.length
      : 0,
    rerank: Array.isArray(result.retrieval_debug?.rerank)
      ? result.retrieval_debug.rerank.length
      : 0,
  };
}

async function testLongDocMerge(noteIds, reactNote, dockerNote, redisNote) {
  console.log('[TestPipelineRAGv2] 🧪 case=long_doc_merge');
  const result = await executeKnowledge({
    ...buildPayload('React useEffect cleanup causes memory leak, how to fix in long doc?'),
    rag_v2_options: {
      noteIds,
      embeddingFn: async text => keywordEmbedding(text),
      crossEncoderFn: buildCrossEncoderById({
        [reactNote.id]: 0.94,
        [dockerNote.id]: 0.22,
        [redisNote.id]: 0.11,
      }),
      llmDecisionFn: async () => {
        throw new Error('long_doc_merge should not call llm');
      },
      proposeMergeFn: async (oldMarkdown, _data) => `${oldMarkdown}\n\n## Merge from e2e\nlong-doc-update`,
    },
  });

  console.log('[TestPipelineRAGv2] 📦 long_doc_merge_result=', JSON.stringify(summarizeResult(result), null, 2));
  assert(result.action === 'MERGE', 'long_doc_merge 应为 MERGE');
  assert(result.note_id === reactNote.id, 'long_doc_merge 应命中 React 长文档');
  assert(typeof result.proposed_content === 'string' && result.proposed_content.includes('long-doc-update'), 'long_doc_merge 合并内容异常');
  assert(result.retrieval_debug?.decision_method === 'rule_high_confidence', 'long_doc_merge decision_method 错误');
  assert(Array.isArray(result.retrieval_debug?.top_chunks) && result.retrieval_debug.top_chunks.length > 0, 'long_doc_merge top_chunks 为空');
}

async function testCrossTopicCreate(noteIds, reactNote, dockerNote, redisNote) {
  console.log('[TestPipelineRAGv2] 🧪 case=cross_topic_create');
  const result = await executeKnowledge({
    ...buildPayload('How to design Kafka stream exactly-once transaction pipeline?'),
    rag_v2_options: {
      noteIds,
      embeddingFn: async text => keywordEmbedding(text),
      crossEncoderFn: buildCrossEncoderById({
        [reactNote.id]: 0.41,
        [dockerNote.id]: 0.39,
        [redisNote.id]: 0.37,
      }),
    },
  });

  console.log('[TestPipelineRAGv2] 📦 cross_topic_create_result=', JSON.stringify(summarizeResult(result), null, 2));
  assert(result.action === 'CREATE', 'cross_topic_create 应为 CREATE');
  assert(result.mode === 'confirm', 'cross_topic_create 应保留 confirm');
  assert(result.retrieval_debug?.decision_method === 'rule_low_confidence', 'cross_topic_create decision_method 错误');
}

async function testBoundaryThresholdMerge(noteIds, reactNote, dockerNote, redisNote) {
  console.log('[TestPipelineRAGv2] 🧪 case=boundary_threshold_merge');
  const result = await executeKnowledge({
    ...buildPayload('React boundary test for update threshold'),
    rag_v2_options: {
      noteIds,
      embeddingFn: async text => keywordEmbedding(text),
      // best=0.82, second=0.74 => margin=0.08，命中 UPDATE 边界
      crossEncoderFn: buildCrossEncoderById({
        [reactNote.id]: 0.82,
        [dockerNote.id]: 0.74,
        [redisNote.id]: 0.2,
      }),
      llmDecisionFn: async () => {
        throw new Error('boundary_threshold_merge should not call llm');
      },
      proposeMergeFn: async (oldMarkdown, _data) => `${oldMarkdown}\n\n## Boundary Merge\nok`,
    },
  });

  console.log('[TestPipelineRAGv2] 📦 boundary_threshold_merge_result=', JSON.stringify(summarizeResult(result), null, 2));
  assert(result.action === 'MERGE', 'boundary_threshold_merge 应为 MERGE');
  assert(result.note_id === reactNote.id, 'boundary_threshold_merge 应命中 React');
  assert(result.retrieval_debug?.decision_method === 'rule_high_confidence', 'boundary_threshold_merge method 错误');
}

async function testLLMFallbackUpdate(noteIds, reactNote, dockerNote, redisNote) {
  console.log('[TestPipelineRAGv2] 🧪 case=llm_fallback_update');
  const result = await executeKnowledge({
    ...buildPayload('React fallback update case'),
    rag_v2_options: {
      noteIds,
      embeddingFn: async text => keywordEmbedding(text),
      // 中间区间：best=0.75, second=0.71 => 触发 LLM；LLM 报错后 fallback 仍应 UPDATE
      crossEncoderFn: buildCrossEncoderById({
        [reactNote.id]: 0.75,
        [dockerNote.id]: 0.71,
        [redisNote.id]: 0.4,
      }),
      llmDecisionFn: async () => {
        throw new Error('mock_llm_down');
      },
      proposeMergeFn: async (oldMarkdown, _data) => `${oldMarkdown}\n\n## Fallback Merge\nok`,
    },
  });

  console.log('[TestPipelineRAGv2] 📦 llm_fallback_update_result=', JSON.stringify(summarizeResult(result), null, 2));
  assert(result.action === 'MERGE', 'llm_fallback_update 应为 MERGE');
  assert(result.retrieval_debug?.decision_method === 'fallback_rule_after_llm_error', 'llm_fallback_update method 错误');
  assert(result.retrieval_debug?.reason?.includes('llm_error'), 'llm_fallback_update 应记录 llm_error');
}

async function testLLMFallbackCreate(noteIds, reactNote, dockerNote, redisNote) {
  console.log('[TestPipelineRAGv2] 🧪 case=llm_fallback_create');
  const result = await executeKnowledge({
    ...buildPayload('React fallback create case'),
    rag_v2_options: {
      noteIds,
      embeddingFn: async text => keywordEmbedding(text),
      // 中间区间：best=0.69, second=0.68 -> LLM报错后 fallback 应 CREATE
      crossEncoderFn: buildCrossEncoderById({
        [reactNote.id]: 0.69,
        [dockerNote.id]: 0.68,
        [redisNote.id]: 0.65,
      }),
      llmDecisionFn: async () => {
        throw new Error('mock_llm_timeout');
      },
    },
  });

  console.log('[TestPipelineRAGv2] 📦 llm_fallback_create_result=', JSON.stringify(summarizeResult(result), null, 2));
  assert(result.action === 'CREATE', 'llm_fallback_create 应为 CREATE');
  assert(result.mode === 'confirm', 'llm_fallback_create 应保留 confirm');
  assert(result.retrieval_debug?.decision_method === 'fallback_rule_after_llm_error', 'llm_fallback_create method 错误');
}

async function run() {
  console.log('[TestPipelineRAGv2] 🚀 开始执行 Task 11 端到端验收');

  const reactNote = await seedIndexedNote({
    title: `RAGv2 E2E React Long ${Date.now()}`,
    rawChat: 'react hooks fiber scheduler cleanup performance',
    markdown: buildLongReactMarkdown(),
  });
  const dockerNote = await seedIndexedNote({
    title: `RAGv2 E2E Docker ${Date.now()}`,
    rawChat: 'docker image container dockerfile compose',
    markdown: `
# Docker Guide
## Basics
Docker image and container lifecycle.

## Build
Dockerfile build cache layers.
`.trim(),
  });
  const redisNote = await seedIndexedNote({
    title: `RAGv2 E2E Redis ${Date.now()}`,
    rawChat: 'redis cache ttl eviction policy',
    markdown: `
# Redis Guide
## Cache
TTL and eviction strategies.
`.trim(),
  });

  const noteIds = [reactNote.id, dockerNote.id, redisNote.id];

  await testLongDocMerge(noteIds, reactNote, dockerNote, redisNote);
  await testCrossTopicCreate(noteIds, reactNote, dockerNote, redisNote);
  await testBoundaryThresholdMerge(noteIds, reactNote, dockerNote, redisNote);
  await testLLMFallbackUpdate(noteIds, reactNote, dockerNote, redisNote);
  await testLLMFallbackCreate(noteIds, reactNote, dockerNote, redisNote);

  console.log('[TestPipelineRAGv2] ✅ 所有 case 通过');
}

run().catch(err => {
  console.error('[TestPipelineRAGv2] ❌ 测试失败:', err.message);
  process.exit(1);
});

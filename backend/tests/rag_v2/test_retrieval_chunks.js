import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import db from '../../src/db/index.js';
import { saveNote } from '../../src/db/notes.js';
import { indexNoteById } from '../../src/tools/chunkIndexer.js';
import {
  dotProduct,
  l2Normalize,
  retrieveTopChunks,
} from '../../src/tools/ragV2Retriever.js';

const DB_PATH = path.resolve(process.cwd(), 'backend/data/branchnote.db');
const readonlyDb = new Database(DB_PATH, { readonly: true });

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

function keywordEmbedding(text) {
  const src = String(text || '').toLowerCase();
  const react = (src.match(/react|hook|state/g) || []).length;
  const docker = (src.match(/docker|container|image/g) || []).length;
  const redis = (src.match(/redis|cache|ttl/g) || []).length;
  return [react + 1, docker + 1, redis + 1];
}

function writeTempMarkdown(name, content) {
  const p = path.join('/tmp', name);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

async function seedIndexedNote(title, rawChat, markdownContent) {
  const filePath = writeTempMarkdown(`rag-v2-retrieval-${Date.now()}-${Math.random()}.md`, markdownContent);
  const note = saveNote({
    intent: 'Concept',
    data: { title, use_cases: ['retrieval-test'] },
    raw_chat: rawChat,
    file_path: filePath,
    embedding: null,
  });

  const indexResult = await indexNoteById(note.id, {
    embeddingFn: async text => keywordEmbedding(text),
  });

  assert(indexResult.status === 'ready', `seed note 索引失败: ${title}`);
  return note;
}

async function testMathHelpers() {
  console.log('[TestRetrieval] 🧪 case=math_helpers');
  const v = l2Normalize([3, 4]);
  assert(Math.abs(v[0] - 0.6) < 0.000001, 'l2Normalize 计算错误');
  assert(Math.abs(v[1] - 0.8) < 0.000001, 'l2Normalize 计算错误');

  const dot = dotProduct([1, 2, 3], [4, 5, 6]);
  assert(dot === 32, 'dotProduct 计算错误');

  await assertThrowsAsync(
    async () => l2Normalize([0, 0, 0]),
    '全 0 向量',
    'l2Normalize_zero_vec'
  );
}

async function testInvalidArgs() {
  console.log('[TestRetrieval] 🧪 case=invalid_args');
  await assertThrowsAsync(
    async () => retrieveTopChunks(''),
    '非空 queryText',
    'retrieve_invalid_query'
  );
  await assertThrowsAsync(
    async () => retrieveTopChunks('ok', { topK: 0 }),
    'topK 必须是正整数',
    'retrieve_invalid_topk'
  );
  await assertThrowsAsync(
    async () => retrieveTopChunks('ok', { noteIds: 'abc' }),
    'noteIds 必须是字符串数组',
    'retrieve_invalid_note_ids'
  );
}

async function testEmptyBranch() {
  console.log('[TestRetrieval] 🧪 case=empty_branch');
  const result = await retrieveTopChunks('react hooks', {
    embeddingFn: async text => keywordEmbedding(text),
    noteIds: ['note-id-does-not-exist'],
  });
  console.log('[TestRetrieval] 📦 empty_result=', JSON.stringify(result, null, 2));
  assert(Array.isArray(result.top_chunks), 'empty_branch top_chunks 应为数组');
  assert(result.top_chunks.length === 0, 'empty_branch 应返回空 top_chunks');
}

async function testTopKAndRankingBranch() {
  console.log('[TestRetrieval] 🧪 case=topk_and_ranking');
  const reactNote = await seedIndexedNote(
    `RAGV2 Retrieval React ${Date.now()}`,
    'react hooks state management',
    `
# React
## Hooks
React hooks explain useState useEffect.

## Tips
state update optimization.
`.trim()
  );

  const dockerNote = await seedIndexedNote(
    `RAGV2 Retrieval Docker ${Date.now()}`,
    'docker image container',
    `
# Docker
## Basics
Docker image container build deploy.
`.trim()
  );

  const all = await retrieveTopChunks('react state hooks', {
    embeddingFn: async text => keywordEmbedding(text),
    noteIds: [reactNote.id],
  });
  assert(all.top_chunks.length > 0, 'topk_and_ranking 应返回至少 1 个 chunk');

  const ranked = await retrieveTopChunks('react state hooks', {
    embeddingFn: async text => keywordEmbedding(text),
    topK: 1,
    noteIds: [reactNote.id, dockerNote.id],
  });
  console.log('[TestRetrieval] 📦 ranked_result=', JSON.stringify(ranked, null, 2));

  assert(ranked.top_chunks.length === 1, 'topK=1 时应只返回 1 条');
  assert(ranked.top_chunks[0].note_id === reactNote.id, '相关性排序错误，Top1 应为 React note');
}

async function testSkipInvalidAndMismatchBranch() {
  console.log('[TestRetrieval] 🧪 case=skip_invalid_and_mismatch');
  const probeNote = await seedIndexedNote(
    `RAGV2 Retrieval Probe ${Date.now()}`,
    'redis cache ttl',
    `
# Redis
## Cache
redis cache ttl invalidation.
`.trim()
  );

  db.prepare(`
    INSERT INTO note_chunks (id, note_id, chunk_index, section_path, chunk_text, chunk_embedding, char_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `bad-json-${Date.now()}`,
    probeNote.id,
    9991,
    'BAD',
    'BAD_JSON_CHUNK_MARKER',
    'not-json',
    10,
    new Date().toISOString()
  );

  db.prepare(`
    INSERT INTO note_chunks (id, note_id, chunk_index, section_path, chunk_text, chunk_embedding, char_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `bad-dim-${Date.now()}`,
    probeNote.id,
    9992,
    'BAD',
    'BAD_DIM_CHUNK_MARKER',
    JSON.stringify([1, 2]),
    10,
    new Date().toISOString()
  );

  const result = await retrieveTopChunks('redis cache', {
    embeddingFn: async text => keywordEmbedding(text),
    noteIds: [probeNote.id],
    topK: 20,
  });
  console.log('[TestRetrieval] 📦 skip_result=', JSON.stringify(result, null, 2));

  const hasBadJson = result.top_chunks.some(c => c.chunk_text.includes('BAD_JSON_CHUNK_MARKER'));
  const hasBadDim = result.top_chunks.some(c => c.chunk_text.includes('BAD_DIM_CHUNK_MARKER'));
  assert(!hasBadJson, 'bad json chunk 应被跳过');
  assert(!hasBadDim, 'bad dim chunk 应被跳过');
}

async function run() {
  console.log('[TestRetrieval] 🚀 开始测试 Task 5 Chunk 召回');
  await testMathHelpers();
  await testInvalidArgs();
  await testEmptyBranch();
  await testTopKAndRankingBranch();
  await testSkipInvalidAndMismatchBranch();
  console.log('[TestRetrieval] ✅ 所有 case 通过');
}

run()
  .catch(err => {
    console.error('[TestRetrieval] ❌ 测试失败:', err.message);
    process.exit(1);
  })
  .finally(() => {
    readonlyDb.close();
  });

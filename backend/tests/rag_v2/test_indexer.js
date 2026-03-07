import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { saveNote } from '../../src/db/notes.js';
import {
  INDEX_STATUS,
  buildChunkEmbeddingText,
  indexNoteById,
  reindexAllNotes,
} from '../../src/tools/chunkIndexer.js';

const DB_PATH = path.resolve(process.cwd(), 'backend/data/branchnote.db');
const db = new Database(DB_PATH);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getStatus(noteId) {
  return db.prepare('SELECT note_id, status, reason FROM note_index_status WHERE note_id = ?').get(noteId);
}

function getChunkCount(noteId) {
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM note_chunks WHERE note_id = ?').get(noteId);
  return row?.cnt ?? 0;
}

function getOneChunk(noteId) {
  return db.prepare(
    'SELECT note_id, chunk_index, section_path, chunk_embedding FROM note_chunks WHERE note_id = ? ORDER BY chunk_index LIMIT 1'
  ).get(noteId);
}

function fakeEmbedding(text) {
  const len = text.length;
  return [len, len % 97, len % 17];
}

function fakeEmbeddingFailOnKeyword(keyword) {
  return async text => {
    if (text.includes(keyword)) {
      throw new Error('mock_embedding_failed');
    }
    return fakeEmbedding(text);
  };
}

function createTempMarkdown(fileName, content) {
  const filePath = path.join('/tmp', fileName);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

async function testBuildEmbeddingText() {
  console.log('[TestIndexer] 🧪 case=build_embedding_text');
  const text = buildChunkEmbeddingText('Note A', 'A > B', 'chunk body');
  assert(text.includes('TITLE: Note A'), 'build_embedding_text 缺少 TITLE');
  assert(text.includes('SECTION: A > B'), 'build_embedding_text 缺少 SECTION');
  assert(text.includes('CONTENT:'), 'build_embedding_text 缺少 CONTENT 标记');
}

async function testReadyBranch() {
  console.log('[TestIndexer] 🧪 case=ready');
  const filePath = createTempMarkdown(
    `rag-v2-ready-${Date.now()}.md`,
    '# ReadyNote\n## PartA\nhello world\n\n## PartB\n' + 'x'.repeat(1800)
  );

  const note = saveNote({
    intent: 'Concept',
    data: { title: `RAGV2 Ready ${Date.now()}`, use_cases: ['indexer'] },
    raw_chat: 'ready branch',
    file_path: filePath,
    embedding: null,
  });

  const result = await indexNoteById(note.id, { embeddingFn: async text => fakeEmbedding(text) });
  console.log('[TestIndexer] 📦 ready_result=', JSON.stringify(result, null, 2));

  assert(result.status === INDEX_STATUS.READY, 'ready 分支状态错误');
  assert(result.chunk_count > 0, 'ready 分支 chunk_count 应 > 0');

  const status = getStatus(note.id);
  assert(status?.status === INDEX_STATUS.READY, 'ready 分支 status 表记录错误');

  const count = getChunkCount(note.id);
  assert(count === result.chunk_count, 'ready 分支 chunk 数与数据库不一致');

  const oneChunk = getOneChunk(note.id);
  assert(oneChunk && oneChunk.section_path, 'ready 分支应写入 chunk');
  const parsed = JSON.parse(oneChunk.chunk_embedding);
  assert(Array.isArray(parsed) && parsed.length === 3, 'ready 分支 embedding 入库格式错误');
}

async function testSkippedMissingPathBranch() {
  console.log('[TestIndexer] 🧪 case=skipped_missing_path');
  const note = saveNote({
    intent: 'Concept',
    data: { title: `RAGV2 MissingPath ${Date.now()}`, use_cases: ['indexer'] },
    raw_chat: 'missing path branch',
    file_path: null,
    embedding: null,
  });

  const result = await indexNoteById(note.id, { embeddingFn: async text => fakeEmbedding(text) });
  console.log('[TestIndexer] 📦 missing_path_result=', JSON.stringify(result, null, 2));

  assert(result.status === INDEX_STATUS.SKIPPED_MISSING_PATH, 'missing_path 分支状态错误');
  assert(getChunkCount(note.id) === 0, 'missing_path 分支不应写入 chunk');
  assert(getStatus(note.id)?.status === INDEX_STATUS.SKIPPED_MISSING_PATH, 'missing_path 状态表错误');
}

async function testSkippedFileNotFoundBranch() {
  console.log('[TestIndexer] 🧪 case=skipped_file_not_found');
  const missingPath = `/tmp/rag-v2-missing-${Date.now()}.md`;
  const note = saveNote({
    intent: 'Concept',
    data: { title: `RAGV2 FileNotFound ${Date.now()}`, use_cases: ['indexer'] },
    raw_chat: 'file not found branch',
    file_path: missingPath,
    embedding: null,
  });

  const result = await indexNoteById(note.id, { embeddingFn: async text => fakeEmbedding(text) });
  console.log('[TestIndexer] 📦 file_not_found_result=', JSON.stringify(result, null, 2));

  assert(result.status === INDEX_STATUS.SKIPPED_FILE_NOT_FOUND, 'file_not_found 分支状态错误');
  assert(getChunkCount(note.id) === 0, 'file_not_found 分支不应写入 chunk');
  assert(getStatus(note.id)?.status === INDEX_STATUS.SKIPPED_FILE_NOT_FOUND, 'file_not_found 状态表错误');
}

async function testSkippedEmptyBranch() {
  console.log('[TestIndexer] 🧪 case=skipped_empty');
  const filePath = createTempMarkdown(`rag-v2-empty-${Date.now()}.md`, '   \n \n');
  const note = saveNote({
    intent: 'Concept',
    data: { title: `RAGV2 Empty ${Date.now()}`, use_cases: ['indexer'] },
    raw_chat: 'empty branch',
    file_path: filePath,
    embedding: null,
  });

  const result = await indexNoteById(note.id, { embeddingFn: async text => fakeEmbedding(text) });
  console.log('[TestIndexer] 📦 skipped_empty_result=', JSON.stringify(result, null, 2));

  assert(result.status === INDEX_STATUS.SKIPPED_EMPTY, 'skipped_empty 分支状态错误');
  assert(getChunkCount(note.id) === 0, 'skipped_empty 分支不应写入 chunk');
  assert(getStatus(note.id)?.status === INDEX_STATUS.SKIPPED_EMPTY, 'skipped_empty 状态表错误');
}

async function testFailedBranch() {
  console.log('[TestIndexer] 🧪 case=failed');
  const filePath = createTempMarkdown(
    `rag-v2-failed-${Date.now()}.md`,
    '# FailNote\n## Part\nthis chunk should trigger embedding error'
  );

  const note = saveNote({
    intent: 'Concept',
    data: { title: `RAGV2 FAIL_MARKER ${Date.now()}`, use_cases: ['indexer'] },
    raw_chat: 'failed branch',
    file_path: filePath,
    embedding: null,
  });

  const result = await indexNoteById(note.id, { embeddingFn: fakeEmbeddingFailOnKeyword('FAIL_MARKER') });
  console.log('[TestIndexer] 📦 failed_result=', JSON.stringify(result, null, 2));

  assert(result.status === INDEX_STATUS.FAILED, 'failed 分支状态错误');
  assert(getChunkCount(note.id) === 0, 'failed 分支不应写入 chunk');
  const status = getStatus(note.id);
  assert(status?.status === INDEX_STATUS.FAILED, 'failed 状态表错误');
  assert((status?.reason || '').includes('mock_embedding_failed'), 'failed reason 未记录');
}

async function testReindexAllNotesBranch() {
  console.log('[TestIndexer] 🧪 case=reindex_all_notes');
  const okPath = createTempMarkdown(
    `rag-v2-reindex-ok-${Date.now()}.md`,
    '# ReindexOK\n## Body\n' + 'abc '.repeat(500)
  );
  const failPath = createTempMarkdown(
    `rag-v2-reindex-fail-${Date.now()}.md`,
    '# ReindexFail\n## Body\n' + 'def '.repeat(500)
  );

  const okNote = saveNote({
    intent: 'Concept',
    data: { title: `RAGV2 REINDEX_OK ${Date.now()}`, use_cases: ['indexer'] },
    raw_chat: 'reindex ok',
    file_path: okPath,
    embedding: null,
  });
  const failNote = saveNote({
    intent: 'Concept',
    data: { title: `RAGV2 REINDEX_FAIL ${Date.now()}`, use_cases: ['indexer'] },
    raw_chat: 'reindex fail',
    file_path: failPath,
    embedding: null,
  });

  const result = await reindexAllNotes({
    noteIds: [okNote.id, failNote.id],
    embeddingFn: fakeEmbeddingFailOnKeyword('REINDEX_FAIL'),
  });
  console.log('[TestIndexer] 📦 reindex_result=', JSON.stringify(result, null, 2));

  assert(result.summary.total === 2, 'reindex_all total 统计错误');
  assert(result.summary.ready === 1, 'reindex_all ready 统计错误');
  assert(result.summary.failed === 1, 'reindex_all failed 统计错误');
}

async function run() {
  console.log('[TestIndexer] 🚀 开始测试 Task 3 Indexer');
  await testBuildEmbeddingText();
  await testReadyBranch();
  await testSkippedMissingPathBranch();
  await testSkippedFileNotFoundBranch();
  await testSkippedEmptyBranch();
  await testFailedBranch();
  await testReindexAllNotesBranch();
  console.log('[TestIndexer] ✅ 所有 case 通过');
}

run()
  .catch(err => {
    console.error('[TestIndexer] ❌ 测试失败:', err.message);
    process.exit(1);
  })
  .finally(() => {
    db.close();
  });


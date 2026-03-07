import fs from 'fs';
import { randomUUID } from 'crypto';
import { executeKnowledge } from '../../src/agent/executor.js';
import { generateEmbedding } from '../../src/tools/rag.js';
import { create_new_markdown } from '../../src/tools/fileManager.js';
import { saveNote } from '../../src/db/notes.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertHasKeys(obj, keys, label) {
  for (const key of keys) {
    assert(Object.prototype.hasOwnProperty.call(obj, key), `${label} 缺少字段: ${key}`);
  }
}

async function testInvalidPayloadBranch() {
  console.log('[TestRAGV1] 🧪 case=invalid_payload');
  let failedAsExpected = false;
  try {
    await executeKnowledge({});
  } catch (err) {
    failedAsExpected = err.message.includes('缺少 intent 或 data');
  }
  assert(failedAsExpected, 'invalid_payload 分支未触发预期错误');
}

async function testMergeBranchWithFilePath() {
  console.log('[TestRAGV1] 🧪 case=merge_with_file_path');
  const caseId = randomUUID();
  const seedRaw = `RAGV1-MERGE-SEED-${caseId} React hooks reconciliation deep dive`;
  const seedEmbedding = await generateEmbedding(seedRaw);

  const seed = create_new_markdown({
    intent: 'Concept',
    data: {
      title: `RAGV1 Merge Seed ${caseId.slice(0, 8)}`,
      summary: 'seed for merge branch',
      key_points: ['seed'],
      use_cases: ['baseline'],
      links: [],
    },
    raw_chat: seedRaw,
    embedding: seedEmbedding,
  });

  const payload = {
    intent: 'Concept',
    data: {
      title: `RAGV1 Merge Seed ${caseId.slice(0, 8)}`,
      summary: 'new update for merge branch',
      key_points: ['merge'],
      use_cases: ['baseline'],
      links: [],
    },
    raw_chat: seedRaw,
    embedding: seedEmbedding,
    threshold: 0.7,
    create_mode: 'auto',
  };

  const result = await executeKnowledge(payload);
  console.log('[TestRAGV1] 📦 merge_result=', JSON.stringify(result, null, 2));

  assert(result.action === 'MERGE', 'merge_with_file_path 应返回 MERGE');
  assertHasKeys(
    result,
    ['action', 'note_id', 'score', 'file_path', 'old_content', 'proposed_content', 'base_hash'],
    'merge_result'
  );
  assert(result.note_id === seed.id, 'merge_with_file_path 返回 note_id 与种子不一致');
  assert(typeof result.file_path === 'string' && result.file_path.length > 0, 'merge_with_file_path 缺少 file_path');
  assert(result.base_hash.startsWith('sha256:'), 'merge_with_file_path base_hash 格式错误');

  const fileContent = fs.readFileSync(result.file_path, 'utf8');
  assert(fileContent === result.old_content, 'merge_with_file_path old_content 与文件内容不一致');
}

async function testCreateAutoBranch() {
  console.log('[TestRAGV1] 🧪 case=create_auto');
  const caseId = randomUUID();
  const rawText = `RAGV1-CREATE-AUTO-${caseId} distributed tracing jaeger otel`;
  const embedding = await generateEmbedding(rawText);

  const result = await executeKnowledge({
    intent: 'Concept',
    data: {
      title: `RAGV1 Create Auto ${caseId.slice(0, 8)}`,
      summary: 'create auto baseline',
      key_points: ['trace'],
      use_cases: ['obs'],
      links: [],
    },
    raw_chat: rawText,
    embedding,
    threshold: 0.99,
    create_mode: 'auto',
  });

  console.log('[TestRAGV1] 📦 create_auto_result=', JSON.stringify(result, null, 2));
  assert(result.action === 'CREATE', 'create_auto 应返回 CREATE');
  assert(result.mode === 'auto', 'create_auto mode 应为 auto');
  assertHasKeys(result, ['action', 'mode', 'note'], 'create_auto_result');
  assertHasKeys(result.note, ['id', 'title', 'intent', 'file_path', 'created_at'], 'create_auto_note');
}

async function testCreateConfirmBranch() {
  console.log('[TestRAGV1] 🧪 case=create_confirm');
  const caseId = randomUUID();
  const rawText = `RAGV1-CREATE-CONFIRM-${caseId} raft lease read optimization`;
  const embedding = await generateEmbedding(rawText);

  const result = await executeKnowledge({
    intent: 'Concept',
    data: {
      title: `RAGV1 Create Confirm ${caseId.slice(0, 8)}`,
      summary: 'create confirm baseline',
      key_points: ['raft'],
      use_cases: ['db'],
      links: [],
    },
    raw_chat: rawText,
    embedding,
    threshold: 0.99,
    create_mode: 'confirm',
  });

  console.log('[TestRAGV1] 📦 create_confirm_result=', JSON.stringify(result, null, 2));
  assert(result.action === 'CREATE', 'create_confirm 应返回 CREATE');
  assert(result.mode === 'confirm', 'create_confirm mode 应为 confirm');
  assertHasKeys(result, ['action', 'mode', 'draft'], 'create_confirm_result');
  assertHasKeys(
    result.draft,
    ['intent', 'data', 'raw_chat', 'embedding', 'markdown_content', 'suggested_title'],
    'create_confirm_draft'
  );
}

async function testMergeWithoutFilePathFallbackBranch() {
  console.log('[TestRAGV1] 🧪 case=merge_without_file_path_fallback');
  const caseId = randomUUID();
  const rawText = `RAGV1-NO-FILE-PATH-${caseId} eventual consistency quorum`;
  const embedding = await generateEmbedding(rawText);

  saveNote({
    intent: 'Concept',
    data: {
      title: `RAGV1 NoFile Seed ${caseId.slice(0, 8)}`,
      summary: 'seed without file_path',
      key_points: ['seed'],
      use_cases: ['baseline'],
      links: [],
    },
    raw_chat: rawText,
    file_path: null,
    embedding,
  });

  const result = await executeKnowledge({
    intent: 'Concept',
    data: {
      title: `RAGV1 NoFile Update ${caseId.slice(0, 8)}`,
      summary: 'should fallback to create',
      key_points: ['fallback'],
      use_cases: ['baseline'],
      links: [],
    },
    raw_chat: rawText,
    embedding,
    threshold: 0.7,
    create_mode: 'confirm',
  });

  console.log('[TestRAGV1] 📦 merge_without_file_path_result=', JSON.stringify(result, null, 2));
  assert(result.action === 'CREATE', 'merge_without_file_path_fallback 应降级为 CREATE');
  assert(result.mode === 'confirm', 'merge_without_file_path_fallback 应保留 confirm 模式');
  assertHasKeys(result, ['action', 'mode', 'draft'], 'merge_without_file_path_result');
}

async function run() {
  console.log('[TestRAGV1] 🚀 开始执行 RAG v1 基线回归测试');

  await testInvalidPayloadBranch();
  await testMergeBranchWithFilePath();
  await testCreateAutoBranch();
  await testCreateConfirmBranch();
  await testMergeWithoutFilePathFallbackBranch();

  console.log('[TestRAGV1] ✅ 所有 case 通过');
}

run().catch(err => {
  console.error('[TestRAGV1] ❌ 测试失败:', err.message);
  process.exit(1);
});


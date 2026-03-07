import fs from 'fs';
import path from 'path';
import { saveNote } from '../../src/db/notes.js';
import { indexNoteById } from '../../src/tools/chunkIndexer.js';
import { executeKnowledge } from '../../src/agent/executor.js';

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
  const react = (src.match(/react|hook|state|useeffect|usestate/g) || []).length;
  const docker = (src.match(/docker|container|image|dockerfile/g) || []).length;
  const redis = (src.match(/redis|cache|ttl/g) || []).length;
  return [react + 1, docker + 1, redis + 1];
}

async function seedIndexedNote({ title, rawChat, markdown }) {
  const filePath = writeTmpMarkdown(`rag-v2-executor-${Date.now()}-${Math.random()}.md`, markdown);
  const note = saveNote({
    intent: 'Concept',
    data: { title, use_cases: ['executor-v2-test'] },
    raw_chat: rawChat,
    file_path: filePath,
    embedding: null,
  });

  const idx = await indexNoteById(note.id, {
    embeddingFn: async text => keywordEmbedding(text),
  });
  assert(idx.status === 'ready', `索引失败: ${title}`);

  return {
    ...note,
    file_path: filePath,
  };
}

function buildPayload(queryText, createMode = 'confirm') {
  return {
    intent: 'Concept',
    data: {
      title: 'Executor V2 Update',
      summary: 'some update',
      key_points: ['a'],
      use_cases: ['b'],
      links: [],
    },
    raw_chat: queryText,
    embedding: [0.1, 0.2, 0.3],
    create_mode: createMode,
    use_rag_v2: true,
  };
}

async function testMergeBranch() {
  console.log('[TestExecutorV2] 🧪 case=merge_branch');
  const reactNote = await seedIndexedNote({
    title: `ExecutorV2 React ${Date.now()}`,
    rawChat: 'react hooks state management',
    markdown: `
# React
## Hooks
React hooks useState useEffect.
`.trim(),
  });
  const dockerNote = await seedIndexedNote({
    title: `ExecutorV2 Docker ${Date.now()}`,
    rawChat: 'docker image container',
    markdown: `
# Docker
## Basics
Docker image container.
`.trim(),
  });

  const result = await executeKnowledge({
    ...buildPayload('react hooks optimization'),
    rag_v2_options: {
      noteIds: [reactNote.id, dockerNote.id],
      embeddingFn: async text => keywordEmbedding(text),
      crossEncoderFn: async (_q, snippet) => (snippet.toLowerCase().includes('react') ? 0.96 : 0.11),
      llmDecisionFn: async () => {
        throw new Error('llm should not be called in high confidence case');
      },
      proposeMergeFn: async (oldMarkdown, _data) => `${oldMarkdown}\n\n## merged\nfrom-test`,
    },
  });

  console.log('[TestExecutorV2] 📦 merge_result=', JSON.stringify(result, null, 2));

  assert(result.action === 'MERGE', 'merge_branch 应为 MERGE');
  assert(result.note_id === reactNote.id, 'merge_branch 应命中 react note');
  assert(typeof result.base_hash === 'string' && result.base_hash.startsWith('sha256:'), 'merge_branch base_hash 错误');
  assert(result.proposed_content.includes('from-test'), 'merge_branch 未使用 proposeMergeFn');

  assert(result.retrieval_debug, 'merge_branch 缺少 retrieval_debug');
  assert(Array.isArray(result.retrieval_debug.top_chunks), 'merge_branch top_chunks 应为数组');
  assert(Array.isArray(result.retrieval_debug.top_docs), 'merge_branch top_docs 应为数组');
  assert(Array.isArray(result.retrieval_debug.rerank), 'merge_branch rerank 应为数组');
  assert(result.retrieval_debug.decision_method === 'rule_high_confidence', 'merge_branch decision_method 错误');
}

async function testCreateBranchByRuleLowConfidence() {
  console.log('[TestExecutorV2] 🧪 case=create_branch_rule_low');
  const reactNote = await seedIndexedNote({
    title: `ExecutorV2 React Low ${Date.now()}`,
    rawChat: 'react hooks state management',
    markdown: `
# React
React hooks.
`.trim(),
  });
  const dockerNote = await seedIndexedNote({
    title: `ExecutorV2 Docker Low ${Date.now()}`,
    rawChat: 'docker image container',
    markdown: `
# Docker
Docker basics.
`.trim(),
  });

  const result = await executeKnowledge({
    ...buildPayload('completely new unknown topic'),
    rag_v2_options: {
      noteIds: [reactNote.id, dockerNote.id],
      embeddingFn: async text => keywordEmbedding(text),
      crossEncoderFn: async () => 0.41,
    },
  });

  console.log('[TestExecutorV2] 📦 create_rule_low_result=', JSON.stringify(result, null, 2));
  assert(result.action === 'CREATE', 'create_branch_rule_low 应 CREATE');
  assert(result.mode === 'confirm', 'create_branch_rule_low 应保留 confirm');
  assert(result.retrieval_debug.decision_method === 'rule_low_confidence', 'create_branch_rule_low method 错误');
}

async function testUpdateDowngradeMissingFile() {
  console.log('[TestExecutorV2] 🧪 case=update_downgrade_missing_file');
  const target = await seedIndexedNote({
    title: `ExecutorV2 Target ${Date.now()}`,
    rawChat: 'react hooks target',
    markdown: `
# Target
React hook target note.
`.trim(),
  });
  const backup = await seedIndexedNote({
    title: `ExecutorV2 Backup ${Date.now()}`,
    rawChat: 'react hooks backup',
    markdown: `
# Backup
React hook backup note.
`.trim(),
  });

  // 索引已完成后删除文件，模拟外部移动/删除
  fs.unlinkSync(target.file_path);

  const result = await executeKnowledge({
    ...buildPayload('react hook target specific update'),
    rag_v2_options: {
      noteIds: [target.id, backup.id],
      embeddingFn: async text => keywordEmbedding(text),
      crossEncoderFn: async (_q, snippet, doc) => {
        if (doc.note_id === target.id) return 0.76;
        return 0.74;
      },
      llmDecisionFn: async () => ({
        action: 'UPDATE',
        target_note_id: target.id,
        reason: 'target is semantically closest',
      }),
    },
  });

  console.log('[TestExecutorV2] 📦 downgrade_result=', JSON.stringify(result, null, 2));
  assert(result.action === 'CREATE', 'update_downgrade_missing_file 应降级 CREATE');
  assert(result.mode === 'confirm', 'update_downgrade_missing_file 应保留 confirm');
  assert(
    String(result.retrieval_debug.decision_method).includes('downgrade_missing_file'),
    'update_downgrade_missing_file decision_method 应带 downgrade 标记'
  );
}

async function run() {
  console.log('[TestExecutorV2] 🚀 开始测试 Task 9 Executor v2 集成');
  await testMergeBranch();
  await testCreateBranchByRuleLowConfidence();
  await testUpdateDowngradeMissingFile();
  console.log('[TestExecutorV2] ✅ 所有 case 通过');
}

run().catch(err => {
  console.error('[TestExecutorV2] ❌ 测试失败:', err.message);
  process.exit(1);
});


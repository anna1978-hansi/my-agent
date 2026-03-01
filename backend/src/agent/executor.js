import fs from 'fs';
import { createHash } from 'crypto';
import { searchSimilarNote } from '../tools/rag.js';
import { proposeMerge } from '../tools/mergeEngine.js';
import { buildCreateDraft, create_new_markdown } from '../tools/fileManager.js';

/**
 * Executor：根据相似度决定合并或创建
 * @param {object} payload
 * @param {string} payload.intent
 * @param {object} payload.data
 * @param {string} payload.raw_chat
 * @param {number[]} payload.embedding
 * @param {'auto' | 'confirm'} [payload.create_mode]
 * @param {number} [payload.threshold]
 * @returns {Promise<object>}
 */
export async function executeKnowledge(payload) {
  const {
    intent,
    data,
    raw_chat = '',
    embedding = null,
    threshold,
    create_mode = 'auto',
  } = payload || {};
  if (!intent || !data) {
    throw new Error('executeKnowledge 缺少 intent 或 data');
  }

  const title = data.title || '(无标题)';
  const queryText = raw_chat && raw_chat.trim().length > 0 ? raw_chat : title;
  console.log('🧠 [Executor] 开始执行，标题:', title);
  console.log('🧠 [Executor] 检索文本:', queryText.slice(0, 80));

  const result = await searchSimilarNote(
    queryText,
    typeof threshold === 'number' ? threshold : 0.85
  );

  if (result.action === 'MERGE' && result.note?.file_path) {
    console.log('🧵 [Executor] 命中相似笔记，开始合并...');
    const oldMarkdown = fs.readFileSync(result.note.file_path, 'utf8');
    const proposed = await proposeMerge(oldMarkdown, data);
    const baseHash = hashMarkdown(oldMarkdown);
    return {
      action: 'MERGE',
      note_id: result.note.id,
      score: result.score,
      file_path: result.note.file_path,
      old_content: oldMarkdown,
      proposed_content: proposed,
      base_hash: baseHash,
    };
  }

  if (result.action === 'MERGE' && !result.note?.file_path) {
    console.log('⚠️  [Executor] 命中相似笔记但缺少 file_path，降级为 CREATE');
  } else {
    console.log('🆕 [Executor] 未命中相似笔记，创建新 Markdown');
  }

  if (create_mode === 'confirm') {
    const draft = buildCreateDraft({
      intent,
      data,
      raw_chat,
      embedding,
    });

    return {
      action: 'CREATE',
      mode: 'confirm',
      draft,
    };
  }

  const created = create_new_markdown({
    intent,
    data,
    raw_chat,
    embedding,
  });

  return {
    action: 'CREATE',
    mode: 'auto',
    note: created,
  };
}

function hashMarkdown(markdown) {
  return `sha256:${createHash('sha256').update(markdown, 'utf8').digest('hex')}`;
}

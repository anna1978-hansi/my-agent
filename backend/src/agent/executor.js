import fs from 'fs';
import { searchSimilarNote } from '../tools/rag.js';
import { proposeMerge } from '../tools/mergeEngine.js';
import { create_new_markdown } from '../tools/fileManager.js';

/**
 * Executor：根据相似度决定合并或创建
 * @param {object} payload
 * @param {string} payload.intent
 * @param {object} payload.data
 * @param {string} payload.raw_chat
 * @param {number[]} payload.embedding
 * @param {number} [payload.threshold]
 * @returns {Promise<object>}
 */
export async function executeKnowledge(payload) {
  const { intent, data, raw_chat = '', embedding = null, threshold } = payload || {};
  if (!intent || !data) {
    throw new Error('executeKnowledge 缺少 intent 或 data');
  }

  const title = data.title || '(无标题)';
  console.log('🧠 [Executor] 开始执行，标题:', title);

  const result = await searchSimilarNote(title, typeof threshold === 'number' ? threshold : 0.85);

  if (result.action === 'MERGE' && result.note?.file_path) {
    console.log('🧵 [Executor] 命中相似笔记，开始合并...');
    const oldMarkdown = fs.readFileSync(result.note.file_path, 'utf8');
    const proposed = await proposeMerge(oldMarkdown, data);
    return {
      action: 'MERGE',
      score: result.score,
      file_path: result.note.file_path,
      proposed_content: proposed,
    };
  }

  if (result.action === 'MERGE' && !result.note?.file_path) {
    console.log('⚠️  [Executor] 命中相似笔记但缺少 file_path，降级为 CREATE');
  } else {
    console.log('🆕 [Executor] 未命中相似笔记，创建新 Markdown');
  }

  const created = create_new_markdown({
    intent,
    data,
    raw_chat,
    embedding,
  });

  return { action: 'CREATE', ...created };
}

import { randomUUID } from 'crypto';
import db from './index.js';

/**
 * 保存一条知识笔记到数据库
 * @param {object} noteData - Pipeline 输出结果
 * @param {string} noteData.intent   - BugFix | Concept | Architecture
 * @param {object} noteData.data     - Worker 提取的结构化数据
 * @param {string} noteData.raw_chat - 原始对话文本
 */
export function saveNote(noteData) {
  const {
    intent,
    data,
    raw_chat = '',
    file_path = null,
    embedding = null,
  } = noteData;

  const id = randomUUID();
  const title = data.title ?? '(无标题)';
  const content = JSON.stringify(data);
  const tags = Array.isArray(data.use_cases)
    ? data.use_cases.slice(0, 3).join(',')
    : '';
  const created_at = new Date().toISOString();

  console.log(`💾 [DB] 保存笔记 → id=${id}, intent=${intent}, title="${title}"`);

  const embeddingText = Array.isArray(embedding)
    ? JSON.stringify(embedding)
    : typeof embedding === 'string'
      ? embedding
      : null;

  const stmt = db.prepare(`
    INSERT INTO knowledge_notes (id, title, intent, content, tags, raw_chat, file_path, embedding, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    id,
    title,
    intent,
    content,
    tags,
    raw_chat,
    file_path,
    embeddingText,
    created_at
  );

  console.log(`✅ [DB] 保存成功！changes=${result.changes}`);
  return {
    id,
    title,
    intent,
    tags: parseTags(tags),
    file_path,
    created_at,
  };
}

/**
 * 按关键词搜索笔记（匹配 title / content / tags）
 * @param {string} keyword
 * @returns {Array}
 */
export function searchNotes(keyword) {
  console.log(`🔍 [DB] 搜索关键词: "${keyword}"`);

  const like = `%${keyword}%`;
  const rows = db.prepare(`
    SELECT id, title, intent, tags, created_at, content, file_path, embedding
    FROM knowledge_notes
    WHERE title LIKE ? OR content LIKE ? OR tags LIKE ?
    ORDER BY created_at DESC
  `).all(like, like, like);

  console.log(`🔍 [DB] 命中 ${rows.length} 条结果`);

  return rows.map(row => ({
    ...row,
    content: JSON.parse(row.content),
    tags: parseTags(row.tags),
    embedding: row.embedding ? JSON.parse(row.embedding) : null,
  }));
}

/**
 * 获取笔记元数据列表（不返回 markdown 正文）
 * @param {string} keyword
 * @returns {Array}
 */
export function listNotesMeta(keyword = '') {
  const trimmed = typeof keyword === 'string' ? keyword.trim() : '';
  const hasKeyword = trimmed.length > 0;
  const like = `%${trimmed}%`;

  const rows = hasKeyword
    ? db.prepare(`
      SELECT id, title, intent, tags, created_at, file_path
      FROM knowledge_notes
      WHERE title LIKE ? OR tags LIKE ? OR content LIKE ?
      ORDER BY created_at DESC
    `).all(like, like, like)
    : db.prepare(`
      SELECT id, title, intent, tags, created_at, file_path
      FROM knowledge_notes
      ORDER BY created_at DESC
    `).all();

  return rows.map(row => ({
    ...row,
    tags: parseTags(row.tags),
  }));
}

/**
 * 根据 id 获取单条笔记记录
 * @param {string} id
 * @returns {object | undefined}
 */
export function getNoteById(id) {
  const row = db.prepare(`
    SELECT id, title, intent, tags, created_at, file_path, content
    FROM knowledge_notes
    WHERE id = ?
    LIMIT 1
  `).get(id);

  if (!row) {
    return undefined;
  }

  return {
    ...row,
    tags: parseTags(row.tags),
  };
}

function parseTags(tags) {
  if (typeof tags !== 'string' || tags.trim().length === 0) {
    return [];
  }

  return tags
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean);
}

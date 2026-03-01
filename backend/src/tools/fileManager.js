/**
 * 将结构化 JSON 转成 Markdown
 * @param {object} json
 * @param {string} intent - BugFix | Concept | Architecture
 * @returns {string}
 */
import fs from 'fs';
import path from 'path';
import { saveNote } from '../db/notes.js';

export function jsonToMarkdown(json, intent) {
  if (!json || typeof json !== 'object') {
    throw new Error('jsonToMarkdown 需要有效的 JSON 对象');
  }
  if (!intent) {
    throw new Error('jsonToMarkdown 需要 intent');
  }

  const title = json.title || '(无标题)';

  if (intent === 'BugFix') {
    return [
      `# ${title}`,
      '',
      '## 问题描述',
      json.problem || '',
      '',
      '## 复现步骤',
      Array.isArray(json.steps) && json.steps.length > 0
        ? json.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')
        : '',
      '',
      '## 解决方案',
      json.solution || '',
      '',
      '## 影响范围',
      json.impact || '',
      '',
      '## 关键链接',
      Array.isArray(json.links) && json.links.length > 0
        ? json.links.map(l => `- ${l}`).join('\n')
        : '',
    ].join('\n');
  }

  if (intent === 'Concept') {
    return [
      `# ${title}`,
      '',
      '## 核心概念',
      json.summary || '',
      '',
      '## 关键要点',
      Array.isArray(json.key_points) && json.key_points.length > 0
        ? json.key_points.map(p => `- ${p}`).join('\n')
        : '',
      '',
      '## 使用场景',
      Array.isArray(json.use_cases) && json.use_cases.length > 0
        ? json.use_cases.map(u => `- ${u}`).join('\n')
        : '',
      '',
      '## 相关链接',
      Array.isArray(json.links) && json.links.length > 0
        ? json.links.map(l => `- ${l}`).join('\n')
        : '',
    ].join('\n');
  }

  if (intent === 'Architecture') {
    return [
      `# ${title}`,
      '',
      '## 架构概览',
      json.overview || '',
      '',
      '## 组件说明',
      Array.isArray(json.components) && json.components.length > 0
        ? json.components.map(c => `- ${c}`).join('\n')
        : '',
      '',
      '## 数据流',
      json.data_flow || '',
      '',
      '## 关键决策',
      Array.isArray(json.decisions) && json.decisions.length > 0
        ? json.decisions.map(d => `- ${d}`).join('\n')
        : '',
      '',
      '## 风险与权衡',
      Array.isArray(json.tradeoffs) && json.tradeoffs.length > 0
        ? json.tradeoffs.map(t => `- ${t}`).join('\n')
        : '',
    ].join('\n');
  }

  throw new Error(`jsonToMarkdown 不支持的 intent: ${intent}`);
}

/**
 * 将 Markdown 写入指定路径
 * @param {string} title
 * @param {string} markdownContent
 * @returns {string} filePath
 */
export function saveMarkdownToFile(title, markdownContent) {
  if (!title || typeof title !== 'string') {
    throw new Error('saveMarkdownToFile 需要有效的 title');
  }
  if (typeof markdownContent !== 'string') {
    throw new Error('saveMarkdownToFile 需要 markdown 字符串');
  }

  const baseDir = '/Users/liuzhixuan/Desktop/my-branchNote-test';
  fs.mkdirSync(baseDir, { recursive: true });

  const safeTitle = title.replace(/[\\/:*?"<>|]/g, '-').trim() || 'untitled';
  const fileName = `${safeTitle}.md`;
  const filePath = path.join(baseDir, fileName);

  fs.writeFileSync(filePath, markdownContent, 'utf8');

  console.log(`✅ [FileManager] 已写入文件: ${filePath}`);
  return filePath;
}

/**
 * 创建新 Markdown 并写入数据库
 * @param {object} payload
 * @param {string} payload.intent
 * @param {object} payload.data
 * @param {string} payload.raw_chat
 * @param {number[]} payload.embedding
 * @returns {object}
 */
export function create_new_markdown(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('create_new_markdown 需要有效的 payload');
  }

  const draft = buildCreateDraft(payload);
  return commitCreateDraft(draft);
}

/**
 * 构建待确认的创建草稿（不落盘）
 * @param {object} payload
 * @param {string} payload.intent
 * @param {object} payload.data
 * @param {string} payload.raw_chat
 * @param {number[] | null} payload.embedding
 * @returns {object}
 */
export function buildCreateDraft(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('buildCreateDraft 需要有效的 payload');
  }

  const { intent, data, raw_chat = '', embedding = null } = payload;
  if (!intent || !data) {
    throw new Error('buildCreateDraft 缺少 intent 或 data');
  }

  const markdown = jsonToMarkdown(data, intent);

  return {
    intent,
    data,
    raw_chat,
    embedding,
    markdown_content: markdown,
    suggested_title: data.title || '(无标题)',
  };
}

/**
 * 提交创建草稿并完成落盘 + 入库
 * @param {object} draft
 * @returns {object}
 */
export function commitCreateDraft(draft) {
  if (!draft || typeof draft !== 'object') {
    throw new Error('commitCreateDraft 需要有效的 draft');
  }

  const {
    intent,
    data,
    raw_chat = '',
    embedding = null,
    markdown_content,
    suggested_title,
  } = draft;

  if (!intent || !data || typeof markdown_content !== 'string') {
    throw new Error('commitCreateDraft 缺少必要字段（intent/data/markdown_content）');
  }

  const title = suggested_title || data.title || '(无标题)';
  const filePath = saveMarkdownToFile(title, markdown_content);

  const saved = saveNote({
    intent,
    data,
    raw_chat,
    file_path: filePath,
    embedding,
  });

  console.log('✅ [FileManager] 创建并入库完成:', saved.id);
  return {
    ...saved,
    file_path: filePath,
  };
}

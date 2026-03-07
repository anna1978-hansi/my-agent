/**
 * 将结构化 JSON 转成 Markdown
 * @param {object} json
 * @param {string} intent - BugFix | Concept | Architecture
 * @returns {string}
 */
import fs from 'fs';
import path from 'path';
import { saveNote } from '../db/notes.js';
import { indexNoteById } from './chunkIndexer.js';

export function jsonToMarkdown(json, intent) {
  if (!json || typeof json !== 'object') {
    throw new Error('jsonToMarkdown 需要有效的 JSON 对象');
  }
  if (!intent) {
    throw new Error('jsonToMarkdown 需要 intent');
  }

  const title = json.title || '(无标题)';

  if (intent === 'BugFix') {
    const symptom = pickText(json.problem, json.symptom);
    const rootCause = pickText(json.root_cause, json.cause);
    const solution = pickText(json.solution);
    const prevention = pickText(json.prevention);
    const steps = normalizeArray(json.steps);
    const links = normalizeArray(json.links);

    return [
      `# ${title}`,
      '',
      '## 问题表现',
      symptom,
      '',
      '## 根本原因',
      rootCause,
      '',
      '## 复现步骤',
      steps.length > 0 ? steps.map((s, i) => `${i + 1}. ${s}`).join('\n') : '',
      '',
      '## 解决方案',
      solution,
      '',
      '## 预防建议',
      prevention,
      '',
      '## 关键链接',
      links.length > 0 ? links.map(link => `- ${link}`).join('\n') : '',
    ].join('\n');
  }

  if (intent === 'Concept') {
    const coreDefinition = pickText(json.summary, json.core_definition);
    const keyPoints = normalizeArray(json.key_points);
    const useCases = normalizeArray(json.use_cases);
    const links = normalizeArray(json.links);
    const analogy = pickText(json.analogy);
    const codeExample = pickText(json.code_example);

    return [
      `# ${title}`,
      '',
      '## 核心概念',
      coreDefinition,
      '',
      '## 类比理解',
      analogy,
      '',
      '## 关键要点',
      keyPoints.length > 0 ? keyPoints.map(point => `- ${point}`).join('\n') : '',
      '',
      '## 使用场景',
      useCases.length > 0 ? useCases.map(useCase => `- ${useCase}`).join('\n') : '',
      '',
      '## 代码示例',
      codeExample,
      '',
      '## 相关链接',
      links.length > 0 ? links.map(link => `- ${link}`).join('\n') : '',
    ].join('\n');
  }

  if (intent === 'Architecture') {
    const overview = pickText(json.overview, json.context);
    const components = normalizeArray(json.components);
    const optionsCompared = normalizeArray(json.options_compared);
    const decisions = normalizeArray(json.decisions);
    const tradeoffs = normalizeArray(json.tradeoffs);
    const finalDecision = pickText(json.final_decision);
    const dataFlow = pickText(json.data_flow);
    const prosCons = normalizeProsCons(json.pros_cons);

    return [
      `# ${title}`,
      '',
      '## 架构概览',
      overview,
      '',
      '## 组件说明',
      components.length > 0 ? components.map(component => `- ${component}`).join('\n') : '',
      '',
      '## 方案对比',
      optionsCompared.length > 0 ? optionsCompared.map(option => `- ${option}`).join('\n') : '',
      '',
      '## 优劣分析',
      prosCons,
      '',
      '## 数据流',
      dataFlow,
      '',
      '## 关键决策',
      decisions.length > 0
        ? decisions.map(decision => `- ${decision}`).join('\n')
        : finalDecision,
      '',
      '## 风险与权衡',
      tradeoffs.length > 0
        ? tradeoffs.map(tradeoff => `- ${tradeoff}`).join('\n')
        : '',
    ].join('\n');
  }

  throw new Error(`jsonToMarkdown 不支持的 intent: ${intent}`);
}

function pickText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return '';
}

function normalizeArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function normalizeProsCons(value) {
  if (!value || typeof value !== 'object') {
    return '';
  }

  const lines = [];
  for (const [option, detail] of Object.entries(value)) {
    lines.push(`### ${option}`);
    const pros = normalizeArray(detail?.pros);
    const cons = normalizeArray(detail?.cons);
    if (pros.length > 0) {
      lines.push('- 优点');
      lines.push(...pros.map(item => `  - ${item}`));
    }
    if (cons.length > 0) {
      lines.push('- 缺点');
      lines.push(...cons.map(item => `  - ${item}`));
    }
  }
  return lines.join('\n');
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

  // Task 4: CREATE 成功后立即触发 chunk 索引（不阻塞主创建流程）
  void indexNoteById(saved.id)
    .then(indexResult => {
      console.log(`[IndexerHook] 🧱 CREATE 索引完成 note_id=${saved.id}`);
      console.log(`[IndexerHook] 🧱 CREATE 索引结果: ${JSON.stringify(indexResult, null, 2)}`);
    })
    .catch(err => {
      console.log(`[IndexerHook] ⚠️ CREATE 索引失败 note_id=${saved.id}, err=${err.message}`);
    });

  console.log('✅ [FileManager] 创建并入库完成:', saved.id);
  return {
    ...saved,
    file_path: filePath,
  };
}

import { callLLM } from '../llm/client.js';

export const MERGE_SYSTEM_PROMPT = `
你是一个缝合专家。你的任务是将新知识无缝补充进旧的 Markdown 内容中。
要求：
1) 只输出合并后的原生 Markdown 文本
2) 绝对不要包含 \`\`\`markdown 或任何代码块标记
3) 不要寒暄、不要解释
4) 保持原有结构与语气，尽量少改动已有内容
5) 新知识需要自然融入合适的章节，必要时可新增小节
`.trim();

/**
 * 调用 LLM 进行 Markdown 缝合
 * @param {string} oldMarkdownContent
 * @param {object} newKnowledgeJson
 * @returns {Promise<string>}
 */
export async function proposeMerge(oldMarkdownContent, newKnowledgeJson) {
  if (!oldMarkdownContent || typeof oldMarkdownContent !== 'string') {
    throw new Error('proposeMerge 需要旧的 Markdown 文本');
  }
  if (!newKnowledgeJson || typeof newKnowledgeJson !== 'object') {
    throw new Error('proposeMerge 需要新的 JSON 知识数据');
  }

  const prompt = `
旧的 Markdown 内容:
${oldMarkdownContent}

新的 JSON 知识:
${JSON.stringify(newKnowledgeJson, null, 2)}
`.trim();

  console.log('🧵 [MergeEngine] 开始调用 LLM 进行缝合...');
  const merged = await callLLM(prompt, MERGE_SYSTEM_PROMPT, false);
  console.log('✅ [MergeEngine] 缝合完成，结果长度:', merged.length);

  return merged;
}

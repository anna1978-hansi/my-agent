import { z } from 'zod';
import { callLLM } from '../llm/client.js';

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const BugFixSchema = z.object({
  title: z.string(),
  symptom: z.string(),
  root_cause: z.string(),
  solution: z.string(),
  prevention: z.string(),
});

const ConceptSchema = z.object({
  title: z.string(),
  core_definition: z.string(),
  analogy: z.string(),
  code_example: z.string(),
  use_cases: z.array(z.string()),
});

const ArchitectureSchema = z.object({
  title: z.string(),
  context: z.string(),
  options_compared: z.array(z.string()),
  pros_cons: z.record(z.string(), z.object({ pros: z.array(z.string()), cons: z.array(z.string()) })),
  final_decision: z.string(),
});

// ─── Prompt Templates ────────────────────────────────────────────────────────

const PROMPTS = {
  BugFix: `你是一个技术知识提炼专家。请从以下对话中提取关键信息，严格按照 JSON 格式输出：
{
  "title": "简洁的问题标题（10字以内）",
  "symptom": "具体的报错现象或异常表现",
  "root_cause": "问题的根本原因",
  "solution": "完整的解决方案步骤",
  "prevention": "如何避免此类问题 / 常见误区"
}
只输出 JSON，不要有任何多余文字。`,

  Concept: `你是一个技术知识提炼专家。请从以下对话中提取关键信息，严格按照 JSON 格式输出：
{
  "title": "概念名称（简洁）",
  "core_definition": "一句话核心定义",
  "analogy": "用生活中的事物做类比，必须通俗易懂",
  "code_example": "最能说明问题的核心代码片段（字符串格式）",
  "use_cases": ["适用场景1", "适用场景2", "适用场景3"]
}
只输出 JSON，不要有任何多余文字。`,

  Architecture: `你是一个技术知识提炼专家。请从以下对话中提取关键信息，严格按照 JSON 格式输出：
{
  "title": "选型主题标题",
  "context": "讨论的背景和约束条件",
  "options_compared": ["方案A", "方案B"],
  "pros_cons": {
    "方案A": { "pros": ["优点1"], "cons": ["缺点1"] },
    "方案B": { "pros": ["优点1"], "cons": ["缺点1"] }
  },
  "final_decision": "最终建议及理由"
}
只输出 JSON，不要有任何多余文字。`,
};

const SCHEMAS = { BugFix: BugFixSchema, Concept: ConceptSchema, Architecture: ArchitectureSchema };

// ─── Worker Function ─────────────────────────────────────────────────────────

/**
 * Worker Agent：根据 intent 动态提取结构化知识
 * @param {string} chatText - 原始聊天记录
 * @param {string} intent - Router 判定的意图（BugFix / Concept / Architecture）
 * @param {string} [feedback] - Critic 的反馈（重试时传入）
 * @returns {Promise<object>} 符合对应 Schema 的结构化数据
 */
export async function extractKnowledge(chatText, intent, feedback = null) {
  console.log(`👷‍♂️ [Worker] 开始提取，intent: ${intent}`);

  const schema = SCHEMAS[intent];
  const systemPrompt = PROMPTS[intent];
  if (!schema || !systemPrompt) throw new Error(`未知的 intent: ${intent}`);

  let userPrompt = chatText;
  if (feedback) {
    console.log('👷‍♂️ [Worker] 收到 Critic 反馈，带入重试...');
    userPrompt = `${chatText}\n\n---\n【上一次提取的改进建议】：${feedback}\n请根据以上建议重新提取，输出更高质量的结果。`;
  }

  const raw = await callLLM(userPrompt, systemPrompt, true);

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    console.error('👷‍♂️ [Worker] Zod 校验失败:', parsed.error.flatten());
    throw new Error(`Worker 输出不符合 ${intent} Schema: ${JSON.stringify(parsed.error.flatten())}`);
  }

  console.log(`👷‍♂️ [Worker] 提取成功，字段: ${Object.keys(parsed.data).join(', ')}`);
  return parsed.data;
}

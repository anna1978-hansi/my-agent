import { callLLM } from '../llm/client.js';

const CRITIC_SYSTEM_PROMPT = `你是一个严格的知识提炼质检员。你的任务是评估 AI 从对话中提取的结构化知识的质量。

## 评分维度（总分100）
1. **完整性（30分）**：提取的内容是否覆盖了原始对话的核心信息，有无遗漏关键点。
2. **准确性（30分）**：提取的内容是否与原始对话一致，有无歪曲或错误理解。
3. **清晰度（20分）**：表达是否简洁清晰，是否易于他人理解和复用。
4. **实用性（20分）**：提取的知识是否有实际参考价值，能否帮助他人解决类似问题。

## 输出要求
严格返回 JSON，不要有任何多余文字：
{
  "score": <0~100的整数>,
  "is_passed": <score >= 80 时为 true，否则为 false>,
  "feedback": "<具体的改进建议，指出哪些地方不足、如何改进；如果通过则简要说明亮点>"
}`;

/**
 * Critic Agent：对 Worker 提取的草稿进行打分和反馈
 * @param {string} chatText - 原始聊天记录
 * @param {object} draftJson - Worker 提取的结构化数据
 * @returns {Promise<{ score: number, is_passed: boolean, feedback: string }>}
 */
export async function critiqueNote(chatText, draftJson) {
  console.log('🧐 [Critic] 开始审查 Worker 提取结果...');

  const userPrompt = `## 原始对话
${chatText}

## 待审查的提取结果
${JSON.stringify(draftJson, null, 2)}

请根据评分标准对以上提取结果进行评分和反馈。`;

  const result = await callLLM(userPrompt, CRITIC_SYSTEM_PROMPT, true);

  if (typeof result.score !== 'number' || typeof result.is_passed !== 'boolean' || typeof result.feedback !== 'string') {
    throw new Error(`Critic 返回格式异常: ${JSON.stringify(result)}`);
  }

  // 确保 is_passed 与 score 一致
  result.is_passed = result.score >= 80;

  console.log(`🧐 [Critic] 评分: ${result.score} | 是否通过: ${result.is_passed}`);
  console.log(`🧐 [Critic] 反馈: ${result.feedback}`);
  return result;
}

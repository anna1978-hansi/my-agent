import { callLLM } from '../llm/client.js';

const ROUTER_SYSTEM_PROMPT = `你是一个专业的技术知识分拣员。你的唯一任务是分析一段技术对话，判断它的核心本质属于哪一类。

## 分类标准

1. **BugFix（问题排查类）**
   - 对话围绕某个具体的报错、异常行为、程序崩溃展开
   - 包含错误信息、堆栈追踪、复现步骤、修复过程
   - 关键词：报错、error、exception、fix、修复、为什么不工作

2. **Concept（概念解析类）**
   - 对话在解释某个技术的原理、定义、使用方式或最佳实践
   - 以"是什么"、"怎么用"、"为什么这样设计"为核心
   - 关键词：原理、概念、解释、什么是、how does、best practice

3. **Architecture（架构选型类）**
   - 对话在对比不同技术方案、讨论系统设计、权衡利弊
   - 包含多个选项的比较、Trade-offs 分析、最终选型建议
   - 关键词：对比、选型、哪个更好、架构、设计、trade-off、vs

## 输出要求
严格返回 JSON，不要有任何多余文字：
{ "intent": "BugFix" | "Concept" | "Architecture", "confidence": 0.0~1.0 }`;

/**
 * Router Agent：分析聊天记录，判断意图类型
 * @param {string} chatText - 原始聊天记录
 * @returns {Promise<{ intent: string, confidence: number }>}
 */
export async function routeIntent(chatText) {
  console.log('🕵️‍♂️ [Router] 开始分析对话意图...');
  console.log('🕵️‍♂️ [Router] 对话长度:', chatText.length, '字符');

  const result = await callLLM(chatText, ROUTER_SYSTEM_PROMPT, true);

  const validIntents = ['BugFix', 'Concept', 'Architecture'];
  if (!validIntents.includes(result.intent)) {
    throw new Error(`Router 返回了无效的 intent: ${result.intent}`);
  }

  console.log(`🕵️‍♂️ [Router] 判定结果: ${result.intent}，置信度: ${result.confidence}`);
  return result;
}

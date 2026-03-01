import { routeIntent } from './router.js';
import { extractKnowledge } from './worker.js';
import { critiqueNote } from './critic.js';
import { executeKnowledge } from './executor.js';
import { generateEmbedding } from '../tools/rag.js';

const MAX_RETRIES = 2;

/**
 * 完整的 Agent Pipeline：Router -> Worker -> Critic（带重试循环）
 * @param {string} chatText - 原始聊天记录
 * @returns {Promise<object>} 最终结构化知识 + 元数据
 */
export async function runPipeline(chatText) {
  console.log('\n🚀 [Pipeline] ===== 开始处理 =====');
  console.log(`🚀 [Pipeline] 输入长度: ${chatText.length} 字符`);

  // Step 1: Router 判定意图
  console.log('\n🚀 [Pipeline] Step 1: Router 意图识别');
  const { intent, confidence } = await routeIntent(chatText);
  console.log(`🚀 [Pipeline] 意图: ${intent}，置信度: ${confidence}`);

  // Step 2 & 3: Worker 提取 + Critic 审查（带重试循环）
  let draft = null;
  let critique = null;
  let retries = 0;
  let feedback = null;

  while (retries <= MAX_RETRIES) {
    console.log(`\n🚀 [Pipeline] Step 2: Worker 提取（第 ${retries + 1} 次）`);
    draft = await extractKnowledge(chatText, intent, feedback);

    console.log(`\n🚀 [Pipeline] Step 3: Critic 审查（第 ${retries + 1} 次）`);
    critique = await critiqueNote(chatText, draft);

    if (critique.is_passed) {
      console.log(`\n✅ [Pipeline] Critic 通过！评分: ${critique.score}，共重试 ${retries} 次`);
      break;
    }

    retries++;
    if (retries > MAX_RETRIES) {
      console.warn(`\n⚠️  [Pipeline] 达到最大重试次数 (${MAX_RETRIES})，使用当前最佳结果（评分: ${critique.score}）`);
      break;
    }

    console.log(`\n🔄 [Pipeline] 评分 ${critique.score} < 80，将反馈传回 Worker 重试...`);
    feedback = critique.feedback;
  }

  console.log('\n🚀 [Pipeline] Step 4: Executor 执行创建/合并');
  const embedding = await generateEmbedding(chatText);
  const executorResult = await executeKnowledge({
    intent,
    data: draft,
    raw_chat: chatText,
    embedding,
  });

  const result = {
    intent,
    confidence,
    score: critique.score,
    is_passed: critique.is_passed,
    retries,
    data: draft,
    executor: executorResult,
  };

  console.log('\n🚀 [Pipeline] ===== 处理完成 =====');
  return result;
}

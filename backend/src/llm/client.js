import 'dotenv/config';
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.BASE_URL,
});

const MODEL = process.env.MODEL_NAME || 'deepseek-chat';

/**
 * 调用 LLM，支持强制 JSON 输出模式
 * @param {string} prompt - 用户消息
 * @param {string} systemMsg - 系统提示词
 * @param {boolean} expectJson - 是否强制返回 JSON（默认 true）
 * @returns {Promise<object|string>} - expectJson=true 时返回解析后的对象，否则返回字符串
 */
export async function callLLM(prompt, systemMsg, expectJson = true) {
  console.log('🤖 [LLM] 发起调用，模型:', MODEL);
  console.log('🤖 [LLM] expectJson:', expectJson);

  const requestParams = {
    model: MODEL,
    messages: [
      { role: 'system', content: systemMsg },
      { role: 'user', content: prompt },
    ],
  };

  if (expectJson) {
    requestParams.response_format = { type: 'json_object' };
  }

  try {
    const response = await client.chat.completions.create(requestParams);
    const rawContent = response.choices[0].message.content;
    console.log('✅ [LLM] 原始响应长度:', rawContent.length, '字符');

    if (expectJson) {
      const parsed = JSON.parse(rawContent);
      console.log('✅ [LLM] JSON 解析成功');
      return parsed;
    }

    return rawContent;
  } catch (err) {
    if (err instanceof SyntaxError) {
      console.error('❌ [LLM] JSON 解析失败:', err.message);
      throw new Error(`LLM 返回了无效的 JSON: ${err.message}`);
    }
    console.error('❌ [LLM] API 调用失败:', err.message);
    throw err;
  }
}

import 'dotenv/config';
import OpenAI from 'openai';

const EMBEDDING_MODEL = 'text-embedding-3-small';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.BASE_URL,
});

/**
 * 生成文本向量（Embedding）
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function generateEmbedding(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('generateEmbedding 需要非空字符串作为输入');
  }

  const baseUrl = process.env.BASE_URL;
  const apiKey = process.env.OPENAI_API_KEY || '';
  const keyMasked = apiKey ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}` : '(empty)';

  console.log('🔎 [RAG] BASE_URL:', baseUrl || '(undefined)');
  console.log('🔎 [RAG] OPENAI_API_KEY:', keyMasked);
  if (baseUrl) {
    console.log('🔎 [RAG] 预期 Embeddings URL:', `${baseUrl.replace(/\/$/, '')}/v1/embeddings`);
  }

  console.log('🧠 [RAG] 开始生成 Embedding...');
  console.log('🧠 [RAG] 模型:', EMBEDDING_MODEL);
  console.log('🧠 [RAG] 文本长度:', text.length);

  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });

  const embedding = response.data?.[0]?.embedding;

  if (!Array.isArray(embedding)) {
    throw new Error('Embedding 响应格式异常，未获取到向量数组');
  }

  console.log('✅ [RAG] Embedding 生成成功，维度:', embedding.length);

  return embedding;
}

import 'dotenv/config';
import OpenAI from 'openai';
import db from '../db/index.js';

const EMBEDDING_MODEL = 'text-embedding-v4';

const client = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: process.env.DASHSCOPE_baseURL,
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

  const baseUrl = process.env.DASHSCOPE_baseURL;
  const apiKey = process.env.DASHSCOPE_API_KEY || '';
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

/**
 * 计算两个向量的余弦相似度
 * @param {number[]} vecA
 * @param {number[]} vecB
 * @returns {number}
 */
export function cosineSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB)) {
    throw new Error('cosineSimilarity 需要两个数组作为输入');
  }
  if (vecA.length === 0 || vecB.length === 0) {
    throw new Error('cosineSimilarity 输入向量不能为空');
  }
  if (vecA.length !== vecB.length) {
    throw new Error('cosineSimilarity 向量维度不一致');
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i += 1) {
    const a = vecA[i];
    const b = vecB[i];
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) {
    throw new Error('cosineSimilarity 计算分母为 0，向量可能全为 0');
  }

  const score = dot / denom;
  return score;
}

/**
 * 在数据库中搜索最相似的笔记
 * @param {string} queryText
 * @param {number} threshold
 * @returns {Promise<object>}
 */
export async function searchSimilarNote(queryText, threshold = 0.85) {
  console.log('🧭 [RAG] 开始相似度检索...');
  console.log('🧭 [RAG] 阈值:', threshold);

  const queryEmbedding = await generateEmbedding(queryText);

  const rows = db.prepare(`
    SELECT id, title, intent, content, file_path, embedding, created_at
    FROM knowledge_notes
  `).all();

  let best = null;
  let bestScore = -1;

  for (const row of rows) {
    if (!row.embedding) {
      continue;
    }

    let embedding;
    try {
      embedding = JSON.parse(row.embedding);
    } catch (err) {
      console.log(`⚠️  [RAG] embedding 解析失败，id=${row.id}`);
      continue;
    }

    if (!Array.isArray(embedding)) {
      console.log(`⚠️  [RAG] embedding 非数组，id=${row.id}`);
      continue;
    }

    if (embedding.length !== queryEmbedding.length) {
      console.log(
        `⚠️  [RAG] 向量维度不一致，id=${row.id} (${embedding.length} vs ${queryEmbedding.length})`
      );
      continue;
    }

    const score = cosineSimilarity(queryEmbedding, embedding);

    if (score > bestScore) {
      bestScore = score;
      best = { ...row, embedding };
    }
  }

  if (best && typeof best.content === 'string') {
    try {
      best.content = JSON.parse(best.content);
    } catch (err) {
      console.log(`⚠️  [RAG] content 解析失败，id=${best.id}`);
    }
  }

  if (best && bestScore >= threshold) {
    console.log(`✅ [RAG] 命中相似笔记，score=${bestScore.toFixed(4)}`);
    return { action: 'MERGE', score: bestScore, note: best };
  }

  console.log('🆕 [RAG] 未命中相似笔记，走 CREATE');
  return { action: 'CREATE', score: bestScore, note: best };
}

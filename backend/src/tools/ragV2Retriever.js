import db from '../db/index.js';
import { generateEmbedding } from './rag.js';

const DEFAULT_TOP_K = 40;

/**
 * Task 5: Chunk 召回（query embedding 归一化 + dot 相似度）
 * @param {string} queryText
 * @param {object} [options]
 * @param {number} [options.topK]
 * @param {(text:string)=>Promise<number[]>} [options.embeddingFn]
 * @param {string[]} [options.noteIds]
 * @returns {Promise<{query_embedding:number[], top_chunks:Array}>}
 */
export async function retrieveTopChunks(queryText, options = {}) {
  console.log('[RAGv2] 🧭 开始执行 Chunk 召回...');

  if (typeof queryText !== 'string' || queryText.trim().length === 0) {
    throw new Error('retrieveTopChunks 需要非空 queryText');
  }

  const topK = normalizeTopK(options.topK);
  const embeddingFn = typeof options.embeddingFn === 'function' ? options.embeddingFn : generateEmbedding;
  const noteIds = normalizeNoteIds(options.noteIds);

  const queryEmbeddingRaw = await embeddingFn(queryText);
  const queryEmbedding = l2Normalize(queryEmbeddingRaw);

  const rows = selectChunkRows(noteIds);
  if (rows.length === 0) {
    console.log('[RAGv2] 🧭 note_chunks 为空，返回空结果');
    return {
      query_embedding: queryEmbedding,
      top_chunks: [],
    };
  }

  const scored = [];
  let skippedInvalidEmbedding = 0;
  let skippedDimensionMismatch = 0;

  for (const row of rows) {
    const chunkEmbedding = parseEmbedding(row.chunk_embedding, row.id);
    if (!chunkEmbedding) {
      skippedInvalidEmbedding += 1;
      continue;
    }

    if (chunkEmbedding.length !== queryEmbedding.length) {
      skippedDimensionMismatch += 1;
      console.log(
        `[RAGv2] ⚠️ 向量维度不一致，跳过 chunk_id=${row.id} (${chunkEmbedding.length} vs ${queryEmbedding.length})`
      );
      continue;
    }

    const normalizedChunk = l2Normalize(chunkEmbedding);
    const score = dotProduct(queryEmbedding, normalizedChunk);
    scored.push({
      chunk_id: row.id,
      note_id: row.note_id,
      note_title: row.note_title,
      chunk_index: row.chunk_index,
      section_path: row.section_path,
      chunk_text: row.chunk_text,
      char_count: row.char_count,
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const topChunks = scored.slice(0, topK);

  console.log(
    `[RAGv2] ✅ Chunk 召回完成，总候选=${rows.length}, 有效=${scored.length}, topK=${topK}, invalid=${skippedInvalidEmbedding}, mismatch=${skippedDimensionMismatch}`
  );

  return {
    query_embedding: queryEmbedding,
    top_chunks: topChunks,
  };
}

export function l2Normalize(vec) {
  if (!Array.isArray(vec) || vec.length === 0) {
    throw new Error('l2Normalize 需要非空数组');
  }

  let norm = 0;
  for (const v of vec) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error('l2Normalize 向量元素必须是有限数字');
    }
    norm += v * v;
  }

  if (norm === 0) {
    throw new Error('l2Normalize 不支持全 0 向量');
  }

  const denom = Math.sqrt(norm);
  return vec.map(v => v / denom);
}

export function dotProduct(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB)) {
    throw new Error('dotProduct 需要两个数组');
  }
  if (vecA.length === 0 || vecB.length === 0) {
    throw new Error('dotProduct 输入不能为空');
  }
  if (vecA.length !== vecB.length) {
    throw new Error('dotProduct 向量维度不一致');
  }

  let dot = 0;
  for (let i = 0; i < vecA.length; i += 1) {
    dot += vecA[i] * vecB[i];
  }
  return dot;
}

function normalizeTopK(topK) {
  const resolved = topK == null ? DEFAULT_TOP_K : topK;
  if (!Number.isInteger(resolved) || resolved <= 0) {
    throw new Error('retrieveTopChunks 参数错误：topK 必须是正整数');
  }
  return resolved;
}

function normalizeNoteIds(noteIds) {
  if (noteIds == null) {
    return null;
  }
  if (!Array.isArray(noteIds)) {
    throw new Error('retrieveTopChunks 参数错误：noteIds 必须是字符串数组');
  }

  const ids = noteIds.filter(id => typeof id === 'string' && id.trim().length > 0);
  return ids.length > 0 ? ids : null;
}

function parseEmbedding(text, chunkId) {
  try {
    const vec = JSON.parse(text);
    if (!Array.isArray(vec) || vec.length === 0) {
      console.log(`[RAGv2] ⚠️ embedding 非法，跳过 chunk_id=${chunkId}`);
      return null;
    }
    return vec;
  } catch {
    console.log(`[RAGv2] ⚠️ embedding 解析失败，跳过 chunk_id=${chunkId}`);
    return null;
  }
}

function selectChunkRows(noteIds) {
  if (!noteIds) {
    return db.prepare(`
      SELECT
        c.id,
        c.note_id,
        c.chunk_index,
        c.section_path,
        c.chunk_text,
        c.char_count,
        c.chunk_embedding,
        n.title AS note_title
      FROM note_chunks c
      LEFT JOIN knowledge_notes n ON n.id = c.note_id
    `).all();
  }

  const placeholders = noteIds.map(() => '?').join(',');
  return db.prepare(`
    SELECT
      c.id,
      c.note_id,
      c.chunk_index,
      c.section_path,
      c.chunk_text,
      c.char_count,
      c.chunk_embedding,
      n.title AS note_title
    FROM note_chunks c
    LEFT JOIN knowledge_notes n ON n.id = c.note_id
    WHERE c.note_id IN (${placeholders})
  `).all(...noteIds);
}


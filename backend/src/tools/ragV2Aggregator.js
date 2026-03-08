const DEFAULT_TOP_N = 8;

/**
 * Task 6: chunk -> document 聚合
 * 公式：0.55*max + 0.30*top3_mean + 0.15*section_coverage
 *
 * section_coverage 定义：
 * unique_sections / min(3, chunk_count)
 * 该值范围 [0, 1]，表示高分 chunk 在不同 section 的分布覆盖度。
 *
 * @param {Array} topChunks
 * @param {object} [options]
 * @param {number} [options.topN]
 * @returns {{top_docs:Array}}
 */
export function aggregateChunksToDocs(topChunks, options = {}) {
  console.log('[RAGv2] 🧠 开始执行文档聚合...');

  if (!Array.isArray(topChunks)) {
    throw new Error('aggregateChunksToDocs 需要 topChunks 数组');
  }

  const topN = normalizeTopN(options.topN);
  if (topChunks.length === 0) {
    console.log('[RAGv2] 🧠 输入 chunks 为空，返回空文档候选');
    return { top_docs: [] };
  }

  const byDoc = new Map();

  for (const chunk of topChunks) {
    const noteId = typeof chunk?.note_id === 'string' ? chunk.note_id : '';
    if (!noteId) {
      console.log('[RAGv2] ⚠️ chunk 缺少 note_id，已跳过');
      continue;
    }

    const score = Number(chunk.score);
    if (!Number.isFinite(score)) {
      console.log(`[RAGv2] ⚠️ chunk score 非法，已跳过 note_id=${noteId}`);
      continue;
    }

    if (!byDoc.has(noteId)) {
      byDoc.set(noteId, {
        note_id: noteId,
        note_title: chunk.note_title || '(unknown)',
        chunks: [],
      });
    }

    byDoc.get(noteId).chunks.push({
      chunk_id: chunk.chunk_id || null,
      chunk_index: chunk.chunk_index ?? null,
      section_path: chunk.section_path || 'ROOT',
      chunk_text: chunk.chunk_text || '',
      score,
    });
  }

  const docs = [];
  for (const doc of byDoc.values()) {
    doc.chunks.sort((a, b) => b.score - a.score);

    const scores = doc.chunks.map(c => c.score);
    const maxScore = scores[0];
    const top3Scores = scores.slice(0, 3);
    const top3Mean = average(top3Scores);
    const sectionCoverage = computeSectionCoverage(doc.chunks);
    const aggScore =
      0.55 * maxScore +
      0.30 * top3Mean +
      0.15 * sectionCoverage;

    docs.push({
      note_id: doc.note_id,
      note_title: doc.note_title,
      agg_score: aggScore,
      max_score: maxScore,
      top3_mean: top3Mean,
      section_coverage: sectionCoverage,
      chunk_count: doc.chunks.length,
      chunks: doc.chunks,
    });
  }

  docs.sort((a, b) => b.agg_score - a.agg_score);
  const topDocs = docs.slice(0, topN);

  console.log(
    `[RAGv2] ✅ 文档聚合完成，input_chunks=${topChunks.length}, docs=${docs.length}, topN=${topN}`
  );

  return { top_docs: topDocs };
}

function normalizeTopN(topN) {
  const resolved = topN == null ? DEFAULT_TOP_N : topN;
  if (!Number.isInteger(resolved) || resolved <= 0) {
    throw new Error('aggregateChunksToDocs 参数错误：topN 必须是正整数');
  }
  return resolved;
}

function average(nums) {
  if (!Array.isArray(nums) || nums.length === 0) {
    return 0;
  }

  let sum = 0;
  for (const n of nums) {
    sum += n;
  }
  return sum / nums.length;
}

export function computeSectionCoverage(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return 0;
  }

  const denominator = Math.min(3, chunks.length);
  const unique = new Set(chunks.map(c => c.section_path || 'ROOT')).size;
  return Math.min(1, unique / denominator);
}


const DEFAULT_SNIPPET_MAX_CHARS = 1800;
const DEFAULT_SNIPPET_TOP_CHUNKS = 2;

/**
 * Task 7: TopN 文档重排（CrossEncoder 层）
 * @param {string} queryText
 * @param {Array} topDocs
 * @param {object} [options]
 * @param {number} [options.topN]
 * @param {(query:string, snippet:string, doc:object)=>Promise<number>|number} [options.crossEncoderFn]
 * @returns {Promise<{model:string, used_fallback:boolean, rerank:Array}>}
 */
export async function rerankTopDocs(queryText, topDocs, options = {}) {
  console.log('[RAGv2] 🎯 开始执行文档重排...');

  if (typeof queryText !== 'string' || queryText.trim().length === 0) {
    throw new Error('rerankTopDocs 需要非空 queryText');
  }
  if (!Array.isArray(topDocs)) {
    throw new Error('rerankTopDocs 需要 topDocs 数组');
  }

  if (topDocs.length === 0) {
    console.log('[RAGv2] 🎯 输入文档为空，返回空重排结果');
    return {
      model: 'cross-encoder-fallback-v1',
      used_fallback: false,
      rerank: [],
    };
  }

  const topN = normalizeTopN(options.topN, topDocs.length);
  const scorer = typeof options.crossEncoderFn === 'function'
    ? options.crossEncoderFn
    : fallbackCrossEncoderScore;

  const rows = [];
  let usedFallback = false;

  for (const doc of topDocs) {
    const snippet = buildDocSnippet(doc, {
      maxChars: DEFAULT_SNIPPET_MAX_CHARS,
      topChunks: DEFAULT_SNIPPET_TOP_CHUNKS,
    });

    let score;
    let source = 'cross_encoder';

    try {
      const val = await scorer(queryText, snippet, doc);
      if (!Number.isFinite(val)) {
        throw new Error('crossEncoder 返回非数字');
      }
      score = Number(val);
    } catch (err) {
      usedFallback = true;
      source = 'agg_fallback';
      score = Number.isFinite(doc?.agg_score) ? Number(doc.agg_score) : 0;
      console.log(`[RAGv2] ⚠️ 重排失败 note_id=${doc?.note_id || '(unknown)'}，回退 agg_score，err=${err.message}`);
    }

    rows.push({
      note_id: doc.note_id,
      note_title: doc.note_title || '(unknown)',
      rerank_score: score,
      score_source: source,
      agg_score: Number.isFinite(doc?.agg_score) ? Number(doc.agg_score) : 0,
      snippet,
      doc,
    });
  }

  rows.sort((a, b) => b.rerank_score - a.rerank_score);

  console.log(`[RAGv2] ✅ 重排完成，input_docs=${topDocs.length}, topN=${topN}, fallback=${usedFallback}`);
  return {
    model: typeof options.modelName === 'string' && options.modelName.trim().length > 0
      ? options.modelName
      : 'cross-encoder-fallback-v1',
    used_fallback: usedFallback,
    rerank: rows.slice(0, topN),
  };
}

/**
 * doc_snippet 规则：
 * - 取该文档 top2 chunks（按输入顺序）
 * - 文本拼接
 * - 最大 1800 chars
 */
export function buildDocSnippet(doc, options = {}) {
  const maxChars = normalizePositiveInt(options.maxChars, DEFAULT_SNIPPET_MAX_CHARS, 'maxChars');
  const topChunks = normalizePositiveInt(options.topChunks, DEFAULT_SNIPPET_TOP_CHUNKS, 'topChunks');

  const chunks = Array.isArray(doc?.chunks) ? doc.chunks : [];
  const selected = chunks.slice(0, topChunks);

  const texts = selected
    .map(c => (typeof c?.chunk_text === 'string' ? c.chunk_text.trim() : ''))
    .filter(Boolean);

  if (texts.length === 0) {
    const title = typeof doc?.note_title === 'string' ? doc.note_title : '';
    return title.slice(0, maxChars);
  }

  const merged = texts.join('\n\n');
  return merged.length <= maxChars ? merged : merged.slice(0, maxChars);
}

export async function fallbackCrossEncoderScore(queryText, snippet) {
  const qTokens = tokenize(queryText);
  const sTokens = tokenize(snippet);
  if (qTokens.length === 0 || sTokens.length === 0) {
    return 0;
  }

  const qSet = new Set(qTokens);
  const sSet = new Set(sTokens);
  let overlap = 0;
  for (const token of qSet) {
    if (sSet.has(token)) {
      overlap += 1;
    }
  }

  // 简化版交并比 + 长度平衡项
  const union = new Set([...qSet, ...sSet]).size;
  const jaccard = union > 0 ? overlap / union : 0;
  const lengthBalance = Math.min(1, snippet.length / DEFAULT_SNIPPET_MAX_CHARS);

  return 0.85 * jaccard + 0.15 * lengthBalance;
}

function tokenize(text) {
  if (typeof text !== 'string') {
    return [];
  }
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function normalizeTopN(topN, fallback) {
  const resolved = topN == null ? fallback : topN;
  if (!Number.isInteger(resolved) || resolved <= 0) {
    throw new Error('rerankTopDocs 参数错误：topN 必须是正整数');
  }
  return resolved;
}

function normalizePositiveInt(value, fallback, label) {
  const resolved = value == null ? fallback : value;
  if (!Number.isInteger(resolved) || resolved <= 0) {
    throw new Error(`buildDocSnippet 参数错误：${label} 必须是正整数`);
  }
  return resolved;
}


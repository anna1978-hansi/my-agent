import fs from 'fs';
import { createHash } from 'crypto';
import { getNoteById } from '../db/notes.js';
import { searchSimilarNote } from '../tools/rag.js';
import { proposeMerge } from '../tools/mergeEngine.js';
import { buildCreateDraft, create_new_markdown } from '../tools/fileManager.js';
import { retrieveTopChunks } from '../tools/ragV2Retriever.js';
import { aggregateChunksToDocs } from '../tools/ragV2Aggregator.js';
import { rerankTopDocs } from '../tools/ragV2Reranker.js';
import { decideCreateOrUpdate } from '../tools/ragV2Decision.js';

/**
 * Executor：根据相似度决定合并或创建
 * @param {object} payload
 * @param {string} payload.intent
 * @param {object} payload.data
 * @param {string} payload.raw_chat
 * @param {number[]} payload.embedding
 * @param {'auto' | 'confirm'} [payload.create_mode]
 * @param {number} [payload.threshold]
 * @param {boolean} [payload.use_rag_v2]
 * @param {object} [payload.rag_v2_options]
 * @returns {Promise<object>}
 */
export async function executeKnowledge(payload) {
  const {
    intent,
    data,
    raw_chat = '',
    embedding = null,
    threshold,
    create_mode = 'auto',
    use_rag_v2,
    rag_v2_options = {},
  } = payload || {};
  if (!intent || !data) {
    throw new Error('executeKnowledge 缺少 intent 或 data');
  }

  const title = data.title || '(无标题)';
  const queryText = raw_chat && raw_chat.trim().length > 0 ? raw_chat : title;
  console.log('🧠 [Executor] 开始执行，标题:', title);
  console.log('🧠 [Executor] 检索文本:', queryText.slice(0, 80));

  const ragV2Enabled = resolveRagV2Enabled(use_rag_v2);
  if (ragV2Enabled) {
    return executeWithRagV2({
      intent,
      data,
      raw_chat,
      embedding,
      create_mode,
      query_text: queryText,
      rag_v2_options,
    });
  }

  return executeWithRagV1({
    intent,
    data,
    raw_chat,
    embedding,
    threshold,
    create_mode,
    query_text: queryText,
  });
}

async function executeWithRagV1(payload) {
  const {
    intent,
    data,
    raw_chat,
    embedding,
    threshold,
    create_mode,
    query_text,
  } = payload;

  const result = await searchSimilarNote(
    query_text,
    typeof threshold === 'number' ? threshold : 0.7
  );

  if (result.action === 'MERGE' && result.note?.file_path) {
    console.log('🧵 [Executor] 命中相似笔记，开始合并...');
    const oldMarkdown = fs.readFileSync(result.note.file_path, 'utf8');
    const proposed = await proposeMerge(oldMarkdown, data);
    const baseHash = hashMarkdown(oldMarkdown);
    return {
      action: 'MERGE',
      note_id: result.note.id,
      score: result.score,
      file_path: result.note.file_path,
      old_content: oldMarkdown,
      proposed_content: proposed,
      base_hash: baseHash,
      retrieval_debug: {
        decision_method: 'v1_threshold',
        best_score: result.score,
      },
    };
  }

  if (result.action === 'MERGE' && !result.note?.file_path) {
    console.log('⚠️  [Executor] 命中相似笔记但缺少 file_path，降级为 CREATE');
  } else {
    console.log('🆕 [Executor] 未命中相似笔记，创建新 Markdown');
  }

  if (create_mode === 'confirm') {
    const draft = buildCreateDraft({
      intent,
      data,
      raw_chat,
      embedding,
    });

    return {
      action: 'CREATE',
      mode: 'confirm',
      draft,
      retrieval_debug: {
        decision_method: 'v1_threshold',
        best_score: result.score,
      },
    };
  }

  const created = create_new_markdown({
    intent,
    data,
    raw_chat,
    embedding,
  });

  return {
    action: 'CREATE',
    mode: 'auto',
    note: created,
    retrieval_debug: {
      decision_method: 'v1_threshold',
      best_score: result.score,
    },
  };
}

async function executeWithRagV2(payload) {
  const {
    intent,
    data,
    raw_chat,
    embedding,
    create_mode,
    query_text,
    rag_v2_options,
  } = payload;

  console.log('[Executor] 🧭 使用 RAG v2 检索链路');
  const topK = Number.isInteger(rag_v2_options.topK) ? rag_v2_options.topK : 40;
  const topN = Number.isInteger(rag_v2_options.topN) ? rag_v2_options.topN : 8;

  const retrieval = await retrieveTopChunks(query_text, {
    topK,
    embeddingFn: rag_v2_options.embeddingFn,
    noteIds: rag_v2_options.noteIds,
  });

  const aggregated = aggregateChunksToDocs(retrieval.top_chunks, { topN });
  const reranked = await rerankTopDocs(query_text, aggregated.top_docs, {
    topN,
    crossEncoderFn: rag_v2_options.crossEncoderFn,
    modelName: rag_v2_options.modelName,
  });

  const decision = await decideCreateOrUpdate(query_text, reranked.rerank, {
    llmDecisionFn: rag_v2_options.llmDecisionFn,
  });

  const retrievalDebug = {
    top_chunks: retrieval.top_chunks,
    top_docs: aggregated.top_docs,
    rerank: reranked.rerank,
    decision_method: decision.decision_method,
    best_score: decision.best_score,
    margin: decision.margin,
    reason: decision.reason,
  };

  if (decision.action === 'UPDATE' && decision.note_id) {
    const note = getNoteById(decision.note_id);
    const filePath = note?.file_path || null;

    if (filePath && fs.existsSync(filePath)) {
      console.log('[Executor] 🧵 RAG v2 判定 UPDATE，开始合并...');
      const oldMarkdown = fs.readFileSync(filePath, 'utf8');
      const mergeFn = typeof rag_v2_options.proposeMergeFn === 'function'
        ? rag_v2_options.proposeMergeFn
        : proposeMerge;
      const proposed = await mergeFn(oldMarkdown, data);
      const baseHash = hashMarkdown(oldMarkdown);

      return {
        action: 'MERGE',
        note_id: decision.note_id,
        score: decision.best_score,
        file_path: filePath,
        old_content: oldMarkdown,
        proposed_content: proposed,
        base_hash: baseHash,
        retrieval_debug: retrievalDebug,
      };
    }

    console.log('[Executor] ⚠️ RAG v2 判定 UPDATE，但目标 file 不可用，降级 CREATE');
    retrievalDebug.decision_method = `${decision.decision_method}_downgrade_missing_file`;
  } else {
    console.log('[Executor] 🆕 RAG v2 判定 CREATE');
  }

  if (create_mode === 'confirm') {
    const draft = buildCreateDraft({
      intent,
      data,
      raw_chat,
      embedding,
    });

    return {
      action: 'CREATE',
      mode: 'confirm',
      draft,
      retrieval_debug: retrievalDebug,
    };
  }

  const created = create_new_markdown({
    intent,
    data,
    raw_chat,
    embedding,
  });

  return {
    action: 'CREATE',
    mode: 'auto',
    note: created,
    retrieval_debug: retrievalDebug,
  };
}

function hashMarkdown(markdown) {
  return `sha256:${createHash('sha256').update(markdown, 'utf8').digest('hex')}`;
}

function resolveRagV2Enabled(flag) {
  if (typeof flag === 'boolean') {
    return flag;
  }
  return process.env.RAG_V2_ENABLED === '1';
}

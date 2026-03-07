import fs from 'fs';
import { randomUUID } from 'crypto';
import db from '../db/index.js';
import { generateEmbedding } from './rag.js';
import { chunkMarkdown } from './chunker.js';

export const INDEX_STATUS = Object.freeze({
  READY: 'ready',
  SKIPPED_MISSING_PATH: 'skipped_missing_path',
  SKIPPED_FILE_NOT_FOUND: 'skipped_file_not_found',
  SKIPPED_EMPTY: 'skipped_empty',
  FAILED: 'failed',
});

const insertChunkStmt = db.prepare(`
  INSERT INTO note_chunks (
    id, note_id, chunk_index, section_path, chunk_text, chunk_embedding, char_count, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const deleteChunksByNoteStmt = db.prepare('DELETE FROM note_chunks WHERE note_id = ?');

const upsertStatusStmt = db.prepare(`
  INSERT INTO note_index_status (note_id, status, reason, updated_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(note_id)
  DO UPDATE SET
    status = excluded.status,
    reason = excluded.reason,
    updated_at = excluded.updated_at
`);

const selectNoteByIdStmt = db.prepare(`
  SELECT id, title, file_path
  FROM knowledge_notes
  WHERE id = ?
  LIMIT 1
`);

const selectNotesStmt = db.prepare(`
  SELECT id, title, file_path
  FROM knowledge_notes
  ORDER BY created_at DESC
`);

const saveReadyTx = db.transaction((noteId, chunkRows, updatedAt) => {
  deleteChunksByNoteStmt.run(noteId);
  for (const row of chunkRows) {
    insertChunkStmt.run(
      row.id,
      row.note_id,
      row.chunk_index,
      row.section_path,
      row.chunk_text,
      row.chunk_embedding,
      row.char_count,
      row.created_at
    );
  }
  upsertStatusStmt.run(noteId, INDEX_STATUS.READY, null, updatedAt);
});

const saveStatusTx = db.transaction((noteId, status, reason, updatedAt) => {
  deleteChunksByNoteStmt.run(noteId);
  upsertStatusStmt.run(noteId, status, reason, updatedAt);
});

/**
 * embedding 输入格式固定：title + section_path + chunk_text
 * @param {string} title
 * @param {string} sectionPath
 * @param {string} chunkText
 * @returns {string}
 */
export function buildChunkEmbeddingText(title, sectionPath, chunkText) {
  const safeTitle = typeof title === 'string' && title.trim().length > 0 ? title.trim() : '(无标题)';
  const safeSection = typeof sectionPath === 'string' && sectionPath.trim().length > 0
    ? sectionPath.trim()
    : 'ROOT';
  const safeChunk = typeof chunkText === 'string' ? chunkText.trim() : '';

  return [
    `TITLE: ${safeTitle}`,
    `SECTION: ${safeSection}`,
    'CONTENT:',
    safeChunk,
  ].join('\n');
}

export function listIndexableNotes(noteIds = null) {
  const rows = selectNotesStmt.all();
  if (!Array.isArray(noteIds) || noteIds.length === 0) {
    return rows;
  }

  const idSet = new Set(noteIds);
  return rows.filter(row => idSet.has(row.id));
}

export function buildFakeEmbedding(text) {
  const source = typeof text === 'string' ? text : '';
  const len = source.length;
  let checksum = 0;
  for (let i = 0; i < source.length; i += 1) {
    checksum = (checksum + source.charCodeAt(i)) % 104729;
  }

  return [
    Number((len / 2000).toFixed(8)),
    Number((checksum / 104729).toFixed(8)),
    Number((((len + checksum) % 997) / 997).toFixed(8)),
  ];
}

function resolveEmbeddingFn(options) {
  if (typeof options.embeddingFn === 'function') {
    return options.embeddingFn;
  }

  if (process.env.RAG_V2_USE_FAKE_EMBEDDING === '1') {
    console.log('[Indexer] 🧪 使用本地 fake embedding 模式');
    return async text => buildFakeEmbedding(text);
  }

  return generateEmbedding;
}

export async function indexNoteById(noteId, options = {}) {
  if (!noteId || typeof noteId !== 'string') {
    throw new Error('indexNoteById 需要 noteId 字符串');
  }

  const note = selectNoteByIdStmt.get(noteId);
  if (!note) {
    return {
      note_id: noteId,
      status: INDEX_STATUS.FAILED,
      reason: 'note_not_found',
      chunk_count: 0,
    };
  }

  return indexSingleNote(note, options);
}

export async function indexSingleNote(note, options = {}) {
  const embeddingFn = resolveEmbeddingFn(options);
  const chunkOptions = options.chunkOptions || {};
  const noteId = note?.id;
  const noteTitle = note?.title || '(无标题)';
  const updatedAt = new Date().toISOString();

  if (!noteId) {
    throw new Error('indexSingleNote 需要 note.id');
  }

  console.log(`[Indexer] 🧱 开始索引 note=${noteId}, title="${noteTitle}"`);

  if (!note.file_path || note.file_path.trim().length === 0) {
    saveStatusTx(noteId, INDEX_STATUS.SKIPPED_MISSING_PATH, 'file_path is empty', updatedAt);
    return {
      note_id: noteId,
      status: INDEX_STATUS.SKIPPED_MISSING_PATH,
      reason: 'file_path is empty',
      chunk_count: 0,
    };
  }

  if (!fs.existsSync(note.file_path)) {
    saveStatusTx(noteId, INDEX_STATUS.SKIPPED_FILE_NOT_FOUND, `file not found: ${note.file_path}`, updatedAt);
    return {
      note_id: noteId,
      status: INDEX_STATUS.SKIPPED_FILE_NOT_FOUND,
      reason: `file not found: ${note.file_path}`,
      chunk_count: 0,
    };
  }

  const markdown = fs.readFileSync(note.file_path, 'utf8');
  if (markdown.trim().length === 0) {
    saveStatusTx(noteId, INDEX_STATUS.SKIPPED_EMPTY, 'markdown is empty', updatedAt);
    return {
      note_id: noteId,
      status: INDEX_STATUS.SKIPPED_EMPTY,
      reason: 'markdown is empty',
      chunk_count: 0,
    };
  }

  try {
    const chunks = chunkMarkdown(markdown, chunkOptions);
    if (chunks.length === 0) {
      saveStatusTx(noteId, INDEX_STATUS.SKIPPED_EMPTY, 'no chunks generated', updatedAt);
      return {
        note_id: noteId,
        status: INDEX_STATUS.SKIPPED_EMPTY,
        reason: 'no chunks generated',
        chunk_count: 0,
      };
    }

    const rows = [];
    for (const chunk of chunks) {
      const embeddingInput = buildChunkEmbeddingText(noteTitle, chunk.section_path, chunk.chunk_text);
      const vec = await embeddingFn(embeddingInput);

      if (!Array.isArray(vec) || vec.length === 0) {
        throw new Error('embedding 返回无效向量');
      }

      rows.push({
        id: randomUUID(),
        note_id: noteId,
        chunk_index: chunk.chunk_index,
        section_path: chunk.section_path,
        chunk_text: chunk.chunk_text,
        chunk_embedding: JSON.stringify(vec),
        char_count: chunk.char_count,
        created_at: updatedAt,
      });
    }

    saveReadyTx(noteId, rows, updatedAt);
    console.log(`[Indexer] ✅ 索引完成 note=${noteId}, chunks=${rows.length}`);
    return {
      note_id: noteId,
      status: INDEX_STATUS.READY,
      reason: null,
      chunk_count: rows.length,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    saveStatusTx(noteId, INDEX_STATUS.FAILED, reason, updatedAt);
    console.log(`[Indexer] ❌ 索引失败 note=${noteId}, reason="${reason}"`);
    return {
      note_id: noteId,
      status: INDEX_STATUS.FAILED,
      reason,
      chunk_count: 0,
    };
  }
}

export async function reindexAllNotes(options = {}) {
  const notes = listIndexableNotes(options.noteIds ?? null);
  const results = [];
  const summary = {
    total: notes.length,
    ready: 0,
    skipped_missing_path: 0,
    skipped_file_not_found: 0,
    skipped_empty: 0,
    failed: 0,
  };

  console.log(`[Indexer] 🔁 开始全量重建，总数=${notes.length}`);

  for (const note of notes) {
    const result = await indexSingleNote(note, options);
    results.push(result);
    if (Object.prototype.hasOwnProperty.call(summary, result.status)) {
      summary[result.status] += 1;
    }
  }

  console.log('[Indexer] 📊 重建汇总:');
  console.log(JSON.stringify(summary, null, 2));

  return {
    summary,
    results,
  };
}

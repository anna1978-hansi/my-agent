import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../../data/branchnote.db');

console.log('🔧 [MigrateRAGv2] 开始执行 RAG v2 数据库迁移...');
console.log(`🔧 [MigrateRAGv2] 数据库路径: ${DB_PATH}`);

const db = new Database(DB_PATH);

function ensureTable(tableName, createSql) {
  const exists = db.prepare(
    "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
  ).get(tableName);

  if (exists) {
    console.log(`⚠️  [MigrateRAGv2] 表已存在，跳过创建: ${tableName}`);
    return;
  }

  db.exec(createSql);
  console.log(`✅ [MigrateRAGv2] 表创建完成: ${tableName}`);
}

function ensureIndex(indexName, createSql) {
  const exists = db.prepare(
    "SELECT 1 AS ok FROM sqlite_master WHERE type = 'index' AND name = ? LIMIT 1"
  ).get(indexName);

  if (exists) {
    console.log(`⚠️  [MigrateRAGv2] 索引已存在，跳过创建: ${indexName}`);
    return;
  }

  db.exec(createSql);
  console.log(`✅ [MigrateRAGv2] 索引创建完成: ${indexName}`);
}

try {
  db.exec('BEGIN');

  ensureTable(
    'note_chunks',
    `
      CREATE TABLE note_chunks (
        id              TEXT PRIMARY KEY,
        note_id         TEXT NOT NULL,
        chunk_index     INTEGER NOT NULL,
        section_path    TEXT NOT NULL,
        chunk_text      TEXT NOT NULL,
        chunk_embedding TEXT NOT NULL,
        char_count      INTEGER NOT NULL,
        created_at      TEXT NOT NULL,
        FOREIGN KEY (note_id) REFERENCES knowledge_notes(id) ON DELETE CASCADE
      )
    `
  );

  ensureTable(
    'note_index_status',
    `
      CREATE TABLE note_index_status (
        note_id     TEXT PRIMARY KEY,
        status      TEXT NOT NULL CHECK (
          status IN ('ready', 'skipped_missing_path', 'skipped_file_not_found', 'skipped_empty', 'failed')
        ),
        reason      TEXT,
        updated_at  TEXT NOT NULL,
        FOREIGN KEY (note_id) REFERENCES knowledge_notes(id) ON DELETE CASCADE
      )
    `
  );

  ensureIndex(
    'idx_note_chunks_note_id',
    'CREATE INDEX idx_note_chunks_note_id ON note_chunks(note_id)'
  );
  ensureIndex(
    'idx_note_chunks_note_id_chunk_index',
    'CREATE INDEX idx_note_chunks_note_id_chunk_index ON note_chunks(note_id, chunk_index)'
  );
  ensureIndex(
    'idx_note_index_status_status',
    'CREATE INDEX idx_note_index_status_status ON note_index_status(status)'
  );

  db.exec('COMMIT');
  console.log('🎉 [MigrateRAGv2] 迁移完成（幂等）');

  const tables = db.prepare(
    "SELECT name, type FROM sqlite_master WHERE (type='table' OR type='index') AND (name LIKE 'note_%' OR name LIKE 'idx_note_%') ORDER BY type, name"
  ).all();
  console.log('📋 [MigrateRAGv2] note_* 结构:');
  console.log(JSON.stringify(tables, null, 2));
} catch (error) {
  db.exec('ROLLBACK');
  console.error('❌ [MigrateRAGv2] 迁移失败:', error.message);
  process.exit(1);
} finally {
  db.close();
}

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../../data/branchnote.db');

console.log('🗄️  [DB] 初始化数据库连接...');
console.log(`🗄️  [DB] 数据库路径: ${DB_PATH}`);

// 确保 data 目录存在（better-sqlite3 不会自动创建父目录）
import { mkdirSync } from 'fs';
mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// 开启 WAL 模式，提升并发读写性能
db.pragma('journal_mode = WAL');

console.log('✅ [DB] 数据库连接成功！');

// ── Task 3.2：初始化表结构 ──────────────────────────────────────
console.log('🏗️  [DB] 检查并初始化 knowledge_notes 表...');

db.exec(`
  CREATE TABLE IF NOT EXISTS knowledge_notes (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    intent      TEXT NOT NULL,
    content     TEXT NOT NULL,
    tags        TEXT,
    raw_chat    TEXT,
    embedding   TEXT,
    created_at  TEXT NOT NULL
  )
`);

console.log('✅ [DB] knowledge_notes 表就绪！');

export default db;

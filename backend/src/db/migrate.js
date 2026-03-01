import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../../data/branchnote.db');

console.log('🔧 [Migrate] 开始数据库升级...');
console.log(`🔧 [Migrate] 数据库路径: ${DB_PATH}`);

const db = new Database(DB_PATH);

try {
  // 检查 file_path 列是否已存在
  const tableInfo = db.pragma('table_info(knowledge_notes)');
  const hasFilePath = tableInfo.some(col => col.name === 'file_path');

  if (hasFilePath) {
    console.log('⚠️  [Migrate] file_path 列已存在，跳过升级。');
  } else {
    console.log('🏗️  [Migrate] 添加 file_path 列...');
    db.exec('ALTER TABLE knowledge_notes ADD COLUMN file_path TEXT;');
    console.log('✅ [Migrate] file_path 列添加成功！');
  }

  // 验证升级结果
  const updatedTableInfo = db.pragma('table_info(knowledge_notes)');
  console.log('\n📋 [Migrate] 当前表结构:');
  updatedTableInfo.forEach(col => {
    console.log(`   - ${col.name} (${col.type})`);
  });

  console.log('\n🎉 [Migrate] 数据库升级完成！');
} catch (error) {
  console.error('❌ [Migrate] 升级失败:', error.message);
  process.exit(1);
} finally {
  db.close();
}

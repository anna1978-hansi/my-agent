import db from './index.js';

const EXPECTED_DIM = Number(process.env.EMBEDDING_DIM || 1024);

console.log('🧹 [CleanDB] 开始清理数据库...');
console.log('🧹 [CleanDB] 期望向量维度:', EXPECTED_DIM);

const rows = db.prepare(`
  SELECT id, title, embedding
  FROM knowledge_notes
  WHERE embedding IS NOT NULL
`).all();

let removed = 0;
let kept = 0;

for (const row of rows) {
  let vec;
  try {
    vec = JSON.parse(row.embedding);
  } catch (err) {
    console.log(`❌ [CleanDB] embedding 解析失败，删除 id=${row.id}`);
    db.prepare('DELETE FROM knowledge_notes WHERE id = ?').run(row.id);
    removed += 1;
    continue;
  }

  if (!Array.isArray(vec)) {
    console.log(`❌ [CleanDB] embedding 非数组，删除 id=${row.id}`);
    db.prepare('DELETE FROM knowledge_notes WHERE id = ?').run(row.id);
    removed += 1;
    continue;
  }

  if (vec.length !== EXPECTED_DIM) {
    console.log(
      `❌ [CleanDB] 维度不匹配(${vec.length})，删除 id=${row.id}, title="${row.title}"`
    );
    db.prepare('DELETE FROM knowledge_notes WHERE id = ?').run(row.id);
    removed += 1;
    continue;
  }

  kept += 1;
}

console.log(`✅ [CleanDB] 清理完成，保留 ${kept} 条，删除 ${removed} 条。`);

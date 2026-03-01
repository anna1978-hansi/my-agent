import { saveNote, searchNotes } from './notes.js';

console.log('🧪 [TestDB] 开始插入 mock 数据...');

const mockEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];

const saved = saveNote({
  intent: 'Concept',
  data: {
    title: 'Test DB Note',
    summary: '用于验证 file_path 与 embedding 是否正确入库/出库',
    use_cases: ['db-test', 'mock'],
  },
  raw_chat: '这是一段用于测试数据库的原始对话文本。',
  file_path: '/tmp/mock-note.md',
  embedding: mockEmbedding,
});

console.log('✅ [TestDB] 插入完成:');
console.log(JSON.stringify(saved, null, 2));

console.log('\n🔍 [TestDB] 开始查询 mock 数据...');
const results = searchNotes('Test DB Note');

console.log('📦 [TestDB] 查询结果:');
console.log(JSON.stringify(results, null, 2));

if (results.length === 0) {
  console.log('❌ [TestDB] 未查到结果，请检查入库/查询逻辑。');
} else {
  const first = results[0];
  const embeddingOk = Array.isArray(first.embedding);
  console.log(
    `✅ [TestDB] 验证 embedding 解析结果: ${embeddingOk ? 'OK' : 'FAIL'}`
  );
}

console.log('\n🎉 [TestDB] 测试结束。');

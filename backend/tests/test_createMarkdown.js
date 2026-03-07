import { generateEmbedding } from '../src/tools/rag.js';
import { create_new_markdown } from '../src/tools/fileManager.js';

async function run() {
  console.log('🧪 [TestCreateMarkdown] 开始测试 create_new_markdown...');

  const rawText = '这是一个用于测试创建 Markdown 与入库流程的示例。';
  const embedding = await generateEmbedding(rawText);

  const payload = {
    intent: 'Concept',
    data: {
      title: 'Create Markdown Test',
      summary: '验证写文件并入库',
      key_points: ['生成 Markdown', '写入本地文件', '写入 SQLite'],
      use_cases: ['测试流程'],
      links: [],
    },
    raw_chat: rawText,
    embedding,
  };

  const result = create_new_markdown(payload);

  console.log('📦 [TestCreateMarkdown] 返回结果:');
  console.log(JSON.stringify(result, null, 2));
  console.log('🎉 [TestCreateMarkdown] 测试结束。');
}

run().catch(err => {
  console.error('❌ [TestCreateMarkdown] 测试失败:', err.message);
  process.exit(1);
});

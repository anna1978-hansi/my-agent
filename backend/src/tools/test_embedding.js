import { generateEmbedding } from './rag.js';

async function run() {
  const text = 'This is a short test sentence for embedding generation.';

  console.log('🧪 [TestEmbedding] 开始测试 generateEmbedding...');
  const embedding = await generateEmbedding(text);

  console.log('📏 [TestEmbedding] 向量维度:', embedding.length);
  console.log('🔢 [TestEmbedding] 前 5 个数字:');
  console.log(JSON.stringify(embedding.slice(0, 5), null, 2));

  console.log('🎉 [TestEmbedding] 测试结束。');
}

run().catch(err => {
  console.error('❌ [TestEmbedding] 测试失败:', err.message);
  process.exit(1);
});

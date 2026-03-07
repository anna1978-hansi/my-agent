import { reindexAllNotes } from './chunkIndexer.js';

function createFakeEmbedding(text) {
  const len = text.length;
  let ascii = 0;
  for (let i = 0; i < text.length; i += 1) {
    ascii = (ascii + text.charCodeAt(i)) % 9973;
  }
  return [
    Number((len / 1000).toFixed(6)),
    Number((ascii / 10000).toFixed(6)),
    Number((((len + ascii) % 389) / 389).toFixed(6)),
  ];
}

async function run() {
  const useFake = process.env.RAG_V2_USE_FAKE_EMBEDDING === '1';
  console.log(`[Indexer] 🚀 执行全量重建，use_fake_embedding=${useFake}`);

  const result = await reindexAllNotes({
    embeddingFn: useFake ? async text => createFakeEmbedding(text) : undefined,
  });

  console.log('[Indexer] 📦 全量重建结果:');
  console.log(JSON.stringify(result.summary, null, 2));
}

run().catch(err => {
  console.error('[Indexer] ❌ 全量重建失败:', err.message);
  process.exit(1);
});


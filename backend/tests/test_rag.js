import { saveNote } from '../src/db/notes.js';
import { generateEmbedding, searchSimilarNote } from '../src/tools/rag.js';

async function run() {
  console.log('🧪 [TestRAG] 开始准备测试数据...');

  const reactText =
    'React hooks useState useEffect 组件状态管理与副作用处理。';
  const dockerText =
    'Docker 镜像、容器、Dockerfile 构建与部署流程。';

  console.log('🧪 [TestRAG] 生成 React 向量...');
  const reactEmbedding = await generateEmbedding(reactText);

  console.log('🧪 [TestRAG] 生成 Docker 向量...');
  const dockerEmbedding = await generateEmbedding(dockerText);

  const reactNote = saveNote({
    intent: 'Concept',
    data: {
      title: 'React Hooks Note',
      summary: '介绍 useState/useEffect 等基础 hooks',
      use_cases: ['react', 'hooks', 'frontend'],
    },
    raw_chat: reactText,
    file_path: '/tmp/react-note.md',
    embedding: reactEmbedding,
  });

  const dockerNote = saveNote({
    intent: 'Concept',
    data: {
      title: 'Docker Basics Note',
      summary: '介绍镜像、容器与 Dockerfile',
      use_cases: ['docker', 'devops', 'container'],
    },
    raw_chat: dockerText,
    file_path: '/tmp/docker-note.md',
    embedding: dockerEmbedding,
  });

  console.log('✅ [TestRAG] 已插入两条测试笔记:');
  console.log(JSON.stringify({ reactNote, dockerNote }, null, 2));

  const queryText = '如何使用 React hooks 管理组件状态？';
  console.log('\n🔎 [TestRAG] 开始相似度检索...');
  const result = await searchSimilarNote(queryText, 0.75);

  console.log('📦 [TestRAG] 检索结果:');
  //console.log(JSON.stringify(result, null, 2));

  const title = result.note?.title || '(none)';
  const score = typeof result.score === 'number' ? result.score : null;
  console.log(`🧾 [TestRAG] Top 命中文档: ${title}`);
  console.log(`🧾 [TestRAG] 相似度得分: ${score}`);

  const ok = title.includes('React');
  console.log(`✅ [TestRAG] 命中 React 笔记: ${ok ? 'OK' : 'FAIL'}`);
  console.log('🎉 [TestRAG] 测试结束。');
}

run().catch(err => {
  console.error('❌ [TestRAG] 测试失败:', err.message);
  process.exit(1);
});

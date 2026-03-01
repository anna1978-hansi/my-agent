import { generateEmbedding } from '../tools/rag.js';
import { create_new_markdown } from '../tools/fileManager.js';
import { executeKnowledge } from './executor.js';

async function run() {
  console.log('🧪 [TestExecutor] 开始测试 Executor...');

  // 准备一条已有笔记
  const seedText = 'React hooks useState useEffect 组件状态管理与副作用处理。';
  const seedEmbedding = await generateEmbedding(seedText);
  const seed = create_new_markdown({
    intent: 'Concept',
    data: {
      title: 'React Hooks Seed',
      summary: '种子笔记',
      key_points: ['useState', 'useEffect'],
      use_cases: ['状态管理'],
      links: [],
    },
    raw_chat: seedText,
    embedding: seedEmbedding,
  });

  console.log('✅ [TestExecutor] 已创建种子笔记:');
  console.log(JSON.stringify(seed, null, 2));

  // 场景1：应该触发 MERGE
  const mergePayload = {
    intent: 'Concept',
    data: {
      title: 'React Hooks Seed',
      summary: '补充 useMemo/useCallback',
      key_points: ['useMemo', 'useCallback'],
      use_cases: ['性能优化'],
      links: ['https://react.dev'],
    },
    raw_chat: '补充一些 React hooks 的性能优化知识',
    embedding: await generateEmbedding('React hooks 性能优化 useMemo useCallback'),
    threshold: 0.75,
  };

  const mergeResult = await executeKnowledge(mergePayload);
  console.log('📦 [TestExecutor] MERGE 结果:');
  console.log(JSON.stringify(mergeResult, null, 2));

  // 场景2：应该触发 CREATE
  const createPayload = {
    intent: 'Concept',
    data: {
      title: 'Docker Basics',
      summary: '容器与镜像基础概念',
      key_points: ['镜像', '容器'],
      use_cases: ['部署'],
      links: [],
    },
    raw_chat: 'Docker 是什么？镜像与容器的区别？',
    embedding: await generateEmbedding('Docker 镜像 容器 Dockerfile'),
    threshold: 0.75,
  };

  const createResult = await executeKnowledge(createPayload);
  console.log('📦 [TestExecutor] CREATE 结果:');
  console.log(JSON.stringify(createResult, null, 2));

  console.log('🎉 [TestExecutor] 测试结束。');
}

run().catch(err => {
  console.error('❌ [TestExecutor] 测试失败:', err.message);
  process.exit(1);
});

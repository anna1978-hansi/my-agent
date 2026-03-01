import { proposeMerge } from './mergeEngine.js';

async function run() {
  console.log('🧪 [TestMergeEngine] 开始测试 proposeMerge...');

  const oldMarkdown = `
# React Hooks

## 核心概念
Hooks 用于在函数组件中管理状态与副作用

## 关键要点
- useState 管理状态
- useEffect 处理副作用
`.trim();

  const newJson = {
    title: 'React Hooks',
    summary: '补充 useMemo/useCallback 相关要点',
    key_points: ['useMemo 做缓存', 'useCallback 缓存函数引用'],
    use_cases: ['性能优化', '避免不必要渲染'],
    links: ['https://react.dev/reference/react'],
  };

  const merged = await proposeMerge(oldMarkdown, newJson);

  console.log('📦 [TestMergeEngine] 合并结果:');
  console.log(merged);
  console.log('🎉 [TestMergeEngine] 测试结束。');
}

run().catch(err => {
  console.error('❌ [TestMergeEngine] 测试失败:', err.message);
  process.exit(1);
});

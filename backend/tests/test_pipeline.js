import { runPipeline } from '../src/agent/pipeline.js';

const CHAT = `
用户：我在用 React 做一个列表页，数据量很大，滚动时非常卡顿，怎么优化？

助手：卡顿的根本原因是 DOM 节点太多。有两个主流方案：

方案一：虚拟列表（Virtual List）
只渲染可视区域内的元素，滚动时动态替换内容。
推荐库：react-window 或 react-virtual。
优点：性能极好，支持百万级数据。
缺点：实现复杂，不支持动态高度时需要额外处理。

方案二：分页 / 无限滚动
每次只加载一页数据，滚动到底部再加载下一页。
优点：实现简单，服务端压力小。
缺点：用户无法快速跳转到任意位置。

用户：我们的数据是固定高度的，大概有5000条，用哪个方案？

助手：固定高度 + 5000条，react-window 是最佳选择。
安装：npm install react-window
核心用法：
import { FixedSizeList } from 'react-window';
<FixedSizeList height={600} itemCount={5000} itemSize={50} width="100%">
  {({ index, style }) => <div style={style}>Row {index}</div>}
</FixedSizeList>
这样只会渲染约12个 DOM 节点，无论数据多少。
`;

(async () => {
  console.log('🧪 开始测试完整 Pipeline...');
  try {
    const result = await runPipeline(CHAT);
    console.log('\n📦 Pipeline 最终输出:');
    console.log(JSON.stringify(result, null, 2));
    console.log('\n🎉 Pipeline 测试完成！');
  } catch (err) {
    console.error('💥 Pipeline 失败:', err.message);
    process.exit(1);
  }
})();

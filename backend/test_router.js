import { routeIntent } from './src/agent/router.js';

const BUGFIX_CHAT = `
用户：我的 Node.js 程序一直报这个错误，不知道怎么解决：
TypeError: Cannot read properties of undefined (reading 'map')
    at processData (/app/index.js:42:18)

助手：这个错误说明你在调用 .map() 时，对象是 undefined。
通常是异步数据还没加载完就开始处理了。

用户：我是这样写的：const result = data.items.map(x => x.id)

助手：问题找到了。data.items 在某些情况下是 undefined。
建议加上可选链：const result = data.items?.map(x => x.id) ?? []
或者在调用前先判断：if (data?.items) { ... }

用户：加了可选链之后确实不报错了，谢谢！
`;

const CONCEPT_CHAT = `
用户：能解释一下什么是 Event Loop 吗？我一直搞不清楚。

助手：Event Loop 是 JavaScript 处理异步操作的核心机制。
简单来说，JS 是单线程的，但它通过 Event Loop 实现了"看起来并发"的效果。

可以把它想象成一个餐厅：
- 主线程是唯一的厨师
- 异步任务（setTimeout、fetch）是外卖订单，先放到一边
- Event Loop 就是服务员，不断检查厨师是否空闲，空闲了就把外卖订单交给厨师处理

用户：那 microtask 和 macrotask 有什么区别？

助手：microtask（如 Promise.then）优先级更高，会在当前任务结束后、下一个 macrotask 开始前全部执行完。
macrotask（如 setTimeout）则在下一轮 Event Loop 才执行。
`;

const ARCHITECTURE_CHAT = `
用户：我们团队在讨论新项目用 REST 还是 GraphQL，你怎么看？

助手：这取决于你们的具体场景。

REST 的优势：
- 简单直观，学习成本低
- 缓存友好，HTTP 缓存开箱即用
- 生态成熟，工具链完善

GraphQL 的优势：
- 客户端精确控制返回字段，避免 over-fetching
- 单端点，减少请求次数
- 强类型 Schema，前后端契约清晰

用户：我们是移动端 App，数据需求变化很频繁。

助手：那 GraphQL 更适合你们。移动端网络敏感，GraphQL 的按需取数能显著减少流量。
数据需求频繁变化时，前端可以自主调整 query，不需要后端每次改接口。
建议用 Apollo Server + Apollo Client 的组合。
`;

async function runTest(name, chat, expectedIntent) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🧪 测试: ${name}`);
  console.log(`📌 期望 intent: ${expectedIntent}`);
  console.log('='.repeat(50));

  const result = await routeIntent(chat);

  const passed = result.intent === expectedIntent;
  console.log(`\n${passed ? '✅' : '❌'} 结果: intent=${result.intent}, confidence=${result.confidence}`);
  if (!passed) {
    console.error(`   期望 ${expectedIntent}，实际得到 ${result.intent}`);
  }
  return passed;
}

(async () => {
  console.log('🧪 开始测试 Router Agent...');
  const results = await Promise.allSettled([
    runTest('BugFix 场景（TypeError 报错修复）', BUGFIX_CHAT, 'BugFix'),
    runTest('Concept 场景（Event Loop 解释）', CONCEPT_CHAT, 'Concept'),
    runTest('Architecture 场景（REST vs GraphQL）', ARCHITECTURE_CHAT, 'Architecture'),
  ]);

  const passed = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
  console.log(`\n🎯 测试结果: ${passed}/${results.length} 通过`);
  if (passed < results.length) process.exit(1);
})();

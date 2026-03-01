import { extractKnowledge } from '../src/agent/worker.js';

const BUGFIX_CHAT = `
用户：我的 Node.js 程序一直报这个错误：
TypeError: Cannot read properties of undefined (reading 'map')
    at processData (/app/index.js:42:18)

助手：这个错误说明你在调用 .map() 时，对象是 undefined。通常是异步数据还没加载完就开始处理了。

用户：我是这样写的：const result = data.items.map(x => x.id)

助手：问题找到了。data.items 在某些情况下是 undefined。
建议加上可选链：const result = data.items?.map(x => x.id) ?? []
或者在调用前先判断：if (data?.items) { ... }

用户：加了可选链之后确实不报错了，谢谢！
`;

const CONCEPT_CHAT = `
用户：能解释一下什么是 Event Loop 吗？

助手：Event Loop 是 JavaScript 处理异步操作的核心机制。JS 是单线程的，但通过 Event Loop 实现了"看起来并发"的效果。
可以把它想象成餐厅：主线程是唯一的厨师，异步任务是外卖订单先放一边，Event Loop 是服务员不断检查厨师是否空闲。

用户：那 microtask 和 macrotask 有什么区别？

助手：microtask（如 Promise.then）优先级更高，会在当前任务结束后、下一个 macrotask 开始前全部执行完。
macrotask（如 setTimeout）则在下一轮 Event Loop 才执行。

代码示例：
console.log('1');
setTimeout(() => console.log('2'), 0);
Promise.resolve().then(() => console.log('3'));
console.log('4');
// 输出顺序：1, 4, 3, 2
`;

async function runTest(name, chat, intent) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🧪 测试: ${name} (intent: ${intent})`);
  console.log('='.repeat(50));

  try {
    const result = await extractKnowledge(chat, intent);
    console.log('\n📦 提取结果:');
    console.log(JSON.stringify(result, null, 2));
    console.log(`\n✅ ${name} 通过`);
    return true;
  } catch (err) {
    console.error(`\n❌ ${name} 失败:`, err.message);
    return false;
  }
}

(async () => {
  console.log('🧪 开始测试 Worker Agent...\n');

  const r1 = await runTest('BugFix 提取', BUGFIX_CHAT, 'BugFix');
  const r2 = await runTest('Concept 提取', CONCEPT_CHAT, 'Concept');

  const passed = [r1, r2].filter(Boolean).length;
  console.log(`\n🎯 测试结果: ${passed}/2 通过`);
  if (passed < 2) process.exit(1);
})();

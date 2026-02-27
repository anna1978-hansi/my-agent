import { critiqueNote } from './src/agent/critic.js';

const CHAT = `
用户：我的 Node.js 程序一直报这个错误：
TypeError: Cannot read properties of undefined (reading 'map')
    at processData (/app/index.js:42:18)

助手：这个错误说明你在调用 .map() 时，对象是 undefined。通常是异步数据还没加载完就开始处理了。

用户：我是这样写的：const result = data.items.map(x => x.id)

助手：问题找到了。data.items 在某些情况下是 undefined。
建议加上可选链：const result = data.items?.map(x => x.id) ?? []

用户：加了可选链之后确实不报错了，谢谢！
`;

// 测试1：高质量提取（期望通过）
const GOOD_DRAFT = {
  title: "可选链修复 undefined.map 报错",
  symptom: "TypeError: Cannot read properties of undefined (reading 'map')",
  root_cause: "data.items 在异步数据未加载完时为 undefined，直接调用 .map() 导致崩溃",
  solution: "使用可选链运算符：data.items?.map(x => x.id) ?? []，或在调用前判断 if (data?.items)",
  prevention: "访问深层属性前始终使用可选链 ?.，避免假设数据一定存在"
};

// 测试2：低质量提取（期望不通过，触发反馈）
const BAD_DRAFT = {
  title: "报错",
  symptom: "程序报错了",
  root_cause: "代码有问题",
  solution: "修改代码",
  prevention: "写好代码"
};

async function runTest(name, draft, expectPass) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🧪 测试: ${name}`);
  console.log(`📌 期望通过: ${expectPass}`);
  console.log('='.repeat(50));

  const result = await critiqueNote(CHAT, draft);
  const correct = result.is_passed === expectPass;
  console.log(`\n${correct ? '✅' : '❌'} 结果符合预期: ${correct}`);
  return correct;
}

(async () => {
  console.log('🧪 开始测试 Critic Agent...\n');
  const r1 = await runTest('高质量提取（应通过）', GOOD_DRAFT, true);
  const r2 = await runTest('低质量提取（应不通过）', BAD_DRAFT, false);

  const passed = [r1, r2].filter(Boolean).length;
  console.log(`\n🎯 测试结果: ${passed}/2 通过`);
  if (passed < 2) process.exit(1);
})();

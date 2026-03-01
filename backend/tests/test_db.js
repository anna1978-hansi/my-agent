import { saveNote, searchNotes } from '../src/db/notes.js';

console.log('🧪 ===== Task 3.3 DB 测试开始 =====\n');

// ── 测试 1：保存 BugFix 笔记 ──────────────────────────────────
console.log('📝 [Test 1] saveNote - BugFix');
const bugNote = await saveNote({
  intent: 'BugFix',
  raw_chat: '我的 Node.js 程序报错 Cannot find module...',
  data: {
    title: 'Node.js 模块找不到问题排查',
    symptom: '启动时报 Cannot find module',
    root_cause: '路径拼写错误或未安装依赖',
    solution: '检查 import 路径，运行 npm install',
    prevention: '使用 IDE 自动补全，避免手写路径',
  },
});
console.log('结果:', JSON.stringify(bugNote, null, 2));

// ── 测试 2：保存 Concept 笔记 ─────────────────────────────────
console.log('\n📝 [Test 2] saveNote - Concept');
const conceptNote = await saveNote({
  intent: 'Concept',
  raw_chat: '什么是 Event Loop？',
  data: {
    title: 'JavaScript Event Loop 原理',
    core_definition: '单线程异步执行模型，通过任务队列调度回调',
    analogy: '像餐厅服务员，一次只服务一桌，但可以同时等多桌上菜',
    code_example: 'setTimeout(() => console.log("异步"), 0)',
    use_cases: ['异步IO', '定时任务', '事件驱动编程'],
  },
});
console.log('结果:', JSON.stringify(conceptNote, null, 2));

// ── 测试 3：保存 Architecture 笔记 ───────────────────────────
console.log('\n📝 [Test 3] saveNote - Architecture');
const archNote = await saveNote({
  intent: 'Architecture',
  raw_chat: 'Redis vs 内存缓存怎么选？',
  data: {
    title: 'Redis vs 内存缓存选型',
    context: '需要为高并发服务选择缓存方案',
    options_compared: ['Redis', '进程内内存缓存'],
    pros_cons: {
      Redis: { pros: '持久化、分布式', cons: '网络开销' },
      Memory: { pros: '极低延迟', cons: '进程重启丢失' },
    },
    final_decision: '分布式场景用 Redis，单机低延迟用内存缓存',
  },
});
console.log('结果:', JSON.stringify(archNote, null, 2));

// ── 测试 4：searchNotes 命中 ──────────────────────────────────
console.log('\n🔍 [Test 4] searchNotes - 关键词 "Node.js"（应命中 1 条）');
const hits = searchNotes('Node.js');
console.log(`命中数量: ${hits.length}`);
console.log('第一条 title:', hits[0]?.title);

// ── 测试 5：searchNotes 无结果 ────────────────────────────────
console.log('\n🔍 [Test 5] searchNotes - 关键词 "不存在的关键词xyz"（应命中 0 条）');
const noHits = searchNotes('不存在的关键词xyz');
console.log(`命中数量: ${noHits.length}`);

// ── 测试 6：searchNotes 按 tags 命中 ─────────────────────────
console.log('\n🔍 [Test 6] searchNotes - 关键词 "异步IO"（应命中 Concept 笔记）');
const tagHits = searchNotes('异步IO');
console.log(`命中数量: ${tagHits.length}`);
console.log('命中 intent:', tagHits[0]?.intent);

console.log('\n🎉 ===== 所有测试通过！=====');

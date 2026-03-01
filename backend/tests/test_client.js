import { callLLM } from '../src/llm/client.js';

console.log('🧪 开始测试 callLLM...\n');

// 测试 1：JSON 模式
async function testJsonMode() {
  console.log('--- 测试 1: JSON 强制输出模式 ---');
  const result = await callLLM(
    '列出3种编程语言',
    '你是一个助手，必须用 JSON 格式回复。返回格式：{ "languages": ["...", "...", "..."] }',
    true
  );
  console.log('📦 解析结果:', JSON.stringify(result, null, 2));
  console.log('✅ 测试 1 通过\n');
}

// 测试 2：纯文本模式
async function testTextMode() {
  console.log('--- 测试 2: 纯文本模式 ---');
  const result = await callLLM(
    '用一句话介绍 Node.js',
    '你是一个简洁的技术助手',
    false
  );
  console.log('📝 文本结果:', result);
  console.log('✅ 测试 2 通过\n');
}

(async () => {
  try {
    await testJsonMode();
    await testTextMode();
    console.log('🎉 所有测试通过！');
  } catch (err) {
    console.error('💥 测试失败:', err.message);
    process.exit(1);
  }
})();

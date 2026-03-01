import { jsonToMarkdown, saveMarkdownToFile } from './fileManager.js';

console.log('🧪 [TestSaveMarkdown] 开始测试 saveMarkdownToFile...');

const mockJson = {
  title: 'Test Save Markdown',
  summary: '用于验证 Markdown 写入流程',
  key_points: ['写入路径固定', '文件名安全处理'],
  use_cases: ['本地笔记落盘'],
  links: ['https://example.com'],
};

const markdown = jsonToMarkdown(mockJson, 'Concept');
const filePath = saveMarkdownToFile(mockJson.title, markdown);

console.log('📄 [TestSaveMarkdown] 生成文件路径:');
console.log(filePath);
console.log('🎉 [TestSaveMarkdown] 测试结束。');

import { jsonToMarkdown } from '../src/tools/fileManager.js';

console.log('🧪 [TestFileManager] 开始测试 jsonToMarkdown...');

const bugfixJson = {
  title: '修复登录按钮无响应',
  problem: '点击登录按钮无任何反馈',
  steps: ['打开登录页', '输入账号密码', '点击登录按钮'],
  solution: '修复点击事件绑定，并补充错误提示',
  impact: '所有用户登录流程',
  links: ['https://example.com/issue/123'],
};

const conceptJson = {
  title: 'React Hooks',
  summary: 'Hooks 用于在函数组件中管理状态与副作用',
  key_points: ['useState 管理状态', 'useEffect 处理副作用'],
  use_cases: ['表单状态', '数据请求'],
  links: ['https://react.dev'],
};

const archJson = {
  title: 'BranchNote 架构',
  overview: '系统由采集、处理、存储与检索四层组成',
  components: ['Collector', 'Worker', 'DB', 'RAG'],
  data_flow: '用户输入 -> Worker 结构化 -> 存储 -> 检索/合并',
  decisions: ['SQLite 作为本地存储', 'RAG 进行相似度检索'],
  tradeoffs: ['性能与可移植性之间的平衡'],
};

const bugfixMd = jsonToMarkdown(bugfixJson, 'BugFix');
const conceptMd = jsonToMarkdown(conceptJson, 'Concept');
const archMd = jsonToMarkdown(archJson, 'Architecture');

console.log('\n🧩 [TestFileManager] BugFix Markdown:');
console.log(bugfixMd);
console.log('\n🧩 [TestFileManager] Concept Markdown:');
console.log(conceptMd);
console.log('\n🧩 [TestFileManager] Architecture Markdown:');
console.log(archMd);

console.log('\n🎉 [TestFileManager] 测试结束。');

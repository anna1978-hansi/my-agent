# BranchNote Engine 介绍文档（MVP 交接版）

## 1. 一句话定位
BranchNote Engine 是一个本地优先的 AI 知识沉淀系统：把长对话提炼为结构化 Markdown 笔记，并自动判断是新建笔记还是合并到已有笔记，且支持用户按 diff 分块选择接受/拒绝。

## 2. 解决的问题与价值
### 主要痛点
- 和 AI 的技术对话很长、很碎，后续难回看。
- 有价值信息不能稳定沉淀成可复用资产。
- 纯本地 Markdown 文件可读性和可控更新体验差。

### 产品价值
- 自动把长对话转成可复用技术笔记。
- 本地存储（SQLite + 本地 Markdown），数据可控。
- 合并阶段提供 Cursor 风格“可选择接收”的改动审阅体验。

## 3. 当前 MVP 范围
### 已包含
- Agent 流水线：Router -> Worker -> Critic（带重试）-> Executor。
- Embedding + RAG 相似度检索。
- CREATE / MERGE 自动分流。
- 前端笔记库浏览 + Markdown 阅读 + Agent 工作区。
- MERGE hunk 审阅（逐块 Accept/Reject + 实时最终稿预览）。
- MERGE 应用时的 `base_hash` 校验 + `.bak` 备份。
- CREATE 双模式：`auto` / `confirm`。

### 暂未包含
- 通用 Markdown 编辑器。
- 大量笔记下的分页与性能优化。
- 鉴权、多用户、云同步。
- 可视化版本时间线（目前只有 `.bak` 文件级回滚）。

## 4. 总体架构
```text
用户输入原始对话
  -> POST /api/process-chat
      -> Router（意图识别）
      -> Worker（结构化抽取）
      -> Critic（质量打分+反馈重试，最多2次）
      -> Executor
           -> RAG 相似检索
           -> 命中相似：返回 MERGE 提案（old/proposed/base_hash）
           -> 未命中：走 CREATE（直接创建或返回确认草稿）

前端
  -> 笔记列表（GET /api/notes）
  -> 笔记详情（GET /api/notes/:id）
  -> Agent 工作区（提交对话、创建确认、合并审阅）
  -> 应用合并（POST /api/notes/apply-merge）
  -> 确认创建（POST /api/notes/commit-create）

存储
  -> SQLite：元数据 + 结构化 JSON + embedding + 文件路径
  -> 本地文件：Markdown 正文（MERGE 时可生成 .bak）
```

## 5. Agent 各模块职责
### Router（`backend/src/agent/router.js`）
- 将对话分类为：`BugFix` / `Concept` / `Architecture`。
- 返回 `{ intent, confidence }`。

### Worker（`backend/src/agent/worker.js`）
- 根据 intent 选择不同 prompt 与 Zod Schema。
- 输出结构化 JSON（强校验）。

### Critic（`backend/src/agent/critic.js`）
- 对 Worker 结果打分（0~100）并给反馈。
- 分数低于 80 时触发重试。

### Pipeline（`backend/src/agent/pipeline.js`）
- 编排 Router/Worker/Critic/Executor。
- 最大重试次数 `MAX_RETRIES = 2`。
- 向 Executor 透传 `create_mode`。

### Executor（`backend/src/agent/executor.js`）
- 负责最终 CREATE / MERGE 决策。
- 当前默认相似度阈值传入值为 `0.7`。
- MERGE 输出字段：
  - `note_id`
  - `file_path`
  - `old_content`
  - `proposed_content`
  - `base_hash`
- CREATE 双模式：
  - `auto`：直接落盘 + 入库
  - `confirm`：仅返回草稿，不立即写入

## 6. 后端 API 契约（当前实现）
### `GET /health`
- 健康检查。

### `GET /api/notes?q=...`
- 返回笔记元数据列表（不含全文 markdown）。

### `GET /api/notes/:id`
- 返回单篇笔记详情与 `markdown_content`。

### `POST /api/process-chat`
请求：
```json
{ "raw_text": "...", "create_mode": "auto|confirm" }
```
返回：
- 包含 pipeline 结果，以及 `executor` 动作结果（CREATE/MERGE）。

### `POST /api/notes/commit-create`
请求：
```json
{ "draft": { "intent": "...", "data": {}, "raw_chat": "...", "embedding": [], "markdown_content": "..." } }
```
行为：
- 将草稿正式创建为 markdown 文件并写入数据库。

### `POST /api/notes/apply-merge`
请求：
```json
{ "note_id": "...", "final_content": "...", "base_hash": "sha256:...", "backup": true }
```
行为：
- 校验笔记与文件是否存在。
- 校验 `base_hash`，不一致返回 `409`。
- `backup=true` 时先写 `<原文件>.<时间戳>.bak`。
- 最后写入 `final_content` 到原文件。

## 7. 数据层与文件层
### SQLite
- 路径：`backend/data/branchnote.db`
- 表：`knowledge_notes`
- 核心字段：
  - `id`, `title`, `intent`, `content`, `tags`, `raw_chat`, `file_path`, `embedding`, `created_at`

### Markdown 文件
- 存储目录：`/Users/liuzhixuan/Desktop/my-branchNote-test`
- CREATE 在此目录写新文件。
- MERGE 在原路径覆盖写入，并可生成 `.bak` 备份。

## 8. 前端现状与交互
### 主界面（`fontend/src/App.jsx`）
三栏结构：
1. 左栏：笔记检索与列表。
2. 中栏：Markdown 阅读视图（`react-markdown` + `remark-gfm`）。
3. 右栏：Agent 工作区。

### Agent 工作区能力
- 粘贴对话并选择 `create_mode`。
- 运行 Pipeline 并展示阶段进度。
- CREATE(confirm) 草稿预览与确认创建。
- MERGE hunk 审阅与应用。

### 前端 API 封装（`fontend/src/services/api.js`）
- 集中管理所有后端请求。

### Diff/Hunk 逻辑（`fontend/src/utils/diff.js`）
- 使用 `diffLines` 生成变更块。
- 状态：`pending | accepted | rejected`。
- 最终稿规则：
  - `accepted` 用新内容
  - `pending/rejected` 用旧内容
- 空白差异块会被过滤，不渲染无意义卡片。

## 9. 环境变量与依赖
### 根目录 `.env`
- `OPENAI_API_KEY`
- `BASE_URL`
- `MODEL_NAME`
- `DASHSCOPE_API_KEY`
- `DASHSCOPE_baseURL`

### 后端依赖
- `express`, `cors`, `openai`, `zod`, `better-sqlite3`, `dotenv`

### 前端依赖
- `react`, `vite`, `tailwindcss`
- `react-markdown`, `remark-gfm`
- `diff`

## 10. 运行方式
### 后端
```bash
cd backend
npm install
node src/server.js
```

### 前端
```bash
cd fontend
npm install
npm run dev
```

## 11. PRD 摘要（MVP 与下一步）
### 目标
把“杂乱 AI 对话”变成“可检索、可审阅、可回滚”的本地知识资产。

### 核心用户
- 高频使用 AI 的开发者/技术人员。

### 关键用户路径
1. 粘贴长对话。
2. 系统判断 CREATE 或 MERGE。
3. MERGE 场景下按块选择接受/拒绝。
4. 写回本地 markdown（带回滚保障）。
5. 在统一前端中浏览与复盘笔记。

### 可跟踪指标（建议）
- MERGE 块接受率。
- 从粘贴到可用笔记的耗时。
- 周活跃回看笔记次数。
- 回滚频率（`.bak` 恢复次数）。

## 12. 下一阶段优化清单
### P0
- 提升 hunk 可读性（上下文、语法高亮、折叠未改动部分）。
- 搜索排序优化（标题/标签/正文权重 + 时间衰减）。
- 相似度阈值支持前端可配置。
- 增加 API 集成测试（notes/process/merge 全链路）。

### P1
- 支持 Markdown 手动编辑并保存。
- CREATE(confirm) 采用双栏预览。
- MERGE 会话历史与“重新打开上次提案”。
- 笔记元信息面板（intent、score、created_at 等）。

### P2
- 版本时间线（数据库化版本，不只依赖 `.bak`）。
- 大规模笔记索引与后台任务队列。
- 外部生态集成（Obsidian / VSCode 插件 / 导出能力）。

## 13. 已知风险与技术债
- Worker 输出 Schema 与 Markdown 模板曾有字段不一致，当前通过兼容映射处理，后续建议统一为单一规范。
- `.bak` 仅提供文件级回滚，暂无可视化恢复流程。
- `process-chat` 同步串行调用 LLM + embedding，尚无队列/异步化。
- 某些沙箱环境下 localhost 联机验证受限，应以本机实测为准。

## 14. 给“无上下文 AI”的接手建议
建议按以下顺序读代码：
1. `backend/src/server.js`（API 面）
2. `backend/src/agent/pipeline.js`（流程编排）
3. `backend/src/agent/executor.js`（CREATE/MERGE 契约核心）
4. `fontend/src/App.jsx`（完整前端工作流）
5. `fontend/src/utils/diff.js`（hunk 审阅核心）
6. `backend/src/tools/fileManager.js`（建档/草稿/提交）
7. `backend/src/db/notes.js`（笔记元数据读写）

以上就是当前 MVP 的完整基线，可直接作为后续优化起点。

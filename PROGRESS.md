# BranchNote Engine — 项目进度记录

## 已完成任务

### Phase 1: 基础设施搭建

**Task 1.1 — 项目初始化**
- `npm init -y`，安装依赖：`dotenv`, `openai`, `zod`
- 配置 `.env`（DeepSeek 凭证）
- `package.json` 添加 `"type": "module"`（ES Module 支持）

**Task 1.2 — LLM 客户端**
- 创建 `src/llm/client.js`
- 使用 OpenAI SDK 指向 DeepSeek base URL（`https://api.deepseek.com/v1`）
- `callLLM(prompt, systemMsg, expectJson)` 封装，`expectJson=true` 时强制 `response_format: { type: 'json_object' }`
- 测试脚本：`test_client.js`

---

### Phase 2: Agent 核心逻辑

**Task 2.1 — Router Agent** (`src/agent/router.js`)
- 将对话分类为三种 Intent：`BugFix` / `Concept` / `Architecture`
- 返回 `{ intent, confidence }`，confidence 为 0~1 浮点数
- 测试脚本：`test_router.js`（覆盖 3 种 intent）

**Task 2.2 — Worker Agent** (`src/agent/worker.js`)
- 三套 Zod Schema：
  - `BugFixSchema`：title, symptom, root_cause, solution, prevention
  - `ConceptSchema`：title, core_definition, analogy, code_example, use_cases[]
  - `ArchitectureSchema`：title, context, options_compared[], pros_cons{}, final_decision
- 三套 Prompt 模板，根据 intent 动态选择
- 支持 `feedback` 参数（Critic 反馈重试时传入）
- **关键 Bug 修复**：Zod v4 `z.record()` 需要显式 key 类型 → `z.record(z.string(), z.object({...}))`
- 测试脚本：`test_worker.js`（⚠️ 目前只覆盖 BugFix + Concept，Architecture 待补）

**Task 2.3 — Critic Agent** (`src/agent/critic.js`)
- 对 Worker 输出按 4 个维度打分（总分 100）：
  - 完整性 30 分 / 准确性 30 分 / 清晰度 20 分 / 实用性 20 分
- 返回 `{ score, is_passed, feedback }`
- 强制校正：`is_passed = score >= 80`（不信任 LLM 自己判断）
- 测试脚本：`test_critic.js`（高质量 + 低质量两个 case）

**Task 2.4 — Pipeline** (`src/agent/pipeline.js`)
- 完整流程：Router → Worker → Critic，带重试循环
- `MAX_RETRIES = 2`，Critic 不通过时将 `feedback` 传回 Worker 重试
- 返回：`{ intent, confidence, score, is_passed, retries, data }`
- 测试脚本：`test_pipeline.js`

---

### Phase 3: 本地 SQLite 持久化

**Task 3.1 — DB 连接** (`src/db/index.js`)
- 安装 `better-sqlite3`
- 数据库文件路径：`data/branchnote.db`（自动创建目录）
- 开启 WAL 模式提升读写性能

**Task 3.2 — 建表** (`src/db/index.js`)
- 表名：`knowledge_notes`
- 字段：`id`(UUID PK), `title`, `intent`, `content`(JSON), `tags`, `raw_chat`, `embedding`(预留), `created_at`
- 使用 `CREATE TABLE IF NOT EXISTS`，幂等安全

**Task 3.3 — CRUD 方法** (`src/db/notes.js`)
- `saveNote({ intent, data, raw_chat })` — 生成 UUID，序列化 content，写入DB
- `searchNotes(keyword)` — LIKE 匹配 title/content/tags，返回反序列化结果
- 测试脚本：`test_db.js`（3 种 intent 存储 + 3 种搜索场景）

---

### Phase 4: API 层

**Task 4.1 — Express 服务器** (`src/server.js`)
- 安装 `express`, `cors`
- `GET /health` 健康检查

**Task 4.2 — process-chat 接口** (`src/server.js`)
- `POST /api/process-chat`，接收 `{ raw_text }`
- 调用 Pipeline → 存库 → 返回完整结果
- 启动命令：`node src/server.js`（默认端口 3000）

---

## 项目目录结构

```
my-agent/
├── .env                        # DeepSeek API 凭证
├── CLAUDE.md                   # 结对编程工作原则
├── PROGRESS.md                 # 本文件
├── package.json                # "type": "module"
├── data/
│   └── branchnote.db           # SQLite 数据库（运行后自动生成）
├── test_client.js
├── test_router.js
├── test_worker.js
├── test_critic.js
├── test_pipeline.js
├── test_db.js
└── src/
    ├── llm/
    │   └── client.js           # callLLM() 封装
    ├── agent/
    │   ├── router.js           # Intent 分类
    │   ├── worker.js           # 结构化提取
    │   ├── critic.js           # 质量评分
    │   └── pipeline.js         # 完整 Pipeline 编排
    ├── db/
    │   ├── index.js            # DB 连接 + 建表
    │   └── notes.js            # saveNote / searchNotes
    └── server.js               # Express API 服务器
```

---

## 核心技术决定

| 模块 | 关键决定 |
|------|---------|
| LLM 客户端 | OpenAI SDK + DeepSeek base URL，强制 JSON 输出模式 |
| Router | System Prompt 要求返回 `{intent, confidence}`，校验 intent 合法性 |
| Worker | Zod safeParse 校验，失败直接 throw（不静默降级） |
| Critic | LLM 打分后强制 `is_passed = score >= 80`，防止 LLM 自相矛盾 |
| Pipeline | while 循环 + feedback 传递，最多重试 2 次，超限使用当前最佳结果 |
| DB | better-sqlite3 + WAL 模式，content 字段存 JSON 字符串 |
| Server | Express 5 + cors，单接口 POST /api/process-chat |

---

## 待完成任务

### Phase 4.3: 前端（用户自行实现）
- 单页面 HTML + Tailwind，接入 `POST /api/process-chat`
- 输入框粘贴对话 → 触发动画 → 展示结构化卡片

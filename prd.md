# Role & Context
你现在是一个高级 Node.js 架构师和 AI Agent 开发者。
我们将一起从零开发一个名为 **BranchNote Engine** 的本地应用。
它的定位是：**一个将 AI 对话转化为结构化知识资产的本地 Agent 系统**。

我们要解决的核心问题是：长篇非结构化的 AI 对话难以沉淀。
我们要使用的核心技术是：Node.js + 大模型 Structured Outputs (强 JSON 校验) + 多阶段 Agent 架构 (Router -> Worker -> Critic) + 本地 SQLite 存储。

请严格按照以下 Phase (阶段) 逐步执行。**不要一次性写完所有代码**，每完成一个 Task，请向我汇报结果并等待我的确认，然后再进行下一个。

---

## 🛠️ Tech Stack (技术栈)
- Backend: Node.js, Express (或 Fastify)
- AI Integration: `openai` SDK (支持各种兼容 API，如 DeepSeek/Qwen)
- Validation: `zod` (用于强类型 JSON Schema 校验)
- Database: `better-sqlite3` (本地轻量级存储)
- Frontend: 纯 HTML + JS + Tailwind CDN (后期可替换为 React)

---

## 🗺️ Execution Plan (执行蓝图)

### Phase 1: 基础设施与 LLM 基座 (Backend Foundation)
**目标：搭建 Node.js 环境，并封装一个极其稳定、强制输出 JSON 的 LLM 调用模块。**

- [ ] **Task 1.1:** 初始化项目 `npm init -y`，安装核心依赖 (`dotenv`, `openai`, `zod`)，配置 `.env` 文件（预留 `OPENAI_API_KEY` 和 `BASE_URL`）。
- [ ] **Task 1.2:** 创建 `src/llm/client.js`。封装一个基础的 `callLLM(prompt, systemMsg, expectJson = true)` 函数。
  - *要求：* 必须开启 `response_format: { type: "json_object" }` 保证稳定输出 JSON。
  - *要求：* 加入基本的 `try-catch` 和 JSON.parse 校验。

### Phase 2: 核心 Agent 流水线开发 (Agentic Workflow)
**目标：实现带有“反思与纠错”机制的提炼逻辑，这是系统的灵魂。**

- [ ] **Task 2.1: Router Agent (高阶意图识别与动态路由)**
  - 创建 `src/agent/router.js`。
  - 输入：一段长聊天记录。
  - 任务：设计一个精准的 System Prompt，让 LLM 充当“知识分拣员”，判断这段对话的核心本质。
  - 分类标准（目前支持三类，后续可扩展）：
    1. `BugFix` (问题排查类)：探讨报错、异常行为、修复过程。
    2. `Concept` (概念解析类)：询问某个技术的原理、怎么用、最佳实践。
    3. `Architecture` (架构选型类)：对比不同技术、讨论系统设计、权衡利弊（Trade-offs）。
  - 输出：严格输出 JSON `{ "intent": "BugFix" | "Concept" | "Architecture", "confidence": 0.95 }`。
  - *测试要求：* 写完后，必须用至少两段不同类型的假聊天记录测试 Router 是否分发正确。

- [ ] **Task 2.2: Worker Agent (多态结构化提取 - 核心难点)**
  - 创建 `src/agent/worker.js`。
  - 输入：聊天记录 + Router 判定出的 `intent`。
  - 任务：根据 `intent`，**动态加载不同的 Prompt 模板和不同的 JSON Schema** 进行提取。
  - **Schema 规范要求：**
    - 如果是 `BugFix`，提取结构必须包含：`title` (标题), `symptom` (表现/报错现象), `root_cause` (根本原因), `solution` (解决方案步骤), `prevention` (如何避免/常见误区)。
    - 如果是 `Concept`，提取结构必须包含：`title` (标题), `core_definition` (一句话核心定义), `analogy` (生活中的类比，必须通俗), `code_example` (核心代码演示), `use_cases` (适用场景)。
    - 如果是 `Architecture`，提取结构必须包含：`title` (标题), `context` (讨论背景), `options_compared` (对比的方案), `pros_cons` (各自优缺点), `final_decision` (最终建议)。
  - 输出：符合对应 Schema 的 JSON 数据。
  - *工程要求：* 请使用 `zod` 库分别为这三种意图定义清晰的 Schema 校验。
  - 任务：根据 Intent 选择不同的 Prompt 模版，让 LLM 提取核心问题、解决方案、标签等。
  - 输出：符合严格 Schema 的 JSON 数据（例如包含 `title`, `core_issue`, `practices`, `tags`）。
- [ ] **Task 2.3: Critic Agent (反思与打分机制)**
  - 创建 `src/agent/critic.js`。
  - 输入：原始聊天记录 + Worker 提取的 draft JSON。
  - 任务：让 LLM 作为裁判，打分并给出修改建议。输出格式 `{ "score": 85, "is_passed": true, "feedback": "..." }`。
- [ ] **Task 2.4: 组装 Pipeline (状态机调度)**
  - 创建 `src/agent/pipeline.js`。
  - 逻辑：Router判定 -> Worker提取 -> Critic审查。
  - *核心要求：* 必须包含 `while` 循环。如果 Critic 打分低于 80，将 `feedback` 传回给 Worker 重新生成，最大重试次数 (MAX_RETRIES) 设为 2。

### Phase 3: 本地持久化层 (Local Storage)
**目标：将结构化的知识落盘，预留未来 RAG (向量检索) 的字段。**

- [ ] **Task 3.1:** 安装 `better-sqlite3`。创建 `src/db/index.js`。
- [ ] **Task 3.2:** 初始化数据库表 `knowledge_notes`。
  - 字段：`id` (UUID), `title`, `intent`, `content` (JSON 字符串), `tags`, `raw_chat` (原始对话片段), `embedding` (预留文本类型，MVP阶段为空), `created_at`。
- [ ] **Task 3.3:** 编写 `saveNote(noteData)` 和 `searchNotes(keyword)` 两个基础方法。

### Phase 4: API 层与前后端联调 (API & UI Integration)
**目标：提供一个 Web 接口，让前端页面能够触发 Agent 流水线。**

- [ ] **Task 4.1:** 安装 `express` 和 `cors`。创建 `src/server.js`。
- [ ] **Task 4.2:** 提供一个 POST 接口 `/api/process-chat`。
  - 接收 `{ "raw_text": "..." }`。
  - 调用 `Phase 2` 的 Pipeline 获取 JSON，调用 `Phase 3` 存入数据库。
  - 返回处理进度或最终结果。
# Phase 5: 前端交互与 API 联调 (React + Tailwind)

你好，Agent。我们的后端 Agent Pipeline 和 API (Task 1-4) 已经全部就绪。
现在我们需要开发前端页面。前端的目标是还原一个极客风、带有 Agent 思考过程动画的知识录入平台。

## 🛠️ Tech Stack (前端技术栈)
- 框架：React (使用 Vite 初始化)
- 样式：Tailwind CSS (极致还原 UI)
- 请求：原生的 `fetch` 即可

## 🗺️ Execution Plan (执行蓝图)

请严格按照以下 Task 逐一执行。每完成一个，请向我确认并请求测试。

- [ ] **Task 5.1: 初始化前端工程**
  - 在当前项目根目录下创建一个 `frontend` 文件夹(我已经创建)；然后在这个文件夹下面，安装react以来
  - 进入 `frontend`，安装依赖，并初始化 Tailwind CSS (配置 `tailwind.config.js` 和 `index.css`)。
  - *注意：不要动后端（backend文件夹下）的代码。*

- [ ] **Task 5.2: 还原整体静态 Layout (左侧边栏 + 右侧工作区)**
  - 修改 `App.jsx`。
  - **整体背景**：`bg-gray-50 text-gray-800 h-screen flex overflow-hidden font-sans`
  - **左侧边栏 (Sidebar)**：宽度 `w-64`，深色主题 `bg-slate-900 text-gray-300`。包含一个 "BranchNote" 的 Logo、全局搜索框、和一个虚拟的 "本地知识库" 列表。底部显示 "SQLite Connected - Online (绿点)"。
  - **右侧主区域**：分为两栏。
    - **左栏 (输入区)**：白色背景，包含一个大的 `<textarea>` 用于粘贴原始对话，以及 4 个 Radio 选项（结构化卡片、原理深挖、常见误区、生成笔记）。底部是一个显眼的 `bg-emerald-600` "启动 Agent 提炼流水线" 按钮。
    - **右栏 (输出区)**：白色背景，分为三个状态：1. 初始空状态；2. 黑底绿字的终端 Loading 状态；3. 结构化卡片展示状态。

- [ ] **Task 5.3: 实现核心 State 和黑客风 Loading 动画**
  - 使用 `useState` 管理：`inputText` (输入文本), `status` ('idle' | 'loading' | 'success' | 'error'), `resultData` (后端返回的卡片数据)。
  - **当 status 为 'loading' 时**：右侧展示一个类似终端的黑底区域 `bg-slate-900 font-mono text-green-400`。
  - *交互细节：* 因为后端处理需要几秒钟，请在这里写一个 `useEffect` 模拟 Agent 的思考进度：
    - 0s 显示: `[System] Initiating Agent Core Pipeline...`
    - 1s 显示: `▶ Stage 1: Router 意图分析中... Done`
    - 2s 显示: `▶ Stage 2: 触发 Worker 提取与强 Schema 校验...`
    - 3s 显示: `▶ Stage 3: Critic 审查与自我纠错中...`
    - *(这些文字要在 UI 上逐行显现，营造高级感)*。

- [ ] **Task 5.4: 对接后端真实 API 并渲染卡片**
  - 点击按钮时，向 `http://localhost:xxxx/api/process-chat` (替换为实际后端端口) 发送 POST 请求。请求体包含 `inputText`。
  - 拿到后端返回的 JSON 数据后，将 `status` 设为 `success`。
  - **渲染结果卡片**：在右栏优雅地展示后端的 JSON。
    - 顶部大标题：`resultData.title`
    - 标签：遍历渲染 `resultData.tags` 为浅色小药丸样式。
    - 内容区：根据后端返回的 Schema（可能是报错原因、也可能是原理解释），用清晰的区块（加上左侧带有颜色的 border，比如 `border-l-4 border-emerald-500`）渲染出来。

---
## 🚀 Initialization
Agent，如果你已经理解了前端蓝图和 UI 风格要求，请回复：“**前端 UI 蓝图已收到！请确认是否开始执行 Task 5.1 初始化 Vite 项目？**”
# 核心 Tools 与 RAG 智能合并引擎实现计划 (Tools Implementation Plan V2)

## 📋 概述 (Overview)
本文档定义了 BranchNote Engine 项目中需要优先实现的 3 个核心 Tools。
我们将把系统从“单纯的数据提取管道”升级为**“Agentic RAG（具备读写与智能合并能力的检索增强生成 Agent）”**。

它不仅能把知识存为本地 Markdown，还能在发现相似知识时，**智能合并新旧笔记**，并为前端预留“Cursor 风格 Diff 视图”的数据接口。

---

## ⚙️ 核心环境配置 (Environment Setup)
- **笔记物理路径**：`/Users/liuzhixuan/Desktop/my-branchNote-test` (所有 MD 文件保存在此)
- **向量模型**：OpenAI `text-embedding-3-small`

---

## 🛠️ 核心 Tools 设计 (The 3 Core Tools)

### Tool 1: `search_by_embedding` (RAG 检索工具)
**功能**：在写入前，通过 Embedding 向量化检索 SQLite，寻找是否存在高度相似的笔记。
- **输入**：`raw_text` (用户原始对话)
- **处理**：调用 OpenAI API 获取向量 -> 使用余弦相似度对比数据库中的 `embedding`。
- **输出**：如果最高相似度 `> 0.85`，返回 `{ action: 'MERGE', file_path: '...', old_content: '...' }`；否则返回 `{ action: 'CREATE' }`。
- **位置**：`backend/src/tools/rag.js`

### Tool 2: `create_markdown` (本地建档工具)
**功能**：当判定为 `CREATE` 时，将提取的 JSON 转化为格式化 Markdown 并落盘。
- **处理**：根据 Intent (BugFix/Concept/Architecture) 使用不同模板 -> 在指定路径创建 MD 文件 -> 将数据（含 `file_path` 和 `embedding`）写入 SQLite 数据库。
- **位置**：`backend/src/tools/fileManager.js`

### Tool 3: `smart_merge_markdown` (智能缝合工具 - ✨ 核心亮点)
**功能**：当判定为 `MERGE` 时，将新知识**无缝融入**旧笔记。
- **处理**：接收旧 MD 文本和新 JSON 数据 -> 调用 LLM，要求在不破坏旧内容的前提下，将新知识自然地补充进去。
- **注意**：本工具**不执行真实写入**！它只返回 `{ proposed_content: '...' }`，以便后续发送给前端 React 进行红绿 Diff 对比。
- **位置**：`backend/src/tools/mergeEngine.js`

---

## 🏗️ 架构集成方案 (Architecture Integration)

```text
┌─────────────────────────────────────────────────────────────┐
│                 Agent Pipeline (ReAct Mode)                 │
└─────────────────────────────────────────────────────────────┘
                            │
                      (Worker 生成 JSON)
                            │
                            ▼
           ┌──────────────────────────────────┐
           │ Tool 1: search_by_embedding      │
           └──────────────────────────────────┘
                            │
               相似度 > 0.85 ?
               /              \
            [是: MERGE]      [否: CREATE]
             /                  \
            ▼                    ▼
┌──────────────────────┐  ┌──────────────────────┐
│Tool 3: smart_merge   │  │Tool 2: create_markdown│
│(调用 LLM 融合新旧文本) │  │(直接格式化MD并保存)  │
└──────────────────────┘  └──────────────────────┘
            │                    │
            ▼                    ▼
     返回 proposed_content   直接落盘，同步写入 DB。
     留给前端做 Diff 视图。    流程结束。


## ⚠️ Agent 沟通协议 (Communication Protocol)
- **绝对细粒度**：下面有十几个微任务 (Task x.x)。你每次**只能**执行一个微任务！写完立刻停止，向我展示测试结果。
- **配置与解惑**：由于架构师（我）对 Embedding 等具体配置不需要介入过深，你需要自己编写配置文件。如果你在执行中遇到 API 报错、权限不足、数学计算出 NaN 等问题，**必须立刻停止，向我解释发生了什么，并给出你的修复方案，等我同意后再改。**

---

## ✅ 极致拆解的微任务清单 (Micro-Tasks Checklist)

### Phase 1: 数据库改造与连通性验证
- [ ] **Task 1.1**: 编写单独的 DB 升级脚本 `src/db/migrate.js`，执行 `ALTER TABLE knowledge_notes ADD COLUMN file_path TEXT;`。运行它，确认终端不报错。
- [ ] **Task 1.2**: 修改你的插入 (`insert`) 和查询 (`select`) 逻辑，让它们支持 `file_path` 和 `embedding`（注意：向量存入时需 `JSON.stringify`，读取时需 `JSON.parse`）。
- [ ] **Task 1.3**: 编写 `test_db.js`，向数据库插入一条带假路径和假数组的 mock 数据，然后读取出来打印在控制台，证明数据库改造彻底成功。

### Phase 2: Embedding 向量化与 RAG 搜索 (核心难点，步步为营)
- [ ] **Task 2.1**: 创建 `src/tools/rag.js`。先只写 `generateEmbedding(text)` 函数（调用 OpenAI `text-embedding-3-small`）。编写 `test_embedding.js`，只传一句话进去，**在终端打印出返回的数组长度（应该是 1536 维）和前 5 个数字**，让我直观看到向量长什么样。
- [ ] **Task 2.2**: 在 `rag.js` 中实现纯数学公式 `cosineSimilarity(vecA, vecB)`。在测试脚本里造两个假数组测一下，确保返回的相似度是 `0` 到 `1` 之间的数字，绝对不能出现 `NaN`。
- [ ] **Task 2.3**: 实现最终的 `searchSimilarNote(queryText, threshold = 0.85)`。逻辑：把输入转向量 -> 从数据库拉取所有笔记的向量 -> 循环计算相似度 -> 返回最相似的那条。
- [ ] **Task 2.4**: 编写 `test_rag.js`。往数据库插两条真实的假笔记（一条关于 React，一条关于 Docker）。传入一个关于 React 的 Query，检查程序能否精准找到 React 那篇笔记，并打印出相似度得分（比如 0.89）。

### Phase 3: Markdown 模板与文件落盘
- [ ] **Task 3.1**: 创建 `src/tools/fileManager.js`。先只写纯字符串拼接函数 `jsonToMarkdown(json, intent)`，支持 BugFix/Concept/Architecture 三种格式。在测试脚本里传个 Mock JSON，在终端把拼接好的 Markdown 打印出来给我检查排版。
- [ ] **Task 3.2**: 实现写文件函数 `saveMarkdownToFile(title, markdownContent)`。强制写入到 `/Users/liuzhixuan/Desktop/my-branchNote-test`。编写测试跑一下，我去桌面上亲自看一眼有没有生成这个 `.md` 文件。
- [ ] **Task 3.3**: 实现整合函数 `create_new_markdown`（写文件 + 把路径存入 SQLite）。跑通一条完整的创建闭环。

### Phase 4: 智能融合引擎 (Smart Merge)
- [ ] **Task 4.1**: 创建 `src/tools/mergeEngine.js`。编写 System Prompt。Prompt 必须强调：“你是一个缝合专家，只输出合并后的原生 Markdown 文本，绝不能包含 ```markdown 这样的代码块标记，也不要寒暄。”
- [ ] **Task 4.2**: 实现 `proposeMerge(oldMarkdownContent, newKnowledgeJson)`，调用 LLM 进行文本融合。**（注意：绝对不在此处写文件）**
- [ ] **Task 4.3**: 编写 `test_mergeEngine.js`。传一段旧文本和新 JSON 给它，在终端打印 LLM 吐出来的结果。我会仔细 Review 缝合的自不自然。

### Phase 5: Executor 终极编排
- [ ] **Task 5.1**: 创建 `src/agent/executor.js`。接收 Worker 提取好的 JSON -> 提取 Title 作为 Query -> 调用 Task 2 的 `searchSimilarNote`。如果找到，返回 Task 4 的 merge 结果；没找到，调用 Task 3 的 create 结果。
- [ ] **Task 5.2**: 把 `executor.js` 接入到主 Pipeline 中（放在 Critic 之后）。
- [ ] **Task 5.3**: 终极 E2E 测试。模拟真实用户的完整输入，看着终端依次打印：意图识别 -> 提取 -> 打分通过 -> **发现相似笔记** -> **触发 Merge 动作** -> 抛出新 Markdown 结果。

🚀 初始化指令

Agent，如果你已经完全理解了带有 Smart Merge 功能的 RAG 架构，并明确了我们的测试驱动纪律。请回复：“终极 Tools 蓝图已收到！请确认是否开始执行 Phase 1：数据库升级？”

给你的建议：

这份文档发过去后，Agent 绝对能看懂你要做一个什么级别的项目了。
它执行 Phase 2 (test_rag.js) 的时候可能会稍微卡壳一下（因为要算数学相似度），如果报错了，直接把终端的 Error 贴给它让它自己修。

享受当架构师的快感吧！等你跑到 Phase 4，看到它完美缝合了两篇笔记的时候，你会觉得这套系统帅呆了。去试试吧！

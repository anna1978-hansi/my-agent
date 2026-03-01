👇 请全选复制以下内容，保存为 tools.md 👇
code
Markdown
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
✅ 严格执行清单 (Vibe Coding Checklist)
Agent，请严格按照以下 Phase 逐一实现。完成每个 Phase 并运行对应测试后，必须向我汇报，等待我的指令再进入下一阶段。
Phase 1: 数据库升级 (Database Migration)

检查并修改 src/db/index.js。编写 ALTER TABLE knowledge_notes ADD COLUMN file_path TEXT;。确保表结构现在支持 file_path 和 embedding（以 JSON 字符串形式存储向量数组）。
Phase 2: 实现 RAG 检索 (Tool 1)

创建 src/tools/rag.js。

实现 OpenAI text-embedding-3-small 调用和余弦相似度计算逻辑。

编写 test_rag.js：手动往 DB 插入两条假数据（带假向量），测试 search_by_embedding 能否正确返回 MERGE 或 CREATE 信号。
Phase 3: 实现文件创建与入库 (Tool 2)

创建 src/tools/fileManager.js。

编写 create_markdown 函数。支持 BugFix、Concept、Architecture 三种 Intent 的 Markdown 模板排版。

必须保存在 /Users/liuzhixuan/Desktop/my-branchNote-test 目录下。

编写 test_fileManager.js：使用下方提供的 Mock 数据，测试能否在桌面上成功生成排版精美的 Markdown 文件，并成功 insert 到数据库。
Phase 4: 实现智能缝合引擎 (Tool 3)

创建 src/tools/mergeEngine.js。

编写极其严谨的 LLM System Prompt，要求融合新旧知识且保持原有格式结构。

编写 test_mergeEngine.js：传入一段假旧 MD 和一段新 JSON，在终端打印 LLM 输出的合并后 MD 结果，供我人工 Review。
Phase 5: 编排 Executor

创建 src/agent/executor.js，按照上方的架构图，将这 3 个 Tool 串联起来。

修改 src/agent/pipeline.js，在 Critic 审查通过后，调用 Executor，并向外暴露最终结果。
📝 测试数据准备 (Test Mock Data)
Mock 数据示例（BugFix Intent）
code
JavaScript
const mockBugFixData = {
  title: 'React useEffect 无限循环问题',
  symptom: 'useEffect 在每次渲染时都会重新执行',
  root_cause: '依赖数组中包含了每次渲染都会重新创建的对象引用',
  solution: ['使用 useMemo 或 useCallback 稳定对象引用', '将依赖项移到 useEffect 内部'],
  use_cases: ['React Hooks', '性能优化']
};
🚀 初始化指令
Agent，如果你已经完全理解了带有 Smart Merge 功能的 RAG 架构，并明确了我们的测试驱动纪律。请回复：“终极 Tools 蓝图已收到！请确认是否开始执行 Phase 1：数据库升级？”
code
Code
---

### 给你的建议：
这份文档发过去后，Agent 绝对能看懂你要做一个什么级别的项目了。
它执行 Phase 2 (`test_rag.js`) 的时候可能会稍微卡壳一下（因为要算数学相似度），如果报错了，直接把终端的 Error 贴给它让它自己修。
享受当架构师的快感吧！等你跑到 Phase 4，看到它完美缝合了两篇笔记的时候，你会觉得这套系统帅呆了。去试试吧！
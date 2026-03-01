# Tools 实现计划 (Tools Implementation Plan)

## 📋 概述 (Overview)

本文档定义了 BranchNote Engine 项目中需要优先实现的 3 个核心 Tools，用于将当前的"数据提取型 Agent"升级为"真正的 ReAct Agent"（Reasoning + Acting）。

---

## 🎯 为什么需要实现 Tools？(Why Implement Tools?)

### 当前架构的问题
- **缺少 Acting 能力**：现有架构只做了 Reasoning（Router → Worker → Critic），但没有 Acting（执行实际操作）
- **不符合 ReAct 模式**：真正的 Agent 应该能够"思考 → 行动 → 观察 → 再思考"，形成闭环
- **无法实现初衷**：项目的原始目标是"对本地 Markdown 文件进行修改和管理"，但目前只能提取数据到数据库，无法操作文件系统

### 实现 Tools 后的收益
1. **完整的 Agent 能力**：从"数据处理管道"升级为"自主行动的 Agent"
2. **本地知识库管理**：自动将提取的知识转换为 Markdown 文件并保存到本地
3. **RAG 检索能力**：通过 Embedding 实现语义搜索，避免重复提取相似知识
4. **简历亮点**：可以在简历中强调"实现了 ReAct 模式的 Multi-Agent 系统，支持 Tool Calling 和 RAG 检索"

---

## 🛠️ 优先实现的 3 个 Tools

### 1. `struct_to_markdown` (格式化工具)

**功能**：将 Worker 提取的 JSON 结构化数据转换为格式化的 Markdown 文本

**为什么需要它？**
- Worker 输出的是 JSON 对象（如 `{ title, symptom, root_cause, solution }`）
- 需要将其转换为人类可读的 Markdown 格式，方便后续保存和阅读
- 不同 Intent（BugFix / Concept / Architecture）需要不同的 Markdown 模板

**输入参数**：
```javascript
{
  data: object,    // Worker 提取的结构化数据
  intent: string   // BugFix | Concept | Architecture
}
```

**输出示例**（BugFix Intent）：
```markdown
# React useEffect 无限循环问题

## 症状
useEffect 在每次渲染时都会重新执行，导致无限循环

## 根因
依赖数组中包含了每次渲染都会重新创建的对象引用

## 解决方案
使用 useMemo 或 useCallback 稳定对象引用，或将对象移到 useEffect 内部

## 适用场景
- React Hooks 开发
- 性能优化
```

**实现位置**：`backend/src/tools/markdown.js`

---

### 2. `create_markdown` (文件创建工具)

**功能**：在指定路径创建一个新的 Markdown 文件

**为什么需要它？**
- 将格式化后的 Markdown 内容持久化到本地文件系统
- 实现"本地知识库"的核心功能
- 让 Agent 真正具备"行动"能力（不只是提取数据，还能创建文件）

**输入参数**：
```javascript
{
  path: string,      // 文件路径，如 './knowledge_base/react-useeffect-loop.md'
  content: string    // Markdown 内容
}
```

**输出**：
```javascript
{
  success: true,
  path: './knowledge_base/react-useeffect-loop.md'
}
```

**实现细节**：
- 使用 Node.js 的 `fs.promises.writeFile`
- 自动创建父目录（如果不存在）
- 文件名基于 `title` 字段生成（转为 kebab-case）

**实现位置**：`backend/src/tools/filesystem.js`

---

### 3. `search_by_embedding` (RAG 检索工具)

**功能**：通过 Embedding 向量进行语义相似度搜索，找到已存在的相关笔记

**为什么需要它？**
- **避免重复提取**：在提取新知识前，先检索是否已有相似内容
- **实现 RAG 能力**：Retrieval-Augmented Generation，让 Agent 能够"记忆"历史知识
- **提升用户体验**：如果已有相关笔记，可以提示用户"已存在类似知识，是否需要更新？"

**工作流程**：
1. 将用户输入的 `raw_text` 转换为 Embedding 向量（调用 OpenAI Embedding API）
2. 在数据库中计算余弦相似度，找到最相似的 Top-K 笔记
3. 如果相似度 > 阈值（如 0.85），返回已有笔记，提示用户

**输入参数**：
```javascript
{
  query: string,     // 用户输入的原始文本
  top_k: number,     // 返回前 K 个最相似的结果（默认 3）
  threshold: number  // 相似度阈值（默认 0.85）
}
```

**输出示例**：
```javascript
{
  found: true,
  results: [
    {
      id: 'uuid-123',
      title: 'React useEffect 无限循环问题',
      similarity: 0.92,
      created_at: '2026-03-01T10:00:00Z'
    }
  ]
}
```

**实现细节**：
- 使用 OpenAI 的 `text-embedding-3-small` 模型生成 Embedding
- 在数据库中存储 Embedding（`knowledge_notes.embedding` 字段已预留）
- 使用余弦相似度计算：`cosine_similarity = dot(A, B) / (norm(A) * norm(B))`
- SQLite 不支持向量运算，需要在应用层计算（或使用 SQLite 扩展如 `sqlite-vss`）

**实现位置**：`backend/src/tools/database.js`

---

## 🏗️ 架构集成方案 (Architecture Integration)

### 修改后的 Pipeline（4 阶段）

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Pipeline (4 Stages)                │
└─────────────────────────────────────────────────────────────┘

  User Input (raw_text)
         │
         ▼
  ┌─────────────┐
  │   Router    │  意图识别 (BugFix / Concept / Architecture)
  └─────────────┘
         │
         ▼
  ┌─────────────┐
  │   Worker    │  结构化提取 (JSON Schema 强校验)
  └─────────────┘
         │
         ▼
  ┌─────────────┐
  │   Critic    │  质量审查 + 自我纠错 (最多重试 2 次)
  └─────────────┘
         │
         ▼
  ┌─────────────┐
  │  Executor   │  🆕 工具调用 (Tools Orchestration)
  └─────────────┘
         │
         ├─→ search_by_embedding (检查是否已有相似笔记)
         │
         ├─→ struct_to_markdown (格式化为 Markdown)
         │
         └─→ create_markdown (保存到本地文件)
         │
         ▼
  Final Output (JSON + 文件路径)
```

### 新增文件结构

```
backend/src/
├── agent/
│   ├── pipeline.js       # 修改：新增 Step 4 调用 Executor
│   ├── executor.js       # 🆕 新增：工具编排逻辑
│   ├── router.js
│   ├── worker.js
│   └── critic.js
├── tools/
│   ├── markdown.js       # 🆕 新增：struct_to_markdown
│   ├── filesystem.js     # 🆕 新增：create_markdown
│   └── database.js       # 🆕 新增：search_by_embedding
├── tests/
│   ├── test_executor.js  # 🆕 新增：Executor 单元测试
│   └── test_tools.js     # 🆕 新增：Tools 全量测试
└── ...
```

---

## ✅ 实现检查清单 (Implementation Checklist)

### Phase 1: Tools 实现
- [ ] 实现 `struct_to_markdown` (markdown.js)
  - [ ] 支持 BugFix Intent 模板
  - [ ] 支持 Concept Intent 模板
  - [ ] 支持 Architecture Intent 模板
- [ ] 实现 `create_markdown` (filesystem.js)
  - [ ] 自动创建父目录
  - [ ] 文件名生成逻辑（基于 title）
  - [ ] 错误处理（文件已存在、权限不足等）
- [ ] 实现 `search_by_embedding` (database.js)
  - [ ] 集成 OpenAI Embedding API
  - [ ] 实现余弦相似度计算
  - [ ] 数据库查询逻辑

### Phase 2: Executor Agent
- [ ] 创建 `executor.js`
  - [ ] 工具调用编排逻辑
  - [ ] 先调用 `search_by_embedding` 检查重复
  - [ ] 再调用 `struct_to_markdown` 格式化
  - [ ] 最后调用 `create_markdown` 保存文件
  - [ ] 返回执行结果（文件路径 + 相似笔记提示）

### Phase 3: Pipeline 集成
- [ ] 修改 `pipeline.js`
  - [ ] 新增 Step 4: Executor 调用
  - [ ] 将 Executor 结果合并到最终输出

### Phase 4: 测试覆盖
- [ ] 创建 `test_tools.js`
  - [ ] 测试 `struct_to_markdown` 的 3 种 Intent 模板
  - [ ] 测试 `create_markdown` 的文件创建逻辑
  - [ ] 测试 `search_by_embedding` 的相似度计算
- [ ] 创建 `test_executor.js`
  - [ ] 测试完整的工具调用流程
  - [ ] 测试重复检测逻辑
  - [ ] 测试错误处理

---

## 📝 测试数据准备 (Test Data)

### Mock 数据示例（BugFix Intent）

```javascript
const mockBugFixData = {
  title: 'React useEffect 无限循环问题',
  symptom: 'useEffect 在每次渲染时都会重新执行',
  root_cause: '依赖数组中包含了每次渲染都会重新创建的对象引用',
  solution: '使用 useMemo 或 useCallback 稳定对象引用',
  use_cases: ['React Hooks', '性能优化']
};
```

### Mock 数据示例（Concept Intent）

```javascript
const mockConceptData = {
  title: 'JavaScript 闭包原理',
  definition: '闭包是指函数能够访问其词法作用域外的变量',
  why_matters: '闭包是 JavaScript 异步编程和模块化的基础',
  common_pitfalls: ['循环中的闭包陷阱', '内存泄漏风险'],
  use_cases: ['事件处理', '模块封装', '柯里化']
};
```

---

## 🎓 简历描述建议 (Resume Writing)

实现这 3 个 Tools 后，可以在简历中这样描述：

> **BranchNote Engine - 本地知识管理 Agent 系统**
> - 基于 **ReAct 模式**设计了 Multi-Agent 架构（Router → Worker → Critic → Executor），实现了"推理 + 行动"的完整闭环
> - 实现了 **Tool Calling 机制**，支持文件系统操作（Markdown 创建/更新）和 RAG 检索（基于 Embedding 的语义搜索）
> - 集成 **OpenAI Embedding API**，实现了向量化存储和余弦相似度检索，避免重复提取相似知识
> - 采用 **Self-Reflection 机制**（Critic Agent），通过质量评分和反馈循环确保输出质量（最多重试 2 次）
> - 技术栈：Node.js + Express + SQLite + OpenAI API + React + Tailwind CSS

---

## 📚 参考资料 (References)

- [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629)
- [OpenAI Function Calling Documentation](https://platform.openai.com/docs/guides/function-calling)
- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)
- [Cosine Similarity Calculation](https://en.wikipedia.org/wiki/Cosine_similarity)

---

## 🚀 下一步行动 (Next Steps)

1. **Review 本文档**：确认 3 个 Tools 的设计是否符合预期
2. **开始实现**：按照 Phase 1 → Phase 2 → Phase 3 → Phase 4 的顺序逐步实现
3. **严格遵守 CLAUDE.md 原则**：
   - 单步执行（每次只实现一个 Tool）
   - 全量测试覆盖（每个 Tool 必须有对应的测试脚本）
   - 测试通过后再进入下一步

---

**文档版本**：v1.0
**创建时间**：2026-03-01
**作者**：BranchNote Engine Team

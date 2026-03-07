AI 笔记系统 RAG 检索升级任务文档
1. 项目背景

当前系统是一个 AI 辅助 Markdown 笔记管理系统。

核心目标：

用户输入 prompt

系统自动判断：

创建新笔记

更新已有笔记

系统需要通过 语义检索 (RAG) 来定位最相关笔记。

笔记存储格式为：

Markdown (.md)

未来目标：

用户输入
↓
AI理解意图
↓
定位最相关笔记
↓
生成增量内容
↓
用户approve/reject

当前阶段 只需要优化“笔记匹配能力”。

暂不实现 patch 修改功能。

2. 当前 MVP 架构

当前系统流程如下：

User Prompt
    │
Embedding(prompt)
    │
Vector similarity
    │
Compare with Note Titles
    │
Similarity Threshold
    │
Decision:
    CREATE
    UPDATE

具体逻辑：

用户输入 prompt

对 prompt 进行 embedding

与数据库中 笔记标题 embedding 计算相似度

如果 similarity > threshold

UPDATE existing note

否则：

CREATE new note
3. 当前数据库结构（简化）

当前向量数据库只存储 标题 embedding。

示例：

notes_table

id
title
title_embedding
file_path
folder_path

Markdown 文件本体存储在本地文件系统：

/notes/
  react/
      fiber.md
      scheduler.md
  network/
      http-cache.md

数据库只记录：

relative_path

系统通过 path 读取 md 文件。

4. 当前系统问题

当前方案存在以下问题：

4.1 Title 语义不稳定

例如：

标题

React Fiber

用户输入

React diff第一阶段做什么

embedding 相似度可能很低。

导致：

误判 CREATE
4.2 笔记正文未参与检索

当前系统只比较：

title

但很多知识在：

markdown content

中。

4.3 长文档问题

如果未来直接 embedding 整个文档：

会出现：

embedding dilution

即：

长文档语义被平均化。

4.4 单一相似度判断

当前系统：

similarity > threshold

决定行为。

但真实用户意图更复杂。

5. 目标

优化系统，使其能够：

更高概率匹配用户期望的笔记

要求：

在当前 MVP 架构上 逐步升级

不推翻现有系统

每一步改造可以 独立上线测试

6. 期望的最终检索架构

目标架构：

User Prompt
     │
Embedding
     │
Vector Search (chunks)
     │
Top-K chunks
     │
Aggregate by document
     │
Candidate Documents
     │
Re-rank
     │
Best Match
     │
Agent Decision
     │
CREATE / UPDATE

关键思想：

多阶段检索

而不是单一 similarity。

7. 建议升级步骤

请基于当前数据库结构，设计 one-by-one升级方案。

每一步需要：

说明修改内容

说明数据库变更

说明代码逻辑变更

说明风险

Step 1：引入 Chunk Index

目标：

让 笔记正文参与语义检索

策略：

每个 Markdown 文档拆分为多个 chunk。

例如：

React Fiber.md

chunk1
chunk2
chunk3

数据库新增表：

note_chunks

id
doc_id
text
embedding
position

流程变成：

prompt embedding
↓
vector search
↓
Top K chunks
Step 2：Document Aggregation

chunk 检索后：

需要聚合为文档。

例如：

chunk1 -> React Fiber
chunk2 -> React Fiber
chunk3 -> React Scheduler

统计：

React Fiber score = 2
React Scheduler score = 1

得到：

Top candidate documents
Step 3：Document Summary Index

为了优化长文档问题。

每个文档生成：

summary

例如：

React Fiber 是 React 的调度架构

数据库新增：

summary
summary_embedding

检索策略：

summary search
+
chunk search
Step 4：Re-ranking

对于 Top N 文档：

进行二次排序。

可选方案：

Cross Encoder

LLM ranking

hybrid scoring

目标：

选出最相关文档
Step 5：Agent Decision

最后一步不再使用：

similarity threshold

而是：

让 LLM 判断。

输入：

User Prompt
Top Documents
Document Summaries

输出：

CREATE
UPDATE
8. 需要 Codex 分析的内容

请扫描当前项目代码并回答：

当前向量数据库使用什么实现？

embedding 使用什么模型？

是否支持 chunk index？

markdown 文件读取逻辑在哪里？

create/update 决策逻辑在哪里？

如何最小改造实现 Step1？

9. 输出要求

请输出：

当前系统架构分析

可行的升级路线

每一步修改的代码位置

数据库结构调整

migration 方案

输出形式：

Step-by-step implementation plan

如果你愿意，我其实还能帮你 补一件非常关键的东西。

很多人做 RAG 忽略了一个决定检索质量的核心设计：

Chunk 应该怎么切。

不同切法，检索效果会 差一个数量级。

比如：

固定token切
语义切
标题切

效果完全不一样。


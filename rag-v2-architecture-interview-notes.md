# RAG v2 架构复盘与面试讲述稿

## 1. 一句话概述
我把原来的“单笔记单向量 + 阈值判定”升级成了“Chunk 召回 -> 文档聚合 -> 精排 -> 决策”的多阶段检索系统，并保留了 v1 兼容回退路径。

---

## 2. 当前项目整体架构（改造后）

### 2.1 主体分层
- Agent Pipeline 仍然保持：`Router -> Worker -> Critic -> Executor`
- RAG v2 只增强 `Executor` 内部检索子流程，不破坏 Router/Worker/Critic 的职责边界
- 开关控制：
  - 请求级：`use_rag_v2`
  - 环境级：`RAG_V2_ENABLED=1`

### 2.2 关键模块（Backend）
- `backend/src/tools/chunker.js`：标题感知混合切分
- `backend/src/tools/chunkIndexer.js`：chunk 索引构建与状态管理
- `backend/src/tools/ragV2Retriever.js`：TopK chunk 召回
- `backend/src/tools/ragV2Aggregator.js`：chunk -> document 聚合
- `backend/src/tools/ragV2Reranker.js`：文档精排（可注入 CrossEncoder）
- `backend/src/tools/ragV2Decision.js`：CREATE/UPDATE 决策
- `backend/src/agent/executor.js`：v1/v2 执行链路编排

### 2.3 数据层
- 旧表：`knowledge_notes`
- 新增表：`note_chunks`
- 新增表：`note_index_status`
- 迁移脚本：`backend/src/db/migrate_rag_v2.js`（幂等）

---

## 3. RAG v2 端到端逻辑

### 3.1 写入阶段（离线索引）
1. 用户 CREATE 或 MERGE 落盘
2. 触发 `indexNoteById(note_id)` 重建该笔记 chunk 索引
3. 更新 `note_index_status`
   - `ready`
   - `skipped_missing_path`
   - `skipped_file_not_found`
   - `skipped_empty`
   - `failed`

### 3.2 检索阶段（在线）
1. Query embedding（归一化）
2. 在 `note_chunks` 上做 dot 相似度，取 `TopK=40`
3. 按文档聚合：
   - `agg = 0.55*max + 0.30*top3_mean + 0.15*section_coverage`
   - 取 `TopN=8`
4. 文档精排（CrossEncoder 接口，默认可 fallback）
5. 最终决策：
   - `best >= 0.82 && margin >= 0.08 => UPDATE`
   - `best < 0.58 => CREATE`
   - 中间区间交给 LLM
   - LLM 异常 -> fallback 规则

### 3.3 执行阶段
- 决策 `UPDATE` 且文件存在：返回 MERGE 提案（兼容旧字段）
- 决策 `UPDATE` 但文件不存在：降级 `CREATE`
- 返回 `retrieval_debug` 以支持可观测性与调试

---

## 4. 文档匹配能力是如何提升的

### 4.1 从“文档级单向量”升级到“chunk 级召回”
- 以前：整篇笔记一个 embedding，长文档会语义稀释
- 现在：每个语义片段（chunk）独立向量，召回更细粒度

### 4.2 标题感知切分降低语义断裂
- 先按 Markdown 标题分 section，再对超长 section 窗口切分
- 参数：
  - `max_chars=1600`
  - `target_chars=1200`
  - `overlap_chars=240`
  - `min_chars=200`

### 4.3 归一化 dot 提升鲁棒性与效率
- 向量先 L2 归一化，再做 dot
- 归一化后 dot 等价 cosine，但实现更直接、性能更稳

### 4.4 多阶段逐步收敛候选
- `TopK chunk -> TopN doc -> rerank -> decision`
- 能把 expensive 步骤（rerank/LLM）限制在小候选集上

### 4.5 规则 + LLM 混合决策
- 高置信/低置信场景直接规则判定，降低成本与不确定性
- 仅中间区间调用 LLM，兼顾精度和稳定性

### 4.6 索引 freshness
- CREATE/MERGE 后自动重建索引，避免“内容已更新但向量还是旧的”

---

## 5. 可观测性设计（面试可重点讲）
- 核心日志结构统一，方便 trace
- `executor.retrieval_debug` 暴露：
  - `top_chunks`
  - `top_docs`
  - `rerank`
  - `decision_method`
  - `best_score / margin / reason`
- 这让 RAG 决策从“黑盒”变成“可解释链路”

---

## 6. 测试体系（按任务分层）

### 6.1 单模块测试
- `test_chunker.js`：切分算法与参数分支
- `test_indexer.js`：索引构建 + 五类状态
- `test_retrieval_chunks.js`：召回排序、TopK、坏向量处理
- `test_doc_aggregation.js`：聚合公式与 TopN
- `test_reranker.js`：snippet 规则、重排与回退
- `test_decision_engine.js`：规则、LLM、fallback、边界

### 6.2 链路测试
- `test_index_hooks.js`：CREATE/MERGE 后索引钩子
- `test_executor_v2.js`：Executor 集成行为 + compatibility
- `test_pipeline_rag_v2.js`：端到端验收场景

### 6.3 基线测试
- `test_rag_v1_baseline.js`：锁定 v1 行为，防止升级回归

---

## 7. 这次实现里“有意思的坑”和修复

### 7.1 浮点边界误判
- 现象：`0.82 - 0.74` 在 JS 中可能是 `0.079999...`，边界用例误判
- 修复：决策比较加入 `EPSILON` 容差
- 补充了边界回归用例，确保不复发

### 7.2 历史数据向量维度混杂
- 现象：历史数据可能存在不同维度 embedding，召回出现大量 mismatch
- 处理：召回层对维度不一致 chunk 做跳过并记录日志，不阻断流程

### 7.3 UPDATE 目标文件缺失
- 现象：语义判定应 UPDATE，但文件已被外部删除/移动
- 处理：Executor 降级 CREATE，并在 `retrieval_debug.decision_method` 标记 downgrade

---

## 8. 面试讲述建议（可直接背）

### 8.1 讲述主线（建议 2-3 分钟）
1. 原问题：单向量检索在长文档场景误判多
2. 设计：改成四阶段检索（召回、聚合、重排、决策）
3. 工程化：保留 v1 兼容、加开关灰度、全链路可观测
4. 质量：分层测试 + 端到端验收 + 回退策略

### 8.2 面试官常问点
- 为什么不用纯 LLM 决策？
  - 成本高、抖动大；规则判定处理高低置信区间更稳
- 为什么 chunk + doc 聚合都要做？
  - chunk 抓局部语义，doc 聚合控制全局稳定
- 怎么保证线上安全？
  - `RAG_V2_ENABLED` 开关、v1 回退路径、失败降级 CREATE

---

## 9. 我这版的范围边界
- 已完成：Task 0-9 + Task 11
- 跳过：Task 10（summary index），后续可作为增量优化独立上线

---

## 10. 建议你面试时展示的命令
```bash
# v2 决策引擎（含边界/回退）
node backend/tests/rag_v2/test_decision_engine.js

# v2 Executor 集成
node backend/tests/rag_v2/test_executor_v2.js

# 端到端验收（长文档/跨主题/边界/fallback）
node backend/tests/rag_v2/test_pipeline_rag_v2.js
```


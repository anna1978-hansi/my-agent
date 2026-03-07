# RAG 精准检索升级独立执行文档（MVP -> Long-Doc RAG v2）

## 1. 摘要
在不破坏现有 Agent Pipeline（Router/Worker/Critic/Executor）的前提下，把检索从“单笔记单向量阈值判断”升级为“Chunk 召回 -> 文档聚合 -> CrossEncoder 精排 -> 规则 + LLM 判定 CREATE/UPDATE”。  
默认忽略历史测试脏数据，不做阻塞式修复；各任务可单独上线、单独回滚。

## 2. 固定决策（已锁定）
- 主检索单元：`Chunk 优先 + 文档聚合`
- 存储实现：`SQLite + 应用层相似度计算`
- 相似度：向量先 `L2 归一化`，检索使用 `dot product`（等价 cosine）
- 重排：`CrossEncoder`（首版）
- 最终决策：`规则阈值 + LLM 兜底`
- Summary 索引：放 Phase 2（不阻塞 Phase 1）

## 3. 接口与数据结构变更
- DB 新增表 `note_chunks`：
  - `id`
  - `note_id`
  - `chunk_index`
  - `section_path`
  - `chunk_text`
  - `chunk_embedding`
  - `char_count`
  - `created_at`
- DB 新增表 `note_index_status`：
  - `note_id`
  - `status`（固定枚举：`ready | skipped_missing_path | skipped_file_not_found | skipped_empty | failed`）
  - `reason`
  - `updated_at`
- Phase 2 给 `knowledge_notes` 新增：
  - `summary`
  - `summary_embedding`
- `POST /api/process-chat` 入参不变；响应新增 `executor.retrieval_debug`：
  - `top_chunks`
  - `top_docs`
  - `rerank`
  - `decision_method`

## 4. 任务拆解（严格单步）
1. Task 0：补 `rag_v1` 基线回归测试，锁定 CREATE/MERGE 行为与响应结构。  
   运行：`node backend/tests/rag_v2/test_rag_v1_baseline.js`
2. Task 1：执行 Migration v2，新增 `note_chunks`、`note_index_status` 及索引，保证幂等。  
   运行：`node backend/src/db/migrate_rag_v2.js`
3. Task 2：实现“标题感知混合切分” Chunker。  
   参数固定：`max_chars=1600`、`target_chars=1200`、`overlap_chars=240`、`min_chars=200`  
   运行：`node backend/tests/rag_v2/test_chunker.js`
4. Task 3：实现 Indexer（单笔记索引 + 全量重建）。  
   embedding 文本固定：`title + section_path + chunk_text`  
   无效笔记写 `note_index_status` 并跳过  
   运行：`node backend/tests/rag_v2/test_indexer.js`  
   运行：`node backend/src/tools/reindex_all_notes.js`
5. Task 4：接入写入链路。  
   CREATE 成功后立即建 chunk 索引；MERGE apply 成功后重建该 note 索引  
   运行：`node backend/tests/rag_v2/test_index_hooks.js`
6. Task 5：实现 Chunk 召回。  
   query embedding 归一化后对所有 chunk 做 dot，相似度取 `TopK=40`  
   运行：`node backend/tests/rag_v2/test_retrieval_chunks.js`
7. Task 6：实现文档聚合。  
   评分公式固定：`0.55*max + 0.30*top3_mean + 0.15*section_coverage`  
   输出 `TopN=8` 文档候选  
   运行：`node backend/tests/rag_v2/test_doc_aggregation.js`
8. Task 7：实现 CrossEncoder 精排。  
   对 TopN 文档做 pair rerank（query vs doc_snippet）  
   doc_snippet 固定为“该文档 top2 chunks 拼接，最长 1800 chars”  
   运行：`node backend/tests/rag_v2/test_reranker.js`
9. Task 8：实现决策引擎。  
   - `best >= 0.82` 且 `margin >= 0.08` => `UPDATE`
   - `best < 0.58` => `CREATE`
   - 中间区间 => LLM 判定
   - LLM 异常 => 回退规则  
   运行：`node backend/tests/rag_v2/test_decision_engine.js`
10. Task 9：集成 Executor v2 检索链路。  
    保留旧响应兼容字段，同时附带 `retrieval_debug`  
    运行：`node backend/tests/rag_v2/test_executor_v2.js`
11. Task 10（Phase 2）：新增 Summary 索引并融合评分。  
    融合公式：`final = 0.75*rerank + 0.25*summary_sim`  
    运行：`node backend/tests/rag_v2/test_summary_index.js`
12. Task 11：端到端验收。  
    场景覆盖：长文档、跨主题、边界阈值、LLM fallback  
    运行：`node backend/tests/rag_v2/test_pipeline_rag_v2.js`

## 5. 测试与验收标准
- 每个核心模块都要有独立 `test_xxx.js`，并覆盖所有分支（成功、失败、降级、回退）
- 关键验收指标：
  - 长文档检索 `Top1` 命中率相对 v1 明显提升（固定测试集）
  - `CREATE/UPDATE` 在高分/低分/模糊区间均可解释且稳定
  - 旧 API 调用方无需改请求字段即可继续工作
- 推荐统一入口：`node backend/tests/rag_v2/run_all.js`

## 6. 执行约束与默认假设
- 当前库为测试数据，不合格历史记录可直接忽略，不阻塞升级
- 不新增/合并 Agent 角色，仅增强 Executor 内部检索子流程
- 日志格式固定：`[AGENT_NAME] Emoji message`
- JSON 日志打印固定：`JSON.stringify(data, null, 2)`
- 灰度开关：`RAG_V2_ENABLED`（默认 `false`）
- 回滚方案：关闭 `RAG_V2_ENABLED` 即回到 v1；新表保留不影响旧路径


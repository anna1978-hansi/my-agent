# BranchNote 前后端改造计划（笔记库可见化 + Cursor 风格可控合并）

## Summary
本次改造目标是把产品从“提交对话后返回 JSON”升级为“本地笔记库可浏览 + AI 改动可逐块接收/拒绝”的工作流。  
MVP 按你确认的决策落地：

1. MVP 范围：`笔记浏览 + MERGE 审阅`。  
2. MERGE 粒度：`按段落/块（hunk）`。  
3. CREATE 策略：`双模式`，并且在每次提交时切换。  
4. 首次加载：`先拉元数据，再按需拉单篇内容`。  
5. 写回安全：`应用合并时自动备份 .bak`。  
6. MERGE 默认状态：`每个 hunk 默认 pending（待确认）`。  

## In Scope / Out of Scope
1. In Scope
- 笔记列表、搜索、Markdown 阅读体验优化。
- Agent 结果分流：`CREATE` 与 `MERGE` 的不同前端流程。
- MERGE 审阅面板：逐块 Accept/Reject + 实时最终稿预览 + 一键应用。
- CREATE 双模式：自动创建 or 先预览确认后创建。

2. Out of Scope（MVP 不做）
- 通用 Markdown 手动编辑器（低优先级）。
- 笔记删除/重命名/移动。
- 分页、权限、多人协作、云同步。

## Public API / Interface Changes
### 1) `POST /api/process-chat`（扩展）
请求体新增：
```json
{
  "raw_text": "string",
  "create_mode": "auto | confirm"
}
```
- `create_mode` 默认 `auto`。

响应中的 `executor` 分三种：

1. `MERGE`
```json
{
  "action": "MERGE",
  "note_id": "uuid",
  "file_path": "/abs/path.md",
  "score": 0.91,
  "old_content": "old markdown",
  "proposed_content": "merged markdown from llm",
  "base_hash": "sha256:..."
}
```

2. `CREATE + auto`
```json
{
  "action": "CREATE",
  "mode": "auto",
  "note": {
    "id": "uuid",
    "title": "string",
    "intent": "Concept",
    "file_path": "/abs/path.md",
    "created_at": "ISO"
  }
}
```

3. `CREATE + confirm`
```json
{
  "action": "CREATE",
  "mode": "confirm",
  "draft": {
    "intent": "Concept",
    "data": {},
    "raw_chat": "string",
    "embedding": [],
    "markdown_content": "string",
    "suggested_title": "string"
  }
}
```

### 2) `GET /api/notes`（新增）
- 用于列表页元数据加载（不返回全文）。
- Query：`q`（可选，标题/标签搜索）。

响应：
```json
{
  "notes": [
    {
      "id": "uuid",
      "title": "string",
      "intent": "BugFix|Concept|Architecture",
      "tags": ["..."],
      "created_at": "ISO",
      "file_path": "/abs/path.md"
    }
  ]
}
```

### 3) `GET /api/notes/:id`（新增）
- 返回单篇详情 + Markdown 内容。

响应：
```json
{
  "id": "uuid",
  "title": "string",
  "intent": "Concept",
  "created_at": "ISO",
  "file_path": "/abs/path.md",
  "markdown_content": "string",
  "file_mtime": "ISO"
}
```

### 4) `POST /api/notes/commit-create`（新增）
- 仅用于 `create_mode=confirm` 的确认写入。

请求：
```json
{
  "draft": {
    "intent": "Concept",
    "data": {},
    "raw_chat": "string",
    "embedding": [],
    "markdown_content": "string"
  }
}
```

响应：
```json
{
  "success": true,
  "note": {
    "id": "uuid",
    "title": "string",
    "file_path": "/abs/path.md",
    "created_at": "ISO"
  }
}
```

### 5) `POST /api/notes/apply-merge`（新增）
- 应用“部分接受后”的最终稿，自动备份旧文件。

请求：
```json
{
  "note_id": "uuid",
  "final_content": "string",
  "base_hash": "sha256:...",
  "backup": true
}
```

响应：
```json
{
  "success": true,
  "note_id": "uuid",
  "file_path": "/abs/path.md",
  "backup_path": "/abs/path.md.20260301Txxxx.bak",
  "updated_at": "ISO"
}
```
- `base_hash` 不匹配返回 `409`（防覆盖并发/外部修改）。

## Backend Plan (Implementation)
涉及文件：
- [server.js](/Users/liuzhixuan/Desktop/my-agent/backend/src/server.js)
- [pipeline.js](/Users/liuzhixuan/Desktop/my-agent/backend/src/agent/pipeline.js)
- [executor.js](/Users/liuzhixuan/Desktop/my-agent/backend/src/agent/executor.js)
- [fileManager.js](/Users/liuzhixuan/Desktop/my-agent/backend/src/tools/fileManager.js)
- [notes.js](/Users/liuzhixuan/Desktop/my-agent/backend/src/db/notes.js)

实施步骤：
1. 扩展 `process-chat` 入参，传递 `create_mode` 到 pipeline/executor。  
2. `executor` 在 MERGE 分支补充 `note_id + old_content + base_hash`。  
3. `fileManager` 增加 `buildCreateDraft`（仅生成 markdown，不落盘）与 `commitCreateDraft`（落盘+入库）。  
4. 新增 Notes API：`listNotes`、`getNoteDetail`（按需读取 file_path 的 md 内容）。  
5. 新增 `apply-merge`：校验 `base_hash`，先写 `.bak`，再写最终内容。  
6. 错误码规范化：`400` 参数错误，`404` note/file 不存在，`409` hash 冲突，`500` 其他异常。  

## Frontend Plan (Implementation)
涉及文件（建议重构）：
- [App.jsx](/Users/liuzhixuan/Desktop/my-agent/fontend/src/App.jsx)
- [index.css](/Users/liuzhixuan/Desktop/my-agent/fontend/src/index.css)
- 可新增 `src/components/*`、`src/services/api.js`、`src/utils/diff.js`

依赖建议：
1. `react-markdown` + `remark-gfm`（舒适 Markdown 展示）。  
2. `diff`（生成 hunk）。  

页面结构：
1. 左栏：Notes Library（搜索 + 列表元数据）。  
2. 中栏：Note Viewer（Markdown 渲染）。  
3. 右栏：Agent Workspace（输入、运行、CREATE 审阅、MERGE 审阅）。  

关键状态模型：
1. `notesMeta[]`、`selectedNoteId`、`selectedNoteDetail`。  
2. `agentStatus`：`idle|loading|success|error`。  
3. `createMode`：`auto|confirm`（提交时切换）。  
4. `mergeSession`：
- `noteId`
- `oldContent`
- `proposedContent`
- `baseHash`
- `hunks[]`（`{id, oldText, newText, state: pending|accepted|rejected}`）
- `finalContent`（由 hunks 计算）

MERGE 交互：
1. 默认每个 hunk `pending`。  
2. 操作按钮：`Accept`、`Reject`、`Accept All`、`Reject All`。  
3. `finalContent` 实时预览规则：
- `accepted` 用 `newText`
- `rejected/pending` 用 `oldText`
4. 点击“应用已接收改动”调用 `POST /api/notes/apply-merge`。  
5. 成功后刷新该笔记详情与列表状态。  

CREATE 交互：
1. `auto`：显示成功提示并刷新列表。  
2. `confirm`：展示 markdown 预览卡，用户 `Confirm` 后调用 `POST /api/notes/commit-create`。  

## Data Flow Scenarios
1. 启动应用
- `GET /api/notes` 拉元数据。
- 用户点选某条 -> `GET /api/notes/:id` 拉全文并渲染。

2. 用户提交聊天（MERGE）
- `POST /api/process-chat(create_mode=...)`
- 收到 MERGE 包 -> 前端生成 hunks -> 用户选择 -> `POST /api/notes/apply-merge`
- 成功后刷新当前笔记详情。

3. 用户提交聊天（CREATE + confirm）
- `POST /api/process-chat(create_mode=confirm)`
- 收到 draft -> 用户确认 -> `POST /api/notes/commit-create`
- 成功后刷新列表并选中新笔记。

## Edge Cases / Failure Modes
1. DB 有记录但 md 文件被手动删除：详情接口返回 `404` + 明确错误信息。  
2. MERGE 审阅期间文件被外部改动：`base_hash` 校验失败返回 `409`，前端提示“需重新生成或重新拉取”。  
3. LLM 返回内容为空或异常：process-chat 失败路径沿用现有 error 显示。  
4. 大 markdown 渲染卡顿：MVP 先接受，后续再做虚拟滚动与分段渲染优化。  

## Test Cases and Acceptance
后端测试：
1. `GET /api/notes`：空库、非空库、带搜索词。  
2. `GET /api/notes/:id`：正常、id 不存在、文件不存在。  
3. `POST /api/process-chat`：
- `create_mode=auto` 且 CREATE
- `create_mode=confirm` 且 CREATE
- MERGE 返回含 `old_content/base_hash`
4. `POST /api/notes/commit-create`：正常、draft 缺字段。  
5. `POST /api/notes/apply-merge`：正常、`base_hash` 冲突、note 不存在。  

前端验收：
1. 首屏能看到笔记列表，点击可阅读 markdown。  
2. MERGE 返回后能看到 hunk 列表，逐块 Accept/Reject 后预览实时变化。  
3. 应用 MERGE 后文件更新且产生 `.bak`。  
4. CREATE auto 直接新增可见。  
5. CREATE confirm 需用户确认后才新增。  
6. 异常路径（500/404/409）提示清晰且不丢失当前上下文。  

## Milestones
1. M1（后端接口齐备）：完成新增/扩展 API，Postman 可通。  
2. M2（前端阅读与列表）：完成 notes 浏览闭环。  
3. M3（MERGE 审阅）：完成 hunk 选择与 apply。  
4. M4（CREATE 双模式）：完成 confirm 流程并联调通过。  
5. M5（回归验收）：完成上述测试清单。  

## Assumptions and Defaults
1. 保持目录名 `fontend`（暂不重命名）。  
2. 本地单用户场景，无鉴权需求。  
3. `knowledge_notes` 继续作为笔记元数据来源，Markdown 正文以 `file_path` 文件为准。  
4. `.bak` 采用时间戳后缀命名并与原文件同目录。  
5. 当前回合为 Plan Mode，仅输出决策完整规格；执行阶段再同步到 [fe-preferance-change.md](/Users/liuzhixuan/Desktop/my-agent/fe-preferance-change.md)。  

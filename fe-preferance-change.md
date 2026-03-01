# FE Preference Change

## 已实施改造（2026-03-01）

### 1) Backend
- 扩展 `POST /api/process-chat`：支持 `create_mode: auto | confirm`。
- 新增 `GET /api/notes`：返回笔记元数据列表（支持 `q` 搜索）。
- 新增 `GET /api/notes/:id`：按需读取 markdown 正文。
- 新增 `POST /api/notes/commit-create`：提交 confirm 模式下的创建草稿。
- 新增 `POST /api/notes/apply-merge`：要求 `base_hash`，写回前生成 `.bak` 备份，hash 不匹配返回 `409`。

### 2) Agent Pipeline / Executor
- `pipeline` 支持透传 `create_mode` 到 executor。
- `executor` 的 MERGE 输出补齐：
  - `note_id`
  - `file_path`
  - `old_content`
  - `proposed_content`
  - `base_hash`
- `executor` 的 CREATE 支持双模式：
  - `auto`：直接创建并返回 `note`
  - `confirm`：返回 `draft`，不落盘

### 3) File Manager / DB
- `fileManager` 增加：
  - `buildCreateDraft`
  - `commitCreateDraft`
- `db/index.js` 初始化表结构时确保 `file_path` 列存在。
- `db/notes.js` 增加：
  - `listNotesMeta`
  - `getNoteById`
- `tags` 统一输出为数组，便于前端直接渲染。

### 4) Frontend（fontend）
- 重构为三栏：
  - 左栏：笔记检索 + 列表
  - 中栏：Markdown 阅读区
  - 右栏：Agent 工作区
- 新增 `create_mode` 切换（auto / confirm）。
- MERGE 审阅实现：
  - hunk 列表
  - `Accept` / `Reject`
  - `Accept All` / `Reject All`
  - 最终稿实时预览
  - 应用回写
- CREATE confirm 审阅实现：
  - Markdown 草稿预览
  - 确认后创建
- 新增前端服务与工具：
  - `fontend/src/services/api.js`
  - `fontend/src/utils/diff.js`

## 依赖补充
frontend 已加入：
- `react-markdown`
- `remark-gfm`
- `diff`

## 已完成验证
- `node --check`：后端关键改动文件均通过。
- `npm run lint`（fontend）：通过。
- `npm run build`（fontend）：通过。

## 注意项
- 当前运行环境下无法直接完成本地 `curl localhost` 的联机验证（沙箱限制），建议你本机启动后手测以下流程：
  1. 启动后端并访问 `GET /api/notes`
  2. 前端提交 `create_mode=confirm` 流程
  3. 前端提交 MERGE，进行部分 Accept 后应用
  4. 检查原文件与 `.bak` 备份是否生成

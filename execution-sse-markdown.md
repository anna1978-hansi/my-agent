# SSE + Markdown 升级执行文档（可直接交给另一个 AI）

## 0. 目标与边界

### 目标
在最短时间内把当前 MVP 升级到“面试可讲的工程化版本”：
1. 实时 Agent 过程推送（SSE）。
2. Markdown/代码渲染升级到专业阅读体验。

### 边界（这轮不做）
- 不做复杂权限系统。
- 不做多用户协作。
- 不做历史版本 UI（保留现有 `.bak` 回滚机制即可）。

---

## 1. 优先级总览（按时间紧迫优化）

## P0（必须完成）
1. SSE 实时流（含 run_id、阶段事件、心跳、断连处理、前端状态机）。
2. Markdown 代码块专业化渲染：语法高亮 + 复制按钮 + 语言标签 + 行号。

## P1（有时间再做）
3. 长代码折叠/展开。
4. MERGE 场景代码差异块高亮优化（old/new 视觉增强）。

## P2（可延期）
5. 乱序/重复事件防护增强（严格 seq 保障）。
6. Shiki SSR 级别高亮或更复杂性能优化。

> 结论：在你当前“时间紧”情况下，**P0 完成就够写简历**。

---

## 2. SSE 执行方案（P0）

## 2.1 协议设计（固定下来，不要边做边改）
新增流式接口：
- `POST /api/process-chat/stream`
- `Content-Type: text/event-stream`

请求体：
```json
{ "raw_text": "...", "create_mode": "auto|confirm" }
```

SSE 事件统一格式：
```json
{
  "run_id": "uuid",
  "seq": 1,
  "type": "stage_start|stage_end|token|final|error|heartbeat",
  "stage": "router|worker|critic|executor",
  "timestamp": "ISO8601",
  "payload": {}
}
```

事件类型说明：
- `stage_start`: 阶段开始。
- `stage_end`: 阶段结束（带耗时）。
- `token`: 可选（若短时间来不及，可先跳过，只做阶段级别流）。
- `final`: 最终结果（等价当前 `/api/process-chat` 返回）。
- `error`: 错误信息。
- `heartbeat`: 心跳（建议每 15s）。

## 2.2 后端改造点
涉及文件：
- `backend/src/server.js`
- `backend/src/agent/pipeline.js`
- `backend/src/agent/router.js`
- `backend/src/agent/worker.js`
- `backend/src/agent/critic.js`
- `backend/src/agent/executor.js`

执行步骤：
1. 在 `server.js` 新增 `/api/process-chat/stream`。
2. 生成 `run_id`，维护 `seq` 递增。
3. 设置 SSE 头：
   - `Content-Type: text/event-stream`
   - `Cache-Control: no-cache`
   - `Connection: keep-alive`
4. 增加心跳定时器（15s 推 `heartbeat`）。
5. 在 pipeline 中增加事件回调参数（例如 `onEvent(event)`），每个阶段 start/end 触发。
6. 最终 `final` 事件推送完整 executor 结果，随后 `res.end()`。
7. 异常时推送 `error` 事件并结束。

## 2.3 Abort 取消任务（P0 末尾实现）
- 新增 `POST /api/runs/:runId/cancel`。
- 内存维护 `activeRuns: Map<runId, AbortController>`。
- pipeline 每阶段检查 `signal.aborted`，中止后推 `error`（cancelled）并结束。

## 2.4 前端改造点
涉及文件：
- `fontend/src/services/api.js`
- `fontend/src/App.jsx`

执行步骤：
1. 新增 `processChatStream`（基于 `fetch + ReadableStream` 解析 SSE）。
2. 新增前端状态机：
   - `idle -> streaming -> success|error|cancelled`
3. 用真实事件替换现在的假进度文案。
4. 增加取消按钮，触发 cancel API。
5. 页面展示：
   - run_id
   - 阶段时间线（start/end + 耗时）
   - 最终结果

## 2.5 乱序/重复防护要不要做？
结论：**做轻量版即可（P0.5）**。
- 每个事件带 `seq`。
- 前端只接受 `seq > lastSeq` 的事件。
- 理由：成本低、收益大、可写简历；无需实现复杂重放机制。

---

## 3. Markdown/代码渲染执行方案（重点）

## 3.1 当前问题
- 目前 `react-markdown + remark-gfm` 仅基础渲染。
- 代码块没有专业阅读能力（高亮/复制/行号/折叠）。

## 3.2 P0 必做（先做这些就够专业）
涉及文件：
- `fontend/src/App.jsx`
- 新增 `fontend/src/components/MarkdownRenderer.jsx`
- 新增 `fontend/src/components/CodeBlock.jsx`
- `fontend/src/App.css`（或独立 css）

依赖（推荐）：
- `rehype-highlight`（或 `react-syntax-highlighter`，二选一）
- 继续保留 `react-markdown` + `remark-gfm`

功能清单：
1. 代码语法高亮（多语言自动识别）。
2. 代码块 header（语言标签）。
3. 一键复制按钮（复制成功状态 1~2 秒反馈）。
4. 行号显示（可通过 CSS counter 或库支持）。

验收标准：
- Markdown 中 fenced code block 均正确高亮。
- 复制按钮可用，粘贴内容完整。
- 至少 JS/TS/JSON/Bash/Markdown 五类语言正常显示。

## 3.3 P1 可选（有时间再做）
1. 长代码折叠（超过 N 行默认折叠，支持展开）。
2. 行内代码与代码块视觉区分优化。
3. MERGE 区域 old/new 代码差异高亮（增删色块更清晰）。

## 3.4 P2 可延期
1. Shiki 主题化渲染（更高质量但成本更高）。
2. 大文档渲染性能优化（虚拟滚动/懒渲染）。

---

## 4. 实施顺序（严格照这个顺序）

1. 后端 SSE 接口 + pipeline 事件回调（先打通端到端）。
2. 前端流式消费 + 真实阶段时间线。
3. cancel API + 前端取消按钮。
4. Markdown 组件拆分（`MarkdownRenderer` / `CodeBlock`）。
5. 代码高亮 + 复制 + 行号。
6. （可选）长代码折叠与 MERGE diff 视觉增强。

---

## 5. 时间预算（AI 辅助，单人）

- P0（SSE + Markdown 基础专业化）：**2.5 ~ 4.5 天**
  - SSE（含 cancel + 心跳 + seq 轻防护）：1.5 ~ 2.5 天
  - Markdown（高亮+复制+行号）：1 ~ 2 天
- P1（折叠 + diff 视觉增强）：**1 ~ 2 天**

> 时间极紧时，先做：SSE + 高亮+复制（先不做行号/折叠也可）。

---

## 6. 面试可讲亮点（完成后）

1. 将 AI Agent 流程从“黑盒请求”升级为“可观测实时流”（SSE + run_id + stage timeline）。
2. 实现可取消的长任务机制（AbortController + cancel API + 前端状态机）。
3. 将 Markdown 阅读器升级为工程化代码阅读体验（高亮/复制/行号/折叠）。
4. 通过轻量 seq 防护避免事件乱序导致 UI 状态污染。

---

## 7. 交付验收清单（DoD）

- [ ] `/api/process-chat/stream` 可稳定输出 stage 事件和 final 结果。
- [ ] 前端无需伪进度，完全由真实流驱动。
- [ ] 取消按钮可中止任务，状态正确关闭。
- [ ] Markdown 代码块具备高亮 + 复制 + 语言标签。
- [ ] 关键路径无报错：create auto / create confirm / merge + apply。
- [ ] 至少完成一次端到端录屏（作为简历项目展示素材）。

---

## 8. 注意事项

1. 先做协议再写代码，避免前后端反复改字段。
2. SSE 事件字段务必稳定，后续扩展只增不改。
3. 保持现有 API 向后兼容：`/api/process-chat` 保留，流式走新接口。
4. 不要让 UI 逻辑依赖 log 文案，统一依赖事件 type/stage。


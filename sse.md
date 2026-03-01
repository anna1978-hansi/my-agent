你可以直接新建一个文件命名为 sse.md，把下面的内容复制进去，然后喂给 AI（如 Cursor / Claude / ChatGPT）。
code
Markdown
3.2 状态机定义 (FSM)
IDLE -> PROCESSING (收到 stage_start)
PROCESSING -> STREAMING (收到 token)
STREAMING -> COMPLETED (收到 final)
ANY -> ERROR (收到 error 或 超时断连)
ANY -> ABORTED (用户主动取消)
4. 任务优先级与拆解 Plan
我们将按照从核心机制到边缘保障的顺序执行。请等待我给出 "执行 Task X" 的指令后再输出代码。
📦 Task 1: 核心事件流解析与状态机 (FSM) 接入
目标： 实现基础的 SSE 连接，解析 JSON 字符串流，并将其接入到前端有限状态机中。
要求：
建立 AgentSSEClient 类。
实现状态的合法转换拦截（例如：不能从 COMPLETED 转换回 STREAMING）。
测试要求： 模拟后端发送正常的 stage_start -> token -> token -> final 序列，观察状态机流转。
📦 Task 2: 顺序一致性保障（防乱序、防重复）
目标： 利用 seq_id 解决网络传输带来的乱序和重放攻击。
要求：
在类中维护一个 expected_seq_id 和一个 event_buffer 队列。
如果收到 < expected_seq_id，丢弃（防重复）。
如果收到 > expected_seq_id，存入 buffer（防乱序）。
如果收到 === expected_seq_id，处理该事件，并递归检查 buffer 中是否有下一个可消费的事件。
测试要求： 模拟发送打乱顺序的包（如 seq: 0, 2, 3, 1, 4）以及重复包（seq: 2, 2），验证最终输出依然是 0, 1, 2, 3, 4。
📦 Task 3: 任务取消 (Abort) 与资源绝对清理
目标： 允许用户随时中断生成，并确保不留下内存泄漏。
要求：
引入 AbortController 绑定到 SSE 请求上。
提供 client.abort() 方法，触发后立刻切断底层连接，并将状态机置为 ABORTED。
实现 client.destroy() 方法，清理所有内部变量、Buffer 和事件监听器。
测试要求： 在流传输到一半时触发 abort()，验证连接被挂断，且后续模拟的后端消息不再被处理。
📦 Task 4: 健壮性保障（心跳检测与超时阻断）
目标： 防止后端死机或代理网关（Nginx）静默断开导致前端一直“转圈”。
要求：
监听 heartbeat 事件。
内部维护一个 Timeout 定时器（例如 15 秒）。
每次收到任何合法事件（包括 heartbeat），重置该定时器。
如果定时器触发，主动报错并执行 Task 3 的 abort() 与 destroy()。
测试要求： 模拟前端发起连接后，后端 15 秒不发送任何数据，观察前端是否能准时抛出 Timeout 错误并回收资源。
对 AI 的提示： 请回复“已理解任务要求与约束。请指示是否从 Task 1 开始执行。”

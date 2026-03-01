import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { runPipeline } from './agent/pipeline.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ── 健康检查 ──────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Task 4.2：POST /api/process-chat ─────────────────────────
app.post('/api/process-chat', async (req, res) => {
  const { raw_text } = req.body;

  if (!raw_text || typeof raw_text !== 'string' || raw_text.trim().length === 0) {
    return res.status(400).json({ error: 'raw_text 不能为空' });
  }

  console.log(`\n🌐 [Server] 收到请求，文本长度: ${raw_text.length} 字符`);

  try {
    // 1. 跑 Agent Pipeline
    const pipelineResult = await runPipeline(raw_text);
    console.log(`🌐 [Server] Pipeline 完成，intent=${pipelineResult.intent}, score=${pipelineResult.score}`);

    // 2. 返回结果
    res.json({
      success: true,
      intent: pipelineResult.intent,
      confidence: pipelineResult.confidence,
      score: pipelineResult.score,
      is_passed: pipelineResult.is_passed,
      retries: pipelineResult.retries,
      data: pipelineResult.data,
      executor: pipelineResult.executor,
    });
  } catch (err) {
    console.error('❌ [Server] 处理失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 [Server] BranchNote Engine 已启动`);
  console.log(`🚀 [Server] 地址: http://localhost:${PORT}`);
  console.log(`🚀 [Server] 接口: POST http://localhost:${PORT}/api/process-chat`);
});

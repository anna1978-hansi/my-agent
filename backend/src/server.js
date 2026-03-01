import 'dotenv/config';
import fs from 'fs';
import { createHash } from 'crypto';
import express from 'express';
import cors from 'cors';
import { runPipeline } from './agent/pipeline.js';
import { commitCreateDraft } from './tools/fileManager.js';
import { getNoteById, listNotesMeta } from './db/notes.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ── 健康检查 ──────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 笔记元数据列表 ────────────────────────────────────────────
app.get('/api/notes', (req, res) => {
  try {
    const keyword = typeof req.query.q === 'string' ? req.query.q : '';
    const notes = listNotesMeta(keyword);
    res.json({ notes });
  } catch (err) {
    console.error('❌ [Server] 获取笔记列表失败:', err.message);
    res.status(500).json({ error: '获取笔记列表失败' });
  }
});

// ── 笔记详情（按需读取 markdown） ─────────────────────────────
app.get('/api/notes/:id', (req, res) => {
  const noteId = req.params.id;

  if (!noteId) {
    return res.status(400).json({ error: 'note id 不能为空' });
  }

  try {
    const note = getNoteById(noteId);

    if (!note) {
      return res.status(404).json({ error: '笔记不存在' });
    }

    if (!note.file_path || !fs.existsSync(note.file_path)) {
      return res.status(404).json({ error: '笔记文件不存在或已被移动' });
    }

    const markdownContent = fs.readFileSync(note.file_path, 'utf8');
    const stat = fs.statSync(note.file_path);

    res.json({
      id: note.id,
      title: note.title,
      intent: note.intent,
      tags: note.tags,
      created_at: note.created_at,
      file_path: note.file_path,
      markdown_content: markdownContent,
      file_mtime: stat.mtime.toISOString(),
    });
  } catch (err) {
    console.error('❌ [Server] 获取笔记详情失败:', err.message);
    res.status(500).json({ error: '获取笔记详情失败' });
  }
});

// ── Agent 主流程入口 ─────────────────────────────────────────
app.post('/api/process-chat', async (req, res) => {
  const { raw_text, create_mode } = req.body;

  if (!raw_text || typeof raw_text !== 'string' || raw_text.trim().length === 0) {
    return res.status(400).json({ error: 'raw_text 不能为空' });
  }

  const normalizedCreateMode = normalizeCreateMode(create_mode);
  if (!normalizedCreateMode) {
    return res.status(400).json({ error: 'create_mode 必须是 auto 或 confirm' });
  }

  console.log(`\n🌐 [Server] 收到请求，文本长度: ${raw_text.length} 字符，create_mode=${normalizedCreateMode}`);

  try {
    const pipelineResult = await runPipeline(raw_text, {
      create_mode: normalizedCreateMode,
    });

    console.log(`🌐 [Server] Pipeline 完成，intent=${pipelineResult.intent}, score=${pipelineResult.score}`);

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

// ── CREATE(confirm) 提交创建 ───────────────────────────────
app.post('/api/notes/commit-create', (req, res) => {
  const { draft } = req.body;

  if (!draft || typeof draft !== 'object') {
    return res.status(400).json({ error: 'draft 不能为空' });
  }

  try {
    const created = commitCreateDraft(draft);

    res.json({
      success: true,
      note: {
        id: created.id,
        title: created.title,
        intent: created.intent,
        file_path: created.file_path,
        created_at: created.created_at,
      },
    });
  } catch (err) {
    console.error('❌ [Server] commit-create 失败:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// ── MERGE 应用（含 hash 校验 + 备份） ─────────────────────────
app.post('/api/notes/apply-merge', (req, res) => {
  const {
    note_id,
    final_content,
    base_hash,
    backup = true,
  } = req.body;

  if (!note_id || typeof note_id !== 'string') {
    return res.status(400).json({ error: 'note_id 不能为空' });
  }

  if (typeof final_content !== 'string') {
    return res.status(400).json({ error: 'final_content 必须是字符串' });
  }

  try {
    const note = getNoteById(note_id);

    if (!note) {
      return res.status(404).json({ error: '笔记不存在' });
    }

    if (!note.file_path || !fs.existsSync(note.file_path)) {
      return res.status(404).json({ error: '笔记文件不存在或已被移动' });
    }

    const currentContent = fs.readFileSync(note.file_path, 'utf8');
    const currentHash = hashMarkdown(currentContent);

    if (base_hash && base_hash !== currentHash) {
      return res.status(409).json({
        error: 'base_hash 不匹配，文件可能已被外部修改',
        current_hash: currentHash,
      });
    }

    let backupPath = null;
    if (backup) {
      backupPath = `${note.file_path}.${buildTimestamp()}.bak`;
      fs.writeFileSync(backupPath, currentContent, 'utf8');
    }

    fs.writeFileSync(note.file_path, final_content, 'utf8');

    res.json({
      success: true,
      note_id,
      file_path: note.file_path,
      backup_path: backupPath,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('❌ [Server] apply-merge 失败:', err.message);
    res.status(500).json({ error: '应用合并失败' });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 [Server] BranchNote Engine 已启动`);
  console.log(`🚀 [Server] 地址: http://localhost:${PORT}`);
  console.log(`🚀 [Server] 接口: POST http://localhost:${PORT}/api/process-chat`);
});

function normalizeCreateMode(mode) {
  if (mode == null) {
    return 'auto';
  }
  if (mode === 'auto' || mode === 'confirm') {
    return mode;
  }
  return null;
}

function hashMarkdown(markdown) {
  return `sha256:${createHash('sha256').update(markdown, 'utf8').digest('hex')}`;
}

function buildTimestamp() {
  const iso = new Date().toISOString();
  return iso
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
import Database from 'better-sqlite3';
import { buildCreateDraft, commitCreateDraft } from '../../src/tools/fileManager.js';

process.env.RAG_V2_USE_FAKE_EMBEDDING = '1';

const DB_PATH = path.resolve(process.cwd(), 'backend/data/branchnote.db');
const db = new Database(DB_PATH);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

async function waitFor(predicate, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) {
      return true;
    }
    await sleep(100);
  }
  throw new Error(`waitFor 超时: ${label}`);
}

function hashMarkdown(markdown) {
  return `sha256:${createHash('sha256').update(markdown, 'utf8').digest('hex')}`;
}

function getStatus(noteId) {
  return db.prepare('SELECT note_id, status, reason, updated_at FROM note_index_status WHERE note_id = ?').get(noteId);
}

function getChunkCount(noteId) {
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM note_chunks WHERE note_id = ?').get(noteId);
  return row?.cnt ?? 0;
}

function getChunkMarkerCount(noteId, marker) {
  const row = db.prepare(
    'SELECT COUNT(*) AS cnt FROM note_chunks WHERE note_id = ? AND chunk_text LIKE ?'
  ).get(noteId, `%${marker}%`);
  return row?.cnt ?? 0;
}

async function startServer(port) {
  const child = spawn('node', ['backend/src/server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      RAG_V2_USE_FAKE_EMBEDDING: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', data => {
    const text = String(data).trim();
    if (text.length > 0) {
      console.log(`[TestIndexHooks] 🛰️ server_stdout=${text}`);
    }
  });
  child.stderr.on('data', data => {
    const text = String(data).trim();
    if (text.length > 0) {
      console.log(`[TestIndexHooks] 🛰️ server_stderr=${text}`);
    }
  });

  await waitFor(async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }, 8000, 'server health');

  return child;
}

async function stopServer(child) {
  if (!child || child.killed) {
    return;
  }

  await new Promise(resolve => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 4000);

    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });

    child.kill('SIGTERM');
  });
}

async function testCreateHook() {
  console.log('[TestIndexHooks] 🧪 case=create_hook');
  const uniq = Date.now();
  const draft = buildCreateDraft({
    intent: 'Concept',
    data: {
      title: `RAGV2 Hook Create ${uniq}`,
      summary: 'test create hook',
      key_points: ['hook', 'create'],
      use_cases: ['test'],
      links: [],
    },
    raw_chat: `RAGV2 hook create raw chat ${uniq}`,
    embedding: null,
  });

  const created = commitCreateDraft(draft);
  console.log('[TestIndexHooks] 📦 create_result=', JSON.stringify(created, null, 2));

  await waitFor(
    async () => {
      const status = getStatus(created.id);
      return status?.status === 'ready';
    },
    5000,
    'create hook ready status'
  );

  const status = getStatus(created.id);
  const chunkCount = getChunkCount(created.id);
  assert(status?.status === 'ready', 'create_hook 索引状态应为 ready');
  assert(chunkCount > 0, 'create_hook 应生成 chunk');

  return created;
}

async function testMergeHook(createdNote) {
  console.log('[TestIndexHooks] 🧪 case=merge_hook');
  const port = 3901;
  const marker = `RAGV2_MERGE_HOOK_MARKER_${Date.now()}`;
  const serverChild = await startServer(port);

  try {
    const oldContent = fs.readFileSync(createdNote.file_path, 'utf8');
    const baseHash = hashMarkdown(oldContent);
    const finalContent = `${oldContent}\n\n## Merge Hook Marker\n${marker}\n`;

    const res = await fetch(`http://127.0.0.1:${port}/api/notes/apply-merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        note_id: createdNote.id,
        final_content: finalContent,
        base_hash: baseHash,
        backup: false,
      }),
    });

    const json = await res.json();
    console.log('[TestIndexHooks] 📦 merge_response=', JSON.stringify(json, null, 2));

    assert(res.ok, `merge_hook 请求失败: ${json.error || res.status}`);
    assert(json.success === true, 'merge_hook success 应为 true');
    assert(json.index_result?.status === 'ready', 'merge_hook index_result.status 应为 ready');

    await waitFor(
      async () => getChunkMarkerCount(createdNote.id, marker) > 0,
      5000,
      'merge hook chunk marker visible'
    );

    const markerCount = getChunkMarkerCount(createdNote.id, marker);
    assert(markerCount > 0, 'merge_hook 后应能在 chunk 中检索到 marker');
  } finally {
    await stopServer(serverChild);
  }
}

async function run() {
  console.log('[TestIndexHooks] 🚀 开始测试 Task 4 索引写入钩子');
  const created = await testCreateHook();
  await testMergeHook(created);
  console.log('[TestIndexHooks] ✅ 所有 case 通过');
}

run()
  .catch(err => {
    console.error('[TestIndexHooks] ❌ 测试失败:', err.message);
    process.exit(1);
  })
  .finally(() => {
    db.close();
  });


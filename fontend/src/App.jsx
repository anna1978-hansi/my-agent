import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './App.css';
import {
  applyMerge,
  commitCreate,
  getNoteDetail,
  getNotes,
  processChat,
} from './services/api';
import {
  buildMergeSession,
  updateAllHunkState,
  updateHunkState,
} from './utils/diff';

const AGENT_STAGES = [
  '▶ Stage 1: Router 意图分析中...',
  '▶ Stage 2: Worker 结构化提取与 Schema 校验...',
  '▶ Stage 3: Critic 审查与自我纠错中...',
  '▶ Stage 4: Executor 决策 CREATE / MERGE...',
];

const INTENT_META = {
  BugFix: 'BugFix',
  Concept: 'Concept',
  Architecture: 'Architecture',
};

function Sidebar({
  notes,
  loading,
  searchKeyword,
  onSearchChange,
  selectedNoteId,
  onSelectNote,
}) {
  return (
    <aside className="w-72 shrink-0 border-r border-slate-800/70 bg-[radial-gradient(120%_120%_at_0%_0%,#213457_0%,#0d1526_45%,#080d18_100%)] text-slate-100">
      <div className="border-b border-slate-700/60 p-5">
        <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/80">BranchNote</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Local Knowledge Forge</h1>
        <p className="mt-2 text-xs text-slate-300/70">可见化你的 AI 对话沉淀</p>
      </div>

      <div className="p-4">
        <input
          value={searchKeyword}
          onChange={event => onSearchChange(event.target.value)}
          placeholder="搜索标题、标签或内容..."
          className="w-full rounded-xl border border-slate-600/50 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none"
        />
      </div>

      <div className="px-4 pb-3 text-xs uppercase tracking-[0.2em] text-slate-400">Notes</div>
      <div className="h-[calc(100%-230px)] overflow-y-auto px-3 pb-4">
        {loading && notes.length === 0 ? (
          <div className="px-2 py-6 text-center text-sm text-slate-300/70">加载中...</div>
        ) : notes.length === 0 ? (
          <div className="rounded-xl border border-slate-700/50 bg-slate-950/40 px-3 py-4 text-sm text-slate-300/70">
            暂无笔记
          </div>
        ) : (
          <ul className="space-y-2">
            {notes.map(note => (
              <li key={note.id}>
                <button
                  type="button"
                  onClick={() => onSelectNote(note.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                    selectedNoteId === note.id
                      ? 'border-cyan-400/90 bg-cyan-400/12 text-white'
                      : 'border-slate-700/50 bg-slate-950/35 text-slate-200 hover:border-slate-500/80 hover:bg-slate-900/50'
                  }`}
                >
                  <p className="truncate text-sm font-medium">{note.title}</p>
                  <p className="mt-1 text-[11px] text-slate-300/70">{INTENT_META[note.intent] || note.intent}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {note.tags?.slice(0, 3).map(tag => (
                      <span
                        key={`${note.id}-${tag}`}
                        className="rounded bg-slate-800/90 px-1.5 py-0.5 text-[10px] text-cyan-200"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-slate-700/60 px-4 py-3 text-xs text-slate-300/80">
        <span className="text-emerald-300">●</span> SQLite Connected
      </div>
    </aside>
  );
}

function MarkdownViewer({ note, loading, error }) {
  if (loading) {
    return (
      <section className="note-panel flex items-center justify-center rounded-2xl border border-slate-200/80 bg-white/90">
        <p className="text-sm text-slate-500">正在加载笔记内容...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="note-panel flex items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-5 text-center">
        <p className="text-sm text-rose-700">{error}</p>
      </section>
    );
  }

  if (!note) {
    return (
      <section className="note-panel flex items-center justify-center rounded-2xl border border-slate-200/80 bg-white/90 px-5 text-center">
        <p className="text-sm text-slate-500">从左侧选择一篇笔记开始阅读。</p>
      </section>
    );
  }

  return (
    <section className="note-panel overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95">
      <header className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-xl font-semibold text-slate-900">{note.title}</h2>
        <p className="mt-1 text-xs text-slate-500">{note.file_path}</p>
        <p className="mt-1 text-xs text-slate-400">最后更新: {new Date(note.file_mtime).toLocaleString()}</p>
      </header>

      <div className="h-[calc(100%-90px)] overflow-y-auto px-6 py-5">
        <article className="markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{note.markdown_content || ''}</ReactMarkdown>
        </article>
      </div>
    </section>
  );
}

function AgentStage({ visibleCount }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4 font-mono text-xs text-emerald-300">
      <p className="text-slate-400">[System] BranchNote Agent is running...</p>
      <div className="mt-3 space-y-2">
        {AGENT_STAGES.map((stage, index) => (
          <p
            key={stage}
            className={`${visibleCount > index ? 'opacity-100' : 'opacity-20'} transition-opacity duration-300`}
          >
            {stage} {visibleCount > index ? 'Done' : '...'}
          </p>
        ))}
      </div>
    </div>
  );
}

function MergeWorkspace({ session, applying, onAccept, onReject, onAcceptAll, onRejectAll, onApply }) {
  const stats = useMemo(() => {
    const total = session.hunks.length;
    const accepted = session.hunks.filter(hunk => hunk.state === 'accepted').length;
    const rejected = session.hunks.filter(hunk => hunk.state === 'rejected').length;
    const pending = total - accepted - rejected;
    return { total, accepted, rejected, pending };
  }, [session.hunks]);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-amber-200/70 bg-amber-50/85 p-3 text-xs text-amber-900">
        <p className="font-semibold">MERGE 审阅模式</p>
        <p className="mt-1">默认状态是 pending，只有 Accept 的块会写入最终稿。</p>
        <p className="mt-1">
          Hunk: {stats.total} | Accepted: {stats.accepted} | Rejected: {stats.rejected} | Pending: {stats.pending}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAcceptAll}
          className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
        >
          Accept All
        </button>
        <button
          type="button"
          onClick={onRejectAll}
          className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          Reject All
        </button>
      </div>

      <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
        {session.hunks.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            没有检测到差异块，候选结果与原文一致。
          </div>
        ) : (
          session.hunks.map((hunk, index) => (
            <div key={hunk.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-600">Hunk {index + 1}</p>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">{hunk.state}</p>
              </div>

              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-2">
                  <p className="mb-1 text-[11px] text-rose-700">Old</p>
                  <pre className="h-24 overflow-auto whitespace-pre-wrap text-xs text-rose-900">{hunk.oldText || '(空)'}</pre>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                  <p className="mb-1 text-[11px] text-emerald-700">New</p>
                  <pre className="h-24 overflow-auto whitespace-pre-wrap text-xs text-emerald-900">{hunk.newText || '(空)'}</pre>
                </div>
              </div>

              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => onAccept(hunk.id)}
                  className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => onReject(hunk.id)}
                  className="rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  Reject
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <p className="mb-2 text-xs font-semibold text-slate-700">最终稿预览（将写回文件）</p>
        <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-2 text-xs text-slate-800">{session.finalContent}</pre>
      </div>

      <button
        type="button"
        onClick={onApply}
        disabled={applying}
        className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {applying ? '正在应用已接收改动...' : '应用已接收改动'}
      </button>
    </div>
  );
}

function CreateConfirmWorkspace({ draft, committing, onCommit }) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-blue-200 bg-blue-50/90 p-3 text-xs text-blue-900">
        <p className="font-semibold">CREATE 审阅模式（confirm）</p>
        <p className="mt-1">该笔记尚未写入本地文件，确认后才会真正创建。</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-semibold text-slate-700">预览标题</p>
        <p className="mt-1 text-sm text-slate-900">{draft.suggested_title}</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <p className="mb-2 text-xs font-semibold text-slate-700">Markdown 预览</p>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-2 text-xs text-slate-800">{draft.markdown_content}</pre>
      </div>

      <button
        type="button"
        onClick={onCommit}
        disabled={committing}
        className="w-full rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {committing ? '正在创建...' : '确认创建笔记'}
      </button>
    </div>
  );
}

function ResultHint({ result }) {
  if (!result) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
        提交对话后，结果会在这里展示。
      </div>
    );
  }

  if (result.type === 'create_auto') {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 text-sm text-emerald-900">
        <p className="font-semibold">CREATE 已完成</p>
        <p className="mt-1">{result.title}</p>
        <p className="mt-1 text-xs">{result.filePath}</p>
      </div>
    );
  }

  if (result.type === 'merge_applied') {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 text-sm text-emerald-900">
        <p className="font-semibold">MERGE 已应用</p>
        <p className="mt-1 text-xs">{result.filePath}</p>
        {result.backupPath && <p className="mt-1 text-xs">备份: {result.backupPath}</p>}
      </div>
    );
  }

  return null;
}

function AgentWorkspace({
  inputText,
  onInputChange,
  createMode,
  onCreateModeChange,
  onSubmit,
  status,
  stageCount,
  mergeSession,
  onAcceptHunk,
  onRejectHunk,
  onAcceptAll,
  onRejectAll,
  applyingMerge,
  onApplyMerge,
  createDraft,
  committingCreate,
  onCommitCreate,
  resultHint,
  error,
}) {
  return (
    <section className="agent-panel overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95">
      <header className="border-b border-slate-200 px-5 py-4">
        <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Agent Workspace</p>
        <h3 className="mt-1 text-xl font-semibold text-slate-900">可控知识提炼</h3>
      </header>

      <div className="h-[calc(100%-85px)] overflow-y-auto p-5">
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">Raw Chat</label>
          <textarea
            value={inputText}
            onChange={event => onInputChange(event.target.value)}
            placeholder="粘贴你和 AI 的长对话..."
            className="h-40 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-cyan-500 focus:outline-none"
          />

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-600">CREATE 策略:</span>
            <button
              type="button"
              onClick={() => onCreateModeChange('auto')}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                createMode === 'auto'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              auto
            </button>
            <button
              type="button"
              onClick={() => onCreateModeChange('confirm')}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                createMode === 'confirm'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              confirm
            </button>
          </div>

          <button
            type="button"
            onClick={onSubmit}
            disabled={status === 'loading'}
            className="w-full rounded-xl bg-gradient-to-r from-cyan-600 to-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:from-cyan-500 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === 'loading' ? 'Agent 运行中...' : '启动 Agent 任务'}
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {status === 'loading' && <AgentStage visibleCount={stageCount} />}

          {status === 'error' && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error || '请求失败，请检查后端服务'}
            </div>
          )}

          {createDraft && (
            <CreateConfirmWorkspace
              draft={createDraft}
              committing={committingCreate}
              onCommit={onCommitCreate}
            />
          )}

          {mergeSession && (
            <MergeWorkspace
              session={mergeSession}
              applying={applyingMerge}
              onAccept={onAcceptHunk}
              onReject={onRejectHunk}
              onAcceptAll={onAcceptAll}
              onRejectAll={onRejectAll}
              onApply={onApplyMerge}
            />
          )}

          {!createDraft && !mergeSession && status !== 'loading' && <ResultHint result={resultHint} />}
        </div>
      </div>
    </section>
  );
}

export default function App() {
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');

  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [selectedNoteDetail, setSelectedNoteDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const [inputText, setInputText] = useState('');
  const [createMode, setCreateMode] = useState('auto');
  const [agentStatus, setAgentStatus] = useState('idle');
  const [agentError, setAgentError] = useState('');
  const [stageCount, setStageCount] = useState(0);

  const [createDraft, setCreateDraft] = useState(null);
  const [mergeSession, setMergeSession] = useState(null);
  const [resultHint, setResultHint] = useState(null);

  const [committingCreate, setCommittingCreate] = useState(false);
  const [applyingMerge, setApplyingMerge] = useState(false);

  useEffect(() => {
    void refreshNotes('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshNotes(searchKeyword);
    }, 250);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKeyword]);

  useEffect(() => {
    if (agentStatus !== 'loading') {
      setStageCount(0);
      return undefined;
    }

    setStageCount(0);
    const timers = AGENT_STAGES.map((_, index) => (
      setTimeout(() => {
        setStageCount(index + 1);
      }, 800 * (index + 1))
    ));

    return () => timers.forEach(clearTimeout);
  }, [agentStatus]);

  async function refreshNotes(keyword = '') {
    setNotesLoading(true);
    try {
      const response = await getNotes(keyword);
      const nextNotes = Array.isArray(response.notes) ? response.notes : [];
      setNotes(nextNotes);

      const hasCurrent = selectedNoteId && nextNotes.some(note => note.id === selectedNoteId);
      const nextSelectedId = hasCurrent ? selectedNoteId : nextNotes[0]?.id || null;

      if (!nextSelectedId) {
        setSelectedNoteId(null);
        setSelectedNoteDetail(null);
        setDetailError('');
        return;
      }

      if (nextSelectedId !== selectedNoteId) {
        setSelectedNoteId(nextSelectedId);
      }

      await refreshNoteDetail(nextSelectedId);
    } catch (error) {
      console.error(error);
      setDetailError(error.message || '获取笔记列表失败');
    } finally {
      setNotesLoading(false);
    }
  }

  async function refreshNoteDetail(noteId) {
    if (!noteId) {
      return;
    }

    setDetailLoading(true);
    setDetailError('');

    try {
      const detail = await getNoteDetail(noteId);
      setSelectedNoteDetail(detail);
    } catch (error) {
      console.error(error);
      setSelectedNoteDetail(null);
      setDetailError(error.message || '加载笔记详情失败');
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleSelectNote(noteId) {
    if (!noteId) {
      return;
    }

    setSelectedNoteId(noteId);
    await refreshNoteDetail(noteId);
  }

  async function handleSubmit() {
    if (!inputText.trim()) {
      return;
    }

    setAgentStatus('loading');
    setAgentError('');
    setCreateDraft(null);
    setMergeSession(null);
    setResultHint(null);

    try {
      const result = await processChat({
        rawText: inputText,
        createMode,
      });

      const executor = result.executor || {};

      if (executor.action === 'MERGE') {
        const session = buildMergeSession(executor.old_content, executor.proposed_content);
        const nextSession = {
          ...session,
          noteId: executor.note_id,
          filePath: executor.file_path,
          baseHash: executor.base_hash,
        };

        setMergeSession(nextSession);
        if (executor.note_id) {
          setSelectedNoteId(executor.note_id);
          await refreshNoteDetail(executor.note_id);
        }
      } else if (executor.action === 'CREATE' && executor.mode === 'confirm') {
        setCreateDraft(executor.draft);
      } else if (executor.action === 'CREATE' && executor.mode === 'auto') {
        setResultHint({
          type: 'create_auto',
          title: executor.note?.title || '新笔记已创建',
          filePath: executor.note?.file_path,
        });

        await refreshNotes(searchKeyword);
        if (executor.note?.id) {
          setSelectedNoteId(executor.note.id);
          await refreshNoteDetail(executor.note.id);
        }
      }

      setAgentStatus('success');
    } catch (error) {
      console.error(error);
      setAgentStatus('error');
      setAgentError(error.message || '请求失败');
    }
  }

  async function handleCommitCreate() {
    if (!createDraft || committingCreate) {
      return;
    }

    setCommittingCreate(true);
    try {
      const response = await commitCreate(createDraft);
      const note = response.note;

      setResultHint({
        type: 'create_auto',
        title: note?.title || '新笔记已创建',
        filePath: note?.file_path,
      });
      setCreateDraft(null);

      await refreshNotes(searchKeyword);
      if (note?.id) {
        setSelectedNoteId(note.id);
        await refreshNoteDetail(note.id);
      }
    } catch (error) {
      console.error(error);
      setAgentError(error.message || '创建失败');
      setAgentStatus('error');
    } finally {
      setCommittingCreate(false);
    }
  }

  async function handleApplyMerge() {
    if (!mergeSession || applyingMerge) {
      return;
    }

    setApplyingMerge(true);
    try {
      const response = await applyMerge({
        noteId: mergeSession.noteId,
        finalContent: mergeSession.finalContent,
        baseHash: mergeSession.baseHash,
        backup: true,
      });

      setResultHint({
        type: 'merge_applied',
        filePath: response.file_path,
        backupPath: response.backup_path,
      });
      setMergeSession(null);

      await refreshNotes(searchKeyword);
      if (response.note_id) {
        setSelectedNoteId(response.note_id);
        await refreshNoteDetail(response.note_id);
      }
    } catch (error) {
      console.error(error);
      setAgentError(error.message || '应用合并失败');
      setAgentStatus('error');
    } finally {
      setApplyingMerge(false);
    }
  }

  return (
    <div className="app-shell h-full overflow-hidden text-slate-800">
      <div className="h-full bg-[radial-gradient(180%_120%_at_15%_0%,#d9f5ff_0%,#edf2ff_38%,#f7f8fd_76%,#fcfcfe_100%)]">
        <div className="mx-auto flex h-full max-w-[1800px] overflow-hidden p-4 lg:p-5">
          <Sidebar
            notes={notes}
            loading={notesLoading}
            searchKeyword={searchKeyword}
            onSearchChange={setSearchKeyword}
            selectedNoteId={selectedNoteId}
            onSelectNote={handleSelectNote}
          />

          <main className="grid flex-1 grid-cols-1 gap-4 overflow-hidden pl-4 lg:grid-cols-[1.08fr_1fr]">
            <MarkdownViewer
              note={selectedNoteDetail}
              loading={detailLoading}
              error={detailError}
            />

            <AgentWorkspace
              inputText={inputText}
              onInputChange={setInputText}
              createMode={createMode}
              onCreateModeChange={setCreateMode}
              onSubmit={handleSubmit}
              status={agentStatus}
              stageCount={stageCount}
              mergeSession={mergeSession}
              onAcceptHunk={hunkId => setMergeSession(current => updateHunkState(current, hunkId, 'accepted'))}
              onRejectHunk={hunkId => setMergeSession(current => updateHunkState(current, hunkId, 'rejected'))}
              onAcceptAll={() => setMergeSession(current => updateAllHunkState(current, 'accepted'))}
              onRejectAll={() => setMergeSession(current => updateAllHunkState(current, 'rejected'))}
              applyingMerge={applyingMerge}
              onApplyMerge={handleApplyMerge}
              createDraft={createDraft}
              committingCreate={committingCreate}
              onCommitCreate={handleCommitCreate}
              resultHint={resultHint}
              error={agentError}
            />
          </main>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react'
import './App.css'

// ── 输入面板 ──────────────────────────────────────────────
const MODES = [
  { value: 'card', label: '📝 结构化知识卡片' },
  { value: 'deep', label: '🔍 原理与源码深挖' },
  { value: 'pitfall', label: '⚠️ 常见误区与避坑' },
  { value: 'note', label: '🧠 生成学习笔记' },
]

function InputPanel({ inputText, onInputChange, mode, onModeChange, onSubmit, loading }) {
  const tokenEstimate = Math.floor(inputText.length * 0.6)

  return (
    <div className="w-1/2 flex flex-col gap-4 bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex justify-between items-end">
        <label className="text-sm font-medium text-gray-700">粘贴原始对话片段 (Raw Chat)</label>
        <span className="text-xs text-gray-400">预估: {tokenEstimate} Tokens</span>
      </div>

      <textarea
        className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none font-mono text-sm text-gray-600"
        placeholder={"User: 为什么我的 useEffect 一直无限循环？\n\nAssistant: 这通常是因为你在依赖数组中放入了每次渲染都会改变的引用类型对象..."}
        value={inputText}
        onChange={e => onInputChange(e.target.value)}
      />

      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <label className="block text-sm font-medium text-gray-700 mb-2">Agent 整理模式 (Strategy)</label>
        <div className="grid grid-cols-2 gap-3">
          {MODES.map(m => (
            <label key={m.value} className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                name="mode"
                value={m.value}
                checked={mode === m.value}
                onChange={() => onModeChange(m.value)}
                className="text-emerald-500 focus:ring-emerald-500"
              />
              <span className="text-sm">{m.label}</span>
            </label>
          ))}
        </div>
      </div>

      <button
        onClick={onSubmit}
        disabled={loading}
        className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium rounded-lg shadow-sm transition flex justify-center items-center gap-2"
      >
        {loading ? (
          <>
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Agent 运行中...
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            启动 Agent 提炼流水线
          </>
        )}
      </button>
    </div>
  )
}

// ── 输出面板 ──────────────────────────────────────────────
const LOADING_STEPS = [
  '▶ Stage 1: Router 意图分析中... Done',
  '▶ Stage 2: 触发 Worker 提取与强 Schema 校验...',
  '▶ Stage 3: Critic 审查与自我纠错中...',
]

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
      <svg className="w-16 h-16 mb-4 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
      <p>等待知识注入...</p>
    </div>
  )
}

function LoadingState({ visibleSteps }) {
  return (
    <div className="absolute inset-0 bg-slate-900 z-20 flex flex-col p-8 font-mono text-sm text-green-400">
      <div className="mb-4 text-gray-400">[System] Initiating Agent Core Pipeline...</div>
      {LOADING_STEPS.map((text, i) => (
        visibleSteps > i && (
          <div key={i} className="mb-2">
            {text} {i === 0 && <span className="text-yellow-400">Done</span>}
          </div>
        )
      ))}
      {visibleSteps >= 3 && (
        <div className="mt-4 text-white typing">持久化至 SQLite 并生成 RAG 预留索引...</div>
      )}
    </div>
  )
}

const INTENT_META = {
  BugFix:       { label: '🐛 Bug 修复',  color: 'bg-red-100 text-red-700' },
  Concept:      { label: '💡 概念解析',  color: 'bg-blue-100 text-blue-700' },
  Architecture: { label: '🏗️ 架构选型', color: 'bg-purple-100 text-purple-700' },
}

function ResultCard({ result }) {
  const { intent, confidence, score, retries, data } = result
  const meta = INTENT_META[intent] ?? { label: intent, color: 'bg-gray-100 text-gray-700' }
  const fields = Object.entries(data).filter(([k]) => k !== 'title' && k !== 'tags')
  const borderColors = ['border-emerald-500', 'border-blue-500', 'border-purple-500', 'border-yellow-500', 'border-rose-500']

  return (
    <div className="flex-1 flex flex-col p-6 overflow-y-auto fade-in">
      {/* 标题区 */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className={`px-2 py-1 text-xs rounded font-medium ${meta.color}`}>{meta.label}</span>
          <span className="text-xs text-gray-400">置信度 {Math.round(confidence * 100)}%</span>
          <span className={`text-xs font-medium ${score >= 80 ? 'text-emerald-600' : 'text-yellow-600'}`}>
            Critic 评分 {score}
          </span>
          {retries > 0 && <span className="text-xs text-gray-400">重试 {retries} 次</span>}
        </div>
        <h2 className="text-2xl font-bold text-gray-800">{data.title}</h2>
      </div>

      {/* Tags */}
      {data.tags?.length > 0 && (
        <div className="flex gap-2 mb-6 border-b border-gray-100 pb-4 flex-wrap">
          {data.tags.map(tag => (
            <span key={tag} className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">#{tag}</span>
          ))}
        </div>
      )}

      {/* 字段区 */}
      <div className="space-y-5">
        {fields.map(([key, value], i) => (
          <div key={key}>
            <h3 className={`text-sm font-bold text-gray-700 mb-2 border-l-4 ${borderColors[i % borderColors.length]} pl-2`}>
              {key}
            </h3>
            <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
              {Array.isArray(value)
                ? <ul className="list-disc list-inside space-y-1">{value.map((v, j) => <li key={j}>{String(v)}</li>)}</ul>
                : typeof value === 'object' && value !== null
                  ? <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(value, null, 2)}</pre>
                  : String(value)
              }
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function OutputPanel({ status, visibleSteps, resultData }) {
  return (
    <div className="w-1/2 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col relative overflow-hidden">
      {status === 'idle' && <EmptyState />}
      {status === 'loading' && <LoadingState visibleSteps={visibleSteps} />}
      {status === 'success' && resultData && <ResultCard result={resultData} />}
      {status === 'error' && (
        <div className="flex-1 flex flex-col items-center justify-center text-red-400 p-8 text-center">
          <p className="text-lg font-medium mb-2">处理失败</p>
          <p className="text-sm text-gray-500">{resultData?.message || '请检查后端服务是否启动'}</p>
        </div>
      )}
    </div>
  )
}

// ── 左侧边栏 ──────────────────────────────────────────────
function Sidebar() {
  const mockNotes = [
    { id: 1, title: 'React Hooks 闭包陷阱', tag: '前端', active: true },
    { id: 2, title: 'Docker 网络模式梳理', tag: '运维', active: false },
  ]

  return (
    <aside className="w-64 bg-slate-900 text-gray-300 flex flex-col shrink-0">
      {/* Logo */}
      <div className="p-5 border-b border-slate-700">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
          BranchNote
        </h1>
        <p className="text-xs text-slate-400 mt-1">Local AI Knowledge Agent</p>
      </div>

      {/* 搜索框 */}
      <div className="p-4">
        <input
          type="text"
          placeholder="全局检索 (MVP)..."
          className="w-full bg-slate-800 text-sm text-white rounded px-3 py-2 border border-slate-700 focus:outline-none focus:border-emerald-500"
        />
      </div>

      {/* 知识库列表 */}
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">本地知识库</h3>
        <ul className="space-y-2">
          {mockNotes.map(note => (
            <li
              key={note.id}
              className={`p-2 rounded cursor-pointer transition ${
                note.active
                  ? 'bg-slate-800 border-l-2 border-emerald-500'
                  : 'hover:bg-slate-800'
              }`}
            >
              <div className="text-sm text-white truncate">{note.title}</div>
              <div className="text-xs text-slate-400 mt-1">
                <span className="bg-slate-700 px-1 rounded">{note.tag}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* 底部状态 */}
      <div className="p-4 border-t border-slate-700 text-xs text-slate-500 flex justify-between">
        <span>SQLite Connected</span>
        <span className="text-emerald-400">● Online</span>
      </div>
    </aside>
  )
}

// ── 主应用 ────────────────────────────────────────────────
export default function App() {
  const [inputText, setInputText] = useState('')
  const [mode, setMode] = useState('card')
  const [status, setStatus] = useState('idle')       // 'idle' | 'loading' | 'success' | 'error'
  const [visibleSteps, setVisibleSteps] = useState(0)
  const [resultData, setResultData] = useState(null)
  const timersRef = useRef([])

  // loading 时逐步显示终端步骤
  useEffect(() => {
    if (status !== 'loading') return

    setVisibleSteps(0)
    const delays = [800, 1800, 2800, 3600]
    timersRef.current = delays.map((ms, i) =>
      setTimeout(() => setVisibleSteps(i + 1), ms)
    )
    return () => timersRef.current.forEach(clearTimeout)
  }, [status])

  async function handleSubmit() {
    if (!inputText.trim()) return
    setStatus('loading')
    setResultData(null)

    // 动画至少跑满 4s，和真实请求并行，两者都完成才切换状态
    const minDelay = new Promise(r => setTimeout(r, 4000))

    try {
      const [json] = await Promise.all([
        fetch('http://localhost:3000/api/process-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw_text: inputText }),
        }).then(r => r.json()),
        minDelay,
      ])

      if (json.error) throw new Error(json.error)
      setResultData(json)
      setStatus('success')
    } catch (err) {
      setResultData({ message: err.message })
      setStatus('error')
    }
  }

  return (
    <div className="bg-gray-50 text-gray-800 h-full flex overflow-hidden font-sans">
      <Sidebar />

      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center shadow-sm z-10">
          <h2 className="text-lg font-semibold text-gray-700">知识提炼引擎 (Input Layer)</h2>
          <div className="flex gap-3">
            <button className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition">
              导入 JSON
            </button>
            <button className="px-4 py-2 text-sm text-white bg-slate-800 hover:bg-slate-700 rounded-md transition">
              VSCode 插件同步
            </button>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden bg-gray-50 p-6 gap-6">
          <InputPanel
            inputText={inputText}
            onInputChange={setInputText}
            mode={mode}
            onModeChange={setMode}
            onSubmit={handleSubmit}
            loading={status === 'loading'}
          />
          <OutputPanel
            status={status}
            visibleSteps={visibleSteps}
            resultData={resultData}
          />
        </div>
      </main>
    </div>
  )
}

# BranchNote Engine Introduction (MVP Handover)

## 1. Product in One Sentence
BranchNote Engine is a local-first AI knowledge system that converts long AI chat logs into structured Markdown notes, then decides whether to create a new note or merge into an existing one with user-controlled diff acceptance.

## 2. Problem and Value
### Problem
- AI conversations are long and fragmented.
- Valuable insights are hard to revisit.
- Raw Markdown files are not easy to inspect or safely update.

### Core Value
- Automatically distill long chats into reusable technical notes.
- Keep knowledge local (SQLite + local Markdown files).
- Provide Cursor-style merge review so users can accept/reject partial changes before writing.

## 3. Current MVP Scope
### Included
- Agent pipeline: Router -> Worker -> Critic (with retries) -> Executor.
- RAG similarity search over stored note embeddings.
- CREATE and MERGE decision flow.
- Frontend note library + markdown viewer + agent workspace.
- MERGE hunk review with per-hunk accept/reject and final preview.
- Safe merge apply with base hash verification and `.bak` backup.
- CREATE dual mode: `auto` and `confirm`.

### Not Included (yet)
- Full-featured markdown editor.
- Pagination for large note libraries.
- Auth / multi-user / cloud sync.
- Version timeline UI (only `.bak` files for rollback).

## 4. High-Level Architecture
```text
User Input (raw chat)
  -> POST /api/process-chat
      -> Router (intent)
      -> Worker (structured extraction by intent schema)
      -> Critic (score + feedback loop, max 2 retries)
      -> Executor
           -> RAG search (embedding similarity)
           -> if similar: MERGE proposal (old + proposed + base_hash)
           -> else: CREATE (auto write or confirm draft)

Frontend
  -> Notes list (GET /api/notes)
  -> Note detail markdown (GET /api/notes/:id)
  -> Agent workspace (process, create confirm, merge review)
  -> Apply merge (POST /api/notes/apply-merge)
  -> Commit create draft (POST /api/notes/commit-create)

Storage
  -> SQLite: note metadata + structured JSON + embeddings + file path
  -> Local files: markdown notes (+ .bak backup on merge apply)
```

## 5. Agent Layer Details
### Router (`backend/src/agent/router.js`)
- Classifies intent into:
  - `BugFix`
  - `Concept`
  - `Architecture`
- Returns `{ intent, confidence }`.

### Worker (`backend/src/agent/worker.js`)
- Uses intent-specific prompts + Zod schema validation.
- Returns strongly-typed JSON extraction.

### Critic (`backend/src/agent/critic.js`)
- Scores extraction quality (`0-100`) with feedback.
- Pipeline retries Worker when score < 80.

### Pipeline (`backend/src/agent/pipeline.js`)
- Orchestrates Router/Worker/Critic/Executor.
- Retry cap: `MAX_RETRIES = 2`.
- Passes `create_mode` to executor.

### Executor (`backend/src/agent/executor.js`)
- Runs similarity search and decides CREATE/MERGE.
- Current default threshold passed to search: `0.7`.
- MERGE return shape includes:
  - `note_id`
  - `file_path`
  - `old_content`
  - `proposed_content`
  - `base_hash`
- CREATE supports:
  - `mode: auto` -> write immediately
  - `mode: confirm` -> return draft only

## 6. Backend/API Contract (Current)
### `GET /health`
- Service health check.

### `GET /api/notes?q=...`
- Returns note metadata list (no full markdown).

### `GET /api/notes/:id`
- Returns full note detail including `markdown_content`.

### `POST /api/process-chat`
Request:
```json
{ "raw_text": "...", "create_mode": "auto|confirm" }
```
Response includes pipeline fields and `executor` result.

### `POST /api/notes/commit-create`
Request:
```json
{ "draft": { "intent": "...", "data": {}, "raw_chat": "...", "embedding": [], "markdown_content": "..." } }
```
- Persists markdown + DB row.

### `POST /api/notes/apply-merge`
Request:
```json
{ "note_id": "...", "final_content": "...", "base_hash": "sha256:...", "backup": true }
```
Behavior:
- Validates note exists + file exists.
- Validates `base_hash` against current file; mismatch => `409`.
- If `backup=true`, writes `<file>.<timestamp>.bak`.
- Writes `final_content` to original file.

## 7. Data and Storage
### SQLite DB
- File: `backend/data/branchnote.db`
- Table: `knowledge_notes`
- Core columns:
  - `id`, `title`, `intent`, `content`, `tags`, `raw_chat`, `file_path`, `embedding`, `created_at`

### Markdown Files
- Base directory: `/Users/liuzhixuan/Desktop/my-branchNote-test`
- CREATE writes markdown files here.
- MERGE writes to original file path and may produce `.bak` backup file.

## 8. Frontend UX and Modules
### Main UX (`fontend/src/App.jsx`)
Three-panel experience:
1. Notes sidebar: search + note metadata.
2. Note viewer: markdown rendering (`react-markdown` + `remark-gfm`).
3. Agent workspace:
   - Input chat text
   - Choose create mode (`auto` / `confirm`)
   - Run pipeline
   - CREATE confirm preview and commit
   - MERGE hunk review + accept/reject + apply

### Frontend API client (`fontend/src/services/api.js`)
- Centralized fetch wrappers for all backend endpoints.

### Diff/Hunk logic (`fontend/src/utils/diff.js`)
- Uses `diffLines` from `diff` package.
- Hunk states: `pending | accepted | rejected`.
- Final content composition rule:
  - accepted -> use new chunk
  - pending/rejected -> use old chunk
- Empty/blank-only hunks are filtered out.

## 9. Environment and Dependencies
### Root `.env`
- `OPENAI_API_KEY`
- `BASE_URL`
- `MODEL_NAME`
- `DASHSCOPE_API_KEY`
- `DASHSCOPE_baseURL`

### Backend deps
- `express`, `cors`, `openai`, `zod`, `better-sqlite3`, `dotenv`

### Frontend deps
- `react`, `vite`, `tailwindcss`
- `react-markdown`, `remark-gfm`
- `diff`

## 10. Runbook
### Backend
```bash
cd backend
npm install
node src/server.js
```

### Frontend
```bash
cd fontend
npm install
npm run dev
```

## 11. Product PRD Snapshot (MVP + Next)
### Product Goal
Turn messy AI conversations into a reliable local knowledge base with safe, controllable updates.

### Primary User
- Individual developer who frequently chats with AI and wants reusable notes.

### Core User Journey
1. Paste long AI chat.
2. System analyzes and proposes CREATE or MERGE.
3. If MERGE, user selectively accepts changes.
4. Persist to local markdown with rollback safety.
5. Browse/read notes in one UI.

### Success Metrics (suggested)
- Merge acceptance rate (not just auto-apply rate).
- Time from chat paste to usable note.
- Number of notes revisited/read per week.
- Merge rollback rate (`.bak` restore frequency).

## 12. Next Optimization Backlog
### P0 (high impact)
- Improve hunk readability (context lines, syntax highlighting, collapse unchanged blocks).
- Better search ranking (title/tags/content weighting, recency boost).
- Make similarity threshold configurable in UI.
- Add API integration tests for all note endpoints.

### P1
- Manual markdown editor + save.
- Side-by-side markdown preview for create confirm.
- Merge session history and “re-open last proposal”.
- Note-level metadata panel (intent, created_at, merge score).

### P2
- Version timeline (store revisions in DB, not only `.bak` files).
- Background indexing queue for large libraries.
- Plugin/export integration (Obsidian, VS Code, etc.).

## 13. Known Risks / Tech Debt
- Worker output schema and markdown templates are currently bridged by compatibility mapping; needs a single canonical schema in future.
- `.bak` provides file-level rollback but no UI restore flow yet.
- `process-chat` combines expensive LLM + embedding calls synchronously; no queueing yet.
- Some local sandbox environments may block localhost loopback tests; validate on host machine.

## 14. Handover Notes for Another AI
If a new AI assistant has zero context, start from these files in order:
1. `backend/src/server.js` (API surface)
2. `backend/src/agent/pipeline.js` (orchestration)
3. `backend/src/agent/executor.js` (create/merge decision contract)
4. `fontend/src/App.jsx` (end-user workflow)
5. `fontend/src/utils/diff.js` (merge interaction logic)
6. `backend/src/tools/fileManager.js` (markdown generation + create draft/commit)
7. `backend/src/db/notes.js` (metadata access)

This is the current MVP baseline from which detailed optimization can begin.

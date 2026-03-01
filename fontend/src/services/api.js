const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

async function fetchJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof json.error === 'string' ? json.error : '请求失败';
    const error = new Error(message);
    error.status = response.status;
    error.payload = json;
    throw error;
  }

  return json;
}

export function getNotes(query = '') {
  const encoded = encodeURIComponent(query);
  const suffix = query ? `?q=${encoded}` : '';
  return fetchJson(`/api/notes${suffix}`);
}

export function getNoteDetail(noteId) {
  return fetchJson(`/api/notes/${encodeURIComponent(noteId)}`);
}

export function processChat({ rawText, createMode }) {
  return fetchJson('/api/process-chat', {
    method: 'POST',
    body: JSON.stringify({
      raw_text: rawText,
      create_mode: createMode,
    }),
  });
}

export function commitCreate(draft) {
  return fetchJson('/api/notes/commit-create', {
    method: 'POST',
    body: JSON.stringify({ draft }),
  });
}

export function applyMerge({ noteId, finalContent, baseHash, backup = true }) {
  return fetchJson('/api/notes/apply-merge', {
    method: 'POST',
    body: JSON.stringify({
      note_id: noteId,
      final_content: finalContent,
      base_hash: baseHash,
      backup,
    }),
  });
}

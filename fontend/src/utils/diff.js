const HUNK_STATES = new Set(['pending', 'accepted', 'rejected']);

export function buildMergeSession(oldContent, proposedContent) {
  const oldBlocks = splitBlocks(oldContent);
  const newBlocks = splitBlocks(proposedContent);
  const operations = diffBlocks(oldBlocks, newBlocks);

  const segments = [];
  const hunks = [];

  let pointer = 0;
  let hunkCounter = 1;

  while (pointer < operations.length) {
    const current = operations[pointer];

    if (current.type === 'context') {
      const contextBlocks = [];
      while (pointer < operations.length && operations[pointer].type === 'context') {
        contextBlocks.push(operations[pointer].value);
        pointer += 1;
      }
      segments.push({
        type: 'context',
        blocks: contextBlocks,
      });
      continue;
    }

    const oldChunk = [];
    const newChunk = [];

    while (pointer < operations.length && operations[pointer].type !== 'context') {
      const op = operations[pointer];
      if (op.type === 'remove') {
        oldChunk.push(op.value);
      }
      if (op.type === 'add') {
        newChunk.push(op.value);
      }
      pointer += 1;
    }

    const hunkId = `hunk-${hunkCounter}`;
    hunkCounter += 1;

    hunks.push({
      id: hunkId,
      oldText: oldChunk.join('\n\n'),
      newText: newChunk.join('\n\n'),
      oldBlocks: oldChunk,
      newBlocks: newChunk,
      state: 'pending',
    });

    segments.push({
      type: 'hunk',
      hunkId,
    });
  }

  return {
    oldContent: normalizeText(oldContent),
    proposedContent: normalizeText(proposedContent),
    segments,
    hunks,
    finalContent: computeFinalContent(segments, hunks),
  };
}

export function updateHunkState(session, hunkId, nextState) {
  if (!session || !Array.isArray(session.hunks)) {
    return session;
  }

  if (!HUNK_STATES.has(nextState)) {
    throw new Error(`不支持的 hunk state: ${nextState}`);
  }

  const hunks = session.hunks.map(hunk => (
    hunk.id === hunkId
      ? { ...hunk, state: nextState }
      : hunk
  ));

  return {
    ...session,
    hunks,
    finalContent: computeFinalContent(session.segments, hunks),
  };
}

export function updateAllHunkState(session, nextState) {
  if (!session || !Array.isArray(session.hunks)) {
    return session;
  }

  if (!HUNK_STATES.has(nextState)) {
    throw new Error(`不支持的 hunk state: ${nextState}`);
  }

  const hunks = session.hunks.map(hunk => ({
    ...hunk,
    state: nextState,
  }));

  return {
    ...session,
    hunks,
    finalContent: computeFinalContent(session.segments, hunks),
  };
}

function computeFinalContent(segments, hunks) {
  const hunkMap = new Map(hunks.map(hunk => [hunk.id, hunk]));
  const outputBlocks = [];

  for (const segment of segments) {
    if (segment.type === 'context') {
      outputBlocks.push(...segment.blocks);
      continue;
    }

    const hunk = hunkMap.get(segment.hunkId);
    if (!hunk) {
      continue;
    }

    if (hunk.state === 'accepted') {
      outputBlocks.push(...hunk.newBlocks);
    } else {
      outputBlocks.push(...hunk.oldBlocks);
    }
  }

  return outputBlocks.join('\n\n');
}

function splitBlocks(content) {
  const normalized = normalizeText(content);
  if (!normalized) {
    return [];
  }
  return normalized.split(/\n{2,}/);
}

function normalizeText(content) {
  return typeof content === 'string'
    ? content.replace(/\r\n/g, '\n').trim()
    : '';
}

function diffBlocks(oldBlocks, newBlocks) {
  const m = oldBlocks.length;
  const n = newBlocks.length;
  const matrix = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (oldBlocks[i] === newBlocks[j]) {
        matrix[i][j] = matrix[i + 1][j + 1] + 1;
      } else {
        matrix[i][j] = Math.max(matrix[i + 1][j], matrix[i][j + 1]);
      }
    }
  }

  const operations = [];
  let i = 0;
  let j = 0;

  while (i < m && j < n) {
    if (oldBlocks[i] === newBlocks[j]) {
      operations.push({ type: 'context', value: oldBlocks[i] });
      i += 1;
      j += 1;
    } else if (matrix[i + 1][j] >= matrix[i][j + 1]) {
      operations.push({ type: 'remove', value: oldBlocks[i] });
      i += 1;
    } else {
      operations.push({ type: 'add', value: newBlocks[j] });
      j += 1;
    }
  }

  while (i < m) {
    operations.push({ type: 'remove', value: oldBlocks[i] });
    i += 1;
  }

  while (j < n) {
    operations.push({ type: 'add', value: newBlocks[j] });
    j += 1;
  }

  return operations;
}

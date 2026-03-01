import { diffLines } from 'diff';

const HUNK_STATES = new Set(['pending', 'accepted', 'rejected']);

export function buildMergeSession(oldContent, proposedContent) {
  const oldText = normalizeText(oldContent);
  const newText = normalizeText(proposedContent);
  const tokens = diffLines(oldText, newText);

  const segments = [];
  const hunks = [];

  let pointer = 0;
  let hunkCounter = 1;

  while (pointer < tokens.length) {
    const current = tokens[pointer];

    if (!current.added && !current.removed) {
      segments.push({
        type: 'context',
        text: current.value,
      });
      pointer += 1;
      continue;
    }

    let oldChunk = '';
    let newChunk = '';

    while (pointer < tokens.length && (tokens[pointer].added || tokens[pointer].removed)) {
      if (tokens[pointer].removed) {
        oldChunk += tokens[pointer].value;
      }
      if (tokens[pointer].added) {
        newChunk += tokens[pointer].value;
      }
      pointer += 1;
    }

    if (isBlankChunk(oldChunk) && isBlankChunk(newChunk)) {
      continue;
    }

    const hunkId = `hunk-${hunkCounter}`;
    hunkCounter += 1;

    hunks.push({
      id: hunkId,
      oldText: oldChunk,
      newText: newChunk,
      state: 'pending',
    });

    segments.push({
      type: 'hunk',
      hunkId,
    });
  }

  return {
    oldContent: oldText,
    proposedContent: newText,
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

  return segments.map(segment => {
    if (segment.type === 'context') {
      return segment.text;
    }

    const hunk = hunkMap.get(segment.hunkId);
    if (!hunk) {
      return '';
    }

    return hunk.state === 'accepted' ? hunk.newText : hunk.oldText;
  }).join('');
}

function normalizeText(content) {
  return typeof content === 'string'
    ? content.replace(/\r\n/g, '\n')
    : '';
}

function isBlankChunk(value) {
  return typeof value !== 'string' || value.trim().length === 0;
}

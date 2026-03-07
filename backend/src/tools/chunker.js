export const DEFAULT_CHUNKER_OPTIONS = Object.freeze({
  max_chars: 1600,
  target_chars: 1200,
  overlap_chars: 240,
  min_chars: 200,
});

/**
 * 标题感知混合切分：
 * 1) 先按 Markdown 标题分段
 * 2) 超长段按窗口切分（带 overlap）
 * 3) 过短 chunk 合并到同 section 的前一块
 *
 * @param {string} markdown
 * @param {object} [options]
 * @returns {Array<{chunk_index:number, section_path:string, chunk_text:string, char_count:number}>}
 */
export function chunkMarkdown(markdown, options = {}) {
  console.log('[Chunker] 🧩 开始切分 Markdown...');

  if (typeof markdown !== 'string') {
    throw new Error('chunkMarkdown 需要 markdown 字符串');
  }

  const opts = normalizeOptions(options);
  if (markdown.trim().length === 0) {
    console.log('[Chunker] 🧩 输入为空，返回 0 chunks');
    return [];
  }

  const sections = splitIntoSections(markdown);
  console.log(`[Chunker] 🧩 section 数量: ${sections.length}`);

  const rawChunks = [];
  for (const section of sections) {
    const pieces = splitSectionByWindow(section.text, opts);
    for (const piece of pieces) {
      rawChunks.push({
        section_path: section.section_path,
        chunk_text: piece,
        char_count: piece.length,
      });
    }
  }

  const mergedChunks = mergeShortChunks(rawChunks, opts.min_chars);
  const chunks = mergedChunks.map((chunk, idx) => ({
    chunk_index: idx,
    section_path: chunk.section_path,
    chunk_text: chunk.chunk_text,
    char_count: chunk.chunk_text.length,
  }));

  console.log(`[Chunker] ✅ 切分完成，chunk 数量: ${chunks.length}`);
  return chunks;
}

function normalizeOptions(options) {
  const maxChars = readPositiveInt(options.max_chars, DEFAULT_CHUNKER_OPTIONS.max_chars);
  const targetChars = readPositiveInt(options.target_chars, DEFAULT_CHUNKER_OPTIONS.target_chars);
  const overlapChars = readNonNegativeInt(options.overlap_chars, DEFAULT_CHUNKER_OPTIONS.overlap_chars);
  const minChars = readPositiveInt(options.min_chars, DEFAULT_CHUNKER_OPTIONS.min_chars);

  if (targetChars > maxChars) {
    throw new Error('chunker 参数错误：target_chars 不能大于 max_chars');
  }
  if (minChars > targetChars) {
    throw new Error('chunker 参数错误：min_chars 不能大于 target_chars');
  }
  if (overlapChars >= targetChars) {
    throw new Error('chunker 参数错误：overlap_chars 必须小于 target_chars');
  }

  return {
    max_chars: maxChars,
    target_chars: targetChars,
    overlap_chars: overlapChars,
    min_chars: minChars,
  };
}

function readPositiveInt(value, fallback) {
  if (value == null) {
    return fallback;
  }
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('chunker 参数错误：需要正整数');
  }
  return value;
}

function readNonNegativeInt(value, fallback) {
  if (value == null) {
    return fallback;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('chunker 参数错误：需要非负整数');
  }
  return value;
}

function splitIntoSections(markdown) {
  const lines = markdown.split(/\r?\n/);
  const sections = [];
  const headingStack = [];
  let sectionPath = 'ROOT';
  let buffer = [];

  const flush = () => {
    const text = buffer.join('\n').trim();
    if (text.length === 0) {
      return;
    }
    sections.push({
      section_path: sectionPath || 'ROOT',
      text,
    });
  };

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (match) {
      flush();
      const depth = match[1].length;
      const headingTitle = match[2].trim();
      headingStack.length = depth - 1;
      headingStack[depth - 1] = headingTitle;
      sectionPath = headingStack.filter(Boolean).join(' > ') || 'ROOT';
      buffer = [line];
    } else {
      buffer.push(line);
    }
  }

  flush();
  return sections;
}

function splitSectionByWindow(text, opts) {
  if (text.length <= opts.max_chars) {
    return [text];
  }

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const hardEnd = Math.min(start + opts.max_chars, text.length);
    const targetEnd = Math.min(start + opts.target_chars, text.length);
    let cut = chooseCutPosition(text, targetEnd, hardEnd);
    if (cut <= start) {
      cut = hardEnd;
    }

    const piece = text.slice(start, cut).trim();
    if (piece.length > 0) {
      chunks.push(piece);
    }

    if (cut >= text.length) {
      break;
    }

    let nextStart = cut - opts.overlap_chars;
    if (nextStart <= start) {
      nextStart = cut;
    }
    start = nextStart;
  }

  return chunks;
}

function chooseCutPosition(text, targetEnd, hardEnd) {
  if (hardEnd >= text.length) {
    return text.length;
  }

  // 优先尝试在可读边界处切分
  const lookBackwardMin = Math.max(0, targetEnd - 120);
  const candidates = ['\n\n', '\n', '。', '.', '！', '？', '；', ';', '，', ','];

  for (const token of candidates) {
    const idx = text.lastIndexOf(token, hardEnd);
    if (idx >= lookBackwardMin) {
      return idx + token.length;
    }
  }

  return hardEnd;
}

function mergeShortChunks(chunks, minChars) {
  const merged = [];

  for (const chunk of chunks) {
    const text = chunk.chunk_text.trim();
    if (text.length === 0) {
      continue;
    }

    const last = merged[merged.length - 1];
    const canMergeToPrev =
      text.length < minChars &&
      last &&
      last.section_path === chunk.section_path;

    if (canMergeToPrev) {
      last.chunk_text = `${last.chunk_text}\n${text}`.trim();
      continue;
    }

    merged.push({
      section_path: chunk.section_path,
      chunk_text: text,
      char_count: text.length,
    });
  }

  return merged;
}


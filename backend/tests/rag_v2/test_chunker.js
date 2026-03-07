import { chunkMarkdown } from '../../src/tools/chunker.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertThrows(fn, expectedText, label) {
  let ok = false;
  try {
    fn();
  } catch (err) {
    ok = err.message.includes(expectedText);
  }
  assert(ok, `${label} 未抛出预期错误: ${expectedText}`);
}

function testInvalidInputBranch() {
  console.log('[TestChunker] 🧪 case=invalid_input');
  assertThrows(() => chunkMarkdown(null), 'markdown 字符串', 'invalid_input');
}

function testInvalidOptionsBranch() {
  console.log('[TestChunker] 🧪 case=invalid_options');
  assertThrows(
    () => chunkMarkdown('# A', { target_chars: 100, max_chars: 50 }),
    'target_chars 不能大于 max_chars',
    'invalid_options_target_max'
  );
  assertThrows(
    () => chunkMarkdown('# A', { target_chars: 120, overlap_chars: 120, min_chars: 60 }),
    'overlap_chars 必须小于 target_chars',
    'invalid_options_overlap'
  );
}

function testEmptyInputBranch() {
  console.log('[TestChunker] 🧪 case=empty_input');
  const chunks = chunkMarkdown('   \n  ');
  assert(Array.isArray(chunks), 'empty_input 返回值应为数组');
  assert(chunks.length === 0, 'empty_input 应返回空数组');
}

function testHeadingAwareSplitBranch() {
  console.log('[TestChunker] 🧪 case=heading_aware_split');
  const markdown = `
# React
React intro.

## Fiber
Fiber body.

## Scheduler
Scheduler body.
`.trim();

  const chunks = chunkMarkdown(markdown);
  console.log('[TestChunker] 📦 heading_chunks=', JSON.stringify(chunks, null, 2));

  assert(chunks.length >= 3, 'heading_aware_split chunk 数应 >= 3');
  assert(chunks[0].section_path === 'React', '一级标题 section_path 错误');
  assert(chunks.some(c => c.section_path === 'React > Fiber'), '缺少 Fiber section');
  assert(chunks.some(c => c.section_path === 'React > Scheduler'), '缺少 Scheduler section');
}

function testWindowSplitWithOverlapBranch() {
  console.log('[TestChunker] 🧪 case=window_split_with_overlap');
  const body = `# LongDoc\n${'A'.repeat(700)}\n${'B'.repeat(700)}\n${'C'.repeat(700)}`;
  const chunks = chunkMarkdown(body, {
    max_chars: 500,
    target_chars: 400,
    overlap_chars: 80,
    min_chars: 100,
  });
  console.log('[TestChunker] 📦 window_chunks=', JSON.stringify(chunks, null, 2));

  assert(chunks.length > 1, 'window_split_with_overlap 应切成多个 chunk');
  for (const chunk of chunks) {
    assert(chunk.char_count <= 500, 'chunk 长度不应超过 max_chars');
  }

  const hasOverlapPattern =
    chunks.length >= 2 &&
    chunks[0].chunk_text.slice(-80).trim().length > 0 &&
    chunks[1].chunk_text.slice(0, 120).trim().length > 0;
  assert(hasOverlapPattern, 'window_split_with_overlap 未体现 overlap 片段');
}

function testShortChunkMergeBranch() {
  console.log('[TestChunker] 🧪 case=short_chunk_merge');
  const markdown = `
# MergeCase
${'X'.repeat(620)}
small-tail
`.trim();

  const chunks = chunkMarkdown(markdown, {
    max_chars: 360,
    target_chars: 300,
    overlap_chars: 60,
    min_chars: 120,
  });
  console.log('[TestChunker] 📦 merge_chunks=', JSON.stringify(chunks, null, 2));

  assert(chunks.length >= 2, 'short_chunk_merge 预期至少 2 块');
  const tinyChunks = chunks.filter(c => c.char_count < 120);
  assert(tinyChunks.length === 0, 'short_chunk_merge 不应留下过短 chunk');
}

function testRootSectionBranch() {
  console.log('[TestChunker] 🧪 case=root_section');
  const markdown = 'No heading paragraph one.\n\nNo heading paragraph two.';
  const chunks = chunkMarkdown(markdown);
  console.log('[TestChunker] 📦 root_chunks=', JSON.stringify(chunks, null, 2));

  assert(chunks.length >= 1, 'root_section 至少有一个 chunk');
  assert(chunks[0].section_path === 'ROOT', '无标题文档应归入 ROOT');
}

function run() {
  console.log('[TestChunker] 🚀 开始测试 Task 2 Chunker');
  testInvalidInputBranch();
  testInvalidOptionsBranch();
  testEmptyInputBranch();
  testHeadingAwareSplitBranch();
  testWindowSplitWithOverlapBranch();
  testShortChunkMergeBranch();
  testRootSectionBranch();
  console.log('[TestChunker] ✅ 所有 case 通过');
}

run();

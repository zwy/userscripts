import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadCore } from './extract-core.mjs';

test('normalizeChapterLabel: mixed naming fills stable sequence numbers', () => {
  const core = loadCore();
  const rows = [
    { index: 1, name: '序章' },
    { index: 2, name: '第2章 风起' },
    { index: 3, name: '003' },
  ];
  const normalized = rows.map((r, i) => core.normalizeChapterLabel(r, i + 1));
  assert.equal(normalized[0].seq, 1);
  assert.equal(normalized[1].seq, 2);
  assert.equal(normalized[2].seq, 3);
});

test('normalizeChapterLabel: zero sequence falls back to order index', () => {
  const core = loadCore();
  const normalized = core.normalizeChapterLabel({ name: '第0章 起始' }, 5);
  assert.equal(core.extractChapterSeq('第0章 起始'), 0);
  assert.equal(normalized.seq, 5);
  assert.equal(normalized.seqPadded, '0005');
});

test('default split config matches the 3000/2000/1000 contract', () => {
  const core = loadCore();
  assert.equal(core.DEFAULT_SPLIT_CONFIG.splitThreshold, 3000);
  assert.equal(core.DEFAULT_SPLIT_CONFIG.targetSize, 2000);
  assert.equal(core.DEFAULT_SPLIT_CONFIG.mergeThreshold, 1000);
});

test('splitChapterByThreshold: long chapters split near the 2000 target with numbered suffixes', () => {
  const core = loadCore();
  const paragraphs = [
    'A'.repeat(1000),
    'B'.repeat(1000),
    'C'.repeat(1000),
    'D'.repeat(1000),
    'E'.repeat(600),
  ];

  const parts = core.splitChapterByThreshold('第十章 风起', paragraphs, {
    splitThreshold: 3000,
    targetSize: 2000,
    mergeThreshold: 1000,
  });

  assert.equal(parts.length, 2);
  assert.equal(parts[0].title, '第十章 风起【1】');
  assert.equal(parts[1].title, '第十章 风起【2】');
  assert.equal(parts[0].paragraphs.join('').length, 2000);
  assert.equal(parts[1].paragraphs.join('').length, 2600);
});

test('splitChapterByThreshold: tail shorter than 1000 merges into the previous part', () => {
  const core = loadCore();
  const paragraphs = [
    'A'.repeat(1000),
    'B'.repeat(1000),
    'C'.repeat(1000),
    'D'.repeat(1000),
    'E'.repeat(700),
  ];

  const parts = core.splitChapterByThreshold('第十一章 夜雨', paragraphs, {
    splitThreshold: 3000,
    targetSize: 2000,
    mergeThreshold: 1000,
  });

  assert.equal(parts.length, 2);
  assert.equal(parts[1].paragraphs.join('').length, 2700);
  assert.ok(parts[1].paragraphs.join('').endsWith('E'.repeat(700)));
});

test('splitChapterByThreshold: tiny tail does not merge into an oversized previous part', () => {
  const core = loadCore();
  const paragraphs = [
    'A'.repeat(5000),
    'B'.repeat(500),
  ];

  const parts = core.splitChapterByThreshold('第十二章 余波', paragraphs, {
    splitThreshold: 3000,
    targetSize: 2000,
    mergeThreshold: 1000,
  });

  assert.equal(parts.length, 2);
  assert.equal(parts[0].paragraphs.join('').length, 5000);
  assert.equal(parts[1].paragraphs.join('').length, 500);
});

test('runDownloadPipeline: retries only failed targets and keeps final placeholders', async () => {
  const core = loadCore();
  const targets = [
    { index: 1, name: '第1章', url: '/1' },
    { index: 2, name: '第2章', url: '/2' },
    { index: 3, name: '第3章', url: '/3' },
  ];
  const calls = new Map(targets.map(target => [target.url, 0]));

  const out = await core.runDownloadPipeline(targets, {
    retryRounds: 1,
    fetcher: async chapter => {
      calls.set(chapter.url, calls.get(chapter.url) + 1);
      if (chapter.url === '/2') throw new Error('network down');
      if (chapter.url === '/3' && calls.get(chapter.url) === 1) throw new Error('transient');
      return [`正文:${chapter.name}`];
    }
  });

  assert.equal(calls.get('/1'), 1);
  assert.equal(calls.get('/2'), 2);
  assert.equal(calls.get('/3'), 2);
  assert.equal(out.failedChapters.length, 1);
  assert.equal(out.failedChapters[0].name, '第2章');
  assert.equal(out.resolvedChapters.length, 3);
  assert.equal(out.resolvedChapters[1].failed, true);
  assert.match(out.resolvedChapters[1].paragraphs.join('\n'), /【本章获取失败】/);
  assert.match(out.resolvedChapters[1].paragraphs.join('\n'), /network down/);
  assert.equal(out.resolvedChapters[2].failed, false);
});

test('runDownloadPipeline: emits progress callbacks in attempt order', async () => {
  const core = loadCore();
  const targets = [
    { index: 1, name: '第1章', url: '/1' },
    { index: 2, name: '第2章', url: '/2' },
    { index: 3, name: '第3章', url: '/3' },
  ];
  const events = [];
  const calls = new Map(targets.map(target => [target.url, 0]));

  await core.runDownloadPipeline(targets, {
    retryRounds: 1,
    fetcher: async chapter => {
      calls.set(chapter.url, calls.get(chapter.url) + 1);
      if (chapter.url === '/2') throw new Error('network down');
      if (chapter.url === '/3' && calls.get(chapter.url) === 1) throw new Error('transient');
      return [`正文:${chapter.name}`];
    },
    onProgress: event => {
      events.push({
        url: event.target.url,
        round: event.round,
        success: event.success,
        completedAttempts: event.completedAttempts,
        scheduledAttempts: event.scheduledAttempts,
      });
    }
  });

  assert.deepEqual(events.map(e => `${e.round}:${e.url}:${e.success ? 'ok' : 'fail'}`), [
    '1:/1:ok',
    '1:/2:fail',
    '1:/3:fail',
    '2:/2:fail',
    '2:/3:ok',
  ]);
  assert.deepEqual(events.map(e => e.completedAttempts), [1, 2, 3, 4, 5]);
  assert.deepEqual(events.map(e => e.scheduledAttempts), [3, 3, 3, 5, 5]);
});

test('fetchChapterParagraphs: clears poll interval when hard timeout fails', async () => {
  const source = fs.readFileSync(new URL('../alicesw-novel-downloader.user.js', import.meta.url), 'utf8');
  const start = source.indexOf('function fetchChapterParagraphs(url, retry = 0) {');
  const end = source.indexOf('    // ════════════════════════════════════════════════════\n    // EPUB 生成工具', start);
  assert.ok(start >= 0 && end > start, 'fetchChapterParagraphs source not found');

  const fnSource = source.slice(start, end);
  const iframe = { style: {}, parentNode: null, setAttribute() {}, onload: null, onerror: null };
  const timers = [];
  const intervals = new Set();
  const clearStats = { timeout: 0, interval: 0 };

  const context = {
    document: {
      body: {
        appendChild(node) {
          node.parentNode = this;
        },
        removeChild(node) {
          node.parentNode = null;
        }
      },
      createElement(tag) {
        assert.equal(tag, 'iframe');
        return iframe;
      }
    },
    setTimeout(fn, ms) {
      const handle = { fn, ms };
      timers.push(handle);
      return handle;
    },
    clearTimeout() {
      clearStats.timeout += 1;
    },
    setInterval(fn, ms) {
      const handle = { fn, ms };
      intervals.add(handle);
      return handle;
    },
    clearInterval(handle) {
      clearStats.interval += 1;
      intervals.delete(handle);
    },
    CONFIG: { retryMax: 0, retryDelay: 0 },
    CONTENT_SELECTORS: [],
    NOISE: new Set(),
    extractParagraphsFromEl() {
      return null;
    },
    console,
    Error,
    globalThis: {}
  };

  vm.runInNewContext(`${fnSource}\nglobalThis.__fn = fetchChapterParagraphs;`, context, { filename: 'fetchChapterParagraphs.vm' });

  const promise = context.globalThis.__fn('https://example.test/chapter');
  assert.equal(typeof iframe.onload, 'function');
  iframe.onload();
  assert.equal(intervals.size, 1);

  const timeout = timers.find(timer => timer.ms === 15000);
  assert.ok(timeout, 'hard timeout was not scheduled');
  timeout.fn();

  await assert.rejects(promise, /加载超时/);
  assert.equal(clearStats.interval, 1);
  assert.equal(intervals.size, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
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

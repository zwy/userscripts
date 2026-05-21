import fs from 'node:fs';
import vm from 'node:vm';

export function loadCore() {
  const file = new URL('../alicesw-novel-downloader.user.js', import.meta.url);
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf('// CORE_START');
  const end = source.indexOf('// CORE_END');

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('CORE region not found');
  }

  const coreSource = source.slice(start, end);
  const context = {
    globalThis: {},
    console,
  };

  vm.runInNewContext(coreSource, context, { filename: 'alicesw-core.vm' });

  if (!context.globalThis.__ALICESW_CORE__) {
    throw new Error('__ALICESW_CORE__ not exposed');
  }

  return context.globalThis.__ALICESW_CORE__;
}

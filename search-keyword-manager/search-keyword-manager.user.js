// ==UserScript==
// @name         Search Keyword Manager
// @name:zh-CN   搜索词管理器
// @namespace    https://github.com/zwy/userscripts
// @version      1.0.0
// @description  Personal search keyword manager. Add/delete keywords, click to copy, usage count sorting, import/export support.
// @description:zh-CN  个人搜索词管理器。支持添加/删除搜索词，点击复制，按使用次数排序，导入/导出功能。
// @author       zwy
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────────────────────
  const STORAGE_KEY = 'skm_keywords';
  const PANEL_VISIBLE_KEY = 'skm_panel_visible';
  const TOGGLE_POS_KEY = 'skm_toggle_pos';

  // ── Detect search input ───────────────────────────────────────────────────
  function hasSearchInput() {
    const selectors = [
      'input[type="search"]',
      'input[name="q"]',
      'input[name="query"]',
      'input[name="keyword"]',
      'input[name="search"]',
      'input[name="s"]',
      'input[name="wd"]',
      'input[name="w"]',
      'input[id*="search" i]',
      'input[class*="search" i]',
      'input[placeholder*="搜索" i]',
      'input[placeholder*="search" i]',
      'input[aria-label*="search" i]',
      'input[aria-label*="搜索" i]',
      '[role="search"] input',
      'form[role="search"] input',
      'form[action*="search"] input[type="text"]',
    ];
    return document.querySelector(selectors.join(',')) !== null;
  }

  // ── Storage helpers ───────────────────────────────────────────────────────
  function loadKeywords() {
    try {
      const raw = GM_getValue(STORAGE_KEY, '[]');
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  function saveKeywords(list) {
    GM_setValue(STORAGE_KEY, JSON.stringify(list));
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  GM_addStyle(/* css */`
    #skm-toggle {
      position: fixed;
      z-index: 2147483646;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #01696f;
      color: #fff;
      border: none;
      cursor: pointer;
      box-shadow: 0 2px 10px rgba(0,0,0,.25);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      transition: background 180ms, transform 180ms;
      user-select: none;
      touch-action: none;
    }
    #skm-toggle:hover { background: #0c4e54; transform: scale(1.08); }
    #skm-toggle:active { transform: scale(0.95); }

    #skm-panel {
      position: fixed;
      z-index: 2147483647;
      bottom: 80px;
      right: 16px;
      width: 320px;
      max-height: 520px;
      background: #f7f6f2;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,.18);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      color: #28251d;
      transition: opacity 180ms, transform 180ms;
    }
    #skm-panel.skm-hidden {
      opacity: 0;
      pointer-events: none;
      transform: translateY(8px);
    }

    #skm-header {
      display: flex;
      align-items: center;
      padding: 12px 14px 10px;
      border-bottom: 1px solid #dcd9d5;
      gap: 8px;
    }
    #skm-title {
      flex: 1;
      font-weight: 600;
      font-size: 13px;
      letter-spacing: .02em;
      color: #28251d;
    }
    .skm-header-btn {
      background: none;
      border: none;
      cursor: pointer;
      color: #7a7974;
      padding: 4px 6px;
      border-radius: 6px;
      font-size: 12px;
      transition: background 150ms, color 150ms;
      white-space: nowrap;
    }
    .skm-header-btn:hover { background: #edeae5; color: #28251d; }

    #skm-add-row {
      display: flex;
      gap: 6px;
      padding: 10px 12px 8px;
      border-bottom: 1px solid #dcd9d5;
    }
    #skm-add-input {
      flex: 1;
      padding: 6px 10px;
      border: 1px solid #d4d1ca;
      border-radius: 8px;
      font-size: 13px;
      outline: none;
      background: #fff;
      color: #28251d;
      transition: border-color 150ms, box-shadow 150ms;
    }
    #skm-add-input:focus {
      border-color: #01696f;
      box-shadow: 0 0 0 2px rgba(1,105,111,.15);
    }
    #skm-add-btn {
      padding: 6px 12px;
      background: #01696f;
      color: #fff;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: background 150ms;
      white-space: nowrap;
    }
    #skm-add-btn:hover { background: #0c4e54; }
    #skm-add-btn:active { background: #0f3638; }

    #skm-sort-row {
      display: flex;
      align-items: center;
      padding: 6px 12px 4px;
      gap: 6px;
    }
    #skm-sort-label {
      font-size: 11px;
      color: #7a7974;
      flex: 1;
    }
    #skm-sort-select {
      font-size: 11px;
      border: 1px solid #d4d1ca;
      border-radius: 6px;
      padding: 2px 6px;
      background: #fff;
      color: #28251d;
      cursor: pointer;
      outline: none;
    }
    #skm-sort-select:focus { border-color: #01696f; }

    #skm-list {
      flex: 1;
      overflow-y: auto;
      padding: 4px 8px 8px;
    }
    #skm-list::-webkit-scrollbar { width: 4px; }
    #skm-list::-webkit-scrollbar-thumb { background: #dcd9d5; border-radius: 4px; }

    .skm-empty {
      text-align: center;
      color: #bab9b4;
      padding: 24px 12px;
      font-size: 13px;
    }

    .skm-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 6px;
      border-radius: 8px;
      transition: background 120ms;
    }
    .skm-item:hover { background: #edeae5; }

    .skm-copy-btn {
      flex: 1;
      text-align: left;
      background: none;
      border: none;
      cursor: pointer;
      font-size: 13px;
      color: #28251d;
      padding: 3px 4px;
      border-radius: 6px;
      transition: color 120ms;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .skm-copy-btn:hover { color: #01696f; }
    .skm-copy-btn:active { color: #0c4e54; }

    .skm-count {
      font-size: 11px;
      color: #bab9b4;
      min-width: 20px;
      text-align: right;
      flex-shrink: 0;
    }
    .skm-count.skm-has-count { color: #7a7974; }

    .skm-del-btn {
      background: none;
      border: none;
      cursor: pointer;
      color: #bab9b4;
      padding: 2px 4px;
      border-radius: 4px;
      font-size: 14px;
      line-height: 1;
      transition: color 120ms, background 120ms;
      flex-shrink: 0;
    }
    .skm-del-btn:hover { color: #a12c7b; background: #e0ced7; }

    .skm-toast {
      position: fixed;
      z-index: 2147483647;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(0);
      background: #28251d;
      color: #f7f6f2;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 13px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 200ms;
      white-space: nowrap;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .skm-toast.skm-toast-show { opacity: 1; }

    #skm-footer {
      padding: 8px 12px;
      border-top: 1px solid #dcd9d5;
      display: flex;
      gap: 6px;
      justify-content: flex-end;
    }
    #skm-footer .skm-footer-btn {
      background: none;
      border: 1px solid #d4d1ca;
      color: #7a7974;
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 6px;
      cursor: pointer;
      transition: background 150ms, color 150ms, border-color 150ms;
    }
    #skm-footer .skm-footer-btn:hover {
      background: #edeae5;
      color: #28251d;
      border-color: #bab9b4;
    }

    @media (prefers-color-scheme: dark) {
      #skm-panel {
        background: #1c1b19;
        color: #cdccca;
        box-shadow: 0 8px 32px rgba(0,0,0,.5);
      }
      #skm-header, #skm-add-row, #skm-footer { border-color: #393836; }
      #skm-add-input { background: #201f1d; border-color: #393836; color: #cdccca; }
      #skm-add-input:focus { border-color: #4f98a3; }
      #skm-sort-select { background: #201f1d; border-color: #393836; color: #cdccca; }
      .skm-item:hover { background: #22211f; }
      .skm-copy-btn { color: #cdccca; }
      .skm-copy-btn:hover { color: #4f98a3; }
      .skm-count.skm-has-count { color: #797876; }
      .skm-del-btn { color: #5a5957; }
      .skm-del-btn:hover { color: #d163a7; background: #4c3d46; }
      .skm-header-btn:hover { background: #2d2c2a; color: #cdccca; }
      #skm-footer .skm-footer-btn { border-color: #393836; color: #797876; }
      #skm-footer .skm-footer-btn:hover { background: #2d2c2a; color: #cdccca; border-color: #5a5957; }
      .skm-empty { color: #5a5957; }
      #skm-title { color: #cdccca; }
      .skm-toast { background: #cdccca; color: #1c1b19; }
    }
  `);

  // ── Toast ─────────────────────────────────────────────────────────────────
  let toastEl = null;
  let toastTimer = null;

  function showToast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'skm-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('skm-toast-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('skm-toast-show'), 1800);
  }

  // ── State ─────────────────────────────────────────────────────────────────
  let keywords = loadKeywords();
  let sortMode = 'count'; // 'count' | 'alpha' | 'recent'
  let panelVisible = GM_getValue(PANEL_VISIBLE_KEY, false);

  // ── Render list ───────────────────────────────────────────────────────────
  function getSortedKeywords() {
    const list = [...keywords];
    if (sortMode === 'count') {
      list.sort((a, b) => (b.count || 0) - (a.count || 0));
    } else if (sortMode === 'alpha') {
      list.sort((a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' }));
    } else if (sortMode === 'recent') {
      list.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
    }
    return list;
  }

  function renderList() {
    const listEl = document.getElementById('skm-list');
    if (!listEl) return;

    const sorted = getSortedKeywords();

    if (sorted.length === 0) {
      listEl.innerHTML = '<div class="skm-empty">还没有搜索词，添加一个吧</div>';
      return;
    }

    listEl.innerHTML = '';
    sorted.forEach((kw) => {
      const item = document.createElement('div');
      item.className = 'skm-item';
      item.dataset.id = kw.id;

      const copyBtn = document.createElement('button');
      copyBtn.className = 'skm-copy-btn';
      copyBtn.textContent = kw.text;
      copyBtn.title = `点击复制：${kw.text}`;
      copyBtn.addEventListener('click', () => copyKeyword(kw.id));

      const countEl = document.createElement('span');
      countEl.className = 'skm-count' + (kw.count ? ' skm-has-count' : '');
      countEl.textContent = kw.count || 0;
      countEl.title = `已使用 ${kw.count || 0} 次`;

      const delBtn = document.createElement('button');
      delBtn.className = 'skm-del-btn';
      delBtn.textContent = '×';
      delBtn.title = '删除';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteKeyword(kw.id);
      });

      item.appendChild(copyBtn);
      item.appendChild(countEl);
      item.appendChild(delBtn);
      listEl.appendChild(item);
    });
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  function addKeyword(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (keywords.some((k) => k.text === trimmed)) {
      showToast('该搜索词已存在');
      return;
    }
    keywords.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text: trimmed,
      count: 0,
      addedAt: Date.now(),
      lastUsed: 0,
    });
    saveKeywords(keywords);
    renderList();
  }

  function deleteKeyword(id) {
    keywords = keywords.filter((k) => k.id !== id);
    saveKeywords(keywords);
    renderList();
    showToast('已删除');
  }

  function copyKeyword(id) {
    const kw = keywords.find((k) => k.id === id);
    if (!kw) return;
    GM_setClipboard(kw.text);
    kw.count = (kw.count || 0) + 1;
    kw.lastUsed = Date.now();
    saveKeywords(keywords);
    renderList();
    showToast(`已复制：${kw.text}`);
  }

  // ── Import / Export ───────────────────────────────────────────────────────
  function exportKeywords() {
    const data = JSON.stringify(keywords, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'search-keywords.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('已导出');
  }

  function importKeywords() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target.result);
          if (!Array.isArray(imported)) throw new Error('invalid format');
          let added = 0;
          imported.forEach((item) => {
            const text = (item.text || '').trim();
            if (!text) return;
            if (keywords.some((k) => k.text === text)) return;
            keywords.push({
              id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
              text,
              count: item.count || 0,
              addedAt: item.addedAt || Date.now(),
              lastUsed: item.lastUsed || 0,
            });
            added++;
          });
          saveKeywords(keywords);
          renderList();
          showToast(`已导入 ${added} 个搜索词`);
        } catch {
          showToast('导入失败：格式错误');
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  // ── Build UI ──────────────────────────────────────────────────────────────
  function buildUI() {
    // Toggle button
    const toggle = document.createElement('button');
    toggle.id = 'skm-toggle';
    toggle.title = '搜索词管理器';
    toggle.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>`;

    // Restore position
    const savedPos = GM_getValue(TOGGLE_POS_KEY, null);
    if (savedPos) {
      toggle.style.right = savedPos.right + 'px';
      toggle.style.bottom = savedPos.bottom + 'px';
    } else {
      toggle.style.right = '16px';
      toggle.style.bottom = '24px';
    }

    // Drag logic
    let dragging = false, startX, startY, startRight, startBottom;
    toggle.addEventListener('mousedown', (e) => {
      dragging = false;
      startX = e.clientX;
      startY = e.clientY;
      const rect = toggle.getBoundingClientRect();
      startRight = window.innerWidth - rect.right;
      startBottom = window.innerHeight - rect.bottom;

      function onMove(ev) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragging = true;
        if (!dragging) return;
        const newRight = Math.max(0, Math.min(window.innerWidth - 44, startRight - dx));
        const newBottom = Math.max(0, Math.min(window.innerHeight - 44, startBottom - dy));
        toggle.style.right = newRight + 'px';
        toggle.style.bottom = newBottom + 'px';
        // Keep panel near toggle
        updatePanelPos();
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (dragging) {
          GM_setValue(TOGGLE_POS_KEY, {
            right: parseFloat(toggle.style.right),
            bottom: parseFloat(toggle.style.bottom),
          });
        }
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    toggle.addEventListener('click', () => {
      if (dragging) return;
      panelVisible = !panelVisible;
      GM_setValue(PANEL_VISIBLE_KEY, panelVisible);
      panel.classList.toggle('skm-hidden', !panelVisible);
      if (panelVisible) {
        updatePanelPos();
        renderList();
      }
    });

    // Panel
    const panel = document.createElement('div');
    panel.id = 'skm-panel';
    if (!panelVisible) panel.classList.add('skm-hidden');

    // Header
    panel.innerHTML = `
      <div id="skm-header">
        <span id="skm-title">🔍 搜索词管理器</span>
        <button class="skm-header-btn" id="skm-close-btn" title="关闭">✕</button>
      </div>
      <div id="skm-add-row">
        <input id="skm-add-input" type="text" placeholder="输入搜索词…" maxlength="100" />
        <button id="skm-add-btn">添加</button>
      </div>
      <div id="skm-sort-row">
        <span id="skm-sort-label">排序方式</span>
        <select id="skm-sort-select">
          <option value="count">使用次数</option>
          <option value="recent">最近使用</option>
          <option value="alpha">字母顺序</option>
        </select>
      </div>
      <div id="skm-list"></div>
      <div id="skm-footer">
        <button class="skm-footer-btn" id="skm-import-btn">导入</button>
        <button class="skm-footer-btn" id="skm-export-btn">导出</button>
      </div>
    `;

    document.body.appendChild(toggle);
    document.body.appendChild(panel);

    // Events
    document.getElementById('skm-close-btn').addEventListener('click', () => {
      panelVisible = false;
      GM_setValue(PANEL_VISIBLE_KEY, false);
      panel.classList.add('skm-hidden');
    });

    const addInput = document.getElementById('skm-add-input');
    const addBtn = document.getElementById('skm-add-btn');
    addBtn.addEventListener('click', () => {
      addKeyword(addInput.value);
      addInput.value = '';
      addInput.focus();
    });
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        addKeyword(addInput.value);
        addInput.value = '';
      }
    });

    document.getElementById('skm-sort-select').addEventListener('change', (e) => {
      sortMode = e.target.value;
      renderList();
    });

    document.getElementById('skm-import-btn').addEventListener('click', importKeywords);
    document.getElementById('skm-export-btn').addEventListener('click', exportKeywords);

    if (panelVisible) renderList();
  }

  function updatePanelPos() {
    const toggle = document.getElementById('skm-toggle');
    const panel = document.getElementById('skm-panel');
    if (!toggle || !panel) return;
    const tRight = parseFloat(toggle.style.right) || 16;
    const tBottom = parseFloat(toggle.style.bottom) || 24;
    panel.style.right = Math.max(8, tRight - 140) + 'px';
    panel.style.bottom = tBottom + 48 + 'px';
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    if (!hasSearchInput()) return;
    buildUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Small delay for SPAs that inject search inputs after DOM ready
    setTimeout(init, 800);
  }
})();

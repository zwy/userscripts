// ==UserScript==
// @name         alicesw章节目录导出工具
// @namespace    https://www.alicesw.com/
// @version      1.2
// @description  在 alicesw.com 章节目录页面，一键提取所有章节名称和链接，支持导出为 JSON / CSV / TXT / Markdown
// @author       zwy
// @match        https://www.alicesw.com/other/chapters/id/*.html
// @match        https://alicesw.com/other/chapters/id/*.html
// @match        https://www.alicesw.org/other/chapters/id/*.html
// @match        https://alicesw.org/other/chapters/id/*.html
// @grant        GM_setClipboard
// @grant        GM_download
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/zwy/userscripts/main/alicesw-chapter-exporter/alicesw-chapter-exporter.user.js
// @downloadURL  https://raw.githubusercontent.com/zwy/userscripts/main/alicesw-chapter-exporter/alicesw-chapter-exporter.user.js
// ==/UserScript==

(function () {
    'use strict';

    // ─── 工具函数 ───────────────────────────────────────────────

    /** 获取书名（从面包屑导航提取） */
    function getBookTitle() {
        const crumbs = document.querySelectorAll('.bread-crumbs li a');
        for (const a of crumbs) {
            const href = a.getAttribute('href') || '';
            if (href.startsWith('/novel/')) return a.textContent.trim();
        }
        // 备选：从 <title> 提取
        const t = document.title;
        const m = t.match(/章节列表-(.+?)-/);
        return m ? m[1] : '未知书名';
    }

    /** 提取所有章节 [{index, name, url}] */
    function extractChapters() {
        const BASE = location.origin;
        const items = document.querySelectorAll('.mulu_list li a');
        return Array.from(items).map((a, i) => ({
            index: i + 1,
            name: a.textContent.trim().replace(/\s+/g, ' '),
            url: a.href.startsWith('http') ? a.href : BASE + a.getAttribute('href')
        }));
    }

    // ─── 格式转换 ────────────────────────────────────────────────

    function toJSON(chapters, bookTitle) {
        return JSON.stringify({ bookTitle, totalChapters: chapters.length, chapters }, null, 2);
    }

    function toCSV(chapters, bookTitle) {
        const header = '序号,章节名称,章节链接';
        const rows = chapters.map(c =>
            `${c.index},"${c.name.replace(/"/g, '""')}",${c.url}`
        );
        return [header, ...rows].join('\n');
    }

    function toTXT(chapters, bookTitle) {
        const header = `书名：${bookTitle}\n章节总数：${chapters.length}\n${'─'.repeat(40)}\n`;
        const body = chapters.map(c => `[${c.index}] ${c.name}\n    ${c.url}`).join('\n\n');
        return header + body;
    }

    function toMarkdown(chapters, bookTitle) {
        const header = `# ${bookTitle} — 章节目录\n\n共 ${chapters.length} 章\n\n`;
        const tableHead = '| 序号 | 章节名称 | 链接 |\n|------|----------|------|\n';
        const rows = chapters.map(c =>
            `| ${c.index} | ${c.name} | [阅读](${c.url}) |`
        ).join('\n');
        return header + tableHead + rows;
    }

    // ─── 下载 / 复制 ─────────────────────────────────────────────

    function downloadFile(content, filename, mime) {
        const blob = new Blob(['\uFEFF' + content], { type: mime + ';charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function copyToClipboard(text) {
        if (typeof GM_setClipboard === 'function') {
            GM_setClipboard(text);
        } else {
            navigator.clipboard.writeText(text).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            });
        }
    }

    // ─── UI 面板 ─────────────────────────────────────────────────

    function createPanel() {
        // 浮动触发按钮
        const fab = document.createElement('button');
        fab.id = 'chapterExportFab';
        fab.textContent = '📋 导出章节目录';
        Object.assign(fab.style, {
            position: 'fixed', bottom: '24px', right: '24px', zIndex: 99999,
            padding: '10px 16px', background: '#4f46e5', color: '#fff',
            border: 'none', borderRadius: '8px', cursor: 'pointer',
            fontSize: '14px', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            transition: 'background 0.2s'
        });
        fab.onmouseenter = () => fab.style.background = '#4338ca';
        fab.onmouseleave = () => fab.style.background = '#4f46e5';

        // 主面板
        const panel = document.createElement('div');
        panel.id = 'chapterExportPanel';
        Object.assign(panel.style, {
            display: 'none', position: 'fixed', bottom: '80px', right: '24px',
            zIndex: 99998, width: '320px', background: '#fff', color: '#333',
            borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            padding: '20px', fontFamily: 'system-ui, sans-serif', fontSize: '14px'
        });

        panel.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                <strong style="font-size:16px">📚 章节导出工具</strong>
                <span id="cpClose" style="cursor:pointer;font-size:18px;line-height:1">✕</span>
            </div>
            <div id="cpInfo" style="background:#f3f4f6;border-radius:6px;padding:10px;margin-bottom:14px;line-height:1.6"></div>
            <p style="margin:0 0 8px;font-weight:bold;color:#555">选择导出格式：</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
                <button class="cpBtn" data-fmt="json"  style="background:#10b981">💾 JSON</button>
                <button class="cpBtn" data-fmt="csv"   style="background:#3b82f6">📊 CSV（Excel）</button>
                <button class="cpBtn" data-fmt="txt"   style="background:#f59e0b">📄 TXT 文本</button>
                <button class="cpBtn" data-fmt="md"    style="background:#8b5cf6">✍️ Markdown</button>
            </div>
            <p style="margin:0 0 8px;font-weight:bold;color:#555">快速复制到剪贴板：</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <button class="cpCopy" data-fmt="txt"  style="background:#6b7280">📋 复制TXT</button>
                <button class="cpCopy" data-fmt="md"   style="background:#6b7280">📋 复制MD</button>
                <button class="cpCopy" data-fmt="json" style="background:#6b7280">📋 复制JSON</button>
                <button class="cpCopy" data-fmt="url"  style="background:#6b7280">🔗 仅复制链接</button>
            </div>
            <div id="cpMsg" style="margin-top:10px;text-align:center;color:#10b981;font-weight:bold;min-height:20px"></div>
        `;

        // 按钮通用样式
        panel.querySelectorAll('.cpBtn, .cpCopy').forEach(btn => {
            Object.assign(btn.style, {
                border: 'none', color: '#fff', padding: '8px 4px',
                borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
                fontWeight: 'bold', transition: 'opacity 0.15s'
            });
            btn.onmouseenter = () => btn.style.opacity = '0.85';
            btn.onmouseleave = () => btn.style.opacity = '1';
        });

        document.body.appendChild(fab);
        document.body.appendChild(panel);

        // ─── 事件绑定 ─────────────────────────────────────────

        const bookTitle = getBookTitle();
        let chapters = [];

        fab.addEventListener('click', () => {
            const isOpen = panel.style.display === 'block';
            panel.style.display = isOpen ? 'none' : 'block';
            if (!isOpen) {
                chapters = extractChapters();
                document.getElementById('cpInfo').innerHTML =
                    `<b>书名：</b>${bookTitle}<br>` +
                    `<b>章节总数：</b>${chapters.length} 章`;
            }
        });

        document.getElementById('cpClose').addEventListener('click', () => {
            panel.style.display = 'none';
        });

        function showMsg(text) {
            const el = document.getElementById('cpMsg');
            el.textContent = text;
            setTimeout(() => el.textContent = '', 2500);
        }

        function safeFileName(name) {
            return name.replace(/[\\/:*?"<>|]/g, '_').substring(0, 60);
        }

        // 下载按钮
        panel.querySelectorAll('.cpBtn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!chapters.length) chapters = extractChapters();
                const fmt = btn.dataset.fmt;
                const safe = safeFileName(bookTitle);
                const map = {
                    json: [toJSON(chapters, bookTitle), `${safe}.json`, 'application/json'],
                    csv:  [toCSV(chapters, bookTitle),  `${safe}.csv`,  'text/csv'],
                    txt:  [toTXT(chapters, bookTitle),  `${safe}.txt`,  'text/plain'],
                    md:   [toMarkdown(chapters, bookTitle), `${safe}.md`, 'text/markdown'],
                };
                const [content, filename, mime] = map[fmt];
                downloadFile(content, filename, mime);
                showMsg(`✅ 已下载 ${filename}`);
            });
        });

        // 复制按钮
        panel.querySelectorAll('.cpCopy').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!chapters.length) chapters = extractChapters();
                const fmt = btn.dataset.fmt;
                let text = '';
                if (fmt === 'txt')  text = toTXT(chapters, bookTitle);
                if (fmt === 'md')   text = toMarkdown(chapters, bookTitle);
                if (fmt === 'json') text = toJSON(chapters, bookTitle);
                if (fmt === 'url')  text = chapters.map(c => c.url).join('\n');
                copyToClipboard(text);
                showMsg('✅ 已复制到剪贴板！');
            });
        });
    }

    // ─── 初始化 ───────────────────────────────────────────────────
    createPanel();

})();

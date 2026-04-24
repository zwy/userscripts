// ==UserScript==
// @name         alicesw小说章节下载器
// @namespace    https://www.alicesw.com/
// @version      1.1
// @description  在 alicesw.com 章节目录页，批量下载每章小说内容为独立TXT，或合并为整本TXT（适配番茄小说导入）
// @author       zwy
// @match        https://www.alicesw.com/other/chapters/id/*.html
// @match        https://alicesw.com/other/chapters/id/*.html
// @match        https://www.alicesw.org/other/chapters/id/*.html
// @match        https://alicesw.org/other/chapters/id/*.html
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      www.alicesw.com
// @connect      alicesw.com
// @connect      www.alicesw.org
// @connect      alicesw.org
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/zwy/userscripts/main/alicesw-novel-downloader/alicesw-novel-downloader.user.js
// @downloadURL  https://raw.githubusercontent.com/zwy/userscripts/main/alicesw-novel-downloader/alicesw-novel-downloader.user.js
// ==/UserScript==

(function () {
    'use strict';

    // ─── 配置 ─────────────────────────────────────────────────────────
    const CONFIG = {
        delay: 1500,      // 每章请求间隔(ms)，防封IP，建议不低于1000
        retryMax: 3,      // 失败重试次数
        retryDelay: 3000, // 重试等待(ms)
    };

    // ─── 工具函数 ──────────────────────────────────────────────────────

    function getBookTitle() {
        const crumbs = document.querySelectorAll('.bread-crumbs li a');
        for (const a of crumbs) {
            if ((a.getAttribute('href') || '').startsWith('/novel/')) return a.textContent.trim();
        }
        const m = document.title.match(/章节列表-(.+?)-/);
        return m ? m[1] : '未知书名';
    }

    function extractChapters() {
        const BASE = location.origin;
        return Array.from(document.querySelectorAll('.mulu_list li a')).map((a, i) => ({
            index: i + 1,
            name: a.textContent.trim().replace(/\s+/g, ' '),
            url: a.href.startsWith('http') ? a.href : BASE + a.getAttribute('href')
        }));
    }

    function safeFileName(str) {
        return str.replace(/[\\/:*?"<>|]/g, '_').substring(0, 80);
    }

    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    // ─── 正文解析（分章 & 合并共用）──────────────────────────────────────

    /**
     * 从章节详情页 HTML 中提取纯文本段落数组
     * @returns {string[]|null}
     */
    function parseChapterParagraphs(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const contentEl = doc.querySelector('.j_readContent, .read-content');
        if (!contentEl) return null;
        contentEl.querySelectorAll('script, style, ins, iframe').forEach(el => el.remove());
        const NOISE = new Set(['加载中...', '使用手机扫码阅读', '']);
        const paras = [];
        contentEl.querySelectorAll('p').forEach(p => {
            const text = p.textContent.trim();
            if (!NOISE.has(text)) paras.push(text);
        });
        return paras.length ? paras : null;
    }

    /**
     * 格式化为独立章节 TXT（每章一个文件）
     */
    function formatSingleChapter(chapterName, paragraphs) {
        return `${chapterName}\n${'═'.repeat(50)}\n\n${paragraphs.join('\n\n')}\n\n${'─'.repeat(50)}\n`;
    }

    /**
     * 格式化为整本合并格式（适配番茄小说）
     * 番茄小说识别「第X章」作为章节跳转锚点
     */
    function formatMergedChapter(chapterName, paragraphs) {
        return `\n${chapterName}\n\n${paragraphs.join('\n\n')}\n`;
    }

    // ─── 网络请求（带重试）────────────────────────────────────────────────

    function fetchChapterParagraphs(url, retryCount = 0) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                headers: { 'User-Agent': navigator.userAgent, 'Referer': location.origin },
                onload(resp) {
                    if (resp.status !== 200) {
                        return retry(new Error(`HTTP ${resp.status}`));
                    }
                    const paras = parseChapterParagraphs(resp.responseText);
                    if (!paras) return retry(new Error('正文提取失败'));
                    resolve(paras);
                },
                onerror() { retry(new Error('网络请求失败')); }
            });
            function retry(err) {
                if (retryCount < CONFIG.retryMax) {
                    setTimeout(() => fetchChapterParagraphs(url, retryCount + 1).then(resolve).catch(reject), CONFIG.retryDelay);
                } else {
                    reject(err);
                }
            }
        });
    }

    // ─── 文件下载 ────────────────────────────────────────────────────────

    function downloadTxt(content, filename) {
        const blob = new Blob(['\uFEFF' + content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1500);
    }

    // ─── UI ──────────────────────────────────────────────────────────────

    function createUI() {
        // 浮动按钮
        const fab = document.createElement('button');
        fab.textContent = '📥 下载小说';
        Object.assign(fab.style, {
            position: 'fixed', bottom: '24px', left: '24px', zIndex: 99999,
            padding: '10px 16px', background: '#059669', color: '#fff',
            border: 'none', borderRadius: '8px', cursor: 'pointer',
            fontSize: '14px', fontWeight: 'bold',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)', transition: 'background 0.2s'
        });
        fab.onmouseenter = () => fab.style.background = '#047857';
        fab.onmouseleave = () => fab.style.background = '#059669';

        // 主面板
        const panel = document.createElement('div');
        Object.assign(panel.style, {
            display: 'none', position: 'fixed', bottom: '80px', left: '24px',
            zIndex: 99998, width: '350px', background: '#fff', color: '#333',
            borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            padding: '20px', fontFamily: 'system-ui, sans-serif', fontSize: '14px',
            maxHeight: '85vh', overflowY: 'auto'
        });

        panel.innerHTML = `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
  <strong style="font-size:15px">📥 小说章节下载器 <span style="font-size:11px;color:#9ca3af">v1.1</span></strong>
  <span id="dlClose" style="cursor:pointer;font-size:20px">✕</span>
</div>

<div id="dlBookInfo" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:10px;margin-bottom:14px;line-height:1.8;font-size:13px"></div>

<!-- 范围 -->
<p style="margin:0 0 6px;font-weight:bold;color:#555">下载范围：</p>
<div style="display:flex;gap:12px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
  <label><input type="radio" name="dlRange" value="all" checked> 全部章节</label>
  <label><input type="radio" name="dlRange" value="range"> 指定范围</label>
</div>
<div id="dlRangeInputs" style="display:none;gap:8px;align-items:center;margin-bottom:10px">
  <span>第</span>
  <input id="dlFrom" type="number" min="1" style="width:58px;padding:4px;border:1px solid #ddd;border-radius:4px">
  <span>章 到 第</span>
  <input id="dlTo" type="number" min="1" style="width:58px;padding:4px;border:1px solid #ddd;border-radius:4px">
  <span>章</span>
</div>

<!-- 间隔 -->
<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
  <span style="color:#555">请求间隔：</span>
  <input id="dlDelay" type="number" min="500" max="10000" value="1500"
    style="width:68px;padding:4px;border:1px solid #ddd;border-radius:4px">
  <span style="color:#888;font-size:12px">ms（建议≥1000）</span>
</div>

<!-- 分隔线 -->
<div style="border-top:1px solid #e5e7eb;margin-bottom:14px"></div>

<!-- 模式按钮区 -->
<p style="margin:0 0 8px;font-weight:bold;color:#555">选择下载模式：</p>
<div style="display:flex;gap:8px;margin-bottom:8px">
  <button id="dlStart" style="flex:1;padding:10px 6px;background:#059669;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px">▶ 分章下载<br><span style="font-weight:normal;font-size:10px">每章一个TXT</span></button>
  <button id="dlMerge" style="flex:1;padding:10px 6px;background:#7c3aed;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px">📖 合并整本TXT<br><span style="font-weight:normal;font-size:10px">适配番茄小说导入</span></button>
  <button id="dlStop" style="flex:0 0 64px;padding:10px 4px;background:#ef4444;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px;display:none">⏹<br>停止</button>
</div>

<!-- 进度区 -->
<div id="dlProgressWrap" style="display:none">
  <div style="display:flex;justify-content:space-between;margin-bottom:4px">
    <span id="dlProgressText" style="font-size:12px;color:#555"></span>
    <span id="dlProgressPct" style="font-size:12px;font-weight:bold"></span>
  </div>
  <div style="background:#e5e7eb;border-radius:999px;height:8px;overflow:hidden;margin-bottom:8px">
    <div id="dlProgressBar" style="height:100%;width:0%;transition:width 0.3s;border-radius:999px"></div>
  </div>
  <div id="dlLog" style="height:130px;overflow-y:auto;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:8px;font-size:11px;color:#555;font-family:monospace;line-height:1.6"></div>
</div>`;

        document.body.appendChild(fab);
        document.body.appendChild(panel);

        // ── 状态 ──
        const bookTitle = getBookTitle();
        let chapters = [];
        let isRunning = false;
        let shouldStop = false;
        let successCount = 0;
        let failCount = 0;

        // ── 初始化 ──
        fab.addEventListener('click', () => {
            const open = panel.style.display === 'block';
            panel.style.display = open ? 'none' : 'block';
            if (!open && !chapters.length) {
                chapters = extractChapters();
                document.getElementById('dlBookInfo').innerHTML =
                    `<b>书名：</b>${bookTitle}<br><b>总章节数：</b>${chapters.length} 章`;
                document.getElementById('dlTo').value = chapters.length;
                document.getElementById('dlFrom').value = 1;
            }
        });
        document.getElementById('dlClose').addEventListener('click', () => { panel.style.display = 'none'; });
        panel.querySelectorAll('input[name="dlRange"]').forEach(r => {
            r.addEventListener('change', () => {
                document.getElementById('dlRangeInputs').style.display = r.value === 'range' ? 'flex' : 'none';
            });
        });

        // ── 辅助 ──
        function setProgressColor(color) {
            document.getElementById('dlProgressBar').style.background = color;
            document.getElementById('dlProgressPct').style.color = color;
        }
        function log(msg, color = '#555') {
            const el = document.getElementById('dlLog');
            const line = document.createElement('div');
            line.style.color = color;
            line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
            el.appendChild(line);
            el.scrollTop = el.scrollHeight;
        }
        function updateProgress(done, total, color = '#059669') {
            const pct = total > 0 ? Math.round(done / total * 100) : 0;
            document.getElementById('dlProgressBar').style.width = pct + '%';
            document.getElementById('dlProgressBar').style.background = color;
            document.getElementById('dlProgressPct').style.color = color;
            document.getElementById('dlProgressPct').textContent = pct + '%';
            document.getElementById('dlProgressText').textContent =
                `已完成 ${done}/${total}（✅${successCount} ❌${failCount}）`;
        }
        function getTargets() {
            if (!chapters.length) chapters = extractChapters();
            const rangeVal = panel.querySelector('input[name="dlRange"]:checked').value;
            if (rangeVal === 'all') return chapters;
            const from = parseInt(document.getElementById('dlFrom').value) || 1;
            const to   = parseInt(document.getElementById('dlTo').value)   || chapters.length;
            return chapters.slice(from - 1, to);
        }
        function enterRunning(color = '#059669') {
            isRunning = true; shouldStop = false; successCount = 0; failCount = 0;
            const delay = Math.max(500, parseInt(document.getElementById('dlDelay').value) || 1500);
            CONFIG.delay = delay;
            document.getElementById('dlStart').style.display = 'none';
            document.getElementById('dlMerge').style.display = 'none';
            document.getElementById('dlStop').style.display  = 'block';
            document.getElementById('dlStop').disabled = false;
            document.getElementById('dlStop').textContent = '⏹\n停止';
            document.getElementById('dlProgressWrap').style.display = 'block';
            document.getElementById('dlLog').innerHTML = '';
            setProgressColor(color);
            return delay;
        }
        function exitRunning() {
            isRunning = false; shouldStop = false;
            document.getElementById('dlStart').style.display = 'block';
            document.getElementById('dlMerge').style.display = 'block';
            document.getElementById('dlStop').style.display  = 'none';
        }

        // ──────────────────────────────────────────────────────────────
        // 模式一：分章下载（每章独立TXT）
        // ──────────────────────────────────────────────────────────────
        document.getElementById('dlStart').addEventListener('click', async () => {
            if (isRunning) return;
            const targets = getTargets();
            if (!targets.length) { alert('没有找到章节，请检查范围设置'); return; }
            const delay = enterRunning('#059669');
            log(`【分章下载】《${bookTitle}》共 ${targets.length} 章，间隔 ${delay}ms`, '#059669');

            for (let i = 0; i < targets.length; i++) {
                if (shouldStop) { log('⏹ 已停止', '#ef4444'); break; }
                const ch = targets[i];
                const paddedIdx = String(ch.index).padStart(4, '0');
                const filename  = `${safeFileName(bookTitle)}_${paddedIdx}_${safeFileName(ch.name)}.txt`;
                log(`↓ [${i+1}/${targets.length}] ${ch.name}`);
                updateProgress(i, targets.length, '#059669');
                try {
                    const paras = await fetchChapterParagraphs(ch.url);
                    downloadTxt(formatSingleChapter(ch.name, paras), filename);
                    successCount++;
                    log(`✅ ${ch.name}`, '#059669');
                } catch(err) {
                    failCount++;
                    log(`❌ ${ch.name} — ${err.message}`, '#ef4444');
                }
                updateProgress(i+1, targets.length, '#059669');
                if (i < targets.length - 1 && !shouldStop) await sleep(delay);
            }
            exitRunning();
            log(`─── 分章下载完成！✅${successCount} ❌${failCount} ───`, '#1d4ed8');
        });

        // ──────────────────────────────────────────────────────────────
        // 模式二：合并整本TXT（番茄小说导入格式）
        // ──────────────────────────────────────────────────────────────
        document.getElementById('dlMerge').addEventListener('click', async () => {
            if (isRunning) return;
            const targets = getTargets();
            if (!targets.length) { alert('没有找到章节，请检查范围设置'); return; }
            const delay = enterRunning('#7c3aed');
            log(`【合并整本】《${bookTitle}》共 ${targets.length} 章，间隔 ${delay}ms`, '#7c3aed');
            log(`下载完成后将自动生成一个整本TXT文件，可直接导入番茄小说`, '#9ca3af');

            // 按顺序抓取所有章节内容，暂存在内存中
            const chapterContents = []; // [{name, text}]

            for (let i = 0; i < targets.length; i++) {
                if (shouldStop) { log('⏹ 已停止', '#ef4444'); break; }
                const ch = targets[i];
                log(`↓ [${i+1}/${targets.length}] ${ch.name}`);
                updateProgress(i, targets.length, '#7c3aed');
                try {
                    const paras = await fetchChapterParagraphs(ch.url);
                    chapterContents.push({ name: ch.name, text: formatMergedChapter(ch.name, paras) });
                    successCount++;
                    log(`✅ ${ch.name}`, '#059669');
                } catch(err) {
                    failCount++;
                    // 失败章节插入占位，保证顺序完整
                    chapterContents.push({ name: ch.name, text: `\n${ch.name}\n\n【本章获取失败，请手动补全】\n` });
                    log(`❌ ${ch.name} — ${err.message}`, '#ef4444');
                }
                updateProgress(i+1, targets.length, '#7c3aed');
                if (i < targets.length - 1 && !shouldStop) await sleep(delay);
            }

            if (chapterContents.length > 0) {
                // 组装整本内容：书名封面 + 各章节
                const cover = `${bookTitle}\n\n作者：（alicesw.com）\n章节数：${chapterContents.length} 章\n\n${'━'.repeat(50)}\n`;
                const body  = chapterContents.map(c => c.text).join('\n');
                const fullText = cover + body;
                const filename = `${safeFileName(bookTitle)}_完整版.txt`;
                downloadTxt(fullText, filename);
                log(`📖 整本TXT已生成：${filename}`, '#7c3aed');
                log(`💡 导入方法：传文件到手机 → 番茄小说 → 书架 → + → 导入本地书籍`, '#9ca3af');
            }

            exitRunning();
            log(`─── 合并完成！✅${successCount} ❌${failCount} ───`, '#1d4ed8');
        });

        // ── 停止 ──
        document.getElementById('dlStop').addEventListener('click', () => {
            shouldStop = true;
            document.getElementById('dlStop').textContent = '停止中';
            document.getElementById('dlStop').disabled = true;
        });
    }

    createUI();

})();

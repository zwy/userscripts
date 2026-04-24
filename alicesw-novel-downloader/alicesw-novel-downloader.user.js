// ==UserScript==
// @name         alicesw小说章节下载器
// @namespace    https://www.alicesw.com/
// @version      1.0
// @description  在 alicesw.com 章节目录页，批量下载每章小说内容为独立TXT文件，支持队列下载、进度显示、速率控制
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
        delay: 1500,          // 每章请求间隔(ms)，防封IP，建议不低于1000
        retryMax: 3,          // 失败重试次数
        retryDelay: 3000,     // 重试等待(ms)
        batchSize: 1,         // 每次并发数（建议保持1，顺序下载）
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

    /** 从章节详情页HTML中提取纯文本正文 */
    function parseChapterContent(html, chapterName) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // 提取正文区域
        const contentEl = doc.querySelector('.j_readContent, .read-content');
        if (!contentEl) return null;

        // 移除广告、脚本、样式等干扰元素
        contentEl.querySelectorAll('script, style, ins, iframe').forEach(el => el.remove());

        // 提取所有段落
        const paragraphs = [];
        contentEl.querySelectorAll('p').forEach(p => {
            const text = p.textContent.trim();
            if (text && text !== '加载中...' && text !== '使用手机扫码阅读' && text.length > 0) {
                paragraphs.push(text);
            }
        });

        if (!paragraphs.length) return null;

        // 组装TXT内容
        const header = `${chapterName}\n${'═'.repeat(50)}\n\n`;
        const body = paragraphs.join('\n\n');
        const footer = `\n\n${'─'.repeat(50)}\n`;
        return header + body + footer;
    }

    /** 下载单章内容，带重试 */
    function fetchChapter(url, chapterName, retryCount = 0) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                headers: {
                    'User-Agent': navigator.userAgent,
                    'Referer': location.origin,
                },
                onload(resp) {
                    if (resp.status !== 200) {
                        if (retryCount < CONFIG.retryMax) {
                            setTimeout(() => {
                                fetchChapter(url, chapterName, retryCount + 1).then(resolve).catch(reject);
                            }, CONFIG.retryDelay);
                        } else {
                            reject(new Error(`HTTP ${resp.status}`));
                        }
                        return;
                    }
                    const content = parseChapterContent(resp.responseText, chapterName);
                    if (!content) {
                        if (retryCount < CONFIG.retryMax) {
                            setTimeout(() => {
                                fetchChapter(url, chapterName, retryCount + 1).then(resolve).catch(reject);
                            }, CONFIG.retryDelay);
                        } else {
                            reject(new Error('正文提取失败'));
                        }
                        return;
                    }
                    resolve(content);
                },
                onerror() {
                    if (retryCount < CONFIG.retryMax) {
                        setTimeout(() => {
                            fetchChapter(url, chapterName, retryCount + 1).then(resolve).catch(reject);
                        }, CONFIG.retryDelay);
                    } else {
                        reject(new Error('网络请求失败'));
                    }
                }
            });
        });
    }

    /** 下载TXT文件到本地 */
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

    // ─── UI 面板 ───────────────────────────────────────────────────────

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
            zIndex: 99998, width: '340px', background: '#fff', color: '#333',
            borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            padding: '20px', fontFamily: 'system-ui, sans-serif', fontSize: '14px',
            maxHeight: '80vh', overflowY: 'auto'
        });

        panel.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
                <strong style="font-size:15px">📥 小说章节下载器</strong>
                <span id="dlClose" style="cursor:pointer;font-size:20px">✕</span>
            </div>
            <div id="dlBookInfo" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:10px;margin-bottom:14px;line-height:1.8;font-size:13px"></div>

            <p style="margin:0 0 6px;font-weight:bold;color:#555">下载范围：</p>
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
                <label><input type="radio" name="dlRange" value="all" checked> 全部章节</label>
                <label><input type="radio" name="dlRange" value="range"> 指定范围</label>
            </div>
            <div id="dlRangeInputs" style="display:none;gap:8px;align-items:center;margin-bottom:10px">
                <span>第</span>
                <input id="dlFrom" type="number" min="1" style="width:60px;padding:4px;border:1px solid #ddd;border-radius:4px">
                <span>章 到 第</span>
                <input id="dlTo" type="number" min="1" style="width:60px;padding:4px;border:1px solid #ddd;border-radius:4px">
                <span>章</span>
            </div>

            <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
                <span style="color:#555">请求间隔：</span>
                <input id="dlDelay" type="number" min="500" max="10000" value="1500"
                    style="width:70px;padding:4px;border:1px solid #ddd;border-radius:4px">
                <span style="color:#888">ms（建议≥1000）</span>
            </div>

            <div style="display:flex;gap:8px;margin-bottom:14px">
                <button id="dlStart" style="flex:1;padding:10px;background:#059669;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;font-size:13px">▶ 开始下载</button>
                <button id="dlStop" style="flex:0 0 80px;padding:10px;background:#ef4444;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;font-size:13px;display:none">⏹ 停止</button>
            </div>

            <div id="dlProgressWrap" style="display:none">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                    <span id="dlProgressText" style="font-size:12px;color:#555"></span>
                    <span id="dlProgressPct" style="font-size:12px;color:#059669;font-weight:bold"></span>
                </div>
                <div style="background:#e5e7eb;border-radius:999px;height:8px;overflow:hidden;margin-bottom:8px">
                    <div id="dlProgressBar" style="height:100%;background:#059669;width:0%;transition:width 0.3s;border-radius:999px"></div>
                </div>
                <div id="dlLog" style="height:130px;overflow-y:auto;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:8px;font-size:11px;color:#555;font-family:monospace;line-height:1.6"></div>
            </div>
        `;

        document.body.appendChild(fab);
        document.body.appendChild(panel);

        const bookTitle = getBookTitle();
        let chapters = [];
        let isRunning = false;
        let shouldStop = false;
        let successCount = 0;
        let failCount = 0;

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

        document.getElementById('dlClose').addEventListener('click', () => {
            panel.style.display = 'none';
        });

        panel.querySelectorAll('input[name="dlRange"]').forEach(radio => {
            radio.addEventListener('change', () => {
                document.getElementById('dlRangeInputs').style.display =
                    radio.value === 'range' ? 'flex' : 'none';
            });
        });

        function log(msg, color = '#555') {
            const el = document.getElementById('dlLog');
            const line = document.createElement('div');
            line.style.color = color;
            line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
            el.appendChild(line);
            el.scrollTop = el.scrollHeight;
        }

        function updateProgress(done, total) {
            const pct = total > 0 ? Math.round(done / total * 100) : 0;
            document.getElementById('dlProgressBar').style.width = pct + '%';
            document.getElementById('dlProgressPct').textContent = pct + '%';
            document.getElementById('dlProgressText').textContent =
                `已完成 ${done}/${total}（✅${successCount} ❌${failCount}）`;
        }

        document.getElementById('dlStart').addEventListener('click', async () => {
            if (isRunning) return;
            if (!chapters.length) chapters = extractChapters();

            const rangeVal = panel.querySelector('input[name="dlRange"]:checked').value;
            let targets = [];
            if (rangeVal === 'all') {
                targets = chapters;
            } else {
                const from = parseInt(document.getElementById('dlFrom').value) || 1;
                const to = parseInt(document.getElementById('dlTo').value) || chapters.length;
                targets = chapters.slice(from - 1, to);
            }

            if (!targets.length) { alert('没有找到章节，请检查范围设置'); return; }

            const delay = Math.max(500, parseInt(document.getElementById('dlDelay').value) || 1500);
            CONFIG.delay = delay;

            isRunning = true;
            shouldStop = false;
            successCount = 0;
            failCount = 0;

            document.getElementById('dlStart').style.display = 'none';
            document.getElementById('dlStop').style.display = 'block';
            document.getElementById('dlStop').disabled = false;
            document.getElementById('dlStop').textContent = '⏹ 停止';
            document.getElementById('dlProgressWrap').style.display = 'block';
            document.getElementById('dlLog').innerHTML = '';

            log(`开始下载《${bookTitle}》，共 ${targets.length} 章，间隔 ${delay}ms`, '#059669');

            for (let i = 0; i < targets.length; i++) {
                if (shouldStop) { log('⏹ 已停止', '#ef4444'); break; }

                const ch = targets[i];
                const paddedIndex = String(ch.index).padStart(4, '0');
                const filename = `${safeFileName(bookTitle)}_${paddedIndex}_${safeFileName(ch.name)}.txt`;

                log(`↓ [${i + 1}/${targets.length}] ${ch.name}`);
                updateProgress(i, targets.length);

                try {
                    const content = await fetchChapter(ch.url, ch.name);
                    downloadTxt(content, filename);
                    successCount++;
                    log(`✅ ${ch.name}`, '#059669');
                } catch (err) {
                    failCount++;
                    log(`❌ ${ch.name} — ${err.message}`, '#ef4444');
                }

                updateProgress(i + 1, targets.length);
                if (i < targets.length - 1 && !shouldStop) await sleep(CONFIG.delay);
            }

            isRunning = false;
            shouldStop = false;
            document.getElementById('dlStart').style.display = 'block';
            document.getElementById('dlStop').style.display = 'none';
            log(`─── 完成！✅${successCount} ❌${failCount} ───`, '#1d4ed8');
        });

        document.getElementById('dlStop').addEventListener('click', () => {
            shouldStop = true;
            document.getElementById('dlStop').textContent = '停止中...';
            document.getElementById('dlStop').disabled = true;
        });
    }

    createUI();

})();

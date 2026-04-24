// ==UserScript==
// @name         alicesw小说章节下载器
// @namespace    https://www.alicesw.com/
// @version      1.2
// @description  在 alicesw.com 章节目录页批量下载TXT/合并整本，在章节详情页朗读小说或导出MP3（需本地Edge TTS服务）
// @author       zwy
// @match        https://www.alicesw.com/other/chapters/id/*.html
// @match        https://alicesw.com/other/chapters/id/*.html
// @match        https://www.alicesw.org/other/chapters/id/*.html
// @match        https://alicesw.org/other/chapters/id/*.html
// @match        https://www.alicesw.com/book/*/*
// @match        https://alicesw.com/book/*/*
// @match        https://www.alicesw.org/book/*/*
// @match        https://alicesw.org/book/*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      www.alicesw.com
// @connect      alicesw.com
// @connect      www.alicesw.org
// @connect      alicesw.org
// @connect      localhost
// @connect      127.0.0.1
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/zwy/userscripts/main/alicesw-novel-downloader/alicesw-novel-downloader.user.js
// @downloadURL  https://raw.githubusercontent.com/zwy/userscripts/main/alicesw-novel-downloader/alicesw-novel-downloader.user.js
// ==/UserScript==

(function () {
    'use strict';

    const TTS_SERVER = 'http://127.0.0.1:9898';

    // ════════════════════════════════════════════════════
    // 判断当前页面类型
    // ════════════════════════════════════════════════════
    const isChapterList = /\/other\/chapters\/id\//i.test(location.pathname);
    const isChapterPage = /\/book\/[^/]+\//i.test(location.pathname) && !isChapterList;

    // ════════════════════════════════════════════════════
    // 公共工具
    // ════════════════════════════════════════════════════
    const CONFIG = { delay: 1500, retryMax: 3, retryDelay: 3000 };

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    function safeFileName(str) { return str.replace(/[\\/:*?"<>|]/g, '_').substring(0, 80); }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1500);
    }
    function downloadTxt(content, filename) {
        downloadBlob(new Blob(['\uFEFF' + content], { type: 'text/plain;charset=utf-8' }), filename);
    }

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
    function parseChapterParagraphs(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const el = doc.querySelector('.j_readContent, .read-content');
        if (!el) return null;
        el.querySelectorAll('script,style,ins,iframe').forEach(e => e.remove());
        const NOISE = new Set(['加载中...', '使用手机扫码阅读', '']);
        const ps = [];
        el.querySelectorAll('p').forEach(p => { const t = p.textContent.trim(); if (!NOISE.has(t)) ps.push(t); });
        return ps.length ? ps : null;
    }
    function fetchChapterParagraphs(url, retry = 0) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET', url,
                headers: { 'User-Agent': navigator.userAgent, 'Referer': location.origin },
                onload(resp) {
                    if (resp.status !== 200) return doRetry(new Error(`HTTP ${resp.status}`));
                    const ps = parseChapterParagraphs(resp.responseText);
                    if (!ps) return doRetry(new Error('正文提取失败'));
                    resolve(ps);
                },
                onerror() { doRetry(new Error('网络请求失败')); }
            });
            function doRetry(err) {
                if (retry < CONFIG.retryMax) setTimeout(() => fetchChapterParagraphs(url, retry + 1).then(resolve).catch(reject), CONFIG.retryDelay);
                else reject(err);
            }
        });
    }

    // ════════════════════════════════════════════════════
    // TTS 工具
    // ════════════════════════════════════════════════════
    function checkTtsServer() {
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: 'GET', url: `${TTS_SERVER}/health`,
                timeout: 2000,
                onload(r) { resolve(r.status === 200); },
                onerror() { resolve(false); },
                ontimeout() { resolve(false); }
            });
        });
    }
    function fetchVoices() {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET', url: `${TTS_SERVER}/voices`,
                onload(r) {
                    try { resolve(JSON.parse(r.responseText)); }
                    catch { resolve([]); }
                },
                onerror() { resolve([]); }
            });
        });
    }
    function synthesize(text, voice, rate) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: `${TTS_SERVER}/tts`,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({ text, voice, rate }),
                responseType: 'arraybuffer',
                onload(r) {
                    if (r.status !== 200) return reject(new Error(`TTS服务返回 ${r.status}`));
                    resolve(r.response);
                },
                onerror() { reject(new Error('无法连接TTS服务')); }
            });
        });
    }

    // ════════════════════════════════════════════════════
    // ① 章节目录页逻辑（批量下载 TXT / 合并整本）
    // ════════════════════════════════════════════════════
    function initChapterListUI() {
        const fab = document.createElement('button');
        fab.textContent = '📥 下载小说';
        Object.assign(fab.style, {
            position:'fixed',bottom:'24px',left:'24px',zIndex:99999,
            padding:'10px 16px',background:'#059669',color:'#fff',
            border:'none',borderRadius:'8px',cursor:'pointer',
            fontSize:'14px',fontWeight:'bold',
            boxShadow:'0 4px 12px rgba(0,0,0,0.3)',transition:'background 0.2s'
        });
        fab.onmouseenter = () => fab.style.background = '#047857';
        fab.onmouseleave = () => fab.style.background = '#059669';

        const panel = document.createElement('div');
        Object.assign(panel.style, {
            display:'none',position:'fixed',bottom:'80px',left:'24px',
            zIndex:99998,width:'350px',background:'#fff',color:'#333',
            borderRadius:'12px',boxShadow:'0 8px 32px rgba(0,0,0,0.25)',
            padding:'20px',fontFamily:'system-ui,sans-serif',fontSize:'14px',
            maxHeight:'85vh',overflowY:'auto'
        });
        panel.innerHTML = `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
  <strong style="font-size:15px">📥 小说章节下载器 <span style="font-size:11px;color:#9ca3af">v1.2</span></strong>
  <span id="dlClose" style="cursor:pointer;font-size:20px">✕</span>
</div>
<div id="dlBookInfo" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:10px;margin-bottom:14px;line-height:1.8;font-size:13px"></div>
<p style="margin:0 0 6px;font-weight:bold;color:#555">下载范围：</p>
<div style="display:flex;gap:12px;margin-bottom:6px">
  <label><input type="radio" name="dlRange" value="all" checked> 全部章节</label>
  <label><input type="radio" name="dlRange" value="range"> 指定范围</label>
</div>
<div id="dlRangeInputs" style="display:none;gap:8px;align-items:center;margin-bottom:10px">
  <span>第</span><input id="dlFrom" type="number" min="1" style="width:58px;padding:4px;border:1px solid #ddd;border-radius:4px">
  <span>章 到 第</span><input id="dlTo" type="number" min="1" style="width:58px;padding:4px;border:1px solid #ddd;border-radius:4px"><span>章</span>
</div>
<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
  <span style="color:#555">请求间隔：</span>
  <input id="dlDelay" type="number" min="500" max="10000" value="1500" style="width:68px;padding:4px;border:1px solid #ddd;border-radius:4px">
  <span style="color:#888;font-size:12px">ms（建议≥1000）</span>
</div>
<div style="border-top:1px solid #e5e7eb;margin-bottom:14px"></div>
<p style="margin:0 0 8px;font-weight:bold;color:#555">选择下载模式：</p>
<div style="display:flex;gap:8px;margin-bottom:8px">
  <button id="dlStart" style="flex:1;padding:10px 6px;background:#059669;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px">▶ 分章下载<br><span style="font-weight:normal;font-size:10px">每章一个TXT</span></button>
  <button id="dlMerge" style="flex:1;padding:10px 6px;background:#7c3aed;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px">📖 合并整本TXT<br><span style="font-weight:normal;font-size:10px">适配番茄小说导入</span></button>
  <button id="dlStop" style="flex:0 0 64px;padding:10px 4px;background:#ef4444;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px;display:none">⏹<br>停止</button>
</div>
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

        const bookTitle = getBookTitle();
        let chapters = [], isRunning = false, shouldStop = false, successCount = 0, failCount = 0;

        fab.addEventListener('click', () => {
            const open = panel.style.display === 'block';
            panel.style.display = open ? 'none' : 'block';
            if (!open && !chapters.length) {
                chapters = extractChapters();
                document.getElementById('dlBookInfo').innerHTML = `<b>书名：</b>${bookTitle}<br><b>总章节数：</b>${chapters.length} 章`;
                document.getElementById('dlTo').value = chapters.length;
                document.getElementById('dlFrom').value = 1;
            }
        });
        document.getElementById('dlClose').addEventListener('click', () => { panel.style.display = 'none'; });
        panel.querySelectorAll('input[name="dlRange"]').forEach(r => r.addEventListener('change', () => {
            document.getElementById('dlRangeInputs').style.display = r.value === 'range' ? 'flex' : 'none';
        }));

        function log(msg, color = '#555') {
            const el = document.getElementById('dlLog');
            const d = document.createElement('div');
            d.style.color = color;
            d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
            el.appendChild(d); el.scrollTop = el.scrollHeight;
        }
        function updateProgress(done, total, color = '#059669') {
            const pct = total > 0 ? Math.round(done / total * 100) : 0;
            document.getElementById('dlProgressBar').style.cssText += `;width:${pct}%;background:${color}`;
            document.getElementById('dlProgressPct').style.color = color;
            document.getElementById('dlProgressPct').textContent = pct + '%';
            document.getElementById('dlProgressText').textContent = `已完成 ${done}/${total}（✅${successCount} ❌${failCount}）`;
        }
        function getTargets() {
            if (!chapters.length) chapters = extractChapters();
            const v = panel.querySelector('input[name="dlRange"]:checked').value;
            if (v === 'all') return chapters;
            const from = parseInt(document.getElementById('dlFrom').value) || 1;
            const to   = parseInt(document.getElementById('dlTo').value) || chapters.length;
            return chapters.slice(from - 1, to);
        }
        function enterRunning(color) {
            isRunning = true; shouldStop = false; successCount = 0; failCount = 0;
            CONFIG.delay = Math.max(500, parseInt(document.getElementById('dlDelay').value) || 1500);
            document.getElementById('dlStart').style.display = 'none';
            document.getElementById('dlMerge').style.display = 'none';
            document.getElementById('dlStop').style.display  = 'block';
            document.getElementById('dlStop').disabled = false;
            document.getElementById('dlStop').textContent = '⏹\n停止';
            document.getElementById('dlProgressWrap').style.display = 'block';
            document.getElementById('dlLog').innerHTML = '';
            document.getElementById('dlProgressBar').style.background = color;
            return CONFIG.delay;
        }
        function exitRunning() {
            isRunning = false; shouldStop = false;
            document.getElementById('dlStart').style.display = 'block';
            document.getElementById('dlMerge').style.display = 'block';
            document.getElementById('dlStop').style.display  = 'none';
        }

        // 分章下载
        document.getElementById('dlStart').addEventListener('click', async () => {
            if (isRunning) return;
            const targets = getTargets();
            if (!targets.length) { alert('没有找到章节'); return; }
            const delay = enterRunning('#059669');
            log(`【分章下载】《${bookTitle}》共 ${targets.length} 章，间隔 ${delay}ms`, '#059669');
            for (let i = 0; i < targets.length; i++) {
                if (shouldStop) { log('⏹ 已停止', '#ef4444'); break; }
                const ch = targets[i];
                log(`↓ [${i+1}/${targets.length}] ${ch.name}`);
                updateProgress(i, targets.length, '#059669');
                try {
                    const ps = await fetchChapterParagraphs(ch.url);
                    const txt = `${ch.name}\n${'═'.repeat(50)}\n\n${ps.join('\n\n')}\n\n${'─'.repeat(50)}\n`;
                    downloadTxt(txt, `${safeFileName(bookTitle)}_${String(ch.index).padStart(4,'0')}_${safeFileName(ch.name)}.txt`);
                    successCount++; log(`✅ ${ch.name}`, '#059669');
                } catch(e) { failCount++; log(`❌ ${ch.name} — ${e.message}`, '#ef4444'); }
                updateProgress(i+1, targets.length, '#059669');
                if (i < targets.length-1 && !shouldStop) await sleep(delay);
            }
            exitRunning();
            log(`─── 完成！✅${successCount} ❌${failCount} ───`, '#1d4ed8');
        });

        // 合并整本
        document.getElementById('dlMerge').addEventListener('click', async () => {
            if (isRunning) return;
            const targets = getTargets();
            if (!targets.length) { alert('没有找到章节'); return; }
            const delay = enterRunning('#7c3aed');
            log(`【合并整本】《${bookTitle}》共 ${targets.length} 章`, '#7c3aed');
            const chunks = [];
            for (let i = 0; i < targets.length; i++) {
                if (shouldStop) { log('⏹ 已停止', '#ef4444'); break; }
                const ch = targets[i];
                log(`↓ [${i+1}/${targets.length}] ${ch.name}`);
                updateProgress(i, targets.length, '#7c3aed');
                try {
                    const ps = await fetchChapterParagraphs(ch.url);
                    chunks.push(`\n${ch.name}\n\n${ps.join('\n\n')}\n`);
                    successCount++; log(`✅ ${ch.name}`, '#059669');
                } catch(e) {
                    failCount++;
                    chunks.push(`\n${ch.name}\n\n【本章获取失败，请手动补全】\n`);
                    log(`❌ ${ch.name} — ${e.message}`, '#ef4444');
                }
                updateProgress(i+1, targets.length, '#7c3aed');
                if (i < targets.length-1 && !shouldStop) await sleep(delay);
            }
            if (chunks.length) {
                const cover = `${bookTitle}\n\n作者：（alicesw.com）\n章节数：${chunks.length} 章\n\n${'━'.repeat(50)}\n`;
                downloadTxt(cover + chunks.join('\n'), `${safeFileName(bookTitle)}_完整版.txt`);
                log(`📖 整本TXT已生成：${safeFileName(bookTitle)}_完整版.txt`, '#7c3aed');
                log(`💡 传到手机→番茄小说→书架→+→导入本地书籍`, '#9ca3af');
            }
            exitRunning();
            log(`─── 完成！✅${successCount} ❌${failCount} ───`, '#1d4ed8');
        });

        document.getElementById('dlStop').addEventListener('click', () => {
            shouldStop = true;
            document.getElementById('dlStop').textContent = '停止中';
            document.getElementById('dlStop').disabled = true;
        });
    }

    // ════════════════════════════════════════════════════
    // ② 章节详情页逻辑（朗读 / 导出MP3）
    // ════════════════════════════════════════════════════
    function initChapterPageUI() {
        // 先检查TTS服务是否在线
        checkTtsServer().then(async (online) => {
            const fab = document.createElement('button');
            fab.textContent = '🔊 朗读小说';
            Object.assign(fab.style, {
                position:'fixed',bottom:'24px',right:'24px',zIndex:99999,
                padding:'10px 16px',background: online ? '#2563eb' : '#9ca3af',color:'#fff',
                border:'none',borderRadius:'8px',cursor:'pointer',
                fontSize:'14px',fontWeight:'bold',
                boxShadow:'0 4px 12px rgba(0,0,0,0.3)',transition:'background 0.2s'
            });

            const panel = document.createElement('div');
            Object.assign(panel.style, {
                display:'none',position:'fixed',bottom:'80px',right:'24px',
                zIndex:99998,width:'320px',background:'#fff',color:'#333',
                borderRadius:'12px',boxShadow:'0 8px 32px rgba(0,0,0,0.25)',
                padding:'18px',fontFamily:'system-ui,sans-serif',fontSize:'14px'
            });

            // 获取章节标题和正文
            const chapterTitle = document.querySelector('h1.read-title, .read-top h1, h1')?.textContent.trim() || document.title;
            const contentEl    = document.querySelector('.j_readContent, .read-content');

            let voiceList = [];
            if (online) voiceList = await fetchVoices();

            const voiceOptions = voiceList.length
                ? voiceList.map(v => `<option value="${v.id}">${v.name}</option>`).join('')
                : `<option value="zh-CN-XiaoxiaoNeural">晓晓（女·温暖活泼）</option>
                   <option value="zh-CN-XiaoyiNeural">晓伊（女·温柔友善）</option>
                   <option value="zh-CN-YunxiNeural">云希（男·稳重）</option>
                   <option value="zh-CN-YunyangNeural">云扬（男·专业播报）</option>`;

            panel.innerHTML = `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
  <strong>🔊 朗读小说</strong>
  <span id="ttsClose" style="cursor:pointer;font-size:20px">✕</span>
</div>
${ !online ? `<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:10px;margin-bottom:12px;font-size:12px;color:#92400e">
  ⚠️ 未检测到本地TTS服务，请先启动 <b>start.bat</b><br>
  <a href="https://github.com/zwy/userscripts/tree/main/alicesw-novel-downloader/edge-tts-server" target="_blank" style="color:#1d4ed8">查看安装说明</a>
</div>` : '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:8px;margin-bottom:12px;font-size:12px;color:#065f46">✅ TTS服务在线</div>' }
<div style="margin-bottom:10px">
  <label style="font-size:12px;color:#555;display:block;margin-bottom:4px">声线选择：</label>
  <select id="ttsVoice" style="width:100%;padding:6px;border:1px solid #ddd;border-radius:4px;font-size:13px">${voiceOptions}</select>
</div>
<div style="margin-bottom:14px">
  <label style="font-size:12px;color:#555;display:block;margin-bottom:4px">朗读速度：<span id="ttsRateLabel">正常</span></label>
  <input id="ttsRate" type="range" min="-50" max="100" value="0" style="width:100%">
  <div style="display:flex;justify-content:space-between;font-size:11px;color:#9ca3af"><span>慢</span><span>正常</span><span>快</span></div>
</div>
<div style="display:flex;gap:8px;margin-bottom:12px">
  <button id="ttsPlay" style="flex:1;padding:10px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold" ${!online ? 'disabled' : ''}>▶ 开始朗读</button>
  <button id="ttsPause" style="flex:0 0 72px;padding:10px;background:#6b7280;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;display:none">⏸ 暂停</button>
  <button id="ttsStop2" style="flex:0 0 72px;padding:10px;background:#ef4444;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;display:none">⏹ 停止</button>
</div>
<button id="ttsExport" style="width:100%;padding:10px;background:#d97706;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;margin-bottom:8px" ${!online ? 'disabled' : ''}>🎵 导出 MP3</button>
<div id="ttsStatus" style="font-size:12px;color:#6b7280;text-align:center;min-height:18px"></div>`;

            document.body.appendChild(fab);
            document.body.appendChild(panel);

            let audio = null;

            fab.addEventListener('click', () => {
                panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
            });
            document.getElementById('ttsClose').addEventListener('click', () => {
                panel.style.display = 'none';
                if (audio) { audio.pause(); audio = null; }
            });

            // 速度滑块标签
            document.getElementById('ttsRate').addEventListener('input', function() {
                const v = parseInt(this.value);
                const lbl = v === 0 ? '正常' : (v > 0 ? `+${v}%` : `${v}%`);
                document.getElementById('ttsRateLabel').textContent = lbl;
            });

            function getRate() {
                const v = parseInt(document.getElementById('ttsRate').value);
                return v >= 0 ? `+${v}%` : `${v}%`;
            }
            function getVoice() { return document.getElementById('ttsVoice').value; }
            function setStatus(msg, color = '#6b7280') {
                const el = document.getElementById('ttsStatus');
                el.style.color = color; el.textContent = msg;
            }
            function getFullText() {
                if (!contentEl) return '';
                const clone = contentEl.cloneNode(true);
                clone.querySelectorAll('script,style,ins,iframe').forEach(e => e.remove());
                const NOISE = new Set(['加载中...', '使用手机扫码阅读']);
                return Array.from(clone.querySelectorAll('p'))
                    .map(p => p.textContent.trim()).filter(t => t && !NOISE.has(t))
                    .join('\n\n');
            }

            // 朗读
            document.getElementById('ttsPlay').addEventListener('click', async () => {
                const text = getFullText();
                if (!text) { setStatus('未找到正文内容', '#ef4444'); return; }
                setStatus('正在合成语音，请稍候...', '#2563eb');
                document.getElementById('ttsPlay').style.display = 'none';
                try {
                    const buf = await synthesize(chapterTitle + '\n\n' + text, getVoice(), getRate());
                    const blob = new Blob([buf], { type: 'audio/mpeg' });
                    const url  = URL.createObjectURL(blob);
                    if (audio) audio.pause();
                    audio = new Audio(url);
                    audio.play();
                    document.getElementById('ttsPause').style.display  = 'block';
                    document.getElementById('ttsStop2').style.display  = 'block';
                    setStatus('▶ 朗读中...', '#059669');
                    audio.onended = () => {
                        setStatus('✅ 朗读完毕');
                        document.getElementById('ttsPlay').style.display  = 'block';
                        document.getElementById('ttsPause').style.display = 'none';
                        document.getElementById('ttsStop2').style.display = 'none';
                        URL.revokeObjectURL(url);
                    };
                } catch(e) {
                    setStatus('❌ ' + e.message, '#ef4444');
                    document.getElementById('ttsPlay').style.display = 'block';
                }
            });

            // 暂停/继续
            document.getElementById('ttsPause').addEventListener('click', function() {
                if (!audio) return;
                if (audio.paused) { audio.play(); this.textContent = '⏸ 暂停'; setStatus('▶ 朗读中...', '#059669'); }
                else { audio.pause(); this.textContent = '▶ 继续'; setStatus('⏸ 已暂停'); }
            });

            // 停止
            document.getElementById('ttsStop2').addEventListener('click', () => {
                if (audio) { audio.pause(); audio = null; }
                document.getElementById('ttsPlay').style.display  = 'block';
                document.getElementById('ttsPause').style.display = 'none';
                document.getElementById('ttsStop2').style.display = 'none';
                setStatus('⏹ 已停止');
            });

            // 导出MP3
            document.getElementById('ttsExport').addEventListener('click', async () => {
                const text = getFullText();
                if (!text) { setStatus('未找到正文内容', '#ef4444'); return; }
                document.getElementById('ttsExport').disabled = true;
                document.getElementById('ttsExport').textContent = '⏳ 合成中...';
                setStatus('正在合成MP3，请稍候...', '#d97706');
                try {
                    const buf  = await synthesize(chapterTitle + '\n\n' + text, getVoice(), getRate());
                    const blob = new Blob([buf], { type: 'audio/mpeg' });
                    downloadBlob(blob, `${safeFileName(chapterTitle)}.mp3`);
                    setStatus('✅ MP3已下载', '#059669');
                } catch(e) {
                    setStatus('❌ ' + e.message, '#ef4444');
                } finally {
                    document.getElementById('ttsExport').disabled = false;
                    document.getElementById('ttsExport').textContent = '🎵 导出 MP3';
                }
            });
        });
    }

    // ════════════════════════════════════════════════════
    // 入口
    // ════════════════════════════════════════════════════
    if (isChapterList)  initChapterListUI();
    if (isChapterPage)  initChapterPageUI();

})();

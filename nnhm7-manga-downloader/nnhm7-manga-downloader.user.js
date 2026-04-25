// ==UserScript==
// @name         nnhm7 漫画CBZ下载器
// @namespace    https://nnhm7.org/
// @version      1.2
// @description  在 nnhm7.org 章节列表页批量下载漫画章节为CBZ格式（兼容 Komga 等本地漫画服务器）
// @author       zwy
// @match        https://nnhm7.org/comic/*
// @match        https://nnhm7.com/comic/*
// @match        https://nnhm5.xyz/comic/*
// @match        https://nnhanman3.com/comic/*
// @match        https://nnhanman7.com/comic/*
// @match        https://nnhanman9.com/comic/*
// @match        https://nnhanman5.com/comic/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      nnhm7.org
// @connect      nnhm7.com
// @connect      nnhm5.xyz
// @connect      nnhanman3.com
// @connect      nnhanman7.com
// @connect      nnhanman9.com
// @connect      nnhanman5.com
// @connect      p4.jmpic.xyz
// @connect      jmpic.xyz
// @connect      *
// @require      https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/zwy/userscripts/main/nnhm7-manga-downloader/nnhm7-manga-downloader.user.js
// @downloadURL  https://raw.githubusercontent.com/zwy/userscripts/main/nnhm7-manga-downloader/nnhm7-manga-downloader.user.js
// ==/UserScript==

(function () {
    'use strict';

    // ─── 配置 ────────────────────────────────────────────────────────
    const CONFIG = {
        pageDelay:  1200,
        imgDelay:   300,
        retryMax:   3,
        retryDelay: 3000,
        imgConcur:  3,
    };

    // ─── 工具 ────────────────────────────────────────────────────────
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    function safeFileName(str) {
        return str.replace(/[\\/:*?"<>|]/g, '_').trim().substring(0, 100);
    }

    function extractChapterNum(name) {
        const m = name.match(/(\d+)/);
        return m ? String(parseInt(m[1])).padStart(4, '0') : '0000';
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    // ─── 页面类型判断 ─────────────────────────────────────────────────
    const isChapterList = /\/comic\/[^/]+\.html/.test(location.pathname);
    const isChapterPage = /\/comic\/[^/]+\/chapter-/.test(location.pathname);

    // ─── 提取章节列表 ─────────────────────────────────────────────────
    function extractChapters() {
        const BASE = location.origin;
        const items = [];
        document.querySelectorAll('#mh-chapter-list-ol-0 li a, ul.Drama li a').forEach((a, i) => {
            const name = (a.querySelector('span') || a).textContent.trim().replace(/\s+/g, ' ');
            const href = a.getAttribute('href');
            const url = href.startsWith('http') ? href : BASE + href;
            items.push({ index: i, name, url });
        });
        return items.reverse();
    }

    function getMangaTitle() {
        const h1 = document.querySelector('.Introduct_Sub h1, h1.title');
        if (h1) return h1.textContent.trim().replace(/[《》]/g, '');
        const m = document.title.match(/^(.+?)无遮/);
        return m ? m[1].trim() : document.title.split('-')[0].trim();
    }

    // ─── 抓取章节详情页图片列表 ────────────────────────────────────────
    function fetchChapterImageUrls(url, retry = 0) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET', url,
                headers: { 'Referer': location.origin, 'User-Agent': navigator.userAgent },
                onload(resp) {
                    if (resp.status !== 200) return doRetry(new Error(`HTTP ${resp.status}`));
                    const doc = new DOMParser().parseFromString(resp.responseText, 'text/html');
                    const imgs = Array.from(
                        doc.querySelectorAll('.view-imgBox img[data-original], #m_r_imgbox_0 img[data-original]')
                    ).map(img => img.getAttribute('data-original')).filter(Boolean);
                    if (!imgs.length) return doRetry(new Error('未找到图片'));
                    resolve(imgs);
                },
                onerror() { doRetry(new Error('网络错误')); }
            });
            function doRetry(err) {
                if (retry < CONFIG.retryMax)
                    setTimeout(() => fetchChapterImageUrls(url, retry + 1).then(resolve).catch(reject), CONFIG.retryDelay);
                else reject(err);
            }
        });
    }

    // ─── 下载单张图片 ───────────────────────────────────
    function fetchImage(url, retry = 0) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET', url,
                responseType: 'arraybuffer',
                headers: { 'Referer': location.origin },
                onload(resp) {
                    if (resp.status !== 200) return doRetry(new Error(`HTTP ${resp.status}`));
                    resolve(resp.response);
                },
                onerror() { doRetry(new Error('图片下载失败')); }
            });
            function doRetry(err) {
                if (retry < CONFIG.retryMax)
                    setTimeout(() => fetchImage(url, retry + 1).then(resolve).catch(reject), CONFIG.retryDelay);
                else reject(err);
            }
        });
    }

    async function fetchImagesWithConcurrency(urls, onProgress) {
        const results = new Array(urls.length);
        let cursor = 0;
        async function worker() {
            while (cursor < urls.length) {
                const idx = cursor++;
                try { results[idx] = await fetchImage(urls[idx]); }
                catch(e) { results[idx] = null; }
                onProgress(idx);
                await sleep(CONFIG.imgDelay);
            }
        }
        await Promise.all(Array.from({ length: CONFIG.imgConcur }, worker));
        return results;
    }

    // ─── 打包为 CBZ ───────────────────────────────────────────────────
    // 说明：JSZip STORE 模式下内置 onUpdate 几乎不会触发（没有压缩计算过程）
    // 改用自制进度：先分批异步将图片加入 zip，再 generateAsync
    async function packCbz(imageBuffers, imageUrls, onPackProgress) {
        const zip = new JSZip();
        const total = imageBuffers.length;
        let added = 0;

        // 分批加入文件，每 20 张让出一次主线程，避免 UI 冻结
        for (let i = 0; i < total; i++) {
            const buf = imageBuffers[i];
            if (buf) {
                const ext = (imageUrls[i].match(/\.(jpe?g|png|webp|gif)$/i) || ['','jpg'])[1].toLowerCase();
                zip.file(`${String(i + 1).padStart(4, '0')}.${ext}`, buf);
            }
            added++;
            if (added % 20 === 0 || added === total) {
                const pct = Math.round(added / total * 50); // 前 50% 给加文件阶段
                onPackProgress && onPackProgress({ percent: pct });
                await sleep(0); // 让出主线程
            }
        }

        // generateAsync 阶段占后 50%
        // 用 streamFiles:true 使 JSZip 分块处理，配合 onUpdate 触发
        return await zip.generateAsync(
            { type: 'blob', compression: 'STORE', streamFiles: true },
            (meta) => {
                const pct = 50 + Math.round(meta.percent / 2); // 50~100%
                onPackProgress && onPackProgress({ percent: pct });
            }
        );
    }

    // ─── UI 工具 ──────────────────────────────────────────────────────
    function $(id) { return document.getElementById(id); }

    function createFabAndPanel() {
        const fab = document.createElement('button');
        fab.id = 'cbzFab';
        fab.textContent = '📦 下载漫画';
        Object.assign(fab.style, {
            position:'fixed', bottom:'24px', left:'24px', zIndex:99999,
            padding:'10px 16px', background:'#7c3aed', color:'#fff',
            border:'none', borderRadius:'8px', cursor:'pointer',
            fontSize:'14px', fontWeight:'bold',
            boxShadow:'0 4px 12px rgba(0,0,0,0.35)', transition:'background 0.2s'
        });
        fab.onmouseenter = () => fab.style.background = '#6d28d9';
        fab.onmouseleave = () => fab.style.background = '#7c3aed';

        const panel = document.createElement('div');
        panel.id = 'cbzPanel';
        Object.assign(panel.style, {
            display:'none', position:'fixed', bottom:'80px', left:'24px',
            zIndex:99998, width:'360px', background:'#fff', color:'#333',
            borderRadius:'12px', boxShadow:'0 8px 32px rgba(0,0,0,0.25)',
            padding:'20px', fontFamily:'system-ui,sans-serif', fontSize:'14px',
            maxHeight:'85vh', overflowY:'auto'
        });

        panel.innerHTML = `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
  <strong style="font-size:15px">📦 漫画CBZ下载器 <span style="font-size:11px;color:#9ca3af">v1.2</span></strong>
  <span id="cbzClose" style="cursor:pointer;font-size:20px">✕</span>
</div>

<div id="cbzInfo" style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:6px;padding:10px;margin-bottom:14px;line-height:1.8;font-size:13px"></div>

<div style="margin-bottom:10px">
  <label style="font-size:12px;color:#555;display:block;margin-bottom:4px">CBZ 文件名前缀（留空则自动用章节名）：</label>
  <input id="cbzPrefix" type="text" placeholder="例如：第001話  留空自动" style="width:100%;padding:6px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;font-size:13px">
</div>

<p style="margin:0 0 6px;font-weight:bold;color:#555">下载范围：</p>
<div style="display:flex;gap:12px;margin-bottom:6px">
  <label><input type="radio" name="cbzRange" value="all" checked> 全部章节</label>
  <label><input type="radio" name="cbzRange" value="range"> 指定范围</label>
</div>
<div id="cbzRangeInputs" style="display:none;gap:8px;align-items:center;margin-bottom:10px">
  <span>第</span>
  <input id="cbzFrom" type="number" min="1" style="width:58px;padding:4px;border:1px solid #ddd;border-radius:4px">
  <span>章 到 第</span>
  <input id="cbzTo" type="number" min="1" style="width:58px;padding:4px;border:1px solid #ddd;border-radius:4px">
  <span>章</span>
</div>

<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
  <span style="color:#555">章节间隔：</span>
  <input id="cbzDelay" type="number" min="500" max="10000" value="1200" style="width:68px;padding:4px;border:1px solid #ddd;border-radius:4px">
  <span style="color:#888;font-size:12px">ms（建议≥1000）</span>
</div>

<div style="border-top:1px solid #e5e7eb;margin-bottom:14px"></div>

<div style="display:flex;gap:8px;margin-bottom:8px">
  <button id="cbzStart" style="flex:1;padding:10px;background:#7c3aed;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold">▶ 开始下载</button>
  <button id="cbzStop" style="flex:0 0 72px;padding:10px;background:#ef4444;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;display:none">⏹ 停止</button>
</div>

<div id="cbzProgressWrap" style="display:none">
  <div style="display:flex;justify-content:space-between;margin-bottom:4px">
    <span id="cbzProgressText" style="font-size:12px;color:#555"></span>
    <span id="cbzProgressPct" style="font-size:12px;font-weight:bold;color:#7c3aed"></span>
  </div>
  <div style="background:#e5e7eb;border-radius:999px;height:8px;overflow:hidden;margin-bottom:8px">
    <div id="cbzProgressBar" style="height:100%;width:0%;background:#7c3aed;transition:width 0.3s;border-radius:999px"></div>
  </div>
  <div id="cbzImgProgress" style="font-size:11px;color:#9ca3af;margin-bottom:6px"></div>
  <div id="cbzLog" style="height:140px;overflow-y:auto;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:8px;font-size:11px;color:#555;font-family:monospace;line-height:1.6"></div>
</div>`;

        document.body.appendChild(fab);
        document.body.appendChild(panel);
        return { fab, panel };
    }

    // ─── 章节列表页逻辑 ───────────────────────────────────────────────
    function initChapterListUI() {
        const { fab, panel } = createFabAndPanel();
        const mangaTitle = getMangaTitle();
        let chapters = [];
        let isRunning = false, shouldStop = false;
        let successCount = 0, failCount = 0;

        fab.addEventListener('click', () => {
            const open = panel.style.display === 'block';
            panel.style.display = open ? 'none' : 'block';
            if (!open && !chapters.length) {
                chapters = extractChapters();
                $('cbzInfo').innerHTML = `<b>漫画：</b>${mangaTitle}<br><b>总章节数：</b>${chapters.length} 话`;
                $('cbzFrom').value = 1;
                $('cbzTo').value = chapters.length;
                $('cbzPrefix').placeholder = `例如：${safeFileName(mangaTitle)}_第001話`;
            }
        });
        $('cbzClose').addEventListener('click', () => { panel.style.display = 'none'; });
        panel.querySelectorAll('input[name="cbzRange"]').forEach(r => r.addEventListener('change', () => {
            $('cbzRangeInputs').style.display = r.value === 'range' ? 'flex' : 'none';
        }));

        function log(msg, color = '#555') {
            const el = $('cbzLog');
            const d = document.createElement('div');
            d.style.color = color;
            d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
            el.appendChild(d); el.scrollTop = el.scrollHeight;
        }

        function updateChapterProgress(done, total) {
            const pct = total > 0 ? Math.round(done / total * 100) : 0;
            $('cbzProgressBar').style.width = pct + '%';
            $('cbzProgressPct').textContent = pct + '%';
            $('cbzProgressText').textContent = `章节 ${done}/${total}（✅${successCount} ❌${failCount}）`;
        }

        function getTargets() {
            if (!chapters.length) chapters = extractChapters();
            const v = panel.querySelector('input[name="cbzRange"]:checked').value;
            if (v === 'all') return chapters;
            const from = parseInt($('cbzFrom').value) || 1;
            const to   = parseInt($('cbzTo').value)   || chapters.length;
            return chapters.slice(from - 1, to);
        }

        $('cbzStart').addEventListener('click', async () => {
            if (isRunning) return;
            const targets = getTargets();
            if (!targets.length) { alert('没有找到章节，请检查设置'); return; }

            const delay = Math.max(500, parseInt($('cbzDelay').value) || 1200);
            CONFIG.pageDelay = delay;
            isRunning = true; shouldStop = false; successCount = 0; failCount = 0;

            $('cbzStart').style.display = 'none';
            $('cbzStop').style.display  = 'block';
            $('cbzStop').disabled = false;
            $('cbzStop').textContent = '⏹ 停止';
            $('cbzProgressWrap').style.display = 'block';
            $('cbzLog').innerHTML = '';

            log(`【开始】《${mangaTitle}》共 ${targets.length} 话，间隔 ${delay}ms`, '#7c3aed');

            for (let i = 0; i < targets.length; i++) {
                if (shouldStop) { log('⏹ 已停止', '#ef4444'); break; }

                const ch = targets[i];
                updateChapterProgress(i, targets.length);
                $('cbzImgProgress').textContent = '';
                log(`↓ [${i+1}/${targets.length}] ${ch.name}`);

                const prefix = $('cbzPrefix').value.trim();
                const cbzName = prefix
                    ? `${safeFileName(prefix)}_${extractChapterNum(ch.name)}.cbz`
                    : `${safeFileName(mangaTitle)}_${extractChapterNum(ch.name)}_${safeFileName(ch.name)}.cbz`;

                try {
                    const imgUrls = await fetchChapterImageUrls(ch.url);
                    log(`  📷 共 ${imgUrls.length} 张图片`);

                    let doneImgs = 0;
                    const imgBuffers = await fetchImagesWithConcurrency(imgUrls, () => {
                        doneImgs++;
                        $('cbzImgProgress').textContent = `  图片进度: ${doneImgs}/${imgUrls.length}`;
                    });

                    const failedImgs = imgBuffers.filter(b => !b).length;
                    if (failedImgs > 0) log(`  ⚠ ${failedImgs} 张图片下载失败，已跳过`, '#d97706');

                    $('cbzImgProgress').textContent = '  打包 CBZ 中... 0%';
                    const cbzBlob = await packCbz(imgBuffers, imgUrls, ({ percent }) => {
                        $('cbzImgProgress').textContent = `  打包 CBZ 中... ${percent}%`;
                    });
                    downloadBlob(cbzBlob, cbzName);

                    successCount++;
                    log(`✅ ${cbzName}  (${(cbzBlob.size/1024/1024).toFixed(1)} MB)`, '#059669');

                } catch(err) {
                    failCount++;
                    log(`❌ ${ch.name} — ${err.message}`, '#ef4444');
                }

                updateChapterProgress(i + 1, targets.length);
                if (i < targets.length - 1 && !shouldStop) await sleep(CONFIG.pageDelay);
            }

            isRunning = false; shouldStop = false;
            $('cbzStart').style.display = 'block';
            $('cbzStop').style.display  = 'none';
            $('cbzImgProgress').textContent = '';
            log(`─── 全部完成！✅${successCount} ❌${failCount} ───`, '#1d4ed8');
        });

        $('cbzStop').addEventListener('click', () => {
            shouldStop = true;
            $('cbzStop').textContent = '停止中...';
            $('cbzStop').disabled = true;
        });
    }

    // ─── 章节详情页逻辑 ─────────────────────────────────
    function initChapterPageUI() {
        const fab = document.createElement('button');
        fab.textContent = '📦 下载本章CBZ';
        Object.assign(fab.style, {
            position:'fixed', bottom:'24px', right:'24px', zIndex:99999,
            padding:'10px 16px', background:'#7c3aed', color:'#fff',
            border:'none', borderRadius:'8px', cursor:'pointer',
            fontSize:'14px', fontWeight:'bold',
            boxShadow:'0 4px 12px rgba(0,0,0,0.35)'
        });

        const statusBar = document.createElement('div');
        Object.assign(statusBar.style, {
            position:'fixed', bottom:'72px', right:'24px', zIndex:99998,
            background:'rgba(0,0,0,0.75)', color:'#fff', borderRadius:'6px',
            padding:'6px 12px', fontSize:'12px', display:'none',
            fontFamily:'system-ui,sans-serif'
        });

        document.body.appendChild(fab);
        document.body.appendChild(statusBar);

        function getLocalImages() {
            return Array.from(document.querySelectorAll('.view-imgBox img[data-original], #m_r_imgbox_0 img[data-original]'))
                .map(img => img.getAttribute('data-original')).filter(Boolean);
        }

        function getChapterTitle() {
            const el = document.querySelector('.view-title, .read-title, h1');
            return el ? el.textContent.trim() : document.title.split('-')[0].trim();
        }

        fab.addEventListener('click', async () => {
            if (fab.disabled) return;
            fab.disabled = true;

            const imgUrls = getLocalImages();
            if (!imgUrls.length) { alert('未找到图片，请等页面加载完成后再试'); fab.disabled = false; return; }

            const chTitle = getChapterTitle();
            const cbzName = `${safeFileName(chTitle)}.cbz`;

            statusBar.style.display = 'block';
            statusBar.textContent = `正在下载 ${imgUrls.length} 张图片...`;

            let done = 0;
            const buffers = await fetchImagesWithConcurrency(imgUrls, () => {
                done++;
                statusBar.textContent = `图片下载中 ${done}/${imgUrls.length}...`;
            });

            statusBar.textContent = '正在打包 CBZ... 0%';
            const cbzBlob = await packCbz(buffers, imgUrls, ({ percent }) => {
                statusBar.textContent = `正在打包 CBZ... ${percent}%`;
            });
            downloadBlob(cbzBlob, cbzName);

            statusBar.textContent = `✅ 完成：${cbzName}  (${(cbzBlob.size/1024/1024).toFixed(1)} MB)`;
            setTimeout(() => { statusBar.style.display = 'none'; }, 4000);
            fab.disabled = false;
        });
    }

    // ─── 入口 ─────────────────────────────────────────────────────────
    if (isChapterList) initChapterListUI();
    if (isChapterPage) initChapterPageUI();

})();

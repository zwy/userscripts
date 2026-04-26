// ==UserScript==
// @name         论坛 GIF 批量下载器
// @namespace    https://github.com/zwy/userscripts
// @version      1.0
// @description  在论坛列表页批量进入详情页，提取并下载正文中的 GIF 图片，支持去重、黑名单/白名单
// @author       zwy
// @match        https://12310.e6042m9.cc:2096/pw/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      12310.e6042m9.cc
// @connect      *
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/zwy/userscripts/main/pw-forum-gif-downloader/pw-forum-gif-downloader.user.js
// @downloadURL  https://raw.githubusercontent.com/zwy/userscripts/main/pw-forum-gif-downloader/pw-forum-gif-downloader.user.js
// ==/UserScript==

(function () {
    'use strict';

    // ─── 配置（页面结构不符时只需修改这里）──────────────────────────────
    const CONFIG = {
        // 列表页：提取帖子详情页链接的选择器
        // 默认匹配 href 中含 html_data 的链接（与目标站 URL 格式一致）
        listItemSelector: 'a[href*="html_data"]',

        // 详情页：正文容器选择器（GIF 只从这个容器内提取）
        // 多个选择器用逗号分隔，从左到右依次尝试，第一个命中的为准
        // 如果全部未命中，自动 fallback 到 body 并在日志中给出警告
        contentSelector: '.t_msgfont, .read-message, .postmessage, .post_message, .message, .threadtext, [id^="postmessage_"]',

        // 详情页抓取间隔（ms），避免频繁请求
        pageDelay: 1500,

        // 请求失败后的最大重试次数
        retryMax: 3,
        retryDelay: 3000,

        // 每个 GIF 下载触发之间的间隔（ms）
        downloadDelay: 500,

        // 跳过表情包/头像 GIF：URL 中含以下关键词时直接过滤
        skipUrlKeywords: ['smilies', 'emoji', 'face', 'avatar', 'emo', 'smiley', '/s/', 'attachicons'],
    };

    // ─── 工具 ────────────────────────────────────────────────────────
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    function safeFileName(str) {
        return str.replace(/[\\/:*?"<>|]/g, '_').trim().substring(0, 120);
    }

    // ─── 持久化存储：已下载文件名集合（去重） ────────────────────────
    function getDownloadedSet() {
        try { return new Set(JSON.parse(GM_getValue('gif_downloaded', '[]'))); }
        catch (e) { return new Set(); }
    }
    function saveDownloadedSet(set) {
        GM_setValue('gif_downloaded', JSON.stringify([...set]));
    }
    function addToDownloaded(filename) {
        const s = getDownloadedSet();
        s.add(filename);
        saveDownloadedSet(s);
    }

    // ─── 持久化存储：黑名单 / 白名单 ─────────────────────────────────
    function getBlacklist() {
        try { return JSON.parse(GM_getValue('gif_blacklist', '[]')); } catch (e) { return []; }
    }
    function getWhitelist() {
        try { return JSON.parse(GM_getValue('gif_whitelist', '[]')); } catch (e) { return []; }
    }
    function saveBlacklist(arr) { GM_setValue('gif_blacklist', JSON.stringify(arr)); }
    function saveWhitelist(arr) { GM_setValue('gif_whitelist', JSON.stringify(arr)); }

    // ─── 去重判断 ─────────────────────────────────────────────────────
    // 返回 { skip: bool, reason: string }
    function shouldSkip(filename) {
        const downloaded = getDownloadedSet();
        const blacklist  = getBlacklist();
        const whitelist  = getWhitelist();
        const lower      = filename.toLowerCase();

        // 黑名单优先：永不下载
        if (blacklist.some(kw => kw && lower.includes(kw.toLowerCase())))
            return { skip: true, reason: '黑名单' };

        // 白名单：强制下载，无视去重记录
        if (whitelist.some(kw => kw && lower.includes(kw.toLowerCase())))
            return { skip: false, reason: '白名单(强制)' };

        // 普通去重
        if (downloaded.has(filename))
            return { skip: true, reason: '已下载' };

        return { skip: false, reason: '' };
    }

    // ─── 从 URL 中提取文件名 ──────────────────────────────────────────
    function gifFilenameFromUrl(url) {
        try {
            const parts = new URL(url, location.href).pathname.split('/');
            return decodeURIComponent(parts[parts.length - 1] || 'unnamed.gif');
        } catch (e) {
            return url.split('/').pop().split('?')[0] || 'unnamed.gif';
        }
    }

    // ─── 判断 URL 是否为表情包 / 头像 ────────────────────────────────
    function isDecorativeGif(url) {
        const lower = url.toLowerCase();
        return CONFIG.skipUrlKeywords.some(kw => lower.includes(kw));
    }

    // ─── 抓取详情页 HTML（带重试）────────────────────────────────────
    function fetchPage(url, retry = 0) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                headers: { 'Referer': location.origin, 'User-Agent': navigator.userAgent },
                onload(resp) {
                    if (resp.status !== 200) return doRetry(new Error(`HTTP ${resp.status}`));
                    resolve(resp.responseText);
                },
                onerror() { doRetry(new Error('网络错误')); }
            });
            function doRetry(err) {
                if (retry < CONFIG.retryMax)
                    setTimeout(() => fetchPage(url, retry + 1).then(resolve).catch(reject), CONFIG.retryDelay);
                else reject(err);
            }
        });
    }

    // ─── 从详情页 HTML 中提取正文 GIF URL ───────────────────────────
    function extractGifsFromHtml(html, pageUrl) {
        const doc = new DOMParser().parseFromString(html, 'text/html');

        // 依次尝试各正文选择器
        let contentEl = null;
        for (const sel of CONFIG.contentSelector.split(',').map(s => s.trim())) {
            try {
                const el = doc.querySelector(sel);
                if (el) { contentEl = el; break; }
            } catch (e) { /* 无效选择器跳过 */ }
        }

        const isFullBody = !contentEl;
        const root = contentEl || doc.body;

        const gifs = [];
        for (const img of root.querySelectorAll('img')) {
            const src = img.getAttribute('src')
                || img.getAttribute('data-src')
                || img.getAttribute('data-original')
                || '';
            if (!src) continue;
            if (!src.toLowerCase().includes('.gif')) continue;
            if (isDecorativeGif(src)) continue;
            const absUrl = src.startsWith('http') ? src : new URL(src, pageUrl).href;
            gifs.push(absUrl);
        }

        return { gifs, isFullBody };
    }

    // ─── 下载单个 GIF ────────────────────────────────────────────────
    function downloadGif(url, filename) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType: 'blob',
                headers: { 'Referer': location.origin },
                onload(resp) {
                    if (resp.status !== 200) { resolve({ ok: false, reason: `HTTP ${resp.status}` }); return; }
                    const a = document.createElement('a');
                    const objUrl = URL.createObjectURL(resp.response);
                    a.href = objUrl;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(objUrl), 3000);
                    resolve({ ok: true });
                },
                onerror() { resolve({ ok: false, reason: '网络错误' }); }
            });
        });
    }

    // ─── 从列表页提取所有详情页链接（去重）──────────────────────────
    function extractDetailLinks() {
        const seen = new Set();
        const links = [];
        document.querySelectorAll(CONFIG.listItemSelector).forEach(a => {
            const href = a.getAttribute('href');
            if (!href) return;
            const url = href.startsWith('http') ? href : location.origin + '/' + href.replace(/^\//, '');
            if (!seen.has(url)) {
                seen.add(url);
                links.push({ url, title: a.textContent.trim().substring(0, 60) || '未知标题' });
            }
        });
        return links;
    }

    // ─── UI：创建悬浮按钮 + 控制面板 ─────────────────────────────────
    function createUI() {
        const fab = document.createElement('button');
        fab.id = 'gifFab';
        fab.textContent = '🎞 GIF下载';
        Object.assign(fab.style, {
            position: 'fixed', bottom: '24px', left: '24px', zIndex: '99999',
            padding: '10px 16px', background: '#0e7490', color: '#fff',
            border: 'none', borderRadius: '8px', cursor: 'pointer',
            fontSize: '14px', fontWeight: 'bold',
            boxShadow: '0 4px 12px rgba(0,0,0,0.35)', transition: 'background 0.2s'
        });
        fab.onmouseenter = () => fab.style.background = '#155e75';
        fab.onmouseleave = () => fab.style.background = '#0e7490';

        const panel = document.createElement('div');
        panel.id = 'gifPanel';
        Object.assign(panel.style, {
            display: 'none', position: 'fixed', bottom: '80px', left: '24px',
            zIndex: '99998', width: '380px', background: '#fff', color: '#333',
            borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            padding: '20px', fontFamily: 'system-ui,sans-serif', fontSize: '14px',
            maxHeight: '88vh', overflowY: 'auto'
        });

        panel.innerHTML = `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
  <strong style="font-size:15px">🎞 GIF 批量下载器 <span style="font-size:11px;color:#9ca3af">v1.0</span></strong>
  <span id="gifClose" style="cursor:pointer;font-size:20px;color:#9ca3af">✕</span>
</div>

<div id="gifInfo" style="background:#ecfeff;border:1px solid #a5f3fc;border-radius:6px;padding:10px;margin-bottom:14px;line-height:1.8;font-size:13px;color:#0e7490"></div>

<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:12px">
  <div style="font-weight:bold;font-size:13px;margin-bottom:8px;color:#374151">去重设置</div>
  <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-bottom:10px">
    <input type="checkbox" id="gifDedup" checked style="cursor:pointer">
    <span style="font-size:13px">跳过已下载的同名 GIF</span>
  </label>
  <div style="margin-bottom:8px">
    <div style="font-size:12px;color:#6b7280;margin-bottom:4px">⬛ 黑名单关键词（每行一个，含关键词的 GIF 永不下载）</div>
    <textarea id="gifBlacklist" rows="2" placeholder="例如：logo" style="width:100%;padding:5px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;font-family:monospace;resize:vertical;box-sizing:border-box"></textarea>
  </div>
  <div>
    <div style="font-size:12px;color:#6b7280;margin-bottom:4px">⬜ 白名单关键词（每行一个，含关键词的 GIF 强制下载，忽略去重）</div>
    <textarea id="gifWhitelist" rows="2" placeholder="例如：special" style="width:100%;padding:5px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;font-family:monospace;resize:vertical;box-sizing:border-box"></textarea>
  </div>
</div>

<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
  <span style="font-size:13px;color:#555;white-space:nowrap">页面间隔：</span>
  <input id="gifDelay" type="number" min="500" max="10000" value="1500"
    style="width:68px;padding:4px;border:1px solid #d1d5db;border-radius:4px;font-size:13px">
  <span style="font-size:12px;color:#9ca3af">ms（建议 ≥ 1000）</span>
</div>

<div style="border-top:1px solid #e5e7eb;margin-bottom:14px"></div>

<div style="display:flex;gap:8px;margin-bottom:8px">
  <button id="gifStart" style="flex:1;padding:10px;background:#0e7490;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;font-size:14px">▶ 开始下载</button>
  <button id="gifStop" style="flex:0 0 72px;padding:10px;background:#ef4444;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;display:none">⏹ 停止</button>
</div>
<button id="gifClearHistory" style="width:100%;padding:7px;background:#f3f4f6;color:#6b7280;border:1px solid #e5e7eb;border-radius:6px;cursor:pointer;font-size:12px;margin-bottom:10px">🗑 清空已下载记录（重置去重）</button>

<div id="gifProgressWrap" style="display:none">
  <div style="display:flex;justify-content:space-between;margin-bottom:4px">
    <span id="gifProgressText" style="font-size:12px;color:#555"></span>
    <span id="gifProgressPct" style="font-size:12px;font-weight:bold;color:#0e7490"></span>
  </div>
  <div style="background:#e5e7eb;border-radius:999px;height:8px;overflow:hidden;margin-bottom:8px">
    <div id="gifProgressBar" style="height:100%;width:0%;background:#0e7490;transition:width 0.3s;border-radius:999px"></div>
  </div>
  <div id="gifSubStatus" style="font-size:11px;color:#9ca3af;margin-bottom:6px"></div>
  <div id="gifLog" style="height:160px;overflow-y:auto;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:8px;font-size:11px;color:#555;font-family:monospace;line-height:1.7"></div>
</div>`;

        document.body.appendChild(fab);
        document.body.appendChild(panel);
        return { fab, panel };
    }

    // ─── 列表页主逻辑 ─────────────────────────────────────────────────
    function initListPage() {
        const { fab, panel } = createUI();
        const $ = id => document.getElementById(id);
        let isRunning = false, shouldStop = false;
        let successCount = 0, skipCount = 0, failCount = 0;

        // 初始化黑白名单输入框
        $('gifBlacklist').value = getBlacklist().join('\n');
        $('gifWhitelist').value = getWhitelist().join('\n');

        // blur 时自动持久化
        $('gifBlacklist').addEventListener('blur', () =>
            saveBlacklist($('gifBlacklist').value.split('\n').map(s => s.trim()).filter(Boolean)));
        $('gifWhitelist').addEventListener('blur', () =>
            saveWhitelist($('gifWhitelist').value.split('\n').map(s => s.trim()).filter(Boolean)));

        fab.addEventListener('click', () => {
            const open = panel.style.display === 'block';
            panel.style.display = open ? 'none' : 'block';
            if (!open) refreshInfo();
        });
        $('gifClose').addEventListener('click', () => { panel.style.display = 'none'; });

        function refreshInfo() {
            const links = extractDetailLinks();
            $('gifInfo').innerHTML =
                `<b>当前页帖子数：</b>${links.length} 个<br>` +
                `<b>已下载记录：</b>${getDownloadedSet().size} 个 GIF<br>` +
                `<b>黑名单：</b>${getBlacklist().length} 条 &nbsp; <b>白名单：</b>${getWhitelist().length} 条`;
        }

        $('gifClearHistory').addEventListener('click', () => {
            if (!confirm('确定清空所有已下载记录？')) return;
            saveDownloadedSet(new Set());
            refreshInfo();
            log('🗑 已清空下载记录', '#6b7280');
        });

        function log(msg, color = '#555') {
            const el = $('gifLog');
            const d = document.createElement('div');
            d.style.color = color;
            d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
            el.appendChild(d);
            el.scrollTop = el.scrollHeight;
        }

        function updateProgress(done, total) {
            const pct = total > 0 ? Math.round(done / total * 100) : 0;
            $('gifProgressBar').style.width = pct + '%';
            $('gifProgressPct').textContent = pct + '%';
            $('gifProgressText').textContent = `帖子 ${done}/${total}（✅${successCount} ⏭${skipCount} ❌${failCount}）`;
        }

        $('gifStart').addEventListener('click', async () => {
            if (isRunning) return;

            // 保存最新黑白名单
            saveBlacklist($('gifBlacklist').value.split('\n').map(s => s.trim()).filter(Boolean));
            saveWhitelist($('gifWhitelist').value.split('\n').map(s => s.trim()).filter(Boolean));

            const links = extractDetailLinks();
            if (!links.length) {
                alert('未在当前页找到帖子链接，请检查 CONFIG.listItemSelector');
                return;
            }

            const delay = Math.max(500, parseInt($('gifDelay').value) || 1500);
            const dedupEnabled = $('gifDedup').checked;

            isRunning = true; shouldStop = false;
            successCount = 0; skipCount = 0; failCount = 0;

            $('gifStart').style.display = 'none';
            $('gifStop').style.display = 'block';
            $('gifStop').disabled = false;
            $('gifStop').textContent = '⏹ 停止';
            $('gifProgressWrap').style.display = 'block';
            $('gifLog').innerHTML = '';

            log(`【开始】共 ${links.length} 个帖子，间隔 ${delay}ms`, '#0e7490');

            for (let i = 0; i < links.length; i++) {
                if (shouldStop) { log('⏹ 已停止', '#ef4444'); break; }

                const { url, title } = links[i];
                updateProgress(i, links.length);
                $('gifSubStatus').textContent = '';
                log(`↓ [${i + 1}/${links.length}] ${title}`);

                try {
                    const html = await fetchPage(url);
                    const { gifs, isFullBody } = extractGifsFromHtml(html, url);

                    if (isFullBody)
                        log('  ⚠ 未命中正文选择器，已 fallback 到 body，建议检查 CONFIG.contentSelector', '#d97706');

                    if (!gifs.length) {
                        log('  ⚪ 未找到 GIF，跳过', '#9ca3af');
                        skipCount++;
                    } else {
                        log(`  🖼 找到 ${gifs.length} 个 GIF`);
                        for (const gifUrl of gifs) {
                            if (shouldStop) break;

                            const filename = gifFilenameFromUrl(gifUrl);
                            $('gifSubStatus').textContent = `  → ${filename}`;

                            if (dedupEnabled) {
                                const { skip, reason } = shouldSkip(filename);
                                if (skip) {
                                    log(`  ⏭ 跳过 ${filename}（${reason}）`, '#9ca3af');
                                    skipCount++;
                                    continue;
                                }
                                if (reason === '白名单(强制)') {
                                    log(`  ⬜ 白名单强制下载：${filename}`, '#0891b2');
                                }
                            }

                            const result = await downloadGif(gifUrl, filename);
                            if (result.ok) {
                                addToDownloaded(filename);
                                successCount++;
                                log(`  ✅ ${filename}`, '#059669');
                            } else {
                                failCount++;
                                log(`  ❌ ${filename} — ${result.reason}`, '#ef4444');
                            }

                            await sleep(CONFIG.downloadDelay);
                        }
                    }
                } catch (err) {
                    failCount++;
                    log(`❌ 帖子加载失败 — ${err.message}`, '#ef4444');
                }

                updateProgress(i + 1, links.length);
                if (i < links.length - 1 && !shouldStop) await sleep(delay);
            }

            isRunning = false; shouldStop = false;
            $('gifStart').style.display = 'block';
            $('gifStop').style.display = 'none';
            $('gifSubStatus').textContent = '';
            log(`─── 全部完成！✅${successCount} ⏭${skipCount} ❌${failCount} ───`, '#1d4ed8');
            refreshInfo();
        });

        $('gifStop').addEventListener('click', () => {
            shouldStop = true;
            $('gifStop').textContent = '停止中...';
            $('gifStop').disabled = true;
        });
    }

    // ─── 入口：列表页特征判断 ─────────────────────────────────────────
    // 列表页 URL 含 thread-htm（如 thread-htm-fid-3-type-17.html）
    const isListPage = /thread-htm/.test(location.pathname);

    if (isListPage) initListPage();

})();

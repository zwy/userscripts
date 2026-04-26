// ==UserScript==
// @name         论坛 GIF 批量下载器
// @namespace    https://github.com/zwy/userscripts
// @version      1.4
// @description  在论坛列表页批量进入详情页，提取并下载正文中的 GIF 图片，支持去重、黑名单/白名单
// @author       zwy
// @match        *://*.e6042m9.cc/*
// @match        *://e6042m9.cc/*
// @include      /^https?:\/\/([\w-]+\.)?e6042m9\.cc(:\d+)?\//
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      e6042m9.cc
// @connect      *.e6042m9.cc
// @connect      *
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/zwy/userscripts/main/pw-forum-gif-downloader/pw-forum-gif-downloader.user.js
// @downloadURL  https://raw.githubusercontent.com/zwy/userscripts/main/pw-forum-gif-downloader/pw-forum-gif-downloader.user.js
// ==/UserScript==

(function () {
    'use strict';

    // ─── 配置 ──────────────────────────────────────────────────────────
    const CONFIG = {
        listItemSelectors: [
            'a[href*="html_data"]',
            'a[href*="read-htm-tid"]',
            'a[href*="read.php"]',
            '.threadlist a[href]',
            'td.folder a[href]',
            'h3 a[href], h4 a[href]',
            '.subject a[href]',
        ],
        contentSelector: '.t_msgfont, .read-message, .postmessage, .post_message, .message, .threadtext, [id^="postmessage_"], td.t_f, .post-content, .content',
        pageDelay: 1500,
        retryMax: 3,
        retryDelay: 3000,
        downloadDelay: 500,
        skipUrlKeywords: ['smilies', 'emoji', 'face', 'avatar', 'emo', 'smiley', '/s/', 'attachicons'],
    };

    // ─── 工具 ─────────────────────────────────────────────────────────
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    // ─── URL 解析工具 ───────────────────────────────────────────────────
    //
    // 核心修复：用 new URL(href, base) 解析所有链接。
    // 原因：手动字符串拼接会丢失端口号（:2096），
    // 并且若 href 带有 http:// 则不会自动升级到 https://。
    // new URL() 会完整保留协议+域名+端口，
    // 并最终强制将协议升级到和当前页面一致。
    //
    function resolveUrl(href, base) {
        try {
            const resolved = new URL(href, base);
            // 强制协议升级：如果当前页面是 https，则将解析结果也升级为 https
            // 防止混合内容错误（Mixed Content）
            if (location.protocol === 'https:' && resolved.protocol === 'http:') {
                resolved.protocol = 'https:';
            }
            return resolved.href;
        } catch (e) {
            return null;
        }
    }

    // ─── 持久化存储 ──────────────────────────────────────────────────
    function getDownloadedSet() { try { return new Set(JSON.parse(GM_getValue('gif_downloaded', '[]'))); } catch (e) { return new Set(); } }
    function saveDownloadedSet(set) { GM_setValue('gif_downloaded', JSON.stringify([...set])); }
    function addToDownloaded(f) { const s = getDownloadedSet(); s.add(f); saveDownloadedSet(s); }
    function getBlacklist() { try { return JSON.parse(GM_getValue('gif_blacklist', '[]')); } catch (e) { return []; } }
    function getWhitelist() { try { return JSON.parse(GM_getValue('gif_whitelist', '[]')); } catch (e) { return []; } }
    function saveBlacklist(arr) { GM_setValue('gif_blacklist', JSON.stringify(arr)); }
    function saveWhitelist(arr) { GM_setValue('gif_whitelist', JSON.stringify(arr)); }

    // ─── 去重判断 ─────────────────────────────────────────────────────
    function shouldSkip(filename) {
        const lower = filename.toLowerCase();
        if (getBlacklist().some(kw => kw && lower.includes(kw.toLowerCase()))) return { skip: true, reason: '黑名单' };
        if (getWhitelist().some(kw => kw && lower.includes(kw.toLowerCase()))) return { skip: false, reason: '白名单(强制)' };
        if (getDownloadedSet().has(filename)) return { skip: true, reason: '已下载' };
        return { skip: false, reason: '' };
    }

    function gifFilenameFromUrl(url) {
        try { const p = new URL(url).pathname.split('/'); return decodeURIComponent(p[p.length - 1] || 'unnamed.gif'); }
        catch (e) { return url.split('/').pop().split('?')[0] || 'unnamed.gif'; }
    }

    function isDecorativeGif(url) { return CONFIG.skipUrlKeywords.some(kw => url.toLowerCase().includes(kw)); }

    // ─── 抓取页面 HTML（fetch + credentials 携带 Cookie，绕过 CDN 鉴权）────────────────
    async function fetchPage(url, retry = 0) {
        try {
            // 请求前再次确认 URL 为 https（安全网。防止拼接阶段遗漏的 http 链接）
            const safeUrl = location.protocol === 'https:' ? url.replace(/^http:/, 'https:') : url;
            const resp = await fetch(safeUrl, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                },
                redirect: 'follow',
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const text = await resp.text();
            if (text.includes('Error 530') || text.includes('域名未配置') || text.includes('CDN节点')) {
                throw new Error('CDN拦截页 (530)，页面可能需登录或处于不同域名');
            }
            return text;
        } catch (err) {
            if (retry < CONFIG.retryMax) {
                await sleep(CONFIG.retryDelay);
                return fetchPage(url, retry + 1);
            }
            throw err;
        }
    }

    // ─── 从详情页 HTML 提取正文 GIF ──────────────────────────────────
    function extractGifsFromHtml(html, pageUrl) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        let contentEl = null, hitSelector = '';
        for (const sel of CONFIG.contentSelector.split(',').map(s => s.trim())) {
            try { const el = doc.querySelector(sel); if (el) { contentEl = el; hitSelector = sel; break; } } catch (e) {}
        }
        const root = contentEl || doc.body;
        const gifs = [];
        for (const img of root.querySelectorAll('img')) {
            const src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('file') || '';
            if (!src || !src.toLowerCase().includes('.gif') || isDecorativeGif(src)) continue;
            // 使用 resolveUrl 确保 GIF 链接也不会有协议问题
            const absUrl = resolveUrl(src, pageUrl);
            if (absUrl) gifs.push(absUrl);
        }
        return { gifs, isFullBody: !contentEl, hitSelector };
    }

    // ─── 下载单个 GIF（同域用 fetch，跨域用 GM_xmlhttpRequest）─────────────
    function isSameOrigin(url) {
        try { return new URL(url).origin === location.origin; } catch (e) { return false; }
    }

    async function downloadGif(url, filename) {
        try {
            let blob;
            if (isSameOrigin(url)) {
                const resp = await fetch(url, { credentials: 'include' });
                if (!resp.ok) return { ok: false, reason: `HTTP ${resp.status}` };
                blob = await resp.blob();
            } else {
                blob = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'GET', url, responseType: 'blob',
                        headers: { 'Referer': location.href },
                        onload(r) { r.status === 200 ? resolve(r.response) : reject(new Error(`HTTP ${r.status}`)); },
                        onerror() { reject(new Error('网络错误')); }
                    });
                });
            }
            const a = document.createElement('a');
            const objUrl = URL.createObjectURL(blob);
            a.href = objUrl; a.download = filename;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(objUrl), 3000);
            return { ok: true };
        } catch (err) {
            return { ok: false, reason: err.message };
        }
    }

    // ─── 从列表页提取帖子链接 ─────────────────────────────────────────
    function extractDetailLinks() {
        const seen = new Set(), links = [];
        let hitSel = '';
        for (const sel of CONFIG.listItemSelectors) {
            try {
                const nodes = document.querySelectorAll(sel);
                if (!nodes.length) continue;
                nodes.forEach(a => {
                    const href = a.getAttribute('href');
                    if (!href || href === '#' || /login|register|logout|page=|&page|search/i.test(href)) return;
                    // 使用 resolveUrl：自动保留协议+域名+端口，并升级 http 到 https
                    const url = resolveUrl(href, location.href);
                    if (!url || seen.has(url)) return;
                    seen.add(url);
                    links.push({ url, title: a.textContent.trim().replace(/\s+/g, ' ').substring(0, 60) || '未知标题' });
                });
                if (links.length) { hitSel = sel; break; }
            } catch (e) {}
        }
        console.log(`[GIF下载器] 选择器命中: "${hitSel}"，找到 ${links.length} 个链接`);
        return links;
    }

    // ─── 页面类型判断 ─────────────────────────────────────────────────
    const path = location.pathname + location.search;
    const isListPage = /thread-htm/.test(path) || /[?&]fid=/.test(path);

    // ─── UI ──────────────────────────────────────────────────────────
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
            zIndex: '99998', width: '400px', background: '#fff', color: '#333',
            borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            padding: '20px', fontFamily: 'system-ui,sans-serif', fontSize: '14px',
            maxHeight: '88vh', overflowY: 'auto'
        });

        panel.innerHTML = `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
  <strong style="font-size:15px">🎞 GIF 批量下载器 <span style="font-size:11px;color:#9ca3af">v1.4</span></strong>
  <span id="gifClose" style="cursor:pointer;font-size:20px;color:#9ca3af">✕</span>
</div>

<div id="gifInfo" style="background:#ecfeff;border:1px solid #a5f3fc;border-radius:6px;padding:10px;margin-bottom:10px;line-height:1.8;font-size:13px;color:#0e7490"></div>

<details id="gifDebugWrap" style="margin-bottom:12px;font-size:12px">
  <summary style="cursor:pointer;color:#6b7280;user-select:none">🔍 诊断：查看识别到的帖子链接</summary>
  <div id="gifDebugLinks" style="margin-top:6px;max-height:120px;overflow-y:auto;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:8px;font-size:11px;font-family:monospace;color:#374151;line-height:1.6"></div>
  <div style="margin-top:6px;font-size:11px;color:#9ca3af">若此处为空，说明列表选择器未命中，请按 F12 查看帖子 &lt;a&gt; 的 href 格式反馈</div>
</details>

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

        $('gifBlacklist').value = getBlacklist().join('\n');
        $('gifWhitelist').value = getWhitelist().join('\n');
        $('gifBlacklist').addEventListener('blur', () => saveBlacklist($('gifBlacklist').value.split('\n').map(s => s.trim()).filter(Boolean)));
        $('gifWhitelist').addEventListener('blur', () => saveWhitelist($('gifWhitelist').value.split('\n').map(s => s.trim()).filter(Boolean)));

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
            const debugEl = $('gifDebugLinks');
            debugEl.innerHTML = !links.length
                ? '<span style="color:#ef4444">⚠ 未识别到帖子链接，请展开查看并反馈</span>'
                : links.slice(0, 10).map(l => `<div title="${l.url}">• ${l.title}<br><span style="color:#9ca3af">${l.url.substring(0, 80)}</span></div>`).join('')
                  + (links.length > 10 ? `<div style="color:#9ca3af">...还有 ${links.length - 10} 个</div>` : '');
        }

        $('gifClearHistory').addEventListener('click', () => {
            if (!confirm('确定清空所有已下载记录？')) return;
            saveDownloadedSet(new Set()); refreshInfo(); log('🗑 已清空下载记录', '#6b7280');
        });

        function log(msg, color = '#555') {
            const el = $('gifLog'), d = document.createElement('div');
            d.style.color = color;
            d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
            el.appendChild(d); el.scrollTop = el.scrollHeight;
        }

        function updateProgress(done, total) {
            const pct = total > 0 ? Math.round(done / total * 100) : 0;
            $('gifProgressBar').style.width = pct + '%';
            $('gifProgressPct').textContent = pct + '%';
            $('gifProgressText').textContent = `帖子 ${done}/${total}（✅${successCount} ⏭${skipCount} ❌${failCount}）`;
        }

        $('gifStart').addEventListener('click', async () => {
            if (isRunning) return;
            saveBlacklist($('gifBlacklist').value.split('\n').map(s => s.trim()).filter(Boolean));
            saveWhitelist($('gifWhitelist').value.split('\n').map(s => s.trim()).filter(Boolean));

            const links = extractDetailLinks();
            if (!links.length) { alert('未识别到帖子链接！\n请点击诊断区查看，或按 F12 查看控制台'); return; }

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
                    const { gifs, isFullBody, hitSelector } = extractGifsFromHtml(html, url);
                    if (isFullBody) log('  ⚠ 未命中正文选择器，已 fallback 到 body', '#d97706');
                    else log(`  📌 正文选择器: ${hitSelector}`);

                    if (!gifs.length) { log('  ⚪ 无 GIF，跳过', '#9ca3af'); skipCount++; }
                    else {
                        log(`  🖼 找到 ${gifs.length} 个 GIF`);
                        for (const gifUrl of gifs) {
                            if (shouldStop) break;
                            const filename = gifFilenameFromUrl(gifUrl);
                            $('gifSubStatus').textContent = `  → ${filename}`;
                            if (dedupEnabled) {
                                const { skip, reason } = shouldSkip(filename);
                                if (skip) { log(`  ⏭ 跳过 ${filename}（${reason}）`, '#9ca3af'); skipCount++; continue; }
                                if (reason === '白名单(强制)') log(`  ⬜ 白名单强制下载：${filename}`, '#0891b2');
                            }
                            const result = await downloadGif(gifUrl, filename);
                            if (result.ok) { addToDownloaded(filename); successCount++; log(`  ✅ ${filename}`, '#059669'); }
                            else { failCount++; log(`  ❌ ${filename} — ${result.reason}`, '#ef4444'); }
                            await sleep(CONFIG.downloadDelay);
                        }
                    }
                } catch (err) {
                    failCount++;
                    log(`❌ 加载失败 — ${err.message}`, '#ef4444');
                }

                updateProgress(i + 1, links.length);
                if (i < links.length - 1 && !shouldStop) await sleep(delay);
            }

            isRunning = false; shouldStop = false;
            $('gifStart').style.display = 'block';
            $('gifStop').style.display = 'none';
            $('gifSubStatus').textContent = '';
            log(`─── 完成！✅${successCount} ⏭${skipCount} ❌${failCount} ───`, '#1d4ed8');
            refreshInfo();
        });

        $('gifStop').addEventListener('click', () => {
            shouldStop = true;
            $('gifStop').textContent = '停止中...';
            $('gifStop').disabled = true;
        });
    }

    // ─── 入口 ─────────────────────────────────────────────────────────
    console.log(`[GIF下载器 v1.4] 已加载 | ${location.href} | isListPage: ${isListPage}`);
    if (isListPage) initListPage();

})();

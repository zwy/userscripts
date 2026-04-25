# 🐵 UserScripts — 个人篡改猴脚本合集

个人使用的 Tampermonkey 用户脚本，持续更新。

## 脚本列表

| 脚本名称 | 适用网站 | 功能简介 | 安装链接 |
|----------|----------|----------|----------|
| [alicesw 章节导出工具](./alicesw-chapter-exporter/) | alicesw.com | 一键导出书籍章节目录（JSON/CSV/TXT/MD） | [安装](https://raw.githubusercontent.com/zwy/userscripts/main/alicesw-chapter-exporter/alicesw-chapter-exporter.user.js) |
| [alicesw 小说章节下载器](./alicesw-novel-downloader/) | alicesw.com | 批量下载每章小说正文为TXT，支持番茄小说导入和 Edge TTS 朗读 | [安装](https://raw.githubusercontent.com/zwy/userscripts/main/alicesw-novel-downloader/alicesw-novel-downloader.user.js) |
| [nnhm7 漫画CBZ下载器](./nnhm7-manga-downloader/) | nnhm7.org 及各备用域名 | 批量下载漫画章节为CBZ，兼容 Komga 本地服务器 | [安装](https://raw.githubusercontent.com/zwy/userscripts/main/nnhm7-manga-downloader/nnhm7-manga-downloader.user.js) |

## 使用说明

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 点击上表中的「安装」链接，Tampermonkey 会自动弹出安装确认界面
3. 点击「安装」确认即可

## 自动更新

所有脚本均配置了 `@updateURL`，Tampermonkey 会定期检查并提示更新。

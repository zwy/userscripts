# alicesw 章节目录导出工具

[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-UserScript-blue)](https://www.tampermonkey.net/)
[![Version](https://img.shields.io/badge/version-1.2-green)](./alicesw-chapter-exporter.user.js)

在 [alicesw.com](https://www.alicesw.com) 章节目录页面，一键提取所有章节名称和链接，支持四种格式导出。

## 安装

点击下方链接，Tampermonkey 会自动弹出安装界面：

👉 **[点击安装脚本](https://raw.githubusercontent.com/zwy/userscripts/main/alicesw-chapter-exporter/alicesw-chapter-exporter.user.js)**

## 使用方法

1. 打开任意书籍的章节目录页（URL 格式：`https://www.alicesw.com/other/chapters/id/xxxxx.html`）
2. 页面右下角会出现 **「📋 导出章节目录」** 浮动按钮
3. 点击按钮，选择所需格式导出或复制

## 支持的导出格式

| 格式 | 说明 |
|------|------|
| JSON | 结构化数据，适合程序处理 |
| CSV  | 可直接用 Excel / WPS 打开 |
| TXT  | 纯文本，人类友好 |
| Markdown | 带链接的表格，适合粘贴进笔记软件 |

## 适用网站

- `https://www.alicesw.com/other/chapters/id/*.html`
- `https://alicesw.com/other/chapters/id/*.html`
- `https://www.alicesw.org/other/chapters/id/*.html`
- `https://alicesw.org/other/chapters/id/*.html`

## 更新日志

### v1.2
- 初始版本发布
- 支持 JSON / CSV / TXT / Markdown 四种导出格式
- 支持一键复制到剪贴板
- 从面包屑导航自动识别书名

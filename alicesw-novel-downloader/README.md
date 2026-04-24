# alicesw 小说章节下载器

[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-UserScript-blue)](https://www.tampermonkey.net/)
[![Version](https://img.shields.io/badge/version-1.0-green)](./alicesw-novel-downloader.user.js)

在 [alicesw.com](https://www.alicesw.com) **章节目录页**，批量下载每章小说内容为独立 TXT 文件。

## 安装

点击下方链接，Tampermonkey 会自动弹出安装界面：

👉 **[点击安装脚本](https://raw.githubusercontent.com/zwy/userscripts/main/alicesw-novel-downloader/alicesw-novel-downloader.user.js)**

## 使用方法

1. 打开任意书籍的章节目录页（URL 格式：`https://www.alicesw.com/other/chapters/id/xxxxx.html`）
2. 页面**左下角**出现绿色 **「📥 下载小说」** 浮动按钮
3. 点击按钮，弹出控制面板
4. 选择下载范围（全部 / 指定章节范围）
5. 设置请求间隔（建议 1500ms，防止被封）
6. 点击 **「▶ 开始下载」**，每章自动保存为独立 TXT 文件

## 功能特性

- ✅ 逐章顺序下载，自动命名（`书名_0001_章节名.txt`）
- ✅ 实时进度条 + 日志面板
- ✅ 失败自动重试（最多3次）
- ✅ 支持随时停止下载
- ✅ 可指定下载章节范围（如第5章到第20章）
- ✅ 可调节请求间隔（防封IP）
- ✅ 输出 UTF-8 BOM 编码，记事本/WPS 打开不乱码

## 输出文件格式

每章保存为一个 TXT 文件，文件名格式：
```
书名_0001_第1章 章节名.txt
书名_0002_第2章 章节名.txt
...
```

文件内容格式：
```
第1章 章节名
══════════════════════════════════════════════════

正文段落...

正文段落...

──────────────────────────────────────────────────
```

## 注意事项

- 请求间隔**建议不低于 1000ms**，过快可能导致 IP 被临时封禁
- 浏览器会连续弹出下载保存框，建议提前在 Edge 设置中开启「自动保存下载」
- 下载大量章节时保持页面不要关闭

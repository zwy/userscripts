# 📦 nnhm7 漫画CBZ下载器

[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-UserScript-blue)](https://www.tampermonkey.net/)
[![Version](https://img.shields.io/badge/version-1.0-green)](./nnhm7-manga-downloader.user.js)
[![Komga](https://img.shields.io/badge/Komga-CBZ兼容-orange)](https://komga.org/)

在 nnhm7.org（鸟鸟韩漫）批量下载漫画章节为 **CBZ 格式**，可直接放入 [Komga](https://komga.org/) 本地漫画服务器使用。

## 安装

👉 **[点击安装脚本](https://raw.githubusercontent.com/zwy/userscripts/main/nnhm7-manga-downloader/nnhm7-manga-downloader.user.js)**

## 使用方法

### 批量下载（章节列表页）

1. 打开漫画的章节列表页（URL 格式：`/comic/漫画名.html`）
2. 页面**左下角**出现紫色 **「📦 下载漫画」** 按钮
3. 点击按钮，展开控制面板
4. 可选配置：
   - **文件名前缀**：留空则自动用「漫画名_章节编号_章节名.cbz」
   - **下载范围**：全部章节 或 指定第 N 话到第 M 话
   - **章节间隔**：建议 1200ms 以上，防止被封
5. 点击 **「▶ 开始下载」**，每话自动打包为独立 CBZ 文件

### 单章下载（章节详情页）

1. 打开任意章节详情页（URL 格式：`/comic/漫画名/chapter-xxxxx.html`）
2. 页面**右下角**出现 **「📦 下载本章CBZ」** 按钮
3. 点击即可直接打包下载当前章节

## 输出文件格式

```
漫画名_0001_第1話.cbz
漫画名_0002_第2話.cbz
...
```

CBZ 内部结构（标准 ZIP）：
```
第1話.cbz
├── 0001.jpg
├── 0002.jpg
├── 0003.jpg
└── ...
```

## 配合 Komga 使用

将下载的 CBZ 文件放入 Komga 的漫画目录，推荐目录结构：

```
~/komga/data/
└── 漫画名/
    ├── 0001_第1話.cbz
    ├── 0002_第2話.cbz
    └── 0003_第3話.cbz
```

Komga 会自动扫描并识别 CBZ 文件，按文件名排序展示章节。

## 功能特性

- ✅ 批量下载，实时进度条 + 日志
- ✅ 单章页一键下载
- ✅ CBZ 文件名包含章节编号，自动排序不乱序
- ✅ 图片 3 张并发下载，速度与稳定性均衡
- ✅ 失败自动重试（最多 3 次）
- ✅ 支持随时停止下载
- ✅ 文件名自动去除非法字符
- ✅ 支持网站多个域名（nnhm7.org/com, nnhm5.xyz, nnhanman*.com）

## 注意事项

- 章节间隔建议不低于 **1000ms**，过快可能导致 IP 被临时屏蔽
- Edge 浏览器下载多文件时建议关闭「每次询问保存位置」（设置 → 下载 → 关闭询问）
- CBZ 格式本质是 ZIP，打包采用 STORE 模式（不压缩），速度最快

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

---

## 🗂️ CBZ 整理工具（cbz_organizer.py）

下载多部漫画后，本地目录里会混放大量 CBZ 文件，例如：

```
Downloads/
  獵艷琯理員_0011_第11話.cbz
  獵艷琯理員_0012_第12話.cbz
  某某漫画_0001_第1話.cbz
  某某漫画_0002_第2話.cbz
```

`cbz_organizer.py` 会自动识别文件名中的漫画名称，将文件归类到对应子文件夹，并去除文件名中的漫画名前缀：

```
Downloads/
  獵艷琯理員/
    0011_第11話.cbz
    0012_第12話.cbz
  某某漫画/
    0001_第1話.cbz
    0002_第2話.cbz
```

### 环境要求

- Python 3.6+，**无需安装任何第三方依赖**

### 基本用法

```bash
# 整理当前目录（默认：复制模式，原文件保留）
python cbz_organizer.py

# 整理指定目录
python cbz_organizer.py D:\Downloads

# 先预览，不执行实际操作（推荐第一次使用）
python cbz_organizer.py D:\Downloads --dry-run

# 移动模式（不保留原文件，节省磁盘空间）
python cbz_organizer.py D:\Downloads --move
```

### 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `目录路径` | 要整理的目录（位置参数） | 当前目录 |
| `--dry-run` | 预览模式，仅打印操作列表，不实际移动/复制文件 | 关闭 |
| `--move` | 移动模式，整理后删除原文件 | 关闭（复制模式） |

### 文件名匹配规则

工具按第一个 `_` 之前的字符串识别漫画名称，支持以下格式：

```
漫画名_0001_章节名.cbz       → 漫画名/0001_章节名.cbz
漫画名_第1話.cbz             → 漫画名/第1話.cbz
My_Comic_001_Chapter1.cbz   → My/Comic_001_Chapter1.cbz  ⚠️ 含下划线的英文名建议手动改名
```

> **提示**：漫画名本身含有下划线时，工具会以第一个 `_` 为分隔符切分，建议下载时不要在漫画名中使用下划线。

### 注意事项

- **目标路径冲突**：若目标文件已存在，工具会自动跳过并给出提示，不会覆盖。
- **非 CBZ 文件**：目录中的其他文件（`.zip`、`.jpg` 等）不受影响，原样保留。
- **推荐先 `--dry-run`**：首次使用建议预览确认后，再去掉 `--dry-run` 正式执行。

---

## 功能特性

- ✅ 批量下载，实时进度条 + 日志
- ✅ 单章页一键下载
- ✅ CBZ 文件名包含章节编号，自动排序不乱序
- ✅ 图片 3 张并发下载，速度与稳定性均衡
- ✅ 失败自动重试（最多 3 次）
- ✅ 支持随时停止下载
- ✅ 文件名自动去除非法字符
- ✅ 支持网站多个域名（nnhm7.org/com, nnhm5.xyz, nnhanman*.com）
- ✅ 本地 CBZ 整理工具，一键归类到漫画子目录

## 注意事项

- 章节间隔建议不低于 **1000ms**，过快可能导致 IP 被临时屏蔽
- Edge 浏览器下载多文件时建议关闭「每次询问保存位置」（设置 → 下载 → 关闭询问）
- CBZ 格式本质是 ZIP，打包采用 STORE 模式（不压缩），速度最快

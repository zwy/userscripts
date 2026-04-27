# 🎞 论坛 GIF 批量下载器

[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-UserScript-blue)](https://www.tampermonkey.net/)
[![Version](https://img.shields.io/badge/version-1.5-green)](./pw-forum-gif-downloader.user.js)

在论坛列表页自动批量进入帖子详情页，提取正文中的 GIF 图片并下载，支持去重、黑名单、白名单、跨设备去重记录同步。

## 安装

👉 **[点击安装脚本](https://raw.githubusercontent.com/zwy/userscripts/main/pw-forum-gif-downloader/pw-forum-gif-downloader.user.js)**

## 使用方法

1. 打开论坛**列表页**（URL 格式：`/pw/thread-htm-fid-*`）
2. 页面**左下角**出现蓝绿色 **「🎞 GIF下载」** 按钮
3. 点击按钮，展开控制面板
4. 根据需要配置去重设置和请求间隔
5. 点击 **「▶ 开始下载」** 即可，脚本会依次抓取每个帖子详情页，自动下载正文中的 GIF

## 功能特性

- ✅ 自动遍历当前列表页所有帖子，无需手动点击
- ✅ 只提取正文容器内的 GIF，自动过滤表情包、头像等装饰性图片
- ✅ **去重**：记住已下载文件名，重复运行不重复下载
- ✅ **黑名单**：文件名含指定关键词的 GIF 永不下载
- ✅ **白名单**：文件名含指定关键词的 GIF 强制下载，无视去重
- ✅ **导出记录**：将当前去重库导出为 JSON 文件，方便备份或同步
- ✅ **导入记录**：从 JSON 文件（或 `gif_scanner.py` 生成的文件）导入已下载列表，实现跨设备去重同步
- ✅ 实时进度条 + 详细日志
- ✅ 支持随时停止
- ✅ 失败自动重试（最多 3 次）
- ✅ 黑白名单和下载记录持久化保存在本地，重启浏览器不丢失

## 去重机制说明

| 情形 | 行为 |
|------|------|
| 文件名已在记录中 | 跳过 |
| 文件名匹配黑名单关键词 | 永远跳过（优先级最高） |
| 文件名匹配白名单关键词 | 强制下载，忽略去重记录 |
| 取消勾选「跳过已下载」 | 全部下载，不做去重判断 |

> 点击「🗑 清空已下载记录」可重置去重状态，下次运行会重新下载所有 GIF。

---

## 跨设备去重同步

如果你将所有 GIF 统一存放在一台电脑（存储 PC），在其他设备浏览论坛时希望跳过已下载的文件，可以使用配套的 Python 工具 `gif_scanner.py` 实现离线同步，**无需服务器、零依赖**。

### 工作流程

```
存储 PC                              浏览设备（任意浏览器）
─────────────────────────────────    ─────────────────────────────────
① 运行 gif_scanner.py               
   扫描 GIF 文件夹                   
   ↓                                
② 生成 gif_records.json             
   ↓                                
③ 将 JSON 复制到浏览设备  →→→→→→→  ④ 脚本面板点击「📥 导入记录」
                                        选择 gif_records.json
                                        ↓
                                     去重库同步完成，开始下载
```

反向同步同样支持：在浏览设备点击「📤 导出记录」，可将脚本内已有的下载记录导出为 JSON，再通过 `gif_scanner.py` 或合并工具统一管理。

### gif_scanner.py 用法

**环境要求：** Python 3.6+，无需安装任何第三方库。

```bash
# 扫描指定目录（Windows）
python gif_scanner.py D:\Downloads\GIFs

# 扫描指定目录（macOS / Linux）
python gif_scanner.py /path/to/gifs

# 递归扫描所有子目录
python gif_scanner.py D:\GIFs --recursive

# 指定输出文件名
python gif_scanner.py D:\GIFs -o my_records.json

# 预览结果，不写入文件
python gif_scanner.py D:\GIFs --dry-run

# 扫描当前目录
python gif_scanner.py
```

**输出 JSON 格式：**

```json
{
  "version": 1,
  "exported_at": "2026-04-27T12:00:00",
  "count": 123,
  "filenames": ["abc.gif", "def.gif"]
}
```

此格式与脚本面板「📤 导出记录」生成的格式完全一致，可互相导入。

### 导入 / 导出按钮说明

| 按钮 | 功能 |
|------|------|
| 📤 导出记录 | 将脚本当前去重库导出为 `gif_records_YYYY-MM-DD.json` |
| 📥 导入记录 | 选择本地 JSON 文件，合并到当前去重库（只新增，不覆盖） |

> 导入操作是**合并**而非替换，不会丢失已有记录。

---

## 适配新站点 / 调整选择器

如果在其他论坛使用，或页面结构变化导致找不到内容，修改脚本顶部 `CONFIG` 中的两个选择器即可：

```js
const CONFIG = {
    // 列表页：帖子链接选择器（<a> 元素）
    listItemSelector: 'a[href*="html_data"]',

    // 详情页：正文容器选择器（GIF 只从这里提取）
    // 多个选择器用逗号分隔，从左到右依次尝试
    contentSelector: '.t_msgfont, .read-message, .postmessage, ...',
};
```

**如何找到正文选择器：**
1. 打开任意帖子详情页
2. 按 F12 → 点击正文区域的 GIF 图片
3. 向上找到包裹正文内容的父元素，查看其 `class` 或 `id`
4. 将对应选择器填入 `contentSelector`

> 如果所有选择器均未命中，脚本会自动 fallback 到整个 `body`，并在日志中打印黄色警告提示。

## 注意事项

- 页面间隔建议不低于 **1000ms**，过快可能导致 IP 被临时屏蔽
- Edge 浏览器下载多文件时建议关闭「每次询问保存位置」（设置 → 下载 → 关闭询问）
- 下载记录和黑白名单保存在 Tampermonkey 本地存储中，重装脚本后会清空
- `gif_scanner.py` 在 Windows / macOS / Linux 均可运行，文件名大小写不敏感（`.gif` / `.GIF` 均识别）

## 版本历史

| 版本 | 更新内容 |
|------|----------|
| v1.5 | 新增「📤 导出记录」「📥 导入记录」功能；配套发布 `gif_scanner.py` |
| v1.4 | 修复 URL 解析，使用 `resolveUrl()` 保留端口号并强制 HTTPS 升级 |
| v1.0 | 初始版本，支持批量下载、去重、黑白名单 |

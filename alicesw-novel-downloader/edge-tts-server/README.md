# 🔊 alicesw Edge TTS 本地服务

> 为篡改猴脚本 [alicesw小说章节下载器](../alicesw-novel-downloader.user.js) 提供本地语音合成服务，
> 基于 Microsoft Edge 神经网络 TTS 引擎，支持高质量中文朗读与 MP3 导出。

---

## 📋 前置要求

| 要求 | 说明 |
|------|------|
| **Python** | 3.8 及以上版本 |
| **网络** | 需要访问微软 TTS 服务器（国内可用，无需代理）|
| **浏览器** | Microsoft Edge + Tampermonkey 扩展 |

---

## 🚀 快速启动（Windows）

### 方法一：双击 start.bat（推荐）

1. 下载本目录所有文件到本地同一文件夹
2. 双击 **`start.bat`**
3. 首次运行会自动安装依赖（`edge-tts`、`flask`、`flask-cors`）
4. 看到以下输出说明服务已就绪：

```
==================================================
  alicesw Edge TTS 本地服务
  监听端口: http://localhost:9898
  默认声线: zh-CN-XiaoxiaoNeural
  接口文档:
    POST /tts    — 文本转MP3
    GET  /voices — 声线列表
    GET  /health — 健康检查
==================================================
```

5. **保持此窗口开启**，关闭窗口服务即停止

### 方法二：手动命令行

```bash
# 1. 安装依赖
pip install edge-tts flask flask-cors

# 2. 启动服务
python server.py
```

---

## 🎙️ 在小说页面使用朗读功能

服务启动后，打开任意 alicesw.com 的**章节详情页**（URL 格式：`/book/xxxxx/xxxxx.html`）：

1. 页面**右下角**出现蓝色 **「🔊 朗读小说」** 按钮
2. 点击按钮，展开朗读控制面板
3. 选择**声线**和**朗读速度**
4. 点击 **「▶ 开始朗读」** → 稍等片刻自动开始播放
5. 支持**暂停 / 继续 / 停止**
6. 点击 **「🎵 导出 MP3」** 可将当前章节保存为 MP3 文件

> ⚠️ **注意**：若按钮显示为灰色，说明未检测到本地服务，请先启动 `start.bat`

---

## 🗣️ 支持的中文声线

| 声线 ID | 名称 | 风格 |
|---------|------|------|
| `zh-CN-XiaoxiaoNeural` | 晓晓 | 女声 · 温暖活泼（**默认**）|
| `zh-CN-XiaoyiNeural` | 晓伊 | 女声 · 温柔友善 |
| `zh-CN-XiaohanNeural` | 晓涵 | 女声 · 自然流畅 |
| `zh-CN-XiaomengNeural` | 晓梦 | 女声 · 甜美活力 |
| `zh-CN-XiaochenNeural` | 晓辰 | 女声 · 温和亲切 |
| `zh-CN-YunxiNeural` | 云希 | 男声 · 稳重 |
| `zh-CN-YunyangNeural` | 云扬 | 男声 · 专业播报 |
| `zh-CN-YunjianNeural` | 云健 | 男声 · 运动激昂 |
| `zh-CN-liaoning-XiaobeiNeural` | 晓北 | 辽宁女声 |

---

## 🔌 接口说明（供开发参考）

服务监听在 `http://127.0.0.1:9898`，仅本机可访问。

### POST `/tts` — 文本转 MP3

**请求体（JSON）：**

```json
{
  "text": "要朗读的文字内容",
  "voice": "zh-CN-XiaoxiaoNeural",
  "rate": "+0%"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | string | ✅ | 要合成的文本，最大 50000 字符 |
| `voice` | string | ❌ | 声线 ID，默认 `zh-CN-XiaoxiaoNeural` |
| `rate` | string | ❌ | 语速，如 `+20%`、`-30%`，默认 `+0%` |

**返回：** `audio/mpeg` 二进制音频流

### GET `/voices` — 获取声线列表

**返回示例：**
```json
[
  {"id": "zh-CN-XiaoxiaoNeural", "name": "晓晓（女·温暖活泼）"},
  {"id": "zh-CN-YunxiNeural",    "name": "云希（男·稳重）"}
]
```

### GET `/health` — 健康检查

**返回：** `{"status": "ok", "port": 9898}`

---

## ❓ 常见问题

**Q：双击 start.bat 闪退？**
> 用命令行手动运行 `python server.py` 查看具体报错信息。

**Q：报错 `ModuleNotFoundError: No module named 'flask'`？**
> 手动运行：`pip install edge-tts flask flask-cors`，然后重新启动。

**Q：浏览器按钮一直显示灰色/未检测到服务？**
> 确认 `start.bat` 窗口正在运行且没有报错。也可在浏览器地址栏访问 `http://localhost:9898/health`，若返回 `{"status":"ok"}` 说明服务正常，刷新小说页面重试。

**Q：朗读速度怎么调？**
> 面板中拖动速度滑块：负值变慢，正值加快，`+50%` 约等于 1.5 倍速。

**Q：合成一章要多久？**
> 约 1 万字的章节通常 3–8 秒即可完成合成，取决于网络速度。

**Q：电脑重启后需要重新安装吗？**
> 不需要。依赖只需安装一次，之后每次双击 `start.bat` 即可直接启动。

---

## 📁 文件说明

```
edge-tts-server/
├── server.py          ← 本地 TTS HTTP 服务主程序
├── requirements.txt   ← Python 依赖列表
├── start.bat          ← Windows 一键启动脚本
└── README.md          ← 本文件
```

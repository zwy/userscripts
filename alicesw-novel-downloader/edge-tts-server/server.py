#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
alicesw 小说 Edge TTS 本地服务

用途：为篡改猴脚本提供本地 TTS 接口，将文本转为 MP3 音频
依赖：pip install edge-tts flask
启动：python server.py
接口：POST http://localhost:9898/tts
        Body: { "text": "要转换的文字", "voice": "zh-CN-XiaoxiaoNeural", "rate": "+0%" }
        返回：audio/mpeg 二进制流
"""

import asyncio
import io
import logging

import edge_tts
from flask import Flask, Response, jsonify, request
from flask_cors import CORS

# ──────────────────────────────────────────────
# 配置
# ──────────────────────────────────────────────
PORT = 9898
DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural"   # 默认声线（女声·晓晓）
MAX_CHARS = 50000                          # 单次最大字符数限制

# 支持的中文声线列表（供前端下拉选择）
CHINESE_VOICES = [
    {"id": "zh-CN-XiaoxiaoNeural",   "name": "晓晓（女·温暖活泼）"},
    {"id": "zh-CN-XiaoyiNeural",     "name": "晓伊（女·温柔友善）"},
    {"id": "zh-CN-XiaohanNeural",    "name": "晓涵（女·自然流畅）"},
    {"id": "zh-CN-XiaomengNeural",   "name": "晓梦（女·甜美活力）"},
    {"id": "zh-CN-XiaochenNeural",   "name": "晓辰（女·温和亲切）"},
    {"id": "zh-CN-YunxiNeural",      "name": "云希（男·稳重）"},
    {"id": "zh-CN-YunyangNeural",    "name": "云扬（男·专业播报）"},
    {"id": "zh-CN-YunjianNeural",    "name": "云健（男·运动激昂）"},
    {"id": "zh-CN-liaoning-XiaobeiNeural", "name": "晓北（辽宁女声）"},
]

# ──────────────────────────────────────────────
app = Flask(__name__)
CORS(app)   # 允许跨域，篡改猴脚本可直接请求
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


async def _synthesize(text: str, voice: str, rate: str) -> bytes:
    """调用 edge-tts 合成 MP3，返回字节流"""
    communicate = edge_tts.Communicate(text, voice, rate=rate)
    buf = io.BytesIO()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buf.write(chunk["data"])
    buf.seek(0)
    return buf.read()


@app.route("/tts", methods=["POST"])
def tts():
    """主接口：文本 → MP3 音频流"""
    data = request.get_json(force=True, silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "text 不能为空"}), 400
    if len(text) > MAX_CHARS:
        return jsonify({"error": f"文本过长，最大 {MAX_CHARS} 字符"}), 400

    voice = data.get("voice", DEFAULT_VOICE)
    rate  = data.get("rate", "+0%")

    logging.info(f"TTS 请求 | voice={voice} rate={rate} chars={len(text)}")
    try:
        audio = asyncio.run(_synthesize(text, voice, rate))
        logging.info(f"TTS 完成 | {len(audio)} bytes")
        return Response(audio, mimetype="audio/mpeg")
    except Exception as e:
        logging.error(f"TTS 失败: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/voices", methods=["GET"])
def voices():
    """返回支持的中文声线列表"""
    return jsonify(CHINESE_VOICES)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "port": PORT})


if __name__ == "__main__":
    print("="*50)
    print(f"  alicesw Edge TTS 本地服务")
    print(f"  监听端口: http://localhost:{PORT}")
    print(f"  默认声线: {DEFAULT_VOICE}")
    print(f"  接口文档:")
    print(f"    POST /tts    — 文本转MP3")
    print(f"    GET  /voices — 声线列表")
    print(f"    GET  /health — 健康检查")
    print("="*50)
    app.run(host="127.0.0.1", port=PORT, debug=False)

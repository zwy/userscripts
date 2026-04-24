@echo off
chcp 65001 >nul
echo ============================================
echo   alicesw Edge TTS 本地服务 一键启动
echo ============================================

REM 检查是否安装依赖
pip show edge-tts >nul 2>&1
if errorlevel 1 (
    echo [提示] 首次运行，正在安装依赖...
    pip install edge-tts flask flask-cors
    echo [完成] 依赖安装完毕
)

echo [启动] 服务运行中，请保持此窗口开启...
echo [提示] 在浏览器中打开小说页面后即可使用朗读功能
echo.
python server.py
pause

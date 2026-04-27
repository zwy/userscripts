#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gif_scanner.py

功能：扫描本地文件夹中所有 GIF 文件，将文件名导出为 JSON，
      供「论坛 GIF 批量下载器」脚本导入，实现跨设备去重同步。

用法：
    python gif_scanner.py                        # 扫描当前目录
    python gif_scanner.py D:\Downloads\GIFs     # 扫描指定目录
    python gif_scanner.py /path/to/gifs -o records.json  # 指定输出文件
    python gif_scanner.py D:\GIFs --recursive   # 递归扫描子目录
    python gif_scanner.py D:\GIFs --dry-run     # 预览，不写文件

输出 JSON 格式（与脚本 GM_setValue 存储格式一致）：
    {
      "version": 1,
      "exported_at": "2026-04-27T11:00:00",
      "count": 123,
      "filenames": ["abc.gif", "def.gif", ...]
    }
"""

import os
import sys
import json
import argparse
from pathlib import Path
from datetime import datetime


def scan_gif_files(folder: Path, recursive: bool = False) -> list:
    """
    扫描文件夹，返回所有 GIF 文件名列表（仅文件名，不含路径）。
    大小写不敏感：.gif / .GIF 均可识别。
    """
    filenames = []

    if recursive:
        gif_files = list(folder.glob("**/*.gif"))
        if sys.platform != "win32":
            gif_files += [f for f in folder.glob("**/*.GIF")]
    else:
        gif_files = list(folder.glob("*.gif"))
        if sys.platform != "win32":
            gif_files += [f for f in folder.glob("*.GIF")]

    for f in gif_files:
        if f.is_file():
            filenames.append(f.name)

    # 去重 + 排序（方便人工核对）
    filenames = sorted(set(filenames), key=lambda x: x.lower())
    return filenames


def build_output(filenames: list) -> dict:
    """构建符合脚本导入格式的 JSON 结构。"""
    return {
        "version": 1,
        "exported_at": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "count": len(filenames),
        "filenames": filenames,
    }


def main():
    parser = argparse.ArgumentParser(
        description="扫描本地 GIF 文件夹，导出文件名列表 JSON 供脚本去重使用",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例：
  python gif_scanner.py
  python gif_scanner.py D:\\Downloads\\GIFs
  python gif_scanner.py /Users/me/gifs -o my_records.json
  python gif_scanner.py D:\\GIFs --recursive
  python gif_scanner.py D:\\GIFs --dry-run
        """,
    )
    parser.add_argument(
        "folder",
        nargs="?",
        default=".",
        help="要扫描的 GIF 文件夹路径（默认：当前目录）",
    )
    parser.add_argument(
        "-o",
        "--output",
        default="gif_records.json",
        help="输出 JSON 文件名（默认：gif_records.json）",
    )
    parser.add_argument(
        "-r",
        "--recursive",
        action="store_true",
        help="递归扫描所有子目录",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="预览结果，不实际写入文件",
    )

    args = parser.parse_args()

    folder = Path(args.folder).expanduser().resolve()
    if not folder.exists():
        print(f"[错误] 目录不存在：{folder}")
        sys.exit(1)
    if not folder.is_dir():
        print(f"[错误] 路径不是目录：{folder}")
        sys.exit(1)

    print(f"[扫描] 目录：{folder}")
    print(f"[扫描] 递归：{'是' if args.recursive else '否'}")

    filenames = scan_gif_files(folder, recursive=args.recursive)
    data = build_output(filenames)

    print(f"[结果] 共找到 {data['count']} 个 GIF 文件")

    if args.dry_run:
        print("[预览] --dry-run 模式，不写入文件")
        print(f"[预览] 前 10 条：{filenames[:10]}")
        return

    output_path = Path(args.output)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"[完成] 已导出到：{output_path.resolve()}")
    print(f"[提示] 在脚本面板点击「导入记录」，选择此 JSON 文件即可同步去重列表")


if __name__ == "__main__":
    main()

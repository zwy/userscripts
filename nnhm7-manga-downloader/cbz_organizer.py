#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
cbz_organizer.py
功能：将同一漫画的多个 CBZ 文件自动归类到以漫画名命名的文件夹中，
并删除文件名中的漫画名前缀。

示例输入：
    猛艳甃理員_0011_第11話.cbz
    猛艳甃理員_0012_第12話.cbz

示例输出：
    猛艳甃理員/
        0011_第11話.cbz
        0012_第12話.cbz

用法：
    python cbz_organizer.py                        # 整理当前目录
    python cbz_organizer.py D:\\Downloads          # 整理指定目录
    python cbz_organizer.py D:\\Downloads --move   # 移动模式（默认是复制）
    python cbz_organizer.py D:\\Downloads --dry-run # 预览模式，不实际操作
"""

import os
import re
import sys
import shutil
import argparse
from pathlib import Path
from collections import defaultdict


def parse_cbz_name(filename: str):
    """
    解析 CBZ 文件名，返回 (manga_title, remaining_name)。

    支持格式：
      漫画名_0011_第11話.cbz   -> (漫画名, 0011_第11話.cbz)
      漫画名_0011.cbz            -> (漫画名, 0011.cbz)
      漫画名_第11話.cbz          -> (漫画名, 第11話.cbz)

    规则：第一个下划线之前的部分为漫画名，之后为章节信息。
    """
    stem = Path(filename).stem  # 去掉 .cbz
    suffix = Path(filename).suffix

    # 必须是 .cbz 文件
    if suffix.lower() != '.cbz':
        return None, None

    # 按第一个下划线切分
    idx = stem.find('_')
    if idx == -1:
        # 没有下划线，整个 stem 当作漫画名，暂时跳过
        return None, None

    manga_title = stem[:idx]       # 下划线前：漫画名
    remaining = stem[idx+1:] + suffix  # 下划线后：不含漫画名的部分

    if not manga_title or not remaining:
        return None, None

    return manga_title, remaining


def collect_cbz_files(directory: Path):
    """
    扫描目录下所有 .cbz 文件（仅扫描一层，不递归）。
    返回字典：{ manga_title: [(src_path, new_filename), ...] }
    """
    groups = defaultdict(list)
    skipped = []

    for f in sorted(directory.iterdir()):
        if not f.is_file() or f.suffix.lower() != '.cbz':
            continue
        manga_title, remaining = parse_cbz_name(f.name)
        if manga_title is None:
            skipped.append(f.name)
            continue
        groups[manga_title].append((f, remaining))

    return groups, skipped


def organize(directory: Path, move: bool = False, dry_run: bool = False):
    """
    执行整理操作。
    """
    print(f"\n📂 扫描目录: {directory}")
    print(f"   模式: {'[预览 DRY-RUN]' if dry_run else ('移动' if move else '复制')}\n")

    groups, skipped = collect_cbz_files(directory)

    if not groups:
        print("⚠　未在该目录下找到可整理的 CBZ 文件。")
        print("   请确认文件名格式为: 漫画名_XXXX_章节.cbz")
        return

    total_files = sum(len(v) for v in groups.values())
    print(f"📖 共找到 {len(groups)} 部漫画，{total_files} 个文件\n")

    success_count = 0
    error_count = 0

    for manga_title, file_list in sorted(groups.items()):
        dest_dir = directory / manga_title
        print(f"  📚 {manga_title}/ （{len(file_list)} 话）")

        if not dry_run:
            dest_dir.mkdir(exist_ok=True)

        for src_path, new_filename in sorted(file_list, key=lambda x: x[1]):
            dest_path = dest_dir / new_filename

            # 目标文件已存在则跳过
            if not dry_run and dest_path.exists():
                print(f"     ⚠ 跳过（已存在）: {new_filename}")
                continue

            action = "移动" if move else "复制"
            print(f"     {'[预览] ' if dry_run else ''}{action}: {src_path.name}")
            print(f"        → {manga_title}/{new_filename}")

            if not dry_run:
                try:
                    if move:
                        shutil.move(str(src_path), str(dest_path))
                    else:
                        shutil.copy2(str(src_path), str(dest_path))
                    success_count += 1
                except Exception as e:
                    print(f"     ❌ 错误: {e}")
                    error_count += 1
            else:
                success_count += 1

        print()

    # 跳过的文件
    if skipped:
        print(f"⚠　以下 {len(skipped)} 个文件无法解析（格式不匹配），已跳过：")
        for name in skipped:
            print(f"   - {name}")
        print()

    # 汇总
    if dry_run:
        print(f"🔍 预览完成！将处理 {success_count} 个文件。")
        print("   去掉 --dry-run 参数即可执行实际操作。")
    else:
        status = f"✅ 完成！成功 {success_count} 个"
        if error_count:
            status += f"，失败 {error_count} 个"
        print(status)


def main():
    parser = argparse.ArgumentParser(
        description="将漫画 CBZ 文件按漫画名归类到文件夹",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python cbz_organizer.py                        整理当前目录
  python cbz_organizer.py D:\\Downloads          整理指定目录
  python cbz_organizer.py D:\\Downloads --move   移动而非复制
  python cbz_organizer.py D:\\Downloads --dry-run 只预览，不实际操作
        """
    )
    parser.add_argument(
        'directory', nargs='?', default='.',
        help="包含 CBZ 文件的目录（默认为当前目录）"
    )
    parser.add_argument(
        '--move', action='store_true',
        help="移动文件而非复制（默认为复制）"
    )
    parser.add_argument(
        '--dry-run', action='store_true',
        help="预览模式，仅显示将要执行的操作，不实际操作文件"
    )

    args = parser.parse_args()
    directory = Path(args.directory).resolve()

    if not directory.exists():
        print(f"❌ 目录不存在: {directory}")
        sys.exit(1)

    if not directory.is_dir():
        print(f"❌ 路径不是目录: {directory}")
        sys.exit(1)

    organize(directory, move=args.move, dry_run=args.dry_run)


if __name__ == '__main__':
    main()

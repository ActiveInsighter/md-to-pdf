#!/usr/bin/env python3
"""Safely prepare one Supabase PDF job without trusting ZIP paths."""

from __future__ import annotations

import argparse
import os
import shutil
import stat
import sys
import zipfile
from pathlib import Path, PurePosixPath


def positive_int(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("value must be positive")
    return parsed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--markdown", required=True, type=Path)
    parser.add_argument("--assets", type=Path)
    parser.add_argument("--work-dir", required=True, type=Path)
    parser.add_argument("--max-markdown-bytes", type=positive_int, default=10 * 1024 * 1024)
    parser.add_argument("--max-assets-bytes", type=positive_int, default=50 * 1024 * 1024)
    parser.add_argument("--max-extracted-bytes", type=positive_int, default=200 * 1024 * 1024)
    parser.add_argument("--max-files", type=positive_int, default=2000)
    parser.add_argument("--max-file-bytes", type=positive_int, default=25 * 1024 * 1024)
    parser.add_argument("--max-path-length", type=positive_int, default=240)
    return parser.parse_args()


def ensure_regular_file(path: Path, label: str, max_bytes: int) -> int:
    if not path.is_file():
        raise ValueError(f"{label} does not exist")
    size = path.stat().st_size
    if size <= 0:
        raise ValueError(f"{label} is empty")
    if size > max_bytes:
        raise ValueError(f"{label} exceeds the size limit")
    return size


def safe_relative_name(raw_name: str, max_length: int) -> PurePosixPath:
    if not raw_name or "\x00" in raw_name:
        raise ValueError("ZIP contains an empty or NUL path")
    normalized = raw_name.replace("\\", "/")
    if len(normalized) > max_length:
        raise ValueError("ZIP path is too long")
    if normalized.startswith("/"):
        raise ValueError(f"ZIP contains an absolute path: {raw_name}")
    if len(normalized) >= 2 and normalized[1] == ":":
        raise ValueError(f"ZIP contains a drive path: {raw_name}")
    path = PurePosixPath(normalized)
    if any(part in ("", ".", "..") for part in path.parts):
        raise ValueError(f"ZIP contains an unsafe path: {raw_name}")
    return path


def is_symlink(info: zipfile.ZipInfo) -> bool:
    mode = (info.external_attr >> 16) & 0xFFFF
    return stat.S_ISLNK(mode)


def extract_assets(archive: Path, destination: Path, args: argparse.Namespace) -> None:
    ensure_regular_file(archive, "assets.zip", args.max_assets_bytes)
    file_count = 0
    total_size = 0

    with zipfile.ZipFile(archive) as zf:
        infos = zf.infolist()
        if len(infos) > args.max_files:
            raise ValueError("ZIP contains too many entries")

        for info in infos:
            relative = safe_relative_name(info.filename, args.max_path_length)
            if is_symlink(info):
                raise ValueError(f"ZIP symlinks are not allowed: {info.filename}")
            if info.is_dir():
                continue
            file_count += 1
            if file_count > args.max_files:
                raise ValueError("ZIP contains too many files")
            if info.file_size > args.max_file_bytes:
                raise ValueError(f"ZIP file is too large: {info.filename}")
            total_size += info.file_size
            if total_size > args.max_extracted_bytes:
                raise ValueError("ZIP expands beyond the total size limit")

            target = destination.joinpath(*relative.parts).resolve()
            destination_resolved = destination.resolve()
            if target != destination_resolved and destination_resolved not in target.parents:
                raise ValueError(f"ZIP path escapes the job directory: {info.filename}")
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info, "r") as source, target.open("wb") as output:
                shutil.copyfileobj(source, output, length=1024 * 1024)


def main() -> int:
    args = parse_args()
    ensure_regular_file(args.markdown, "input.md", args.max_markdown_bytes)

    work_dir = args.work_dir.resolve()
    if work_dir.exists():
        shutil.rmtree(work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)

    if args.assets is not None:
        extract_assets(args.assets, work_dir, args)

    output_markdown = work_dir / "input.md"
    shutil.copyfile(args.markdown, output_markdown)
    if output_markdown.stat().st_size <= 0:
        raise ValueError("prepared Markdown is empty")

    print(output_markdown.as_posix())
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, zipfile.BadZipFile) as exc:
        print(f"Input preparation failed: {exc}", file=sys.stderr)
        raise SystemExit(1)

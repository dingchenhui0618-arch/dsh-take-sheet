# Changelog

## 0.1.0 — 2026-10-28

首个版本。

- 扫描本地视频，用 ffmpeg `scdet` 检测镜头切点，按 `minShotMs` 合并过近切点，按 `maxShots` 均匀保留。
- 每个镜头抽一帧缩略图，带 `HH:MM:SS.mmm` 时间码；面板内勾选、全选 / 全不选。
- 导出 `frames.csv`、`shots.json`、`frames/` 与带时间码标签的 `contact-sheet.jpg`。
- 输出目录 `$DSH_HOME/take-sheet/jobs/<job-id>/`，最近 30 个 job 记录在 `index.json`。
- 自动发现 ffmpeg（环境变量、WinGet Links、`C:\ffmpeg\bin`、Chocolatey、PATH、Homebrew、`/usr/bin`），版本要求 ≥5.1，失败后 15 秒重试，面板可手动「重新检测」。

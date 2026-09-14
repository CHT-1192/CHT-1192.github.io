#!/usr/bin/env bash
#
# 把两个 Demo 的构建产物同步进本站，让入口页永远指向最新的构建。
#
#   scripts/sync-demos.sh            # 直接复制各自仓库里现成的构建产物
#   scripts/sync-demos.sh --build    # 先重新构建，再复制（会用 npm / node）
#
# 源仓库默认取 ~/Projects 下的同名目录，可用环境变量覆盖：
#   TWO_D_REPO=/path/to/2D-Ray-Trace-Demo
#   OSC_REPO=/path/to/Web-Oscilloscope-Music-Player-Visualizer
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECTS="$(cd "$ROOT/.." && pwd)"

TWO_D_REPO="${TWO_D_REPO:-$PROJECTS/2D-Ray-Trace-Demo}"
OSC_REPO="${OSC_REPO:-$PROJECTS/Web-Oscilloscope-Music-Player-Visualizer}"

DO_BUILD=0
[ "${1:-}" = "--build" ] && DO_BUILD=1

die() {
  printf '  ✗ %s\n' "$1" >&2
  exit 1
}

need_file() {
  [ -f "$1" ] || die "缺少文件：$1"
}

# 先全部构建/校验，再统一复制 —— 中途失败不会留下半新半旧的站点。
if [ "$DO_BUILD" = 1 ]; then
  printf '▸ 构建 2D-Ray-Trace-Demo\n'
  ( cd "$TWO_D_REPO" && npm run --silent build )
  printf '▸ 构建 Web-Oscilloscope 单文件版\n'
  ( cd "$OSC_REPO" && node build-standalone.js )
fi

for f in index.html app.js styles.css; do
  need_file "$TWO_D_REPO/dist/$f"
done
need_file "$OSC_REPO/oscilloscope-standalone.html"
need_file "$TWO_D_REPO/docs/screenshot.png"
need_file "$OSC_REPO/docs/preview.png"

printf '▸ 同步 2D 光线追踪 Demo → 2d-ray-trace/\n'
cp "$TWO_D_REPO/dist/index.html" "$ROOT/2d-ray-trace/index.html"
cp "$TWO_D_REPO/dist/app.js" "$ROOT/2d-ray-trace/app.js"
cp "$TWO_D_REPO/dist/styles.css" "$ROOT/2d-ray-trace/styles.css"

printf '▸ 同步示波器单文件版 → oscilloscope/index.html\n'
cp "$OSC_REPO/oscilloscope-standalone.html" "$ROOT/oscilloscope/index.html"

printf '▸ 同步入口页预览图 → assets/\n'
cp "$TWO_D_REPO/docs/screenshot.png" "$ROOT/assets/2d-ray-trace.png"
cp "$OSC_REPO/docs/preview.png" "$ROOT/assets/oscilloscope.png"

printf '\n完成。当前产物：\n'
( cd "$ROOT" && find 2d-ray-trace oscilloscope assets -type f -print0 |
  xargs -0 shasum | awk '{ printf "  %s  %s\n", substr($1, 1, 12), $2 }' )

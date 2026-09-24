#!/usr/bin/env bash
#
# 把两个 Demo 的构建产物同步进本站，让入口页永远指向最新的构建。
#
#   scripts/sync-demos.sh            # 复制 2D 的 dist、重新拼装示波器单文件版
#   scripts/sync-demos.sh --build    # 先用 npm / node 重新构建 2D 的 dist，再同步
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
fi

for f in index.html app.js styles.css; do
  need_file "$TWO_D_REPO/dist/$f"
done
# 示波器那份不读源仓库的 oscilloscope-standalone.html：它是构建产物，
# 源仓库里未必跟着 public/ 更新（已经踩过一次），这里永远从 public/ 现拼。
# 入口是 public/js/main.js —— 上游已把 app.js 拆成 public/js/*.js 模块。
[ -d "$OSC_REPO/public/js" ] || die "缺少目录：$OSC_REPO/public/js"
for f in index.html styles.css js/main.js; do
  need_file "$OSC_REPO/public/$f"
done
need_file "$TWO_D_REPO/docs/screenshot.png"
# 入口页预览图用 docs/ui.png（带完整界面）而不是 docs/preview.png：
# 后者只是纯画布截图，上游加了预设面板之后就没再更新过。
need_file "$OSC_REPO/docs/ui.png"

printf '▸ 同步 2D 光线追踪 Demo → 2d-ray-trace/\n'
cp "$TWO_D_REPO/dist/index.html" "$ROOT/2d-ray-trace/index.html"
cp "$TWO_D_REPO/dist/app.js" "$ROOT/2d-ray-trace/app.js"
cp "$TWO_D_REPO/dist/styles.css" "$ROOT/2d-ray-trace/styles.css"

printf '▸ 从 public/ 拼装示波器单文件版 → oscilloscope/index.html\n'
OSC_REPO="$OSC_REPO" node "$ROOT/scripts/build-standalone.mjs"

printf '▸ 同步入口页预览图 → assets/\n'
cp "$TWO_D_REPO/docs/screenshot.png" "$ROOT/assets/2d-ray-trace.png"
cp "$OSC_REPO/docs/ui.png" "$ROOT/assets/oscilloscope.png"

# 源仓库里那份提交过的单文件版如果和 public/ 对不上，说明它过期了 ——
# 本站不受影响（我们是从 public/ 现拼的），但值得提醒一句。
COMMITTED="$OSC_REPO/oscilloscope-standalone.html"
if [ -f "$COMMITTED" ] && ! cmp -s "$COMMITTED" "$ROOT/oscilloscope/index.html"; then
  printf '\n  ! 提醒：%s\n' "${COMMITTED#$PROJECTS/} 落后于 public/，该仓库自己提交的那份该重新生成了。"
fi

# 烟花不在本站托管：它由自己的仓库发布到 /Fireworks/（Pages 用那份仓库的 docs/）。
# 这里只放一张预览图，所以只能查一下线上是不是已经跟上本地构建。
FW_REPO="${FW_REPO:-$PROJECTS/Fireworks}"
FW_BUILD="$FW_REPO/dist/turtle_fireworks.html"
if [ -f "$FW_BUILD" ]; then
  printf '▸ 同步烟花预览图 → assets/fireworks.png\n'
  cp "$FW_REPO/docs/preview/ui.png" "$ROOT/assets/fireworks.png"

  fw_live="$(curl -fsS --max-time 20 "https://cht-1192.github.io/Fireworks/" 2>/dev/null | shasum | awk '{print $1}')" || fw_live=""
  fw_local="$(shasum "$FW_BUILD" | awk '{print $1}')"
  if [ -z "$fw_live" ]; then
    printf '\n  ! 取不到 https://cht-1192.github.io/Fireworks/ 的线上产物，没法确认它是否最新。\n'
  elif [ "$fw_live" != "$fw_local" ]; then
    printf '\n  ! 提醒：/Fireworks/ 线上的产物和本地 dist/ 不一致。\n'
    printf '    烟花由它自己的仓库发布 —— 去 %s 提交推送，线上才会跟上。\n' "${FW_REPO#$PROJECTS/}"
  fi
fi

printf '\n完成。当前产物：\n'
( cd "$ROOT" && find 2d-ray-trace oscilloscope assets -type f -print0 |
  xargs -0 shasum | awk '{ printf "  %s  %s\n", substr($1, 1, 12), $2 }' )
# CHT-1192.github.io

两个纯前端 Demo 的静态入口页 —— <https://cht-1192.github.io/>

| 路径 | 内容 |
| --- | --- |
| `/` | 入口页：两张卡片，分别指向下面两个 Demo |
| `/2d-ray-trace/` | [2D-Ray-Trace-Demo](https://github.com/CHT-1192/2D-Ray-Trace-Demo) 的 `dist/` 构建产物（WebGL2，静态） |
| `/oscilloscope/` | [web-oscilloscope-music-player-visualizer](https://github.com/CHT-1192/web-oscilloscope-music-player-visualizer) 的单文件自包含版（`oscilloscope-standalone.html`） |
| `/assets/` | 入口页用的预览图，取自两个仓库的 `docs/` |
| `/scripts/sync-demos.sh` | 从两个源仓库同步构建产物到本站 |

本站只托管**构建产物**，不包含源码；源码在各自仓库里。入口页是手写的单个 `index.html`，
内联样式，无构建步骤、无 JS 依赖。

## 为什么示波器版用单文件版

示波器的 `public/` 版会 `fetch('/api/tracks')` 向 Node 服务器要播放列表 —— 静态站点上没有这个
接口。单文件版本身就是为「拷到任何地方双击打开」设计的：没有任何外部请求，音频靠拖拽/选择
本地文件。站点也不内置音乐文件（源仓库里的 `.flac` 有几十上百 MB）。

## 更新流程

源仓库改完之后：

```bash
scripts/sync-demos.sh --build   # 重新构建再同步（需要 npm / node）
scripts/sync-demos.sh           # 或者只复制现成的构建产物

git add -A && git commit -m "Sync demo builds" && git push
```

`--build` 会先跑 `2D-Ray-Trace-Demo` 的 `npm run build` 和示波器仓库的 `node build-standalone.js`，
并且**先全部构建、再统一复制**，所以中途失败不会留下半新半旧的站点。

源仓库默认按 `../2D-Ray-Trace-Demo`、`../Web-Oscilloscope-Music-Player-Visualizer` 查找，
可用 `TWO_D_REPO=` / `OSC_REPO=` 指定别的路径。

## 部署

GitHub Pages，用户主页站点：仓库 `CHT-1192.github.io` 的 `main` 分支根目录直接发布。
根目录的 `.nojekyll` 关掉 Jekyll 处理，产物原样送出。

## 本地预览

```bash
python3 -m http.server 4173
# http://127.0.0.1:4173/
```

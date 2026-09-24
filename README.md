# 网页 Demo 入口

三个纯前端 Demo 的静态入口页：**<https://cht-1192.github.io/>**

一个手写的 `index.html`，三张卡片，没有构建步骤。**Demo 不在这里**——各自由自己的仓库构建、
发布到自己的 GitHub Pages，所以这个仓库不用跟着它们更新。

| Demo | 地址 | 源码 |
| --- | --- | --- |
| 2D 光线追踪 | <https://cht-1192.github.io/2D-Ray-Trace-Demo/> | [repo](https://github.com/CHT-1192/2D-Ray-Trace-Demo) |
| 示波器音乐播放器 | <https://cht-1192.github.io/web-oscilloscope-music-player-visualizer/> | [repo](https://github.com/CHT-1192/web-oscilloscope-music-player-visualizer) |
| 烟花 · Fireworks | <https://cht-1192.github.io/Fireworks/> | [repo](https://github.com/CHT-1192/Fireworks) |

几句提醒：示波器**不会自动加载音乐**，得拖一个本地音频文件进去；2D 那个每次打开的世界都不一样
（随机种子）；烟花那个留着地址里的 `?seed=` 就能重现同一场。

## 文件

```
index.html     入口页
404.html       旧地址的跳转（见下）
assets/*.png   三张预览图
.nojekyll      关掉 Jekyll
```

改文案或配色直接改 `index.html`；改功能去各自的源仓库。

## 旧地址跳转

仓库改过名、站点也搬过家，所以老链接会落到 `404.html`——GitHub Pages 对未命中的路径就送这个
文件。它按路径跳转，**不区分大小写**，`?query` 和 `#fragment` 原样带走：

| 旧地址 | 转到 |
| --- | --- |
| `/oscilloscope/`、`/Oscilloscope-Music/` 等 | `/web-oscilloscope-music-player-visualizer/` |
| `/2D-Ray-Trace/`、`/2d-ray-trace/` 等 | `/2D-Ray-Trace-Demo/` |

## 本地预览

```bash
python3 -m http.server 4173     # 打开 http://127.0.0.1:4173/
```

卡片指向线上地址，本地点击会直接跳到线上 Demo，属预期。这个命令也不会用 `404.html`（它自带 404
页），所以跳转只能在线上验证。

# 网页 Demo 入口

三个纯前端 Demo 的静态入口页：**<https://cht-1192.github.io/>**

页面本身就是一个手写的 `index.html`（内联样式，没有构建步骤，也没有 JS 依赖），上面三张卡片分别
指向三个 Demo。**这里不托管任何 Demo 产物**——每个 Demo 由它自己的仓库构建并发布到自己的
GitHub Pages 上，所以这个仓库不需要跟着它们一起更新。

| 卡片 | Demo 地址 | 源码 |
| --- | --- | --- |
| **2D 光线追踪 Demo** | <https://cht-1192.github.io/2D-Ray-Trace-Demo/> | [2D-Ray-Trace-Demo](https://github.com/CHT-1192/2D-Ray-Trace-Demo) |
| **网页版示波器音乐播放器** | <https://cht-1192.github.io/web-oscilloscope-music-player-visualizer/> | [Web-Oscilloscope-Music-Player-Visualizer](https://github.com/CHT-1192/web-oscilloscope-music-player-visualizer) |
| **烟花 · Fireworks** | <https://cht-1192.github.io/Fireworks/> | [Fireworks](https://github.com/CHT-1192/Fireworks) |

> **示波器那个需要你自己准备音乐**：音频不会自动加载，请拖拽或选择一个本地音频文件
> （WAV / FLAC / MP3 / OGG / Opus / M4A / AAC 等）。
>
> **2D 那个每次打开都不一样**：光源跟随鼠标，方块自左向右平移，首屏的世界是随机挑种子生成的。
>
> **烟花那个同一个种子永远是同一场**：想再看刚才那场，就留着地址里的 `?seed=`。

## 这个仓库里有什么

```
index.html          入口页，唯一的页面
404.html            旧地址的跳转页（见下）
assets/*.png        三张预览图（卡片用）
.nojekyll           关掉 Jekyll，产物原样送出
```

只有 5 个文件（外加 `.gitignore`）。想改功能请去各自的源仓库；想改入口页的文案、配色或卡片，
直接改 `index.html` 就行——没有构建步骤。

## 旧地址的跳转

两个 Demo 的仓库都改过名（站点也从这里搬到了各仓库自己的 Pages 上），所以从前贴出去的地址会失效。
GitHub Pages 是静态托管、没有服务端重定向，但**未命中的路径会送 `404.html`**（状态码 404），
于是这个文件就成了总入口：它按路径把老链接转到新地址。

| 旧地址（大小写不限） | 转到 |
| --- | --- |
| `/oscilloscope/`、`/Oscilloscope/`、`/OSCILLOSCOPE/`… | `/web-oscilloscope-music-player-visualizer/` |
| `/Oscilloscope-Music/`、`/oscilloscope-music/`… | 同上 |
| `/2D-Ray-Trace/`、`/2d-ray-trace/`… | `/2D-Ray-Trace-Demo/` |
| `/2d-ray-trace-demo/` 之类 | 同上 |

匹配在 `404.html` 里做，**不区分大小写**，所以不需要为每种大小写各建一个目录（穷举
「oscilloscope」的大小写组合有 90 万种，建目录是不可行的）。`?query` 和 `#fragment` 会原样带走。

> 注意：`/2d-ray-trace-demo/` 这种「2D 仓库名的大小写变体」**不归这里管** —— 它已经在项目站
> 自己的路径空间里了，只有那个仓库能处理。这里能覆盖的是仍然落在这个仓库路径下的旧地址。

## 本地预览

```bash
python3 -m http.server 4173
# 然后打开 http://127.0.0.1:4173/
```

页面里的卡片指向的是线上地址，所以本地预览时点击会跳到真正的线上 Demo，属预期。

`python3 -m http.server` **不会**使用 `404.html`（它有自己的 404 页面），所以本地测不出跳转效果，
要验证得看线上。

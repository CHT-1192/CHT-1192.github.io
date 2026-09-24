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
assets/*.png        三张预览图（卡片用）
.nojekyll           关掉 Jekyll，产物原样送出
```

只有 4 个文件（外加 `.gitignore`）。想改功能请去各自的源仓库；想改入口页的文案、配色或卡片，
直接改 `index.html` 就行——没有构建步骤。

## 本地预览

```bash
python3 -m http.server 4173
# 然后打开 http://127.0.0.1:4173/
```

页面里的卡片指向的是线上地址，所以本地预览时点击会跳到真正的线上 Demo，属预期。

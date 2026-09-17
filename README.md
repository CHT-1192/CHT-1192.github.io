# 网页 Demo 入口

两个纯前端 Demo 的静态入口页，从 GitHub Pages 直接访问：**<https://cht-1192.github.io/>**

页面本身是一个手写的 `index.html`（内联样式，没有构建步骤，也没有 JS 依赖），上面两张卡片
分别指向下面两个 Demo。

| 路径 | 内容 |
| --- | --- |
| `/` | 入口页：两张卡片 + 预览图 |
| `/2d-ray-trace/` | **2D 光线追踪 Demo** —— WebGL2 硬阴影，光照跟随鼠标 |
| `/oscilloscope/` | **网页版示波器音乐播放器** —— 左声道 → X 轴、右声道 → Y 轴 |
| `/assets/` | 入口页用的预览图，取自两个源仓库的 `docs/` |
| `/scripts/` | 把两个 Demo 的构建产物同步进来的脚本 |

> **示波器那个需要你自己准备音乐**：音频不会自动加载，请拖拽或选择一个本地音频文件
> （WAV / FLAC / MP3 / OGG / Opus / M4A / AAC 等）。
>
> **2D 那个每次打开都不一样**：光源跟随鼠标，方块自左向右平移，首屏的世界是随机挑种子生成的。

## 本站只放构建产物

源码不在这个仓库里，分别在两个源仓库：

- [2D-Ray-Trace-Demo](https://github.com/CHT-1192/2D-Ray-Trace-Demo)
- [Web-Oscilloscope-Music-Player-Visualizer](https://github.com/CHT-1192/Web-Oscilloscope-Music-Player-Visualizer)

这里存放的只是它们的构建产物。所以想改功能，请去源仓库改；本站的同步脚本负责把新构建搬进来。

## 示波器为什么用的是单文件版

源仓库的 `public/` 版本会通过 `fetch('/api/tracks')` 向 Node 服务器要播放列表，而静态站点上没有
这个接口。

单文件版（`oscilloscope-standalone.html`）本来就是为「拷到任何地方双击打开」设计的：样式和
`public/js/*.js` 那 8 个模块全部内联进一个 HTML，加载时不发出任何外部请求，音频靠拖拽或选择
本地文件。本站因此也不内置音乐，源仓库里的音频动辄几十到几百 MB。

## 更新产物

改完源仓库之后，在本仓库根目录跑一条命令即可，不需要手动挑选文件：

```bash
scripts/sync-demos.sh           # 直接取两个源仓库现成的构建产物
scripts/sync-demos.sh --build   # 先用 npm / node 重新构建 2D 的产物，再同步
```

- **2D 那份**直接复制源仓库的 `dist/`。如果改了源码，请用 `--build`（它会先跑源仓库的
  `npm run build`），否则复制到的还是上一次的产物。
- **示波器那份**不是复制，而是从 `public/` 现拼：`scripts/build-standalone.mjs` 读
  `public/js/*.js`，按依赖顺序把模块收进一个注册表再内联进 HTML，拼完还会自检产物里没有任何
  外部引用。这样即使源仓库里提交的单文件版落后于 `public/`，入口页也不会发旧版。
- 脚本**先全部构建、再统一复制**，所以中途失败不会留下半新半旧的站点。

源仓库默认按同级的 `../2D-Ray-Trace-Demo`、`../Web-Oscilloscope-Music-Player-Visualizer` 查找，
也可以用 `TWO_D_REPO=` / `OSC_REPO=` 指向别处。

同步完把改动提交推上去，GitHub Pages 会自动发布。

## 本地预览

```bash
python3 -m http.server 4173
# 然后打开 http://127.0.0.1:4173/
```

建议用 HTTP 服务预览，而不是直接双击 `index.html`：这样两个 Demo 的地址和线上一致。

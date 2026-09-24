# 网页 Demo 入口

前端 demo 三枚，各自构建、各自托管。本仓库只有这一页。

| Demo | 源码 | 地址 |
| --- | --- | --- |
| 2D 光线追踪 | [2D-Ray-Trace-Demo](https://github.com/CHT-1192/2D-Ray-Trace-Demo) | [打开](https://cht-1192.github.io/2D-Ray-Trace-Demo/) |
| 示波器音乐播放器 | [web-oscilloscope-music-player-visualizer](https://github.com/CHT-1192/web-oscilloscope-music-player-visualizer) | [打开](https://cht-1192.github.io/web-oscilloscope-music-player-visualizer/) |
| 烟花 | [Fireworks](https://github.com/CHT-1192/Fireworks) | [打开](https://cht-1192.github.io/Fireworks/) |

- 示波器不预载音乐，拖一个本地音频文件进去
- 2D 每次打开的世界由种子决定
- 烟花同一个 `?seed=` 永远同一场

## 文件

```
index.html     入口页
404.html       旧地址跳转
assets/        预览图三张
.nojekyll      关闭 Jekyll
```

旧路径（`/oscilloscope/`、`/2D-Ray-Trace/` 之类）由 `404.html` 接到新地址，不分大小写，`?query`
与 `#fragment` 保留。

本地看：`python3 -m http.server 4173`。卡片指向线上，点开即是线上 demo。

"use strict";
(() => {
  // src/config.ts
  var REF_W = 1200;
  var REF_H = 685;
  var WORLD_H = REF_H;
  var THEME = {
    /** 方块填充色（参考图实测 0x3D3D3D） */
    blockFill: [61 / 255, 61 / 255, 61 / 255],
    /** 阴影里的环境光下限 */
    bgFar: 0.315,
    /** 光源辉光的振幅 */
    glowAmp: 0.3,
    /** 辉光影响半径（世界单位）：1050 能覆盖 1200×685 画面的最远角（≈690） */
    glowRadius: 1050,
    /** 辉光衰减指数：1.0 时远端抬得起来，光照范围看着更大（参考图拟合值是 1.16） */
    glowPower: 1,
    /** 辉光中「定向光」占比：只有这段会被方块遮挡，其余算环境光 */
    directShare: 0.62,
    /**
     * 灯泡的径向剖面：[半径(世界单位), 叠加的白色透明度]。
     * 逐点实测拟合（r 为世界单位）：0→255, 2→250, 4→242, 6→215, 8→183, 10≈平台期 153。
     * 灯泡叠在「环境光 + 直接光」的平台期 157 之上，换算出的透明度即下表。
     */
    lightStops: [
      [0, 0.7],
      [1, 0.55],
      [2, 0.39],
      [4, 0.36],
      [6, 0.29],
      [8, 0.115],
      [9.5, 0.02],
      [13, 0]
    ],
    /** 方块朝向光源那条棱的高光强度 */
    rimStrength: 0.46,
    /** 外墙到视口的额外距离：射线兜底，保证可见多边形永远闭合 */
    wallMargin: 120
  };
  var DEFAULT_OPTIONS = {
    mode: "exact",
    speed: 70,
    rayCount: 360,
    edgeEpsilon: 1e-3,
    debugRays: false,
    followMouse: false,
    paused: false,
    showBlocks: true
  };

  // src/core/math.ts
  var TAU = Math.PI * 2;
  function mixSeed(seed, salt) {
    let h = seed ^ Math.imul(salt + 1, 2654435769) | 0;
    h ^= h >>> 16;
    h = Math.imul(h, 2246822507);
    h ^= h >>> 13;
    h = Math.imul(h, 3266489909);
    h ^= h >>> 16;
    return h | 0;
  }
  function randomSeed() {
    return Math.floor(Math.random() * 2147483647);
  }
  function makeRng(seed) {
    let s = seed | 0 || 2654435769;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) % 1e5 / 1e5;
    };
  }

  // src/core/layout.ts
  var REFERENCE_BLOCKS = [
    { x: 243, y: 16, w: 141, h: 94 },
    { x: 960, y: 36, w: 141, h: 95 },
    { x: 749, y: 67, w: 141, h: 70 },
    { x: 502, y: 80, w: 203, h: 125 },
    { x: 81, y: 97, w: 130, h: 86 },
    { x: 261, y: 145, w: 203, h: 92 },
    { x: 949, y: 161, w: 207, h: 71 },
    { x: 811, y: 172, w: 59, h: 60 },
    { x: 209, y: 420, w: 146, h: 102 },
    { x: 958, y: 442, w: 145, h: 103 },
    { x: 736, y: 476, w: 148, h: 76 },
    { x: 479, y: 490, w: 212, h: 136 },
    { x: 40, y: 508, w: 135, h: 94 },
    { x: 227, y: 561, w: 213, h: 100 },
    { x: 945, y: 578, w: 215, h: 77 },
    { x: 800, y: 590, w: 63, h: 66 }
  ];
  var SIZE_CLASSES = [
    { weight: 2 / 16, min: 50, max: 86 },
    // 小方块
    { weight: 8 / 16, min: 116, max: 164 },
    // 中条
    { weight: 6 / 16, min: 188, max: 230 }
    // 长条
  ];
  var ASPECT_FIT = { mu: 0.51, sigma: 0.304, min: 0.9, max: 3.2 };
  var HEIGHT_RANGE = { min: 46, max: 150 };
  function deriveBands(blocks, pad = 6) {
    const sorted = [...blocks].sort((a, b) => a.y - b.y);
    let splitAt = -1;
    let biggest = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = sorted[i + 1].y - (sorted[i].y + sorted[i].h);
      if (gap > biggest) {
        biggest = gap;
        splitAt = i;
      }
    }
    const groups = splitAt < 0 ? [sorted] : [sorted.slice(0, splitAt + 1), sorted.slice(splitAt + 1)];
    return groups.map((g) => {
      const top = Math.max(0, Math.min(...g.map((b) => b.y)) - pad);
      const bottom = Math.min(REF_H, Math.max(...g.map((b) => b.y + b.h)) + pad);
      return { y: top, h: bottom - top };
    });
  }
  var BANDS = deriveBands(REFERENCE_BLOCKS);
  function rectsOverlap(a, b, pad = 0) {
    return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
  }

  // src/settings.ts
  function defaultSettings() {
    const [small, medium, large] = SIZE_CLASSES;
    return {
      glowRadius: THEME.glowRadius,
      glowPower: THEME.glowPower,
      glowAmp: THEME.glowAmp,
      bgFar: THEME.bgFar,
      directShare: THEME.directShare,
      rimStrength: THEME.rimStrength,
      bulbSize: 1,
      bulbBright: 1,
      lightX: 0.5,
      lightY: 325 / 685,
      blockTone: THEME.blockFill[0],
      rimWidth: 0.85,
      rayWidth: 0.5,
      dotRadius: 2.2,
      overlap: 0.45,
      stepSpread: 100,
      gap: 10,
      widthScale: 1,
      heightMin: HEIGHT_RANGE.min,
      heightMax: HEIGHT_RANGE.max,
      aspectMu: ASPECT_FIT.mu,
      aspectSigma: ASPECT_FIT.sigma,
      weightSmall: small.weight,
      weightMedium: medium.weight,
      weightLarge: large.weight,
      wallMargin: THEME.wallMargin
    };
  }
  var settings = defaultSettings();
  function resetSettings() {
    Object.assign(settings, defaultSettings());
  }
  function blockFill() {
    const t = settings.blockTone;
    return [t, t, t];
  }
  function bulbStops() {
    return THEME.lightStops.map(([r, a]) => [
      r * settings.bulbSize,
      1,
      1,
      1,
      Math.min(1, a * settings.bulbBright)
    ]);
  }
  function sampleSize(rng) {
    const classes = [SIZE_CLASSES[0], SIZE_CLASSES[1], SIZE_CLASSES[2]];
    const weights = [settings.weightSmall, settings.weightMedium, settings.weightLarge];
    const total = weights[0] + weights[1] + weights[2];
    let cls = classes[2];
    if (total > 1e-6) {
      let r = rng() * total;
      for (let i = 0; i < 3; i++) {
        if (r < weights[i]) {
          cls = classes[i];
          break;
        }
        r -= weights[i];
      }
    }
    const w = (cls.min + rng() * (cls.max - cls.min)) * settings.widthScale;
    let h = w / Math.exp(settings.aspectMu);
    for (let attempt = 0; attempt < 6; attempt++) {
      const u1 = Math.max(1e-9, rng());
      const u2 = rng();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const aspect = Math.min(ASPECT_FIT.max, Math.max(ASPECT_FIT.min, Math.exp(settings.aspectMu + settings.aspectSigma * z)));
      h = w / aspect;
      if (h >= settings.heightMin && h <= settings.heightMax) break;
    }
    const lo = Math.min(settings.heightMin, settings.heightMax);
    const hi = Math.max(settings.heightMin, settings.heightMax);
    h = Math.min(hi, Math.max(lo, h));
    return { w: Math.round(w), h: Math.round(h) };
  }

  // src/core/segment.ts
  function makeSegment(id) {
    return { id, ax: 0, ay: 0, bx: 0, by: 0, ex: 0, ey: 0, nx: 0, ny: 0, owner: -1, edge: -1 };
  }
  function makeRayHit() {
    return { t: Infinity, u: 0, index: -1, x: 0, y: 0 };
  }
  function setSegment(s, ax, ay, bx, by, nx, ny, owner, edge) {
    s.ax = ax;
    s.ay = ay;
    s.bx = bx;
    s.by = by;
    s.ex = bx - ax;
    s.ey = by - ay;
    s.nx = nx;
    s.ny = ny;
    s.owner = owner;
    s.edge = edge;
  }
  function rayCast(segments, count, px, py, dx, dy, out) {
    let bestT = Infinity;
    let bestU = 0;
    let bestI = -1;
    for (let i = 0; i < count; i++) {
      const s = segments[i];
      const den = dx * s.ey - dy * s.ex;
      if (den === 0) continue;
      const wx = s.ax - px;
      const wy = s.ay - py;
      const t = (wx * s.ey - wy * s.ex) / den;
      if (t <= 1e-9 || t >= bestT) continue;
      const u = (wx * dy - wy * dx) / den;
      if (u < 0 || u > 1) continue;
      bestT = t;
      bestU = u;
      bestI = i;
    }
    if (bestI < 0) return false;
    out.t = bestT;
    out.u = bestU;
    out.index = bestI;
    out.x = px + dx * bestT;
    out.y = py + dy * bestT;
    return true;
  }
  function pinToSegment(seg, px, py, dx, dy, out) {
    const den = dx * seg.ey - dy * seg.ex;
    const wx = seg.ax - px;
    const wy = seg.ay - py;
    let u;
    if (Math.abs(den) < 1e-12) {
      u = wx * dx + wy * dy >= 0 ? 0 : 1;
    } else {
      u = (wx * dy - wy * dx) / den;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
    }
    out.u = u;
    out.index = seg.id;
    out.x = seg.ax + seg.ex * u;
    out.y = seg.ay + seg.ey * u;
    out.t = Math.hypot(out.x - px, out.y - py);
  }
  function pointInRect(px, py, x, y, w, h) {
    return px >= x && px <= x + w && py >= y && py <= y + h;
  }

  // src/core/scene.ts
  function makeInstance() {
    return { id: 0, x: 0, y: 0, w: 0, h: 0, segIds: [-1, -1, -1, -1] };
  }
  var SPAWN_MARGIN = 280;
  var CULL_MARGIN = 120;
  var Scene = class {
    /** 屏幕（世界）尺寸 */
    worldW = REF_W;
    worldH = WORLD_H;
    /** 相机走过的距离（参考单位）；可见窗口在世界坐标里是 [-scrollX, -scrollX + REF_W] */
    scrollX = 0;
    /** 当前世界种子（0 表示还没生成过世界） */
    seed = 0;
    /** 灯泡位置（屏幕坐标），固定在画面中心偏上 */
    light = { x: REF_W / 2, y: REF_H * 325 / 685 };
    /** 灯泡被方块压住 → 整个房间全黑 */
    lightOccluded = false;
    blocks = [];
    /** 本帧可见的方块（屏幕坐标） */
    instances = [];
    /** 线段池：只增长、原地重写，配合 segmentCount 使用 */
    segments = [];
    segmentCount = 0;
    /** 累计生成过的方块数 */
    spawned = 0;
    /** 每条放置带一条独立随机流（generate() 里按种子重建） */
    bandRng = BANDS.map((_, i) => makeRng(mixSeed(1, i)));
    /** 每条带下一次生成的位置（参考单位，代表下一个方块的右边界） */
    cursors = BANDS.map(() => REF_W);
    nextId = 0;
    instanceCount = 0;
    /**
     * 用给定种子重建整个世界。同一个 seed 永远得到同一个世界，
     * 且与调用时机、帧率无关。
     *
     * 注意 Scene 不会自己挑种子：调用方必须显式给一颗
     * （app 在首次加载时用 randomSeed()，并把结果写进地址栏以便复现）。
     */
    generate(seed) {
      this.seed = seed | 0;
      this.bandRng = BANDS.map((_, i) => makeRng(mixSeed(this.seed, i)));
      this.blocks.length = 0;
      this.nextId = 0;
      this.spawned = 0;
      this.scrollX = 0;
      this.cursors = BANDS.map(() => REF_W);
      this.spawn();
      this.rebuild();
    }
    resize(w, h) {
      this.worldW = w;
      this.worldH = h;
      this.light.x = w * settings.lightX;
      this.light.y = h * settings.lightY;
    }
    /** 推进相机并维护方块条带。 */
    update(dtSeconds, speed) {
      this.scrollX += speed * dtSeconds;
      this.spawn();
      this.cull();
      this.rebuild();
    }
    /**
     * 在可见窗口左侧补齐方块，直到越过生成地平线。
     * 光标代表「下一个方块的右边界」，一路向左推进。
     */
    spawn() {
      const edge = -this.scrollX;
      const horizon = edge - SPAWN_MARGIN;
      for (let i = 0; i < BANDS.length; i++) {
        const band = BANDS[i];
        const rng = this.bandRng[i];
        let cursor = this.cursors[i];
        let guard = 0;
        while (cursor > horizon && guard++ < 128) {
          const size = sampleSize(rng);
          const h = Math.min(size.h, band.h - 8);
          const x = cursor - size.w;
          const y = this.pickY(x, size.w, h, band, rng);
          if (y < 0) {
            cursor -= 48;
            continue;
          }
          this.blocks.push({ id: this.nextId++, x, y, w: size.w, h });
          this.spawned++;
          const t = Math.min(0.95, Math.max(0, settings.overlap));
          cursor -= size.w * (t + (1 - t) * rng()) + settings.gap + rng() * settings.stepSpread;
        }
        this.cursors[i] = cursor;
      }
    }
    /** 在带内挑一个不与他人重叠的 y；挑不到返回 -1。 */
    pickY(x, w, h, band, rng) {
      const yMin = band.y;
      const yMax = band.y + band.h - h;
      if (yMax < yMin) return -1;
      const candidate = { x, y: 0, w, h };
      for (let attempt = 0; attempt < 14; attempt++) {
        const y = yMin + rng() * (yMax - yMin);
        candidate.y = y;
        if (!this.collides(candidate)) return y;
      }
      const steps = 32;
      for (let i = 0; i <= steps; i++) {
        const y = yMin + (yMax - yMin) * i / steps;
        candidate.y = y;
        if (!this.collides(candidate)) return y;
      }
      return -1;
    }
    collides(candidate) {
      for (let i = 0; i < this.blocks.length; i++) {
        if (rectsOverlap(candidate, this.blocks[i], settings.gap)) return true;
      }
      return false;
    }
    /** 回收已经滚出右边界的方块。 */
    cull() {
      const right = -this.scrollX + REF_W + CULL_MARGIN;
      let k = 0;
      for (let i = 0; i < this.blocks.length; i++) {
        const b = this.blocks[i];
        if (b.x > right) continue;
        this.blocks[k++] = b;
      }
      this.blocks.length = k;
    }
    /** 把参考坐标的方块换算成屏幕坐标，重建本帧几何。 */
    rebuild() {
      const sx = this.worldW / REF_W;
      const sy = this.worldH / REF_H;
      this.instanceCount = 0;
      this.segmentCount = 0;
      this.lightOccluded = false;
      for (let i = 0; i < this.blocks.length; i++) {
        const b = this.blocks[i];
        const x = (b.x + this.scrollX) * sx;
        const w = b.w * sx;
        if (x + w < -2 || x > this.worldW + 2) continue;
        this.emitBlock(i, x, b.y * sy, w, b.h * sy);
      }
      this.emitWalls();
    }
    /** 点 (x,y)（屏幕坐标）是否被某个方块盖住 —— 光源埋进方块时整个房间全黑。 */
    occludedAt(x, y) {
      for (let i = 0; i < this.instanceCount; i++) {
        const inst = this.instances[i];
        if (pointInRect(x, y, inst.x, inst.y, inst.w, inst.h)) return true;
      }
      return false;
    }
    /**
     * 调试 / 验证用：从光源到屏幕点 (x,y) 之间有几个方块挡着。
     * 做法是沿这条射线数穿过的线段数再除以 2（穿过一个方块正好进、出各一次）。
     */
    blockerCount(x, y) {
      const lx = this.light.x;
      const ly = this.light.y;
      const dx = x - lx;
      const dy = y - ly;
      const len = Math.hypot(dx, dy) || 1;
      let hits = 0;
      for (let i = 0; i < this.segmentCount; i++) {
        const s = this.segments[i];
        if (s.owner < 0) continue;
        const den = dx * s.ey - dy * s.ex;
        if (den === 0) continue;
        const wx = s.ax - lx;
        const wy = s.ay - ly;
        const t = (wx * s.ey - wy * s.ex) / den;
        if (t <= 0 || t >= len) continue;
        const u = (wx * dy - wy * dx) / den;
        if (u < 0 || u > 1) continue;
        hits++;
      }
      return Math.round(hits / 2);
    }
    get visibleInstanceCount() {
      return this.instanceCount;
    }
    emitBlock(id, x, y, w, h) {
      let inst = this.instances[this.instanceCount];
      if (!inst) {
        inst = makeInstance();
        this.instances[this.instanceCount] = inst;
      }
      this.instanceCount++;
      inst.id = id;
      inst.x = x;
      inst.y = y;
      inst.w = w;
      inst.h = h;
      inst.segIds[0] = this.emitSegment(x, y, x + w, y, 0, -1, id, 0);
      inst.segIds[1] = this.emitSegment(x + w, y, x + w, y + h, 1, 0, id, 1);
      inst.segIds[2] = this.emitSegment(x + w, y + h, x, y + h, 0, 1, id, 2);
      inst.segIds[3] = this.emitSegment(x, y + h, x, y, -1, 0, id, 3);
      if (!this.lightOccluded && pointInRect(this.light.x, this.light.y, x, y, w, h)) this.lightOccluded = true;
    }
    emitSegment(ax, ay, bx, by, nx, ny, owner, edge) {
      const index = this.segmentCount++;
      let seg = this.segments[index];
      if (!seg) {
        seg = makeSegment(index);
        this.segments[index] = seg;
      }
      setSegment(seg, ax, ay, bx, by, nx, ny, owner, edge);
      return index;
    }
    /** 视口外的「外墙」：给逃逸的射线一个兜底，保证可见多边形永远闭合。 */
    emitWalls() {
      const m = settings.wallMargin;
      const w = this.worldW;
      const h = this.worldH;
      this.emitSegment(-m, -m, w + m, -m, 0, -1, -1, -1);
      this.emitSegment(w + m, -m, w + m, h + m, 1, 0, -1, -1);
      this.emitSegment(w + m, h + m, -m, h + m, 0, 1, -1, -1);
      this.emitSegment(-m, h + m, -m, -m, -1, 0, -1, -1);
    }
  };

  // src/core/visibility.ts
  var Visibility = class {
    /**
     * 可见多边形顶点，[x0,y0,x1,y1,...]，严格按绕光源的极角排列。
     * 因为多边形关于光源是「星形」的，所以直接扇形三角化即可，无需耳切。
     */
    poly = [];
    /** segmentId → [u0,u1, u0,u1 ...]：这段线段的哪些参数区间被照到（给方块棱边打光用） */
    litSpans = /* @__PURE__ */ new Map();
    /** 本帧真正投射的射线数 */
    raysCast = 0;
    /** 光源被方块压住 → 没有可见区域 */
    blackout = false;
    reset() {
      this.poly.length = 0;
      for (const spans of this.litSpans.values()) spans.length = 0;
      this.raysCast = 0;
      this.blackout = false;
    }
    get vertexCount() {
      return this.poly.length >> 1;
    }
    /** 取某条线段被照亮的参数区间；没有就返回 undefined。 */
    litSpan(id) {
      const s = this.litSpans.get(id);
      return s && s.length > 0 ? s : void 0;
    }
  };
  var VisibilityEngine = class {
    cornerBuffer = new Float64Array(2048);
    angles = [];
    expanded = [];
    samples = [];
    sampleCount = 0;
    hit = makeRayHit();
    pin = makeRayHit();
    compute(px, py, segments, count, opts, out) {
      out.reset();
      if (count <= 0) return;
      this.collectCornerAngles(px, py, segments, count);
      switch (opts.mode) {
        case "uniform":
          this.runUniform(px, py, segments, count, opts.rayCount, out);
          break;
        case "edge":
          this.runEdge(px, py, segments, count, opts.edgeEpsilon, out);
          break;
        default:
          this.runExact(px, py, segments, count, out);
          break;
      }
    }
    /** 端点极角 → 排序去重，存进 this.angles。 */
    collectCornerAngles(px, py, segments, count) {
      const need = count * 2;
      if (this.cornerBuffer.length < need) this.cornerBuffer = new Float64Array(Math.max(need, this.cornerBuffer.length * 2));
      const buf = this.cornerBuffer;
      let n = 0;
      for (let i = 0; i < count; i++) {
        const s = segments[i];
        buf[n++] = Math.atan2(s.ay - py, s.ax - px);
        buf[n++] = Math.atan2(s.by - py, s.bx - px);
      }
      const view = buf.subarray(0, n);
      view.sort();
      const list = this.angles;
      list.length = 0;
      let prev = -Infinity;
      for (let i = 0; i < n; i++) {
        const a = view[i];
        if (a - prev > 1e-9) {
          list.push(a);
          prev = a;
        }
      }
    }
    // ─────────────────────────────── 精确锁定边缘 ───────────────────────────────
    runExact(px, py, segments, count, out) {
      const list = this.angles;
      const m = list.length;
      if (m < 2) return;
      this.sampleCount = 0;
      for (let i = 0; i < m; i++) {
        const a0 = list[i];
        const a1 = i === m - 1 ? list[0] + TAU : list[i + 1];
        const span = a1 - a0;
        if (span < 1e-12) continue;
        const am = a0 + span * 0.5;
        if (!rayCast(segments, count, px, py, Math.cos(am), Math.sin(am), this.hit)) continue;
        out.raysCast++;
        const seg = segments[this.hit.index];
        const segIndex = this.hit.index;
        pinToSegment(seg, px, py, Math.cos(a0), Math.sin(a0), this.pin);
        this.pushSample(a0, segIndex, seg.id, this.pin.u, this.pin.x, this.pin.y);
        pinToSegment(seg, px, py, Math.cos(a1), Math.sin(a1), this.pin);
        this.pushSample(a1, segIndex, seg.id, this.pin.u, this.pin.x, this.pin.y);
      }
      this.build(out);
    }
    // ─────────────────────────────── 角点 ±ε ───────────────────────────────
    runEdge(px, py, segments, count, eps, out) {
      const list = this.angles;
      if (list.length < 2) return;
      const expanded = this.expanded;
      expanded.length = 0;
      for (let i = 0; i < list.length; i++) {
        expanded.push(list[i] - eps, list[i], list[i] + eps);
      }
      expanded.sort((a, b) => a - b);
      this.sampleCount = 0;
      let prev = -Infinity;
      for (let i = 0; i < expanded.length; i++) {
        const a = expanded[i];
        if (a - prev <= 1e-12) continue;
        prev = a;
        if (!rayCast(segments, count, px, py, Math.cos(a), Math.sin(a), this.hit)) continue;
        out.raysCast++;
        const seg = segments[this.hit.index];
        this.pushSample(a, this.hit.index, seg.id, this.hit.u, this.hit.x, this.hit.y);
      }
      this.build(out);
    }
    // ─────────────────────────────── 均匀射线 ───────────────────────────────
    runUniform(px, py, segments, count, rayCount, out) {
      const n = Math.max(3, Math.floor(rayCount) || 360);
      const step = TAU / n;
      this.sampleCount = 0;
      for (let i = 0; i < n; i++) {
        const a = i * step;
        if (!rayCast(segments, count, px, py, Math.cos(a), Math.sin(a), this.hit)) continue;
        out.raysCast++;
        const seg = segments[this.hit.index];
        this.pushSample(a, this.hit.index, seg.id, this.hit.u, this.hit.x, this.hit.y);
      }
      this.build(out);
    }
    // ─────────────────────────────── 公共部分 ───────────────────────────────
    pushSample(ang, segIndex, segId, u, x, y) {
      let s = this.samples[this.sampleCount];
      if (!s) {
        s = { ang: 0, segIndex: 0, segId: 0, u: 0, x: 0, y: 0 };
        this.samples[this.sampleCount] = s;
      }
      this.sampleCount++;
      s.ang = ang;
      s.segIndex = segIndex;
      s.segId = segId;
      s.u = u;
      s.x = x;
      s.y = y;
    }
    /**
     * 把采样点整理成多边形 + 照亮区间：
     * 连续命中同一条线段的采样会被合并成一个「可见段」，只保留首尾两个顶点
     * （同一条线段上极角单调 ⇒ u 单调，中间点必然共线，留着只是浪费）。
     */
    build(out) {
      const n = this.sampleCount;
      const poly = out.poly;
      let i = 0;
      while (i < n) {
        const segId = this.samples[i].segId;
        let j = i;
        while (j + 1 < n && this.samples[j + 1].segId === segId) j++;
        const a = this.samples[i];
        const b = this.samples[j];
        if (j === i) {
          poly.push(a.x, a.y);
        } else if (a.x !== b.x || a.y !== b.y) {
          poly.push(a.x, a.y, b.x, b.y);
        } else {
          poly.push(a.x, a.y);
        }
        let spans = out.litSpans.get(segId);
        if (!spans) {
          spans = [];
          out.litSpans.set(segId, spans);
        }
        spans.push(a.u, b.u);
        i = j + 1;
      }
    }
  };

  // src/core/shadow.ts
  function umbraQuad(inst, segments, lx, ly, far, out) {
    let front = 0;
    for (let e = 0; e < 4; e++) {
      const s = segments[inst.segIds[e]];
      if ((lx - s.ax) * s.nx + (ly - s.ay) * s.ny > 0) front |= 1 << e;
    }
    let n = 0;
    let x1 = 0;
    let y1 = 0;
    let x2 = 0;
    let y2 = 0;
    for (let i = 0; i < 4; i++) {
      const a = front >> i & 1;
      const b = front >> (i + 3) % 4 & 1;
      if (a === b) continue;
      const s = segments[inst.segIds[i]];
      if (n === 0) {
        x1 = s.ax;
        y1 = s.ay;
      } else if (n === 1) {
        x2 = s.ax;
        y2 = s.ay;
      }
      n++;
    }
    if (n !== 2) return false;
    const d1 = Math.hypot(x1 - lx, y1 - ly) || 1;
    const d2 = Math.hypot(x2 - lx, y2 - ly) || 1;
    out[0] = x1;
    out[1] = y1;
    out[2] = x2;
    out[3] = y2;
    out[4] = x2 + (x2 - lx) / d2 * far;
    out[5] = y2 + (y2 - ly) / d2 * far;
    out[6] = x1 + (x1 - lx) / d1 * far;
    out[7] = y1 + (y1 - ly) / d1 * far;
    return true;
  }

  // src/render/mesh.ts
  var MeshBuilder = class {
    data;
    /** 当前写了多少个 float */
    n = 0;
    constructor(capacity = 1 << 15) {
      this.data = new Float32Array(capacity);
    }
    reset() {
      this.n = 0;
    }
    get floats() {
      return this.data;
    }
    /** 只读视图，交给 gl.bufferData 用 */
    view() {
      return this.data.subarray(0, this.n);
    }
    get vertexCount() {
      return this.n / 6;
    }
    ensure(extra) {
      if (this.n + extra <= this.data.length) return;
      let cap = this.data.length * 2;
      while (cap < this.n + extra) cap *= 2;
      const next = new Float32Array(cap);
      next.set(this.data.subarray(0, this.n));
      this.data = next;
    }
    vert(x, y, r, g, b, a) {
      this.ensure(6);
      const d = this.data;
      let i = this.n;
      d[i++] = x;
      d[i++] = y;
      d[i++] = r;
      d[i++] = g;
      d[i++] = b;
      d[i++] = a;
      this.n = i;
    }
    tri(x0, y0, x1, y1, x2, y2, r, g, b, a) {
      this.vert(x0, y0, r, g, b, a);
      this.vert(x1, y1, r, g, b, a);
      this.vert(x2, y2, r, g, b, a);
    }
    rect(x, y, w, h, r, g, b, a) {
      this.tri(x, y, x + w, y, x + w, y + h, r, g, b, a);
      this.tri(x, y, x + w, y + h, x, y + h, r, g, b, a);
    }
    /** 以 (x0,y0)-(x1,y1) 为轴、半宽 hw 的矩形（用来画线，WebGL 的 lineWidth 不可靠） */
    thickLine(x0, y0, x1, y1, hw, r, g, b, a) {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) return;
      const nx = -dy / len * hw;
      const ny = dx / len * hw;
      this.tri(x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, r, g, b, a);
      this.tri(x0 + nx, y0 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny, r, g, b, a);
    }
    /** 带径向渐变的圆盘（灯泡 + 外晕）：stops = [半径, r, g, b, a] */
    disc(cx, cy, stops, segments = 48) {
      for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i];
        const b = stops[i + 1];
        for (let s = 0; s < segments; s++) {
          const t0 = s / segments * Math.PI * 2;
          const t1 = (s + 1) / segments * Math.PI * 2;
          const c0 = Math.cos(t0);
          const s0 = Math.sin(t0);
          const c1 = Math.cos(t1);
          const s1 = Math.sin(t1);
          this.tri(cx + c0 * a[0], cy + s0 * a[0], cx + c1 * a[0], cy + s1 * a[0], cx + c1 * b[0], cy + s1 * b[0], a[1], a[2], a[3], a[4]);
          this.tri(cx + c0 * a[0], cy + s0 * a[0], cx + c1 * b[0], cy + s1 * b[0], cx + c0 * b[0], cy + s0 * b[0], b[1], b[2], b[3], b[4]);
        }
      }
    }
  };
  function falloffStops(radius, power, scale, steps = 24) {
    const out = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const d = t * radius;
      const f = d >= radius ? 0 : Math.pow(1 - d / radius, power);
      out.push([t, f * scale * settings.glowAmp]);
    }
    return out;
  }

  // src/render/canvas2d-renderer.ts
  function gray(v) {
    const c = Math.max(0, Math.min(255, Math.round(v * 255)));
    return `rgb(${c},${c},${c})`;
  }
  var Canvas2DRenderer = class {
    backend = "canvas2d";
    detail = "Canvas 2D（CPU 回退）";
    canvas;
    ctx;
    /** 离屏「光场」：只有 amp·f，然后被每个方块的本影逐个 multiply 掉 */
    field = document.createElement("canvas");
    umbra = [0, 0, 0, 0, 0, 0, 0, 0];
    scale = 1;
    pixelScale = 1;
    constructor(canvas) {
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Canvas 2D 不可用");
      this.canvas = canvas;
      this.ctx = ctx;
    }
    resize(cssW, cssH, dpr) {
      const w = Math.max(1, Math.round(cssW * dpr));
      const h = Math.max(1, Math.round(cssH * dpr));
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      this.scale = cssH / WORLD_H;
      this.pixelScale = dpr * this.scale;
      this.ctx.setTransform(this.pixelScale, 0, 0, this.pixelScale, 0, 0);
      if (this.field.width !== w || this.field.height !== h) {
        this.field.width = w;
        this.field.height = h;
      }
    }
    render(model) {
      const ctx = this.ctx;
      const { light, worldW, worldH } = model;
      const ds = 1 - settings.directShare;
      const field = this.field;
      const fctx = field.getContext("2d");
      if (!fctx) return;
      fctx.setTransform(1, 0, 0, 1, 0, 0);
      fctx.globalCompositeOperation = "source-over";
      fctx.clearRect(0, 0, field.width, field.height);
      fctx.setTransform(this.pixelScale, 0, 0, this.pixelScale, 0, 0);
      if (model.blackout) {
        fctx.fillStyle = gray(settings.glowAmp * ds);
        fctx.fillRect(0, 0, worldW, worldH);
      } else {
        const glow2 = fctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, settings.glowRadius);
        for (const [t, v] of falloffStops(settings.glowRadius, settings.glowPower, 1)) {
          glow2.addColorStop(t, gray(v));
        }
        fctx.fillStyle = glow2;
        fctx.fillRect(0, 0, worldW, worldH);
        fctx.globalCompositeOperation = "multiply";
        fctx.fillStyle = gray(ds);
        for (let i = 0; i < model.instanceCount; i++) {
          const inst = model.instances[i];
          if (!umbraQuad(inst, model.segments, light.x, light.y, 4e3, this.umbra)) continue;
          const q = this.umbra;
          fctx.beginPath();
          fctx.moveTo(q[0], q[1]);
          fctx.lineTo(q[2], q[3]);
          fctx.lineTo(q[4], q[5]);
          fctx.lineTo(q[6], q[7]);
          fctx.closePath();
          fctx.fill();
        }
        fctx.globalCompositeOperation = "source-over";
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = gray(settings.bgFar);
      ctx.fillRect(0, 0, worldW, worldH);
      ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(field, 0, 0, worldW, worldH);
      if (model.opts.debugRays) {
        const n = model.vis.vertexCount;
        ctx.strokeStyle = "rgba(255,222,153,0.22)";
        ctx.lineWidth = settings.rayWidth * model.pxScale;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          ctx.moveTo(light.x, light.y);
          ctx.lineTo(model.vis.poly[i * 2], model.vis.poly[i * 2 + 1]);
        }
        ctx.stroke();
      }
      if (model.opts.showBlocks) {
        ctx.globalCompositeOperation = "source-over";
        const fr = blockFill()[0];
        ctx.fillStyle = gray(fr);
        const count = model.instanceCount;
        for (let i = 0; i < count; i++) {
          const inst = model.instances[i];
          ctx.fillRect(inst.x, inst.y, inst.w, inst.h);
        }
        ctx.lineCap = "butt";
        ctx.lineWidth = settings.rimWidth * 2 * model.pxScale;
        for (let i = 0; i < count; i++) {
          const inst = model.instances[i];
          for (let e = 0; e < 4; e++) {
            const segId = inst.segIds[e];
            const seg = model.segments[segId];
            if (!seg || seg.id !== segId) continue;
            const spans = model.vis.litSpan(segId);
            if (!spans) continue;
            for (let s = 0; s < spans.length; s += 2) {
              const x0 = seg.ax + seg.ex * spans[s];
              const y0 = seg.ay + seg.ey * spans[s];
              const x1 = seg.ax + seg.ex * spans[s + 1];
              const y1 = seg.ay + seg.ey * spans[s + 1];
              if (Math.hypot(x1 - x0, y1 - y0) < 0.5) continue;
              const mx = (x0 + x1) * 0.5 - light.x;
              const my = (y0 + y1) * 0.5 - light.y;
              const dist = Math.hypot(mx, my) || 1;
              const ndotl = Math.max(0, (-mx * seg.nx - my * seg.ny) / dist);
              const k = settings.rimStrength * (0.3 + 0.7 * ndotl);
              ctx.strokeStyle = gray(fr + (1 - fr) * k);
              ctx.beginPath();
              ctx.moveTo(x0, y0);
              ctx.lineTo(x1, y1);
              ctx.stroke();
            }
          }
        }
      }
      ctx.globalCompositeOperation = "lighter";
      const stops = bulbStops();
      const halo = stops[stops.length - 1][0] || 1;
      const glow = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, halo);
      for (const [r, , , , a] of stops) glow.addColorStop(Math.min(1, r / halo), `rgba(255,255,255,${a})`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(light.x, light.y, halo, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }
    dispose() {
    }
  };

  // src/render/shaders.ts
  var TRANSFORM = `
  gl_Position = vec4(p.x / u_world.x * 2.0 - 1.0, 1.0 - p.y / u_world.y * 2.0, 0.0, 1.0);
`;
  var POS_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
uniform vec2 u_world;
out vec2 v_world;
void main() {
  vec2 p = a_pos;
  v_world = p;
${TRANSFORM}}
`;
  var BG_FRAG = `#version 300 es
precision highp float;
in vec2 v_world;
uniform vec2 u_world;
uniform vec2 u_light;
uniform float u_bgFar;
uniform float u_glowAmp;
uniform float u_glowRadius;
uniform float u_glowPower;
uniform float u_ambShare;
out vec4 outColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  float d = distance(v_world, u_light);
  float f = pow(max(0.0, 1.0 - d / u_glowRadius), u_glowPower);
  float v = u_bgFar + u_glowAmp * u_ambShare * f;
  v += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  outColor = vec4(vec3(v), 1.0);
}
`;
  var LIT_FRAG = `#version 300 es
precision highp float;
in vec2 v_world;
uniform vec2 u_light;
uniform float u_glowAmp;
uniform float u_glowRadius;
uniform float u_glowPower;
uniform float u_directShare;
out vec4 outColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  float d = distance(v_world, u_light);
  float f = pow(max(0.0, 1.0 - d / u_glowRadius), u_glowPower);
  float v = u_glowAmp * u_directShare * f;
  v += (hash(gl_FragCoord.xy + 7.13) - 0.5) / 255.0;
  outColor = vec4(vec3(v), 1.0);
}
`;
  var FLAT_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec4 a_color;
uniform vec2 u_world;
out vec4 v_color;
void main() {
  vec2 p = a_pos;
  v_color = a_color;
${TRANSFORM}}
`;
  var FLAT_FRAG = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 outColor;
void main() {
  outColor = v_color;
}
`;
  var SHADOW_FRAG = `#version 300 es
precision highp float;
in vec2 v_world;
uniform vec2 u_world;
uniform vec2 u_light;
uniform sampler2D u_count;
uniform float u_glowAmp;
uniform float u_glowRadius;
uniform float u_glowPower;
uniform float u_directShare;
uniform float u_bgFar;
out vec4 outColor;

void main() {
  vec2 uv = vec2(v_world.x / u_world.x, 1.0 - v_world.y / u_world.y);
  float n = floor(texture(u_count, uv).r * 16.0 + 0.5);
  if (n < 2.0) {
    outColor = vec4(0.0);
    return;
  }
  float d = distance(v_world, u_light);
  float f = pow(max(0.0, 1.0 - d / u_glowRadius), u_glowPower);
  float ds = 1.0 - u_directShare;
  float glow = u_glowAmp * ds * f;
  float base = u_bgFar + glow;                       // 这一步时像素的当前值
  float amount = glow * (1.0 - pow(ds, n - 1.0));    // 要减掉的量
  float src = base > 1e-5 ? clamp(amount / base, 0.0, 1.0) : 0.0;
  outColor = vec4(src, src, src, 0.0);
}
`;

  // src/render/webgl-renderer.ts
  function compile(gl, type, src, label) {
    const sh = gl.createShader(type);
    if (!sh) throw new Error(`创建 shader 失败: ${label}`);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error(`shader 编译失败 (${label}): ${log}`);
    }
    return sh;
  }
  function link(gl, vsSrc, fsSrc, label) {
    const vs = compile(gl, gl.VERTEX_SHADER, vsSrc, `${label}.vert`);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc, `${label}.frag`);
    const prog = gl.createProgram();
    if (!prog) throw new Error(`创建 program 失败: ${label}`);
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error(`program 链接失败 (${label}): ${log}`);
    }
    return prog;
  }
  function uniformMap(gl, prog, names) {
    const out = {};
    for (const n of names) out[n] = gl.getUniformLocation(prog, n);
    return out;
  }
  var WebGL2Renderer = class {
    backend = "webgl2";
    detail;
    gl;
    bgProg;
    litProg;
    flatProg;
    bgU;
    litU;
    flatU;
    quadVao;
    quadBuf;
    quadData = new Float32Array(12);
    fanVao;
    fanBuf;
    flatVao;
    flatBuf;
    shadowProg;
    shadowU;
    countFbo = null;
    countTex = null;
    mesh = new MeshBuilder(1 << 16);
    fan = new Float32Array(1 << 13);
    fanVerts = 0;
    /** mesh 里本影四边形的顶点数（最前面这段） */
    umbraVerts = 0;
    /** 叠加层在 mesh 里的起点与两段长度 */
    overlayStart = 0;
    alphaVerts = 0;
    addVerts = 0;
    umbra = [0, 0, 0, 0, 0, 0, 0, 0];
    pixelW = 1;
    pixelH = 1;
    constructor(canvas) {
      const gl = canvas.getContext("webgl2", {
        alpha: false,
        antialias: true,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
        powerPreference: "high-performance"
      });
      if (!gl) throw new Error("WebGL2 不可用");
      this.gl = gl;
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      const raw = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      this.detail = String(raw ?? "WebGL2");
      this.bgProg = link(gl, POS_VERT, BG_FRAG, "bg");
      this.litProg = link(gl, POS_VERT, LIT_FRAG, "lit");
      this.flatProg = link(gl, FLAT_VERT, FLAT_FRAG, "flat");
      this.shadowProg = link(gl, POS_VERT, SHADOW_FRAG, "shadow");
      this.bgU = uniformMap(gl, this.bgProg, ["u_world", "u_light", "u_bgFar", "u_glowAmp", "u_glowRadius", "u_glowPower", "u_ambShare"]);
      this.litU = uniformMap(gl, this.litProg, ["u_world", "u_light", "u_glowAmp", "u_glowRadius", "u_glowPower", "u_directShare"]);
      this.flatU = uniformMap(gl, this.flatProg, ["u_world"]);
      this.shadowU = uniformMap(gl, this.shadowProg, [
        "u_world",
        "u_light",
        "u_count",
        "u_glowAmp",
        "u_glowRadius",
        "u_glowPower",
        "u_directShare",
        "u_bgFar"
      ]);
      this.quadVao = gl.createVertexArray();
      this.quadBuf = gl.createBuffer();
      gl.bindVertexArray(this.quadVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
      gl.bufferData(gl.ARRAY_BUFFER, this.quadData, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      this.fanVao = gl.createVertexArray();
      this.fanBuf = gl.createBuffer();
      gl.bindVertexArray(this.fanVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.fanBuf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      this.flatVao = gl.createVertexArray();
      this.flatBuf = gl.createBuffer();
      gl.bindVertexArray(this.flatVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.flatBuf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 24, 8);
      gl.bindVertexArray(null);
    }
    resize(cssW, cssH, dpr) {
      const w = Math.max(1, Math.round(cssW * dpr));
      const h = Math.max(1, Math.round(cssH * dpr));
      if (w === this.pixelW && h === this.pixelH) return;
      this.pixelW = w;
      this.pixelH = h;
      const canvas = this.gl.canvas;
      canvas.width = w;
      canvas.height = h;
      this.resizeCountTarget(w, h);
    }
    /** 离屏「遮挡计数」纹理：每个方块的本影往里加 1/16，最多记到 16 个遮挡物。 */
    resizeCountTarget(w, h) {
      const gl = this.gl;
      if (!this.countTex) this.countTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.countTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (!this.countFbo) this.countFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.countFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.countTex, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (!ok) {
        gl.deleteFramebuffer(this.countFbo);
        gl.deleteTexture(this.countTex);
        this.countFbo = null;
        this.countTex = null;
      }
    }
    render(model) {
      const gl = this.gl;
      gl.viewport(0, 0, this.pixelW, this.pixelH);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      this.mesh.reset();
      this.buildUmbras(model);
      this.umbraVerts = this.mesh.vertexCount;
      this.overlayStart = this.umbraVerts;
      this.buildOverlay(model);
      this.drawCountPass(model);
      this.drawBackground(model);
      this.drawLit(model);
      this.drawShadowCorrection(model);
      this.drawOverlay(model);
    }
    /** 每个方块的本影四边形（近端两个剪影角点 + 向外延伸的远端）。 */
    buildUmbras(model) {
      if (!this.countTex || model.blackout) return;
      const m = this.mesh;
      const step = 1 / 16;
      const far = 4e3;
      for (let i = 0; i < model.instanceCount; i++) {
        const inst = model.instances[i];
        if (!umbraQuad(inst, model.segments, model.light.x, model.light.y, far, this.umbra)) continue;
        const q = this.umbra;
        m.tri(q[0], q[1], q[2], q[3], q[4], q[5], step, 0, 0, 0);
        m.tri(q[0], q[1], q[4], q[5], q[6], q[7], step, 0, 0, 0);
      }
    }
    /** 把本影写进离屏纹理：叠加混合 ⇒ 每个像素记录的 R 就是遮挡物数量。 */
    drawCountPass(model) {
      const gl = this.gl;
      if (!this.countFbo) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.countFbo);
      gl.viewport(0, 0, this.pixelW, this.pixelH);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.uploadMesh();
      if (this.umbraVerts > 0) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.useProgram(this.flatProg);
        gl.uniform2f(this.flatU.u_world, model.worldW, model.worldH);
        gl.bindVertexArray(this.flatVao);
        gl.drawArrays(gl.TRIANGLES, 0, this.umbraVerts);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.pixelW, this.pixelH);
    }
    /** 多重阴影：按「被几个方块挡住」把重叠区域压暗（n ≤ 1 时不动，保持原观感）。 */
    drawShadowCorrection(model) {
      const gl = this.gl;
      if (!this.countTex || model.blackout) return;
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.ZERO, gl.ONE_MINUS_SRC_COLOR, gl.ZERO, gl.ONE);
      gl.useProgram(this.shadowProg);
      gl.uniform2f(this.shadowU.u_world, model.worldW, model.worldH);
      gl.uniform2f(this.shadowU.u_light, model.light.x, model.light.y);
      gl.uniform1f(this.shadowU.u_glowAmp, settings.glowAmp);
      gl.uniform1f(this.shadowU.u_glowRadius, settings.glowRadius);
      gl.uniform1f(this.shadowU.u_glowPower, settings.glowPower);
      gl.uniform1f(this.shadowU.u_directShare, settings.directShare);
      gl.uniform1f(this.shadowU.u_bgFar, settings.bgFar);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.countTex);
      gl.uniform1i(this.shadowU.u_count, 0);
      gl.bindVertexArray(this.quadVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
      const w = model.worldW;
      const h = model.worldH;
      this.quadData.set([0, 0, w, 0, w, h, 0, 0, w, h, 0, h]);
      gl.bufferData(gl.ARRAY_BUFFER, this.quadData, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    uploadMesh() {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.flatBuf);
      gl.bufferData(gl.ARRAY_BUFFER, this.mesh.view(), gl.DYNAMIC_DRAW);
    }
    drawBackground(model) {
      const gl = this.gl;
      gl.disable(gl.BLEND);
      gl.useProgram(this.bgProg);
      gl.uniform2f(this.bgU.u_world, model.worldW, model.worldH);
      gl.uniform2f(this.bgU.u_light, model.light.x, model.light.y);
      gl.uniform1f(this.bgU.u_bgFar, settings.bgFar);
      gl.uniform1f(this.bgU.u_glowAmp, settings.glowAmp);
      gl.uniform1f(this.bgU.u_glowRadius, settings.glowRadius);
      gl.uniform1f(this.bgU.u_glowPower, settings.glowPower);
      gl.uniform1f(this.bgU.u_ambShare, 1 - settings.directShare);
      gl.bindVertexArray(this.quadVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
      const w = model.worldW;
      const h = model.worldH;
      this.quadData.set([0, 0, w, 0, w, h, 0, 0, w, h, 0, h]);
      gl.bufferData(gl.ARRAY_BUFFER, this.quadData, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    drawLit(model) {
      const gl = this.gl;
      const n = model.vis.vertexCount;
      if (model.blackout || n < 3) return;
      if (this.fan.length < n * 6) this.fan = new Float32Array(n * 12);
      const poly = model.vis.poly;
      const lx = model.light.x;
      const ly = model.light.y;
      let k = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        this.fan[k++] = lx;
        this.fan[k++] = ly;
        this.fan[k++] = poly[i * 2];
        this.fan[k++] = poly[i * 2 + 1];
        this.fan[k++] = poly[j * 2];
        this.fan[k++] = poly[j * 2 + 1];
      }
      this.fanVerts = k / 2;
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
      gl.useProgram(this.litProg);
      gl.uniform2f(this.litU.u_world, model.worldW, model.worldH);
      gl.uniform2f(this.litU.u_light, lx, ly);
      gl.uniform1f(this.litU.u_glowAmp, settings.glowAmp);
      gl.uniform1f(this.litU.u_glowRadius, settings.glowRadius);
      gl.uniform1f(this.litU.u_glowPower, settings.glowPower);
      gl.uniform1f(this.litU.u_directShare, settings.directShare);
      gl.bindVertexArray(this.fanVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.fanBuf);
      gl.bufferData(gl.ARRAY_BUFFER, this.fan.subarray(0, this.fanVerts * 2), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, this.fanVerts);
    }
    drawOverlay(model) {
      const gl = this.gl;
      this.buildOverlay(model);
      if (this.mesh.n === 0) return;
      if (!this.countFbo) this.uploadMesh();
      gl.useProgram(this.flatProg);
      gl.uniform2f(this.flatU.u_world, model.worldW, model.worldH);
      gl.bindVertexArray(this.flatVao);
      if (this.alphaVerts > 0) {
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.TRIANGLES, this.overlayStart, this.alphaVerts);
      }
      if (this.addVerts > 0) {
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ZERO, gl.ONE);
        gl.drawArrays(gl.TRIANGLES, this.overlayStart + this.alphaVerts, this.addVerts);
      }
    }
    buildOverlay(model) {
      const m = this.mesh;
      const o = model.opts;
      const light = model.light;
      const start = m.vertexCount;
      if (o.debugRays) {
        const w = settings.rayWidth * model.pxScale;
        const poly = model.vis.poly;
        const n = model.vis.vertexCount;
        for (let i = 0; i < n; i++) {
          m.thickLine(light.x, light.y, poly[i * 2], poly[i * 2 + 1], w, 1, 0.87, 0.6, 0.22);
        }
      }
      if (o.showBlocks) {
        const [fr, fg, fb] = blockFill();
        const count = model.instanceCount;
        for (let i = 0; i < count; i++) {
          const inst = model.instances[i];
          m.rect(inst.x, inst.y, inst.w, inst.h, fr, fg, fb, 1);
        }
        const halfWidth = settings.rimWidth * model.pxScale;
        for (let i = 0; i < count; i++) {
          const inst = model.instances[i];
          for (let e = 0; e < 4; e++) {
            const segId = inst.segIds[e];
            const seg = model.segments[segId];
            if (!seg || seg.id !== segId) continue;
            const spans = model.vis.litSpan(segId);
            if (!spans) continue;
            for (let s = 0; s < spans.length; s += 2) {
              const x0 = seg.ax + seg.ex * spans[s];
              const y0 = seg.ay + seg.ey * spans[s];
              const x1 = seg.ax + seg.ex * spans[s + 1];
              const y1 = seg.ay + seg.ey * spans[s + 1];
              const dx = x1 - x0;
              const dy = y1 - y0;
              const len = Math.hypot(dx, dy);
              if (len < 0.5) continue;
              const mx = (x0 + x1) * 0.5 - light.x;
              const my = (y0 + y1) * 0.5 - light.y;
              const dist = Math.hypot(mx, my) || 1;
              const ndotl = Math.max(0, (-mx * seg.nx - my * seg.ny) / dist);
              const k = settings.rimStrength * (0.3 + 0.7 * ndotl);
              m.thickLine(x0, y0, x1, y1, halfWidth, fr + (1 - fr) * k, fg + (1 - fg) * k, fb + (1 - fb) * k, 1);
            }
          }
        }
      }
      this.alphaVerts = m.vertexCount - start;
      m.disc(light.x, light.y, bulbStops());
      this.addVerts = m.vertexCount - start - this.alphaVerts;
      if (model.opts.debugRays) {
        const poly = model.vis.poly;
        const n = model.vis.vertexCount;
        for (let i = 0; i < n; i++) {
          m.disc(poly[i * 2], poly[i * 2 + 1], [
            [0, 1, 0.9, 0.6, 0.95],
            [settings.dotRadius * model.pxScale, 1, 0.9, 0.6, 0]
          ], 12);
        }
        this.addVerts = m.vertexCount - start - this.alphaVerts;
      }
    }
    dispose() {
      const gl = this.gl;
      gl.deleteProgram(this.bgProg);
      gl.deleteProgram(this.litProg);
      gl.deleteProgram(this.flatProg);
      gl.deleteBuffer(this.quadBuf);
      gl.deleteBuffer(this.fanBuf);
      gl.deleteBuffer(this.flatBuf);
      if (this.countFbo) gl.deleteFramebuffer(this.countFbo);
      if (this.countTex) gl.deleteTexture(this.countTex);
      gl.deleteProgram(this.shadowProg);
      gl.deleteVertexArray(this.quadVao);
      gl.deleteVertexArray(this.fanVao);
      gl.deleteVertexArray(this.flatVao);
    }
  };

  // src/render/index.ts
  function createRenderer(canvas) {
    try {
      return { renderer: new WebGL2Renderer(canvas), canvas };
    } catch (err) {
      console.warn("[rt2d] WebGL2 初始化失败，回退到 Canvas 2D：", err);
      const replacement = canvas.cloneNode(false);
      canvas.replaceWith(replacement);
      return { renderer: new Canvas2DRenderer(replacement), canvas: replacement };
    }
  }

  // src/timing.ts
  var CostMeter = class {
    constructor(run, targetMs = 1.5, budgetPerFrame = 0.025, windowSize = 7, initial = 0.03, maxK = 512) {
      this.run = run;
      this.targetMs = targetMs;
      this.budgetPerFrame = budgetPerFrame;
      this.windowSize = windowSize;
      this.maxK = maxK;
      this.estimate = initial;
    }
    run;
    targetMs;
    budgetPerFrame;
    windowSize;
    maxK;
    /** 对外给出的估计值（ms） */
    estimate;
    /** 还要等几帧才采样 */
    countdown = 0;
    /** 最近的若干次测量，取最小值 */
    recent = [];
    /** 最近一次批量的原始数据（调试用） */
    lastBatch = { k: 0, elapsed: 0, samples: 0 };
    /** 下次调用立刻重新采样（切换算法、改射线数之后要调）。 */
    invalidate() {
      this.countdown = 0;
      this.recent.length = 0;
    }
    /** 是否已经真正测过一次（没测过时 value 返回 NaN，HUD 显示「—」而不是初始猜测值）。 */
    get measured() {
      return this.recent.length > 0;
    }
    /** 当前估计耗时（ms）；还没测过则是 NaN。 */
    get value() {
      return this.measured ? this.estimate : NaN;
    }
    /** 返回当前估计；到点时会真的跑一批并更新估计。 */
    sample() {
      if (this.countdown > 0) {
        this.countdown--;
        return this.estimate;
      }
      const perCall = Math.max(this.estimate, 1e-4);
      const k = Math.max(1, Math.min(Math.round(this.targetMs / perCall), this.maxK));
      this.run();
      const t0 = performance.now();
      for (let i = 0; i < k; i++) this.run();
      const elapsed = performance.now() - t0;
      this.lastBatch.k = k;
      this.lastBatch.elapsed = elapsed;
      this.lastBatch.samples = this.recent.length;
      if (elapsed > 0) {
        this.recent.push(elapsed / k);
        if (this.recent.length > this.windowSize) this.recent.shift();
        this.estimate = Math.min(...this.recent);
      }
      this.countdown = Math.min(600, Math.max(12, Math.ceil(k * this.estimate / this.budgetPerFrame)));
      return this.estimate;
    }
  };

  // src/ui/advanced-panel.ts
  var GROUPS = [
    {
      title: "光照",
      open: true,
      knobs: [
        { key: "glowRadius", label: "光照范围", min: 300, max: 2400, step: 10, digits: 0 },
        { key: "glowPower", label: "衰减指数", min: 0.3, max: 2.5, step: 0.05, digits: 2 },
        { key: "glowAmp", label: "辉光亮度", min: 0, max: 0.8, step: 0.01, digits: 2 },
        { key: "bgFar", label: "环境光", min: 0, max: 0.8, step: 5e-3, digits: 3 },
        {
          key: "directShare",
          label: "阴影深度",
          min: 0,
          max: 0.95,
          step: 0.01,
          digits: 2,
          hint: "每个遮挡物挡掉的比例，同时决定重叠阴影的累积速度"
        },
        { key: "rimStrength", label: "棱边高光", min: 0, max: 1, step: 0.02, digits: 2 }
      ]
    },
    {
      title: "灯泡与位置",
      knobs: [
        { key: "bulbSize", label: "灯泡大小", min: 0.2, max: 4, step: 0.1, digits: 1 },
        { key: "bulbBright", label: "灯泡亮度", min: 0, max: 2, step: 0.05, digits: 2 },
        { key: "lightX", label: "光源 X", min: 0.02, max: 0.98, step: 5e-3, digits: 3 },
        { key: "lightY", label: "光源 Y", min: 0.02, max: 0.98, step: 5e-3, digits: 3 }
      ]
    },
    {
      title: "方块与线宽",
      knobs: [
        { key: "blockTone", label: "方块灰度", min: 0.05, max: 0.6, step: 5e-3, digits: 3, hint: "参考图实测 0.239" },
        { key: "rimWidth", label: "棱边宽", min: 0.2, max: 4, step: 0.05, digits: 2 },
        { key: "rayWidth", label: "射线宽", min: 0.2, max: 3, step: 0.05, digits: 2 },
        { key: "dotRadius", label: "端点亮点", min: 0, max: 6, step: 0.2, digits: 1 }
      ]
    },
    {
      title: "生成器",
      note: "只影响之后新生成的方块：想立刻看到效果就按 N 换种子",
      knobs: [
        { key: "overlap", label: "重叠程度", min: 0, max: 0.95, step: 0.05, digits: 2, hint: "越小越容易出现同带内 x 重叠" },
        { key: "stepSpread", label: "疏密抖动", min: 0, max: 300, step: 5, digits: 0 },
        { key: "gap", label: "最小间隙", min: 0, max: 60, step: 2, digits: 0 },
        { key: "widthScale", label: "宽度缩放", min: 0.4, max: 1.6, step: 0.02, digits: 2 },
        { key: "heightMin", label: "高度下限", min: 20, max: 200, step: 2, digits: 0 },
        { key: "heightMax", label: "高度上限", min: 20, max: 240, step: 2, digits: 0 },
        { key: "aspectMu", label: "长宽比中心", min: 0, max: 1.2, step: 0.01, digits: 2 },
        { key: "aspectSigma", label: "长宽比离散", min: 0, max: 0.8, step: 0.01, digits: 2 }
      ]
    },
    {
      title: "宽度档位权重",
      note: "三档按比例归一化，参考图拟合值是 2 : 8 : 6",
      knobs: [
        { key: "weightSmall", label: "小方块", min: 0, max: 1, step: 0.02, digits: 2 },
        { key: "weightMedium", label: "中条", min: 0, max: 1, step: 0.02, digits: 2 },
        { key: "weightLarge", label: "长条", min: 0, max: 1, step: 0.02, digits: 2 }
      ]
    },
    {
      title: "兜底",
      knobs: [{ key: "wallMargin", label: "外墙距离", min: 40, max: 600, step: 10, digits: 0, hint: "只影响射线兜底，画面无变化" }]
    }
  ];
  var AdvancedPanel = class {
    constructor(root, actions) {
      this.root = root;
      this.actions = actions;
      root.classList.add("panel", "panel-adv");
      root.hidden = true;
      const header = document.createElement("header");
      const title = document.createElement("h2");
      title.textContent = "高级参数";
      const close = document.createElement("button");
      close.type = "button";
      close.className = "close";
      close.title = "关闭（A）";
      close.textContent = "×";
      close.addEventListener("click", () => this.actions.onClose());
      header.append(title, close);
      const note = document.createElement("p");
      note.className = "adv-note";
      note.textContent = "拖动即时生效";
      const groups = document.createElement("div");
      groups.className = "adv-groups";
      for (const group of GROUPS) {
        const details = document.createElement("details");
        if (group.open) details.open = true;
        const summary = document.createElement("summary");
        summary.textContent = group.title;
        details.append(summary);
        if (group.note) {
          const p = document.createElement("p");
          p.className = "adv-group-note";
          p.textContent = group.note;
          details.append(p);
        }
        for (const knob of group.knobs) {
          const row = document.createElement("label");
          row.className = "knob";
          if (knob.hint) row.title = knob.hint;
          const name = document.createElement("span");
          name.textContent = knob.label;
          const input = document.createElement("input");
          input.type = "range";
          input.dataset.knob = knob.key;
          input.min = String(knob.min);
          input.max = String(knob.max);
          input.step = String(knob.step);
          const value = document.createElement("b");
          const format = (v) => v.toFixed(knob.digits);
          input.value = String(settings[knob.key]);
          value.textContent = format(settings[knob.key]);
          input.addEventListener("input", () => {
            const v = Number(input.value);
            settings[knob.key] = v;
            value.textContent = format(v);
            this.actions.onChange(knob.key);
          });
          row.append(name, input, value);
          details.append(row);
          this.inputs.set(knob.key, { input, value });
        }
        groups.append(details);
      }
      const footer = document.createElement("footer");
      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "reset";
      reset.textContent = "恢复默认值";
      reset.addEventListener("click", () => {
        resetSettings();
        this.refresh();
        this.actions.onReset();
      });
      footer.append(reset);
      root.append(header, note, groups, footer);
    }
    root;
    actions;
    inputs = /* @__PURE__ */ new Map();
    hidden = true;
    get visible() {
      return !this.hidden;
    }
    toggle(force) {
      this.hidden = force === void 0 ? !this.hidden : !force;
      this.root.hidden = this.hidden;
    }
    /** 把 settings 的当前值刷回控件（恢复默认后调用）。 */
    refresh() {
      for (const [key, { input, value }] of this.inputs) {
        const v = settings[key];
        input.value = String(v);
        value.textContent = v.toFixed(this.digitsOf(key));
      }
    }
    digitsOf(key) {
      for (const g of GROUPS) for (const k of g.knobs) if (k.key === key) return k.digits;
      return 2;
    }
  };

  // src/ui/hud.ts
  var EPSILONS = [0.01, 3e-3, 1e-3, 3e-4, 1e-4];
  function formatMs(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return "—";
    if (ms < 1e-3) return "<1µs";
    if (ms < 0.1) return `${(ms * 1e3).toFixed(1)}µs`;
    if (ms < 1) return `${Math.round(ms * 1e3)}µs`;
    return `${ms.toFixed(2)}ms`;
  }
  var TEMPLATE = (
    /* html */
    `
<div class="panel">
  <header>
    <h1>2D 光线追踪</h1>
    <span class="badge" data-backend>—</span>
  </header>
  <p class="sub">点光源硬阴影 · 方块程序化生成，自左向右平移</p>

  <div class="modes">
    <button type="button" data-mode="exact">精确锁定边缘</button>
    <button type="button" data-mode="edge">角点 ±ε</button>
    <button type="button" data-mode="uniform">均匀射线</button>
  </div>
  <p class="note" data-note></p>

  <div class="stats">
    <div title="本帧参与求交的线段：每个方块 4 条 + 4 面外墙">
      <span>线段</span><b data-stat="segments">0</b>
    </div>
    <div title="本帧实际投射的射线数。精确模式 = 角区间数，而不是固定 360 条">
      <span>射线</span><b data-stat="rays">0</b>
    </div>
    <div title="可见多边形的顶点数，与角点数量同阶">
      <span>顶点</span><b data-stat="vertices">0</b>
    </div>
    <div title="同屏可见的方块数（屏幕外的邻居不参与求交）">
      <span>方块</span><b data-stat="blocks">0</b>
    </div>
    <div title="可见性求解耗时：角度排序 + 射线求交">
      <span>求解</span><b data-stat="vis">0</b>
    </div>
    <div title="真实帧率（受 vsync 限制）">
      <span>FPS</span><b data-stat="fps">0</b>
    </div>
  </div>

  <label class="row">
    <span>速度</span>
    <input type="range" min="0" max="400" step="5" data-slider="speed">
    <b data-value="speed">0</b>
  </label>
  <label class="row" data-row="rayCount">
    <span>射线数</span>
    <input type="range" min="90" max="1440" step="30" data-slider="rayCount">
    <b data-value="rayCount">0</b>
  </label>
  <label class="row" data-row="epsilon">
    <span>ε / rad</span>
    <select data-select="epsilon"></select>
  </label>

  <p class="warn" data-warn hidden>光源被方块挡住 · 没有可见区域</p>

  <label class="row row-seed">
    <span>种子</span>
    <input type="number" data-seed min="0" max="2147483647" step="1" spellcheck="false" />
    <button type="button" class="dice" data-action="dice" title="换一个随机种子">随机</button>
  </label>
  <p class="tip">同一颗种子永远生成同一个世界。种子会写进地址栏，刷新或分享链接都能复现。</p>

  <div class="flags">
    <label><input type="checkbox" data-flag="debugRays"><span>显示射线</span></label>
    <label><input type="checkbox" data-flag="followMouse"><span>光源跟随鼠标</span></label>
    <label><input type="checkbox" data-flag="showBlocks"><span>显示方块</span></label>
    <label><input type="checkbox" data-flag="paused"><span>暂停滚动</span></label>
  </div>

  <button type="button" class="advanced-toggle" data-action="advanced">高级参数<em>A</em></button>
</div>
<div class="hint">
  <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> 算法 ·
  <kbd>Space</kbd> 暂停 ·
  <kbd>←</kbd><kbd>→</kbd> 速度 ·
  <kbd>R</kbd> 射线 ·
  <kbd>M</kbd> 跟随鼠标 ·
  <kbd>B</kbd> 方块 ·
  <kbd>N</kbd> 换种子 ·
  <kbd>A</kbd> 高级参数 ·
  <kbd>H</kbd> 面板
</div>
`
  );
  var NOTES = {
    exact: "每个角区间只投 1 条射线确定遮挡者，两端精确钉在角点上 —— 边界零误差，也不需要 ε。",
    edge: "每个角点 ±ε 各投 1 条 —— 实现简单的近似解，边界依赖 ε，会有细微漏光。",
    uniform: "沿圆周均匀扫 360 条 —— 最直观的写法，边界落在采样角度上，方块一动就抖。"
  };
  var Hud = class {
    constructor(root, opts, actions) {
      this.opts = opts;
      this.root = root;
      this.actions = actions;
      root.innerHTML = TEMPLATE;
      root.classList.add("hud");
      const q = (sel) => {
        const el = root.querySelector(sel);
        if (!el) throw new Error(`HUD 缺少元素: ${sel}`);
        return el;
      };
      this.note = q("[data-note]");
      this.modeButtons = Array.from(root.querySelectorAll("[data-mode]"));
      for (const btn of this.modeButtons) {
        btn.addEventListener("click", () => this.actions.onMode(btn.dataset.mode));
      }
      for (const key of ["segments", "rays", "vertices", "blocks", "vis", "fps"]) {
        this.statFields[key] = q(`[data-stat="${key}"]`);
      }
      for (const key of ["speed", "rayCount"]) {
        const input = q(`[data-slider="${key}"]`);
        const value = q(`[data-value="${key}"]`);
        this.sliders[key] = input;
        this.sliderValues[key] = value;
        input.addEventListener("input", () => {
          const v = Number(input.value);
          if (key === "speed") this.actions.onSpeed(v);
          else this.actions.onRayCount(v);
        });
      }
      this.epsilonSelect = q('[data-select="epsilon"]');
      for (const e of EPSILONS) {
        const opt = document.createElement("option");
        opt.value = String(e);
        opt.textContent = e.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
        this.epsilonSelect.append(opt);
      }
      this.epsilonSelect.addEventListener("change", () => this.actions.onEpsilon(Number(this.epsilonSelect.value)));
      for (const key of ["debugRays", "followMouse", "showBlocks", "paused"]) {
        const input = q(`[data-flag="${key}"]`);
        this.flags[key] = input;
        input.addEventListener("change", () => this.actions.onFlag(key, input.checked));
      }
      this.warn = q("[data-warn]");
      this.seedInput = q("[data-seed]");
      const applySeed = () => {
        const v = Number(this.seedInput.value);
        if (Number.isFinite(v) && this.seedInput.value.trim() !== "") this.actions.onSeed(Math.trunc(v) | 0);
        else this.setSeed(this.seed);
      };
      this.seedInput.addEventListener("change", applySeed);
      this.seedInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          applySeed();
          this.seedInput.blur();
        }
      });
      q('[data-action="dice"]').addEventListener("click", () => this.actions.onRandomSeed());
      q('[data-action="advanced"]').addEventListener("click", () => this.actions.onToggleAdvanced());
      this.sync();
    }
    opts;
    root;
    actions;
    modeButtons;
    statFields = {};
    sliders = {};
    sliderValues = {};
    flags = {};
    note;
    epsilonSelect;
    seedInput;
    warn;
    seed = 0;
    hidden = false;
    blackout = false;
    /** short 显示在徽标里，full 放 tooltip（GPU 型号串通常很长） */
    setBackend(short, full = short) {
      const el = this.root.querySelector("[data-backend]");
      if (el) {
        el.textContent = short;
        el.setAttribute("title", full);
      }
    }
    /** 光源被方块埋住时给个明确提示，免得以为是卡住了。 */
    setBlackout(on) {
      if (on === this.blackout) return;
      this.blackout = on;
      this.warn.hidden = !on;
    }
    /** 面板当前是否可见（隐藏时就没必要测耗时了）。 */
    get visible() {
      return !this.hidden;
    }
    /** 同步种子输入框（生成世界之后由 app 调用）。 */
    setSeed(seed) {
      this.seed = seed;
      this.seedInput.value = String(seed);
    }
    /** 把 opts 的当前值刷到控件上（键盘改选项后也要调）。 */
    sync() {
      for (const btn of this.modeButtons) btn.classList.toggle("active", btn.dataset.mode === this.opts.mode);
      this.sliders.speed.value = String(Math.round(this.opts.speed));
      this.sliderValues.speed.textContent = String(Math.round(this.opts.speed));
      this.sliders.rayCount.value = String(this.opts.rayCount);
      this.sliderValues.rayCount.textContent = String(this.opts.rayCount);
      this.epsilonSelect.value = String(this.opts.edgeEpsilon);
      if (this.epsilonSelect.selectedIndex < 0) this.epsilonSelect.selectedIndex = 2;
      for (const key of ["debugRays", "followMouse", "showBlocks", "paused"]) {
        this.flags[key].checked = this.opts[key];
      }
      this.note.textContent = NOTES[this.opts.mode];
      this.root.querySelector('[data-row="rayCount"]')?.classList.toggle("dim", this.opts.mode !== "uniform");
      this.root.querySelector('[data-row="epsilon"]')?.classList.toggle("dim", this.opts.mode !== "edge");
    }
    update(stats) {
      this.statFields.segments.textContent = String(stats.segments);
      this.statFields.rays.textContent = String(stats.rays);
      this.statFields.vertices.textContent = String(stats.vertices);
      this.statFields.blocks.textContent = String(stats.instances);
      this.statFields.vis.textContent = formatMs(stats.visMs);
      this.statFields.fps.textContent = String(Math.round(stats.fps));
    }
    toggle() {
      this.hidden = !this.hidden;
      this.root.classList.toggle("hidden", this.hidden);
    }
  };

  // src/ui/input.ts
  function attachInput(target, handlers) {
    const ARROW_KEYS = /* @__PURE__ */ new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);
    const onKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target;
      const tag = el?.tagName;
      const type = el?.type;
      if (tag === "TEXTAREA" || tag === "SELECT") return;
      if (tag === "INPUT") {
        if (type === "range" && !ARROW_KEYS.has(e.code)) {
        } else if (type === "checkbox" && e.code !== "Space") {
        } else {
          return;
        }
      }
      if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
      handlers.onKey(e.code);
    };
    const onPointerMove = (e) => {
      const r = target.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      handlers.onPointer((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    };
    const onPointerLeave = () => handlers.onPointerLeave();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("blur", onPointerLeave);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("blur", onPointerLeave);
    };
  }

  // src/app.ts
  function boot() {
    const initialCanvas = document.getElementById("stage");
    const uiRoot = document.getElementById("ui");
    const advRoot = document.getElementById("advanced");
    if (!(initialCanvas instanceof HTMLCanvasElement) || !uiRoot || !advRoot) throw new Error("页面结构不完整");
    const { renderer, canvas } = createRenderer(initialCanvas);
    const scene = new Scene();
    const engine = new VisibilityEngine();
    const vis = new Visibility();
    const opts = { ...DEFAULT_OPTIONS };
    const meterLight = { x: 0, y: 0 };
    const solveMeter = new CostMeter(() => {
      engine.compute(meterLight.x, meterLight.y, scene.segments, scene.segmentCount, opts, vis);
    });
    const pointer = { x: 0.5, y: 0.47, inside: false };
    const stats = { fps: 0, frameMs: 0, visMs: 0, segments: 0, rays: 0, vertices: 0, instances: 0, blocks: 0 };
    let worldW = 1200;
    let worldH = WORLD_H;
    let pxScale = 1;
    let dpr = 1;
    let lastDpr = 0;
    const readSeedFromUrl = () => {
      const m = /(?:^|[#&])seed=(-?\d+)/.exec(location.hash);
      if (!m) return null;
      const v = Number(m[1]);
      return Number.isFinite(v) ? Math.trunc(v) | 0 : null;
    };
    const writeSeedToUrl = (value) => {
      try {
        history.replaceState(null, "", `#seed=${value}`);
      } catch {
      }
    };
    const hud = new Hud(uiRoot, opts, {
      onMode(mode) {
        opts.mode = mode;
        solveMeter.invalidate();
        hud.sync();
      },
      onSpeed(v) {
        opts.speed = v;
        hud.sync();
      },
      onRayCount(v) {
        opts.rayCount = v;
        solveMeter.invalidate();
        hud.sync();
      },
      onEpsilon(v) {
        opts.edgeEpsilon = v;
        solveMeter.invalidate();
        hud.sync();
      },
      onFlag(key, value) {
        opts[key] = value;
        hud.sync();
      },
      onSeed(value) {
        applySeed(value);
      },
      onRandomSeed() {
        applySeed(randomSeed());
      },
      onToggleAdvanced() {
        advanced.toggle();
      },
      onToggleHud() {
        hud.toggle();
      }
    });
    const advanced = new AdvancedPanel(advRoot, {
      onChange(key) {
        if (key === "lightX" || key === "lightY" || key === "wallMargin") relayout();
        solveMeter.invalidate();
      },
      onReset() {
        relayout();
        solveMeter.invalidate();
      },
      onClose() {
        advanced.toggle(false);
      }
    });
    const backendName = renderer.backend === "webgl2" ? "WebGL2" : "Canvas 2D";
    hud.setBackend(backendName, `${backendName} · ${renderer.detail}`);
    function applySeed(value) {
      scene.generate(value);
      hud.setSeed(scene.seed);
      writeSeedToUrl(scene.seed);
    }
    function relayout() {
      const cssW = Math.max(1, canvas.clientWidth || window.innerWidth);
      const cssH = Math.max(1, canvas.clientHeight || window.innerHeight);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      lastDpr = dpr;
      worldH = WORLD_H;
      worldW = worldH * (cssW / cssH);
      pxScale = worldH / cssH;
      scene.resize(worldW, worldH);
      renderer.resize(cssW, cssH, dpr);
      scene.rebuild();
      solveMeter.invalidate();
    }
    function currentLight() {
      if (opts.followMouse && pointer.inside) {
        return { x: pointer.x * worldW, y: pointer.y * worldH };
      }
      return { x: worldW * settings.lightX, y: worldH * settings.lightY };
    }
    let last = performance.now();
    let smoothDt = 16.7;
    function frame(now) {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1e3));
      last = now;
      if (Math.abs((window.devicePixelRatio || 1) - lastDpr) > 0.01) relayout();
      scene.update(dt, opts.paused ? 0 : opts.speed);
      const light = currentLight();
      meterLight.x = light.x;
      meterLight.y = light.y;
      scene.light.x = light.x;
      scene.light.y = light.y;
      const blackout = scene.occludedAt(light.x, light.y);
      const t0 = performance.now();
      engine.compute(light.x, light.y, scene.segments, scene.segmentCount, opts, vis);
      const rays = vis.raysCast;
      const needTiming = !solveMeter.measured || !opts.paused && !document.hidden && hud.visible;
      const visMs = needTiming ? solveMeter.sample() : solveMeter.value;
      if (blackout) vis.reset();
      hud.setBlackout(blackout);
      const model = {
        worldW,
        worldH,
        pxScale,
        light,
        instances: scene.instances,
        instanceCount: scene.visibleInstanceCount,
        segments: scene.segments,
        segmentCount: scene.segmentCount,
        vis,
        opts,
        blackout
      };
      renderer.render(model);
      const cpuMs = performance.now() - t0;
      smoothDt += (Math.max(dt * 1e3, 0.1) - smoothDt) * 0.1;
      stats.fps = 1e3 / Math.max(smoothDt, 0.1);
      stats.frameMs = cpuMs;
      stats.visMs = visMs;
      stats.segments = scene.segmentCount;
      stats.rays = rays;
      stats.vertices = vis.vertexCount;
      stats.instances = scene.visibleInstanceCount;
      stats.blocks = scene.blocks.length;
      hud.update(stats);
      requestAnimationFrame(frame);
    }
    attachInput(canvas, {
      onKey(code) {
        switch (code) {
          case "Digit1":
            opts.mode = "exact";
            solveMeter.invalidate();
            break;
          case "Digit2":
            opts.mode = "edge";
            solveMeter.invalidate();
            break;
          case "Digit3":
            opts.mode = "uniform";
            solveMeter.invalidate();
            break;
          case "Space":
            opts.paused = !opts.paused;
            break;
          case "ArrowLeft":
            opts.speed = Math.max(0, opts.speed - 10);
            break;
          case "ArrowRight":
            opts.speed = Math.min(400, opts.speed + 10);
            break;
          case "KeyR":
            opts.debugRays = !opts.debugRays;
            break;
          case "KeyM":
            opts.followMouse = !opts.followMouse;
            break;
          case "KeyB":
            opts.showBlocks = !opts.showBlocks;
            break;
          case "KeyN":
            applySeed(randomSeed());
            break;
          case "KeyA":
            advanced.toggle();
            return;
          case "Escape":
            if (advanced.visible) advanced.toggle(false);
            return;
          case "KeyH":
            hud.toggle();
            return;
          default:
            return;
        }
        hud.sync();
      },
      onPointer(x, y) {
        pointer.x = x;
        pointer.y = y;
        pointer.inside = true;
      },
      onPointerLeave() {
        pointer.inside = false;
      }
    });
    window.addEventListener("resize", relayout);
    applySeed(readSeedFromUrl() ?? randomSeed());
    relayout();
    requestAnimationFrame(frame);
    window.__RT2D__ = {
      opts,
      scene,
      vis,
      engine,
      renderer,
      stats,
      relayout,
      solveMeter,
      settings,
      theme: settings,
      blockerCount: (x, y) => scene.blockerCount(x, y),
      applySeed,
      getSeed: () => scene.seed
    };
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
//# sourceMappingURL=app.js.map

#!/usr/bin/env node
/*
 * 从 Web-Oscilloscope 的 public/ 源文件重新生成单文件版，直接写进本站。
 *
 * 为什么本站自己拼这一份，而不是复制源仓库里的 oscilloscope-standalone.html：
 * 那个文件是构建产物，源仓库里未必跟着 public/ 一起更新 —— 已经出现过一次
 * 「public/ 加了新功能，但提交的单文件版还是旧的」，复制就会把旧版发上线。
 * 这里的输入永远是 public/ 的当前内容，所以不可能落后。
 *
 * 拼装逻辑与上游 build-standalone.js 等价：把 public/js/ 下的 ES 模块按拓扑序
 * 收进一个小注册表（__define / __req），再把整包内联进 HTML。等价性是校过的：
 * 对上游提交过的两个产物都能逐字节复现。
 *
 *   node scripts/build-standalone.mjs [--check] [--list]
 *
 *   --check  只比对新旧是否一致，不写文件（用于 scripts/sync-demos.sh）
 *   --list   顺带打印内联了哪些模块
 *
 * 源仓库默认 ~/Projects/Web-Oscilloscope-Music-Player-Visualizer，
 * 可用 OSC_REPO 覆盖。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PROJECTS = path.resolve(ROOT, '..');

const OSC_REPO =
  process.env.OSC_REPO || path.join(PROJECTS, 'Web-Oscilloscope-Music-Player-Visualizer');
const PUB = path.join(OSC_REPO, 'public');
const OUT = path.join(ROOT, 'oscilloscope', 'index.html');
const ENTRY = 'js/main.js';

const CHECK = process.argv.includes('--check');
const LIST = process.argv.includes('--list') || Boolean(process.env.DSH_BUILD_LIST);

const die = (msg) => {
  console.error(`  ✗ ${msg}`);
  process.exit(1);
};

const read = (p) => {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (err) {
    die(`读不到 ${p}（${err.code}）`);
  }
};

/* ----------------------------------------------------------- 模块方言的约束
 * 只认这几种写法，遇到别的直接报错，绝不猜：
 *   import * as ns from './other.js';     唯一的 import 形式
 *   export function f() {}                 export const x = 1;
 *   export { a, b };
 * 不允许 export let（内联模块不共享作用域，可变标量被快照后就不再更新）、
 * default、export *、动态 import()，也不允许循环依赖。
 */
const IMPORT_RE = /^import \* as ([A-Za-z_$][\w$]*) from '(\.[^']+)';?\s*$/;
const ANY_IMPORT_RE = /^import\b/;
const EXPORT_FN_RE = /^export function ([A-Za-z_$][\w$]*)/;
const EXPORT_CONST_RE = /^export const ([A-Za-z_$][\w$]*)/;
const EXPORT_LIST_RE = /^export \{([^}]*)\};?\s*$/;
const ANY_EXPORT_RE = /^export\b/;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(/;

/** 模块 id = 相对 public/ 的 posix 路径。 */
function resolveId(fromId, spec) {
  return path.posix.normalize(path.posix.join(path.posix.dirname(fromId), spec));
}

/** 解析 `export { ... }` 里的名字，只接受裸名字（`a as b` 需要真正的模块机制）。 */
function exportNames(list, id, where) {
  return list
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      if (!/^[A-Za-z_$][\w$]*$/.test(s)) {
        die(`${id}: 只允许导出裸名字（${where}）：${s}`);
      }
      return s;
    });
}

/** 每个 `const { a, b } = ns;` 里的名字都必须是目标模块真的导出的。 */
function validateAliases(mod) {
  const nsToId = new Map(mod.imports.map((i) => [i.ns, i.target]));
  const re = /const \{\n([\s\S]*?)\n\} = ([A-Za-z_$][\w$]*);/g;
  for (const m of mod.body.matchAll(re)) {
    const target = nsToId.get(m[2]);
    if (!target) continue;
    const targetExports = new Set((mod.deps.get(target) || { exports: [] }).exports);
    for (const line of m[1].split('\n')) {
      const name = line.trim().replace(/,$/, '');
      if (!name) continue;
      if (!targetExports.has(name)) {
        die(`${mod.id}: \`${name}\` 并不由 ${target} 导出 —— 内联后它会静默变成 undefined`);
      }
    }
  }
}

function loadModule(id, seen) {
  if (seen.has(id)) return seen.get(id);
  const file = path.join(PUB, id);
  if (!fs.existsSync(file)) die(`无法解析模块：${id}（入口 ${ENTRY} 的依赖图里）`);

  const src = read(file);
  const mod = { id, file, src, imports: [], exports: [], body: null };
  seen.set(id, mod);

  const out = [];
  const srcLines = src.split('\n');
  for (let i = 0; i < srcLines.length; i++) {
    const line = srcLines[i].replace(/\s+$/, '');
    const imp = line.match(IMPORT_RE);
    if (imp) {
      const target = resolveId(id, imp[2]);
      mod.imports.push({ ns: imp[1], target });
      out.push(`const ${imp[1]} = __req(${JSON.stringify(target)});`);
      continue;
    }
    if (ANY_IMPORT_RE.test(line)) {
      die(`${id}: 不支持的 import 写法（只允许 \`import * as ns from './x.js';\`）：\n    ${line}`);
    }
    const fn = line.match(EXPORT_FN_RE);
    if (fn) {
      mod.exports.push(fn[1]);
      out.push(line.replace(/^export /, ''));
      continue;
    }
    const cn = line.match(EXPORT_CONST_RE);
    if (cn) {
      mod.exports.push(cn[1]);
      out.push(line.replace(/^export /, ''));
      continue;
    }
    const list = line.match(EXPORT_LIST_RE);
    if (list) {
      for (const name of exportNames(list[1], id, '单行')) mod.exports.push(name);
      continue; // 不输出：这些名字本来就在本模块里
    }
    if (/^export \{/.test(line)) {
      const collected = [line.slice(line.indexOf('{') + 1)];
      let closed = false;
      while (++i < srcLines.length) {
        const l = srcLines[i];
        if (/^\};?\s*$/.test(l)) {
          closed = true;
          break;
        }
        collected.push(l);
      }
      if (!closed) die(`${id}: \`export {\` 列表没有闭合`);
      for (const name of exportNames(collected.join(' '), id, '多行')) mod.exports.push(name);
      continue;
    }
    if (ANY_EXPORT_RE.test(line)) {
      die(`${id}: 不支持的 export 写法（不允许 default / export let / export *）：\n    ${line}`);
    }
    if (DYNAMIC_IMPORT_RE.test(line)) {
      die(`${id}: 动态 import() 无法内联：\n    ${line}`);
    }
    out.push(line);
  }

  for (const { target } of mod.imports) loadModule(target, seen);
  mod.body = out.join('\n');
  mod.deps = seen;
  validateAliases(mod);
  return mod;
}

/** 深度优先拓扑序，遇到环直接报错。 */
function topoSort(entry, seen) {
  const order = [];
  const done = new Set();
  const stack = [];
  (function visit(id) {
    if (done.has(id)) return;
    const at = stack.indexOf(id);
    if (at >= 0) {
      die(`循环依赖：${stack.slice(at).concat(id).join(' -> ')}\n`
        + '    （内联后模块会看到半成品命名空间，请把值传进去或反转其中一条依赖）');
    }
    stack.push(id);
    const mod = seen.get(id);
    if (!mod) die(`模块未加载：${id}`);
    for (const { target } of mod.imports) visit(target);
    stack.pop();
    done.add(id);
    order.push(mod);
  })(entry);
  return order;
}

/* -------------------------------------------------------------------- 打包 */

function bundle(entryId) {
  const seen = new Map();
  loadModule(entryId, seen);
  const order = topoSort(entryId, seen);

  const parts = order.map((mod) => {
    const tail = mod.exports.length
      ? '\n' + mod.exports.map((n) => `__exp.${n} = ${n};`).join('\n')
      : '';
    return `/* ---- ${mod.id} ${'-'.repeat(Math.max(0, 62 - mod.id.length))} */\n`
      + `__define(${JSON.stringify(mod.id)}, function (__exp, __req) {\n`
      + mod.body + tail + '\n});';
  });

  const runtime = `
/* Minimal module registry: each module body is a function that fills its own
   exports object and pulls its dependencies through __req. Exports objects are
   stable and filled before any caller runs (the graph is acyclic), so
   \`ns.name\` is always read at call time — no snapshotting of live values. */
(function () {
  'use strict';
  const registry = Object.create(null);
  function __define(id, body) { registry[id] = { body, exports: null }; }
  function __req(id) {
    const mod = registry[id];
    if (!mod) throw new Error('module not found: ' + id);
    if (!mod.exports) {
      mod.exports = {};
      mod.body(mod.exports, __req);
    }
    return mod.exports;
  }
`;

  const js = `${runtime}${parts.join('\n\n')}\n\n__req(${JSON.stringify(entryId)});\n})();\n`;
  return { js, ids: order.map((m) => m.id) };
}

/* -------------------------------------------------------------------- 构建 */

let html = read(path.join(PUB, 'index.html'));
const css = read(path.join(PUB, 'styles.css'));
const built = bundle(ENTRY);
const js = built.js;

if (LIST) console.log('  内联模块：' + built.ids.join(', '));

// 先解析一遍再发：某个模块的语法错误否则只会在浏览器里暴露，而且表现为一片空白。
try {
  new Function(js); // eslint-disable-line no-new-func
} catch (err) {
  die(`内联后的代码无法解析：${err.message}`);
}

if (js.includes('</script')) die('打包结果里有字面量 "</script"，内联会破坏文档结构。');

/** 用函数替换，避免 payload 里的 `$&` 之类被当成替换模式。 */
function put(source, needle, payload, label) {
  if (!source.includes(needle)) die(`找不到 ${label} 占位符：${needle}`);
  return source.replace(needle, () => payload);
}

const banner = `<!--
  ===========================================================================
   Web Oscilloscope Music Player / Visualizer — SINGLE-FILE EDITION
   Generated by build-standalone.js — do not edit this file directly,
   edit public/index.html, public/styles.css and public/js/*.js instead.

   Left channel -> X axis, right channel -> Y axis.
   No retrace lines, no glow.  See README.md for the full explanation.
  ===========================================================================
-->
`;

html = put(
  html,
  '<link rel="stylesheet" href="styles.css" />',
  `<style>\n${css}\n</style>`,
  'stylesheet'
);
html = put(
  html,
  '<script type="module" src="js/main.js"></script>',
  `<script>\n${js}\n</script>`,
  'module entry'
);
html = html.replace('<!doctype html>', `<!doctype html>\n${banner}`);
html = html.replace(
  '<title>示波器音乐播放器 · Oscilloscope Music Player</title>',
  '<title>示波器音乐播放器 · Oscilloscope Music Player（单文件版）</title>'
);

// 自检：单文件版不该有任何外部请求（data: / blob: 除外）。
const external = [...html.matchAll(/\b(?:src|href)\s*=\s*"([^"]+)"/g)]
  .map((m) => m[1])
  .filter((u) => !/^(?:data:|blob:|#)/.test(u));
if (external.length) die(`产物里出现了外部引用：${external.join(', ')}`);

const n = Buffer.byteLength(html, 'utf8');
const kb = (x) => `${(x / 1024).toFixed(1)} KB`;

if (CHECK) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
  if (cur === html) {
    console.log(`  ✓ 单文件版已是最新（${kb(n)}）`);
    process.exit(0);
  }
  const curN = cur === null ? null : Buffer.byteLength(cur, 'utf8');
  console.log(
    `  ! 单文件版与 public/ 不一致（public 构建 ${kb(n)}，站上 ${curN === null ? '缺失' : kb(curN)}）`
  );
  process.exit(1);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');
console.log(`
  ✓ 生成 oscilloscope/index.html
      html ${kb(n)}  (css ${kb(css.length)} + js ${kb(js.length)} 已内联)
      ${built.ids.length} 个模块
      源：${path.relative(PROJECTS, PUB)}
`);
